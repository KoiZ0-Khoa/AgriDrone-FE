import { readFileSync } from 'node:fs'
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const apiUrl = dataUrl(compile('../src/management/api.ts').replace("'../api/client'", JSON.stringify(clientUrl)))
const api = await import(apiUrl)
const actions = await import(dataUrl(compile('../src/management/actions.ts').replace("'./api'", JSON.stringify(apiUrl))))
const originalFetch = globalThis.fetch
const assignmentApi = await import(dataUrl(compile('../src/features/farms/farmAssignmentsApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))

test('assignment candidates accept BE string enums and legacy numbers; Tenant Admin targets require Owner', async () => {
  for (const actor of ['OWNER', 'TENANT_ADMIN']) {
    let count = 0
    globalThis.fetch = async (url, options) => {
      count++
      assert.equal(options.headers.Authorization, 'Bearer token')
      assert.equal(new URL(url).searchParams.get('pageNumber'), String(count))
      return Response.json(count === 1
        ? { items: [{ id: 'owner', role: 'Owner', status: 'Active' }, { id: 'admin', role: 'TenantAdmin', status: 'Active' }, { id: 'legacy-admin', role: 1, status: 0 }], hasNextPage: true }
        : { items: [{ id: 'member', role: 'Member', status: 'Active' }, { id: 'legacy-member', role: 2, status: 0 }, { id: 'inactive', role: 'Member', status: 'Inactive' }], hasNextPage: false })
    }
    assert.deepEqual((await assignmentApi.getAssignableUsers('token', actor)).map(user => user.id), actor === 'OWNER' ? ['admin', 'legacy-admin', 'member', 'legacy-member'] : ['member', 'legacy-member'])
    assert.equal(count, 2)
  }
})

test('assignment PUT supports both roles/scopes and preserves reviewed version', async () => {
  for (const [role, accessScope, zoneIds, expectedVersion] of [['WORKER', 'SELECTED_ZONES', ['zone'], null], ['MANAGER', 'ALL_ZONES', [], 4]]) {
    const body = { role, accessScope, zoneIds, expectedVersion, reason: null }
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://test.local/api/farms/f%2Fid/members/u%2Fid/assignment')
      assert.equal(options.method, 'PUT')
      assert.deepEqual(JSON.parse(options.body), body)
      return Response.json({ ...body, version: (expectedVersion ?? 0) + 1 })
    }
    assert.equal((await assignmentApi.assignFarmMember('token', 'f/id', 'u/id', body)).version, (expectedVersion ?? 0) + 1)
  }
})
test('Member invitation sends only invited email and tenant auth', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/tenants/current/invitations/member')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.deepEqual(JSON.parse(options.body), { email: 'member@example.test' })
    return Response.json({ invitationId: 'invite', email: 'member@example.test' })
  }
  await actions.inviteMemberAction('token').run({ email: ' member@example.test ' })
})

test('farm member lists preserve server paging and send role/status filters', async () => {
  const urls = []
  globalThis.fetch = async (url, options) => {
    urls.push(url)
    assert.equal(options.headers.Authorization, 'Bearer token')
    return Response.json({ items: [{ tenantRole: 'TENANTADMIN', role: 'MANAGER', zoneIds: ['z'] }], pageNumber: 2, pageSize: 20, totalCount: 42, hasNextPage: true })
  }
  const result = await api.getFarmMembers('token', 'farm/id', 2, 'WORKER', 'ACTIVE')
  assert.equal(result.totalCount, 42)
  assert.equal(result.hasNextPage, true)
  assert.equal(result.items[0].tenantRole, 'TENANTADMIN')
  await api.getFarmMembers('token', 'farm/id', 1)
  await api.getFarmMembers('token', 'farm/id', 1, 'MANAGER', 'INACTIVE')
  assert.deepEqual(urls, [
    'http://test.local/api/farms/farm%2Fid/members?pageNumber=2&pageSize=20&role=WORKER&status=ACTIVE',
    'http://test.local/api/farms/farm%2Fid/members?pageNumber=1&pageSize=20',
    'http://test.local/api/farms/farm%2Fid/members?pageNumber=1&pageSize=20&role=MANAGER&status=INACTIVE',
  ])
})

test('my assignments are scoped by bearer identity and preserve assigned zones', async () => {
  const urls = []
  globalThis.fetch = async (url, options) => {
    urls.push(url)
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.equal(options.body, undefined)
    return Response.json({ items: [{ farm: { id: 'f', name: 'Farm' }, role: 'WORKER', accessScope: 'SELECTED_ZONES', zones: [{ id: 'z', name: 'Zone' }] }], totalCount: 1 })
  }
  const result = await api.getMyFarmAssignments('token', 3, 'WORKER')
  assert.deepEqual(result.items[0].zones, [{ id: 'z', name: 'Zone' }])
  await api.getMyFarmAssignments('token', 1)
  assert.deepEqual(urls, [
    'http://test.local/api/users/me/farm-assignments?pageNumber=3&pageSize=20&role=WORKER',
    'http://test.local/api/users/me/farm-assignments?pageNumber=1&pageSize=20',
  ])
})

