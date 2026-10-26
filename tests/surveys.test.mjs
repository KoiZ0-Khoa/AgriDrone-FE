import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const client = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(urlFor(compile('../src/features/surveys/api.ts').replace("'../../api/client'", JSON.stringify(client))))
const workflow = await import(urlFor(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(client))))
const navigation = await import(urlFor(compile('../src/features/auth/navigation.ts')))
const storage = await import(urlFor(compile('../src/features/auth/authStorage.ts')))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('System Manager system sessions are accepted without tenant and routed separately', () => {
  for (const system_role of ['SYSTEM_MANAGER', ['SYSTEM_MANAGER'], ['SYSTEM_MANAGER', 'SYSTEM_ADMIN']]) {
    const token = `header.${Buffer.from(JSON.stringify({ system_role })).toString('base64url')}.signature`
    const session = storage.toAuthSession({ email: 'manager@example.test', fullName: 'Manager', phone: null, session: { accessToken: token, expiresAt: '2099-01-01T00:00:00Z', tenant: null }, tenantSelection: null })
    assert.equal(session.role, Array.isArray(system_role) && system_role.includes('SYSTEM_ADMIN') ? 'SYSTEM_ADMIN' : 'SYSTEM_MANAGER')
    assert.equal(session.tenant, null)
  }
  assert.equal(navigation.loginDestination('SYSTEM_MANAGER', '/farms'), '/manager')
  assert.equal(navigation.loginDestination('SYSTEM_MANAGER', '/system/users'), '/manager')
  assert.equal(navigation.loginDestination('SYSTEM_MANAGER', '/manager/account'), '/manager/account')
  assert.equal(navigation.loginDestination('OWNER', '/manager'), '/dashboard')
  assert.equal(navigation.loginDestination('OWNER', '//example.test'), '/dashboard')
  assert.equal(navigation.loginDestination('SYSTEM_ADMIN', '/system/managers'), '/system/managers')
})

test('eligible Managers require active, available and an unexpired qualification', () => {
  const manager = { status: 'ACTIVE', availability: 'AVAILABLE', qualificationStatus: 'QUALIFIED', qualificationExpiresAt: '2026-12-01T00:00:00Z' }
  const now = Date.parse('2026-10-16T00:00:00Z')
  assert.equal(workflow.isEligibleManager(manager, now), true)
  for (const changes of [{ status: 'SUSPENDED' }, { availability: 'UNAVAILABLE' }, { qualificationStatus: 'PENDING' }, { qualificationExpiresAt: null }, { qualificationExpiresAt: 'invalid' }, { qualificationExpiresAt: '2026-10-16T00:00:00Z' }]) assert.equal(workflow.isEligibleManager({ ...manager, ...changes }, now), false)
})

test('Manager directory filters and detail preserve server version, paging and cancellation', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system/managers')
    assert.equal(parsed.searchParams.get('pageNumber'), '3')
    assert.equal(parsed.searchParams.get('status'), 'ACTIVE')
    assert.equal(parsed.searchParams.get('qualificationStatus'), 'QUALIFIED')
    assert.equal(parsed.searchParams.has('availability'), false)
    assert.equal(options.signal, controller.signal)
    assert.equal(options.headers.Authorization, 'Bearer admin')
    return Response.json({ items: [{ id: 'manager', version: 23 }], totalCount: 41 })
  }
  assert.equal((await api.getManagers('admin', 3, { status: 'ACTIVE', qualificationStatus: 'QUALIFIED', availability: '' }, controller.signal)).items[0].version, 23)
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system/managers/m%2F1'); assert.equal(options.signal, controller.signal); return Response.json({ version: 24 }) }
  assert.equal((await api.getManager('admin', 'm/1', controller.signal)).version, 24)
})

test('Manager mutations use stable string enums, reviewed version and correct methods', async () => {
  const calls = [
    [() => api.inviteManager('admin', 'manager@example.test'), '/api/system/managers/invitations', 'POST', { email: 'manager@example.test' }],
    [() => api.createManager('admin', 'user'), '/api/system/managers', 'POST', { userId: 'user' }],
    [() => api.changeManagerState('admin', 'm/id', 'activate', { reason: 'Verified', expectedVersion: 18 }), '/api/system/managers/m%2Fid/activate', 'PUT', { reason: 'Verified', expectedVersion: 18 }],
    [() => api.changeManagerState('admin', 'm/id', 'suspend', { reason: 'Paused', expectedVersion: 19 }), '/api/system/managers/m%2Fid/suspend', 'PUT', { reason: 'Paused', expectedVersion: 19 }],
    [() => api.changeManagerAvailability('admin', 'm', { availability: 'AVAILABLE', reason: 'Ready', expectedVersion: 20 }), '/api/system/managers/m/availability', 'PUT', { availability: 'AVAILABLE', reason: 'Ready', expectedVersion: 20 }],
    [() => api.changeManagerQualification('admin', 'm', { status: 'QUALIFIED', expiresAt: '2027-01-01T00:00:00Z', reason: 'Checked', expectedVersion: 21 }), '/api/system/managers/m/qualification', 'PUT', { status: 'QUALIFIED', expiresAt: '2027-01-01T00:00:00Z', reason: 'Checked', expectedVersion: 21 }],
  ]
  for (const [run, path, method, body] of calls) {
    globalThis.fetch = async (url, options) => { assert.equal(url, `http://test.local${path}`); assert.equal(options.method, method); assert.equal(options.headers.Authorization, 'Bearer admin'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ version: 22 }) }
    await run()
  }
})

