import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/surveys/orderApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const health = await import(dataUrl(compile('../src/features/surveys/plantHealthApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/surveys/orderWorkflow.ts')))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('assigned Order directory preserves paging/filter, cancellation and Manager authorization', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/survey-orders')
    assert.equal(parsed.searchParams.get('pageNumber'), '3')
    assert.equal(parsed.searchParams.get('status'), 'AWAITING_BASELINE_APPOINTMENT')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.signal, controller.signal)
    return Response.json({ items: [{ surveyOrderId: 'order', orderVersion: 31, currentAppointmentId: null, currentAppointmentVersion: null }], totalCount: 41 })
  }
  assert.equal((await api.getAssignedOrders('manager', 3, 'AWAITING_BASELINE_APPOINTMENT', controller.signal)).items[0].orderVersion, 31)
})

test('Order context searches assigned pages without inventing a detail route or accepting unassigned IDs', async () => {
  const calls = []
  globalThis.fetch = async url => {
    const parsed = new URL(url), page = Number(parsed.searchParams.get('pageNumber'))
    calls.push(page)
    assert.equal(parsed.searchParams.has('status'), false)
    return Response.json({ items: [{ surveyOrderId: `order-${page}` }], hasNextPage: page === 1 })
  }
  assert.equal((await api.getAssignedOrder('manager', 'order-2')).surveyOrderId, 'order-2')
  assert.deepEqual(calls, [1, 2])
  calls.length = 0
  assert.equal(await api.getAssignedOrder('manager', 'unassigned'), null)
  assert.deepEqual(calls, [1, 2])
})

test('Manager directory normalizes the BE reschedule status for dashboard, detail and replacement proposals', async () => {
  const current = { surveyOrderId: 'order', tenantId: 'tenant', farmId: 'farm', status: 'AWAITING_BASELINE_APPOINTMENT', requiresBaselineMapping: true, orderVersion: 2345, currentAppointmentId: 'appointment', currentAppointmentVersion: 2494 }
  const response = { items: [{ ...current, currentAppointmentStatus: 'RESCHEDULEREQUESTED' }], totalCount: 3, pageNumber: 1, pageSize: 20, hasNextPage: false }
  globalThis.fetch = async () => Response.json(response)
  const page = await api.getAssignedOrders('manager')
  assert.equal(page.items[0].currentAppointmentStatus, 'RESCHEDULE_REQUESTED')
  assert.equal(page.items[0].currentAppointmentVersion, 2494)
  assert.equal(page.items[0].orderVersion, 2345)
  assert.equal(page.totalCount, 3)
  assert.equal((await api.getAssignedOrder('manager', 'order')).currentAppointmentStatus, 'RESCHEDULE_REQUESTED')
  const body = workflow.appointmentBody(page.items[0], { ...current, orderStatus: current.status }, '2099-01-01T08:00:00Z', '2099-01-01T10:00:00Z')
  assert.equal(body.expectedCurrentAppointmentId, 'appointment')
  assert.equal(body.expectedCurrentAppointmentVersion, 2494)
  for (const status of ['RESCHEDULE_REQUESTED', 'PROPOSED', 'CONFIRMED', null]) {
    globalThis.fetch = async () => Response.json({ ...response, items: [{ ...current, currentAppointmentStatus: status }] })
    assert.equal((await api.getAssignedOrders('manager')).items[0].currentAppointmentStatus, status)
  }
})

const scope = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 51, orderStatus: 'AWAITING_BASELINE_APPOINTMENT', requiresBaselineMapping: true }
const order = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 51, status: 'AWAITING_BASELINE_APPOINTMENT', requiresBaselineMapping: true, currentAppointmentId: null, currentAppointmentVersion: null, currentAppointmentStatus: null }
const start = '2026-10-22T10:00:00+07:00', end = '2026-10-22T12:00:00+07:00', now = Date.parse('2026-10-19T00:00:00Z')

test('unmapped Orders propose Baseline appointment first, convert local dates and retain server versions', () => {
  assert.deepEqual(workflow.appointmentBody(order, scope, start, end, now), { purpose: 'BASELINE_MAPPING', proposedStartAt: '2026-10-22T03:00:00.000Z', proposedEndAt: '2026-10-22T05:00:00.000Z', expectedOrderVersion: 51, expectedCurrentAppointmentId: null, expectedCurrentAppointmentVersion: null })
  assert.equal(workflow.appointmentBody({ ...order, status: 'AWAITING_PAID_APPOINTMENT' }, { ...scope, orderStatus: 'AWAITING_PAID_APPOINTMENT' }, start, end, now).purpose, 'PAID_SERVICE')
})