test('revoke checks actor/target role and active assignment before sending', async () => {
  const member = { farmId: 'f', userId: 'u', fullName: 'Member', email: 'm@example.test', version: 3, status: 'ACTIVE', tenantRole: 'MEMBER' }
  for (const actor of ['OWNER', 'TENANT_ADMIN', 'MEMBER']) {
    for (const tenantRole of ['OWNER', 'TENANTADMIN', 'MEMBER']) {
      const target = { ...member, tenantRole }
      const permitted = actor === 'OWNER' || (actor === 'TENANT_ADMIN' && tenantRole === 'MEMBER')
      assert.equal(actions.canRevokeFarmMember(actor, target), permitted)
      if (!permitted) assert.throws(() => actions.revokeFarmAction('token', target, actor).run({}))
    }
    assert.equal(actions.canRevokeFarmMember(actor, { ...member, status: 'INACTIVE' }), false)
  }
  assert.throws(() => actions.revokeFarmAction('token', { ...member, version: 0 }, 'OWNER').run({}))
  assert.throws(() => actions.revokeFarmAction('token', member, 'OWNER').run({ reason: 'x'.repeat(501) }))
})

test('revoke sends DELETE with reviewed version, optional reason and supports 204', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/farms/f%2Fid/members/u%2Fid/assignment')
    assert.equal(options.method, 'DELETE')
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.deepEqual(JSON.parse(options.body), { expectedVersion: 7, reason: null })
    return new Response(null, { status: 204 })
  }
  const member = { farmId: 'f/id', userId: 'u/id', fullName: 'Member', email: 'm@example.test', version: 7, status: 'ACTIVE', tenantRole: 'MEMBER' }
  assert.equal(await actions.revokeFarmAction('token', member, 'TENANT_ADMIN').run({ reason: ' ' }), undefined)
})

test('revoke conflict and forbidden responses propagate without retry or success', async () => {
  for (const status of [403, 409]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return Response.json({ errorCode: status === 409 ? 'FarmMembership.ConcurrentUpdate' : 'Tenant.AccessDenied' }, { status }) }
    await assert.rejects(() => api.revokeFarmAssignment('t', 'f', 'u', { expectedVersion: 1, reason: null }), error => error.status === status)
    assert.equal(calls, 1)
  }
})

test('Long system catalog APIs use the current routes and concurrency bodies', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.method ?? 'GET', options.body === undefined ? undefined : JSON.parse(options.body)])
    assert.equal(options.headers.Authorization, 'Bearer token')
    if ((options.method ?? 'GET') === 'GET') return Response.json([])
    if (options.method === 'PUT') return new Response(null, { status: 204 })
    return Response.json({ id: 'created', version: 1 })
  }

  await api.getPlantConditions('token')
  await api.createPlantCondition('token', { code: 'BLAST', name: 'Đạo ôn', scientificName: null, conditionType: 'DISEASE', description: null })
  await api.versionPlantCondition('token', 'condition/id', { name: 'Đạo ôn', scientificName: null, description: 'Mô tả', expectedVersion: 3 })
  await api.retirePlantCondition('token', 'condition/id', 4)
  await api.getHarvestQualityGrades('token')
  await api.createHarvestQualityGrade('token', { code: 'GRADE_A', name: 'Loại A', displayOrder: 1 })
  await api.versionHarvestQualityGrade('token', 'grade/id', { name: 'Loại A+', displayOrder: 0, expectedVersion: 5 })
  await api.retireHarvestQualityGrade('token', 'grade/id', 6)
  await api.getHealthLevels('token')

  assert.deepEqual(calls, [
    ['http://test.local/api/catalog/plant-conditions', 'GET', undefined],
    ['http://test.local/api/system/plant-conditions', 'POST', { code: 'BLAST', name: 'Đạo ôn', scientificName: null, conditionType: 'DISEASE', description: null }],
    ['http://test.local/api/system/plant-conditions/condition%2Fid/versions', 'POST', { name: 'Đạo ôn', scientificName: null, description: 'Mô tả', expectedVersion: 3 }],
    ['http://test.local/api/system/plant-conditions/condition%2Fid/retire', 'PUT', { expectedVersion: 4 }],
    ['http://test.local/api/catalog/harvest-quality-grades', 'GET', undefined],
    ['http://test.local/api/system/harvest-quality-grades', 'POST', { code: 'GRADE_A', name: 'Loại A', displayOrder: 1 }],
    ['http://test.local/api/system/harvest-quality-grades/grade%2Fid/versions', 'POST', { name: 'Loại A+', displayOrder: 0, expectedVersion: 5 }],
    ['http://test.local/api/system/harvest-quality-grades/grade%2Fid/retire', 'PUT', { expectedVersion: 6 }],
    ['http://test.local/api/catalog/health-levels', 'GET', undefined],
  ])
})
afterEach(() => { globalThis.fetch = originalFetch })