test('manual Farm assignment uses the profile ID and a null assignment version for first assignment only', async () => {
  const receipt = { assignmentId: 'assignment', tenantId: 'tenant', farmId: 'farm/id', systemManagerProfileId: 'profile', managerUserId: 'user', assignedAt: '2026-10-17T00:00:00Z', version: 31 }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system/farms/farm%2Fid/primary-manager')
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers.Authorization, 'Bearer admin')
    assert.deepEqual(JSON.parse(options.body), { systemManagerProfileId: 'profile', reason: 'Assign the existing Farm', expectedCurrentAssignmentVersion: null })
    return Response.json(receipt)
  }
  assert.deepEqual(await api.assignFarmManager('admin', 'farm/id', { systemManagerProfileId: 'profile', reason: 'Assign the existing Farm' }), receipt)
})

test('manual assignment never retries with a guessed version or overwrites an existing Manager after conflict', async () => {
  for (const code of ['SystemManager.ConcurrentUpdate', 'SystemManager.ActiveAssignmentConflict']) {
    let calls = 0
    globalThis.fetch = async (_url, options) => {
      calls++
      assert.equal(JSON.parse(options.body).expectedCurrentAssignmentVersion, null)
      return Response.json({ detail: 'An assignment already exists.', errorCode: code, traceId: 'assignment-trace' }, { status: 409 })
    }
    await assert.rejects(api.assignFarmManager('admin', 'farm', { systemManagerProfileId: 'profile', reason: 'First assignment' }), error => error.status === 409 && error.code === code && error.traceId === 'assignment-trace')
    assert.equal(calls, 1)
  }
})

test('manual assignment preserves missing Farm, ineligible Manager and permission failures', async () => {
  for (const [status, code] of [[404, 'SystemManager.FarmNotFound'], [409, 'SystemManager.NotAssignable'], [403, 'Authorization.Forbidden']]) {
    globalThis.fetch = async () => Response.json({ detail: 'Assignment refused.', errorCode: code }, { status })
    await assert.rejects(api.assignFarmManager('admin', 'farm', { systemManagerProfileId: 'profile', reason: 'First assignment' }), error => error.status === status && error.code === code)
  }
})

test('service pricing sends only the current per-pole VND contract and server version', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-admin/survey-services/s%2F1/prices')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { amountPerPole: 1250.5, currency: 'VND', expectedServiceVersion: 37 })
    return Response.json({ serviceVersion: 38, effectiveFrom: '2026-10-16T00:00:00Z' })
  }
  assert.equal((await api.createServicePrice('admin', 's/1', { amountPerPole: 1250.5, currency: 'VND', expectedServiceVersion: 37 })).serviceVersion, 38)
})

test('catalogue reads use separate public, admin and price history routes', async () => {
  const cases = [[() => api.getPublicServices(), '/api/public/survey-services', undefined], [() => api.getServices('admin'), '/api/system-admin/survey-services', 'Bearer admin'], [() => api.getPriceHistory('admin', 'service'), '/api/system-admin/survey-services/service/prices', 'Bearer admin']]
  for (const [run, path, auth] of cases) { globalThis.fetch = async (url, options) => { assert.equal(url, `http://test.local${path}`); assert.equal(options.headers.Authorization, auth); return Response.json([]) }; await run() }
})

test('service metadata and lifecycle mutations retain the reviewed concurrency version', async () => {
  const changes = [[() => api.updateService('admin', 's/id', { name: 'Plant Health', description: 'Survey', expectedVersion: 48 }), '', 'PUT', { name: 'Plant Health', description: 'Survey', expectedVersion: 48 }], ...['activate', 'experimental', 'retire'].map(state => [() => api.changeServiceState('admin', 's/id', state, { reason: 'Reviewed', expectedVersion: 49 }), `/${state}`, 'POST', { reason: 'Reviewed', expectedVersion: 49 }])]
  for (const [run, suffix, method, body] of changes) { globalThis.fetch = async (url, options) => { assert.equal(url, `http://test.local/api/system-admin/survey-services/s%2Fid${suffix}`); assert.equal(options.method, method); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ version: 50 }) }; await run() }
})