test('appointment proposal refuses mismatched contexts, active appointments and invalid time windows', () => {
  for (const changes of [{ orderVersion: 50 }, { surveyOrderId: 'other' }, { tenantId: 'other' }, { farmId: 'other' }, { status: 'COMPLETED' }, { currentAppointmentId: 'appointment', currentAppointmentVersion: 4, currentAppointmentStatus: 'PROPOSED' }, { currentAppointmentId: 'appointment', currentAppointmentVersion: null, currentAppointmentStatus: 'RESCHEDULE_REQUESTED' }]) assert.throws(() => workflow.appointmentBody({ ...order, ...changes }, scope, start, end, now))
  for (const [from, to] of [['invalid', end], [end, start], ['2026-10-18T00:00:00Z', end]]) assert.throws(() => workflow.appointmentBody(order, scope, from, to, now))
  assert.throws(() => workflow.appointmentBody({ ...order, status: 'AWAITING_BOUNDARY_CAPTURE' }, { ...scope, orderStatus: 'AWAITING_BOUNDARY_CAPTURE' }, start, end, now))
  assert.throws(() => workflow.appointmentBody({ ...order, requiresBaselineMapping: false }, scope, start, end, now))
  assert.throws(() => workflow.appointmentBody({ ...order, orderVersion: undefined }, { ...scope, orderVersion: undefined }, start, end, now))
})

test('rescheduling sends the current appointment ID and exact version, never an assumed default', () => {
  const body = workflow.appointmentBody({ ...order, currentAppointmentId: 'appointment', currentAppointmentVersion: 73, currentAppointmentStatus: 'RESCHEDULE_REQUESTED' }, scope, start, end, now)
  assert.equal(body.expectedCurrentAppointmentId, 'appointment')
  assert.equal(body.expectedCurrentAppointmentVersion, 73)
})

test('appointment API sends reviewed state and propagates a conflict without retrying', async () => {
  const body = workflow.appointmentBody(order, scope, start, end, now)
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/appointments')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ errorCode: 'SurveyAppointment.VersionConflict', traceId: 'trace' }, { status: 409 })
  }
  await assert.rejects(api.proposeAppointment('manager', 'o/1', body), error => error.code === 'SurveyAppointment.VersionConflict' && error.traceId === 'trace')
  assert.equal(calls, 1)
})

test('boundary coordinate editor keeps longitude-first order, closes the ring and preserves interior rings', () => {
  const points = [{ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }, { longitude: 1, latitude: 1 }]
  const holes = [[[0.2, 0.2], [0.3, 0.2], [0.3, 0.3], [0.2, 0.2]]]
  const polygon = workflow.polygonFromPoints(points, holes)
  assert.deepEqual(polygon, { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]], ...holes] })
  assert.equal(points.length, 3)
  for (const invalid of [points.slice(0, 2), [points[0], points[0], points[0]], [...points, { longitude: 181, latitude: 0 }], [...points, { longitude: NaN, latitude: 0 }]]) assert.throws(() => workflow.polygonFromPoints(invalid))
})

test('boundary scope and verification use Manager endpoints and actual Order/boundary versions', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/boundary-scope')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    return Response.json({ ...scope, currentApprovedBoundary: { versionNumber: 8 } })
  }
  assert.equal((await api.getOrderScope('manager', 'o/1')).currentApprovedBoundary.versionNumber, 8)
  const body = { boundary: { type: 'Polygon', coordinates: [[[108, 10], [109, 10], [109, 11], [108, 10]]] }, reason: 'Field verified', evidenceReference: null, expectedOrderVersion: 51, expectedCurrentBoundaryVersionNumber: 8 }
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/boundary-scope/verify'); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ orderVersion: 52 }) }
  assert.equal((await api.verifyOrderBoundary('manager', 'o/1', body)).orderVersion, 52)
})

test('Plant Health catalogue and full guidance history use distinct authenticated read APIs', async () => {
  const controller = new AbortController()
  for (const [run, path] of [[() => health.getPlantHealth('admin', controller.signal), '/api/catalog/plant-health'], [() => health.getGuidanceHistory('admin', controller.signal), '/api/system-admin/plant-health/guidance']]) {
    globalThis.fetch = async (url, options) => { assert.equal(url, `http://test.local${path}`); assert.equal(options.headers.Authorization, 'Bearer admin'); assert.equal(options.signal, controller.signal); return Response.json([]) }
    await run()
  }
})

test('guidance draft creation and lifecycle retain references and server concurrency versions', async () => {
  const body = { code: 'GUIDE-1', plantConditionId: 'condition', sourceTitle: 'Field reference', sourceReference: 'reference-id', guidanceText: 'Preliminary guidance', effectiveFrom: null, effectiveTo: null }
  globalThis.fetch = async (url, options) => { assert.equal(url, 'http://test.local/api/system-admin/plant-health/guidance'); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), body); return Response.json({ id: 'guidance', status: 'DRAFT', version: 31 }) }
  assert.equal((await health.createGuidance('admin', body)).version, 31)
  for (const state of ['activate', 'retire']) {
    globalThis.fetch = async (url, options) => { assert.equal(url, `http://test.local/api/system-admin/plant-health/guidance/g%2F1/${state}`); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { expectedVersion: 31 }); return Response.json({ errorCode: 'SourcedGuidance.VersionConflict' }, { status: 409 }) }
    await assert.rejects(health.changeGuidanceState('admin', 'g/1', state, 31), error => error.status === 409 && error.code === 'SourcedGuidance.VersionConflict')
  }
})