test('profile uses name/phone and preserves the returned fullName', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/current/profile')
    assert.equal(options.method, 'PUT')
    assert.equal(options.headers.Authorization, 'Bearer token')
    assert.deepEqual(JSON.parse(options.body), { name: 'Nguyễn A', phone: '0900000000' })
    return Response.json({ fullName: 'Nguyễn A', phone: '0900000000' })
  }
  let saved
  await actions.profileAction('token', { fullName: 'A', phone: null }, p => { saved = p }).run({ name: ' Nguyễn A ', phone: '0900000000' })
  assert.equal(saved.fullName, 'Nguyễn A')
})
test('password confirmation never goes to BE and password spaces remain unchanged', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/current/change-password')
    assert.deepEqual(JSON.parse(options.body), { oldPassword: ' old password ', newPassword: ' new password ' })
    return Response.json({ message: 'ok' })
  }
  const action = actions.passwordAction('token', () => {})
  assert.throws(() => action.run({ oldPassword: 'x', newPassword: '12345678', confirm: 'different' }))
  await action.run({ oldPassword: ' old password ', newPassword: ' new password ', confirm: ' new password ' })
})
test('farm edit preserves polygon and reviewed version, handles zero and nullable fields', () => {
  const farm = { expectedVersion: 4, boundary: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [1, 1]]] } }
  const body = actions.farmBody({ name: ' Farm ', address: ' ', area: '0', longitude: '0', latitude: '0' }, farm)
  assert.equal(body.expectedVersion, 4)
  assert.deepEqual(body.boundary, farm.boundary)
  assert.deepEqual(body.centerPoint.coordinates, [0, 0])
  assert.equal(body.areaHectares, 0)
  assert.equal(body.address, null)
  assert.equal(actions.farmBody({ name: 'F', area: '', longitude: '', latitude: '' }, farm).centerPoint, null)
  for (const change of [{ longitude: '1', latitude: '' }, { longitude: '181', latitude: '1' }, { area: '-1' }, { area: 'Infinity' }]) {
    assert.throws(() => actions.farmBody({ name: 'F', area: '', longitude: '', latitude: '', ...change }, farm))
  }
})
test('farm update uses PUT and propagates concurrency without retry', async () => {
  let count = 0
  globalThis.fetch = async (url, options) => {
    count++
    assert.equal(url, 'http://test.local/api/farms/farm%2Fid')
    assert.equal(options.method, 'PUT')
    assert.equal(JSON.parse(options.body).expectedVersion, 7)
    return Response.json({ errorCode: 'Farm.ConcurrentUpdate' }, { status: 409 })
  }
  await assert.rejects(api.updateFarm('token', 'farm/id', { expectedVersion: 7 }), e => e.code === 'Farm.ConcurrentUpdate')
  assert.equal(count, 1)
})
test('member role/status strings and transfer-owner body match BE', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return new Response(null, { status: 204 }) }
  await api.changeMemberRole('t', 'u', 'TENANT_ADMIN')
  await api.changeMemberStatus('t', 'u', 'INACTIVE')
  await api.transferOwnership('t', 'u')
  assert.deepEqual(calls, [
    ['http://test.local/api/tenants/current/members/u/role', 'PUT', { role: 'TENANT_ADMIN' }],
    ['http://test.local/api/tenants/current/members/u/status', 'PUT', { status: 'INACTIVE' }],
    ['http://test.local/api/tenants/current/transfer-ownership', 'POST', { newOwnerUserId: 'u' }],
  ])
})
test('invitations use absolute routes, acceptance is anonymous and blanks are nullable', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options]); return Response.json({ invitationId: 'i' }) }
  await actions.inviteAction('token').run({ email: ' a@example.test ' })
  const existing = actions.acceptAction(' abc ', { requiresAccountCreation: false, tenantName: 'An Phú', maskedEmail: 'a***@example.test' })
  assert.deepEqual(existing.fields, [])
  await existing.run({ token: 'different-token', fullName: 'Ignored', phone: 'Ignored', password: 'Ignored' })
  assert.equal(calls[0][0], 'http://test.local/current/invitations/tenant-admin')
  assert.equal(calls[1][0], 'http://test.local/invitations/accept')
  assert.equal(calls[1][1].headers.Authorization, undefined)
  assert.deepEqual(JSON.parse(calls[1][1].body), { token: 'abc', fullName: null, phone: null, password: null })
})
test('preview sends the invitation token anonymously and keeps the BE account decision', async () => {
  for (const requiresAccountCreation of [true, false]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://test.local/api/auth/invitations/preview')
      assert.equal(options.method, 'POST')
      assert.equal(options.headers.Authorization, undefined)
      assert.deepEqual(JSON.parse(options.body), { token: 'invitation-token' })
      return Response.json({ requiresAccountCreation, tenantName: 'An Phú', maskedEmail: 'a***@example.test' })
    }
    const preview = await api.previewInvitation('invitation-token')
    const action = actions.acceptAction('invitation-token', preview)
    assert.equal(action.fields.some(f => f.key === 'password'), requiresAccountCreation)
    assert.equal(action.fields.some(f => f.key === 'fullName' && !f.optional), requiresAccountCreation)
  }
})