test('survey inbox uses server filters/paging and detail keeps checklist version', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => { const parsed = new URL(url); assert.equal(parsed.pathname, '/api/system-admin/survey-requests'); assert.equal(parsed.searchParams.get('status'), 'UNDER_REVIEW'); assert.equal(parsed.searchParams.get('kind'), 'NEW_CUSTOMER'); assert.equal(parsed.searchParams.get('pageNumber'), '2'); assert.equal(options.signal, controller.signal); return Response.json({ items: [], totalCount: 21 }) }
  await api.getRequests('admin', 2, { status: 'UNDER_REVIEW', kind: 'NEW_CUSTOMER' }, controller.signal)
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-admin/survey-requests/r%2F1'); assert.equal(options.headers.Authorization, 'Bearer admin'); return Response.json({ checklistVersion: 'survey-request-review.v6', version: 513 }) }
  assert.equal((await api.getRequest('admin', 'r/1')).version, 513)
})

const checklist = { 'contact-valid': true, 'dragon-fruit-farm-confirmed': true, 'service-area-supported': true, 'candidate-location-sufficient': true, 'consent-feasibility': true, 'flight-permission-feasibility': true, notes: null }
test('v6 review sends exactly six hyphenated answers; rejection can record failed conditions', () => {
  assert.deepEqual(workflow.reviewChecklist('survey-request-review.v6', { ...checklist, notes: '  Reviewed  ', contactValid: true, 'eligible-manager-available': true, version: 'old' }, true), { ...checklist, notes: 'Reviewed' })
  for (const code of Object.keys(checklist).filter(key => key !== 'notes')) {
    assert.throws(() => workflow.reviewChecklist('survey-request-review.v6', { ...checklist, [code]: false }, true), /sáu điều kiện/)
    assert.equal(workflow.reviewChecklist('survey-request-review.v6', { ...checklist, [code]: false }, false)[code], false)
    const missing = { ...checklist }; delete missing[code]
    assert.throws(() => workflow.reviewChecklist('survey-request-review.v6', missing, true), /sáu điều kiện/)
  }
  assert.throws(() => workflow.reviewChecklist('survey-request-review.v3', checklist, true), /Checklist/)
  assert.throws(() => workflow.reviewChecklist('survey-request-review.v5', checklist, true), /Checklist/)
  assert.throws(() => workflow.reviewChecklist('survey-request-review.v7', checklist, false), /Checklist/)
})

test('request review sends actual checklist/version and approval idempotency key', async () => {
  const body = { expectedVersion: 419, reason: 'Reviewed', checklist, selectedSystemManagerProfileId: 'manager' }
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-admin/survey-requests/r%2F1/approve'); assert.equal(options.method, 'POST'); assert.equal(options.headers['Idempotency-Key'], 'same-operation'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ orderNumber: 'SO-1' }) }
  assert.equal((await api.approveRequest('admin', 'r/1', body, 'same-operation')).orderNumber, 'SO-1')
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-admin/survey-requests/r%2F1/start-review'); assert.deepEqual(JSON.parse(options.body), { expectedVersion: 418 }); return Response.json({ version: 419 }) }
  await api.startReview('admin', 'r/1', 418)
  const rejected = { expectedVersion: 419, reason: 'Outside service area', checklist: { ...checklist, 'service-area-supported': false } }
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-admin/survey-requests/r%2F1/reject'); assert.deepEqual(JSON.parse(options.body), rejected); assert.equal(options.headers['Idempotency-Key'], undefined); return Response.json({ status: 'REJECTED' }) }
  await api.rejectRequest('admin', 'r/1', rejected)
})

test('retries keep the operation key, edits create a new key', () => {
  const first = workflow.operationFor(null, { amount: 1 })
  assert.deepEqual(workflow.operationFor(first, { amount: 1 }), first)
  assert.notEqual(workflow.operationFor(first, { amount: 2 }).key, first.key)
})

test('public intake includes the caller cookie without bearer auth', async () => {
  const body = { surveyServiceId: 'service', tenantCode: 'ANPHU', tenantName: 'An Phu', applicantName: 'Customer', applicantEmail: 'customer@example.test', applicantPhone: '0901234567', farmName: 'Farm', farmAddress: 'Address', approximateAreaHa: 1, longitude: 108, latitude: 10, estimatedPoleCount: 100, preferredStartAt: null, preferredEndAt: null, notes: null }
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/public/survey-requests'); assert.equal(options.credentials, 'include'); assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers['Idempotency-Key'], 'intake-1'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ requestNumber: 'SR-1' }) }
  assert.equal((await api.submitPublicRequest(body, 'intake-1')).requestNumber, 'SR-1')
})