test('new invitee requires registration details and confirmation, preserving password spaces', async () => {
  let accepted = false
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'http://test.local/invitations/accept')
    assert.deepEqual(JSON.parse(options.body), { token: 'abc', fullName: 'New User', phone: null, password: ' password123 ' })
    return Response.json({ accountCreated: true })
  }
  const action = actions.acceptAction('abc', { requiresAccountCreation: true, tenantName: 'An Phú', maskedEmail: 'a***@example.test' }, () => { accepted = true })
  await assert.rejects(() => action.run({}), /họ và tên/)
  await assert.rejects(() => action.run({ fullName: 'New User', password: 'short', confirm: 'short' }), /8 ký tự/)
  await assert.rejects(() => action.run({ fullName: 'New User', password: 'password123', confirm: 'different' }), /chưa khớp/)
  assert.equal(calls, 0)
  assert.equal(accepted, false)
  await action.run({ fullName: ' New User ', phone: '', password: ' password123 ', confirm: ' password123 ' })
  assert.equal(accepted, true)
})

test('invalid preview and failed acceptance remain errors, never successful onboarding', async () => {
  let accepted = false
  globalThis.fetch = async () => Response.json({ detail: 'Invitation expired.', errorCode: 'TenantInvitation.InvalidOrExpired' }, { status: 400 })
  await assert.rejects(() => api.previewInvitation('expired'), /Invitation expired/)
  const action = actions.acceptAction('expired', { requiresAccountCreation: false, tenantName: 'An Phú', maskedEmail: 'a***@example.test' }, () => { accepted = true })
  await assert.rejects(() => action.run({}), /Invitation expired/)
  assert.equal(accepted, false)
})

test('all management lists request the selected page', async () => {
  const urls = []
  globalThis.fetch = async url => { urls.push(url); return Response.json({ items: [], totalCount: 0 }) }
  await api.getMembers('t', 2); await api.getTenants('t', 3); await api.getUsers('t', 4); await api.getMemberships('t', 'u/id', 2)
  assert.deepEqual(urls, [
    'http://test.local/tenants/current/users?pageNumber=2&pageSize=20',
    'http://test.local/api/system/tenants/all?pageNumber=3&pageSize=20',
    'http://test.local/api/users?pageNumber=4&pageSize=20',
    'http://test.local/api/system/users/u%2Fid/tenants?pageNumber=2&pageSize=20',
  ])
})
test('system tenant and membership actions support bodyless 204 responses', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options.method, options.body]); return new Response(null, { status: 204 }) }
  await api.setTenantActive('t', 'tenant', false)
  await api.setMembershipActive('t', 'membership', true)
  assert.deepEqual(calls, [
    ['http://test.local/api/system/tenants/tenant/deactivate', 'PUT', undefined],
    ['http://test.local/api/system/tenant-memberships/membership/activate', 'PUT', undefined],
  ])
})
test('create tenant and provision owner match contract field names', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return Response.json({ id: 't' }) }
  await api.createTenant('token', { tenantCode: 'FARM', tenantName: 'Đơn vị' })
  await api.provisionOwner('token', 't', 'owner@example.test')
  assert.deepEqual(calls, [
    ['http://test.local/api/system/tenants', 'POST', { tenantCode: 'FARM', tenantName: 'Đơn vị' }],
    ['http://test.local/api/system/tenants/t/owner-provisionings', 'POST', { email: 'owner@example.test' }],
  ])
})
test('forms reject empty required values and malformed emails before a request', () => {
  assert.throws(() => actions.validate([actions.emailField], { email: 'not-email' }))
  assert.throws(() => actions.validate([{ key: 'name', label: 'Tên', max: 3 }], { name: '    ' }))
  assert.throws(() => actions.validate([{ key: 'name', label: 'Tên', max: 3 }], { name: 'abcd' }))
  assert.doesNotThrow(() => actions.validate([actions.emailField], { email: 'ok@example.test' }))
})