test('Owner intake selects new-farm or existing-farm route with tenant bearer auth', async () => {
  const common = { surveyServiceId: 'service', estimatedPoleCount: null, preferredStartAt: null, preferredEndAt: null, notes: null }
  for (const [run, path, body] of [[() => api.submitNewFarmRequest('owner', { ...common, farmName: 'New farm' }, 'new-1'), '/api/tenant-owner/survey-requests/new-farm', { ...common, farmName: 'New farm' }], [() => api.submitExistingFarmRequest('owner', 'f/id', common, 'existing-1'), '/api/tenant-owner/farms/f%2Fid/survey-requests', common]]) {
    globalThis.fetch = async (url, options) => { assert.equal(url, `http://test.local${path}`); assert.equal(options.headers.Authorization, 'Bearer owner'); assert.ok(options.headers['Idempotency-Key']); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ status: 'SUBMITTED' }) }; await run()
  }
})

test('intake rejects invalid coordinates, pole count and incomplete/reversed time windows', () => {
  const body = { longitude: 108, latitude: 10, approximateAreaHa: 1, estimatedPoleCount: null, preferredStartAt: null, preferredEndAt: null }
  assert.doesNotThrow(() => workflow.validateIntake(body))
  for (const change of [{ longitude: NaN }, { latitude: 91 }, { approximateAreaHa: 0 }, { estimatedPoleCount: 1.5 }, { estimatedPoleCount: 2147483648 }, { preferredStartAt: '2026-10-17T00:00:00Z' }, { preferredStartAt: 'invalid', preferredEndAt: 'invalid' }, { preferredStartAt: '2026-10-18T00:00:00Z', preferredEndAt: '2026-10-17T00:00:00Z' }]) assert.throws(() => workflow.validateIntake({ ...body, ...change }))
})

test('public intake requires both tenant fields and preserves an actionable duplicate-code error', async () => {
  assert.doesNotThrow(() => workflow.validatePublicTenant({ tenantCode: 'ANPHU', tenantName: 'An Phu' }))
  for (const body of [{ tenantCode: ' ', tenantName: 'Name' }, { tenantCode: 'CODE', tenantName: '' }, { tenantCode: 'A'.repeat(51), tenantName: 'Name' }, { tenantCode: 'CODE', tenantName: 'A'.repeat(151) }]) assert.throws(() => workflow.validatePublicTenant(body))
  globalThis.fetch = async () => Response.json({ errorCode: 'SurveyRequest.TenantCodeUnavailable' }, { status: 409 })
  await assert.rejects(api.submitPublicRequest({}, 'key'), error => /Mã đơn vị/.test(workflow.workflowError(error)))
})

test('conflict responses propagate without retry or false approval success', async () => {
  let count = 0
  globalThis.fetch = async () => { count++; return Response.json({ detail: 'Version conflict', errorCode: 'SurveyRequest.VersionConflict' }, { status: 409 }) }
  await assert.rejects(api.approveRequest('admin', 'request', { expectedVersion: 2, checklist }, 'operation'), error => error.status === 409 && /Tải lại/.test(workflow.workflowError(error)))
  assert.equal(count, 1)
})

test('incomplete Farm profile conflicts explain the prerequisite instead of asking for a version reload', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'The farm must contain a valid name, address, area and center point before submitting a survey request.', errorCode: 'SurveyRequest.FarmProfileIncomplete' }, { status: 409 })
  await assert.rejects(api.submitExistingFarmRequest('owner', 'farm', { surveyServiceId: 'service' }, 'operation'), error => {
    const message = workflow.workflowError(error)
    assert.match(message, /địa chỉ/)
    assert.match(message, /diện tích/)
    assert.match(message, /tọa độ tâm/)
    assert.doesNotMatch(message, /Dữ liệu.*đã.*thay đổi|Tải lại/)
    return true
  })
})

test('unknown conflict details from BE remain visible instead of being replaced by a generic version message', async () => {
  globalThis.fetch = async () => Response.json({ detail: 'A specific business requirement was not satisfied.', errorCode: 'SurveyRequest.OtherConflict' }, { status: 409 })
  await assert.rejects(api.submitExistingFarmRequest('owner', 'farm', { surveyServiceId: 'service' }, 'operation'), error => workflow.workflowError(error) === 'A specific business requirement was not satisfied.')
})
