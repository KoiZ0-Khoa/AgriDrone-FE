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
const surveyWorkflow = await import(dataUrl(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const pricingOrder = { surveyOrderId: '11111111-1111-4111-8111-111111111111', tenantId: 'tenant', farmId: 'farm', status: 'AWAITING_PRICING', orderVersion: 4165, requiresBaselineMapping: true }
const pricingScope = { ...pricingOrder, orderStatus: pricingOrder.status, currentApprovedBoundary: { farmBoundaryId: 'boundary', versionNumber: 2 } }
const pricingFarm = { farmId: 'farm', tenantId: 'tenant', status: 'ACTIVE', publishedBaseMap: { id: '22222222-2222-4222-8222-222222222222', versionNumber: 3, sourceSurveyOrderId: pricingOrder.surveyOrderId } }

test('pricing confirmation uses published map/version and leaves pole count, unit price and total to BE', async () => {
  const body = workflow.pricingConfirmationBody(pricingOrder, pricingScope, pricingFarm, '  Đã đối chiếu bản đồ  ')
  assert.deepEqual(body, { expectedFarmBaseMapVersionId: pricingFarm.publishedBaseMap.id, evidenceReference: 'Đã đối chiếu bản đồ', expectedOrderVersion: 4165 })
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/system-manager/survey-orders/o%2F1/pole-count/confirm')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ confirmedSurveyPoleCount: 321, finalPrice: 481500, currency: 'VND', orderStatus: 'AWAITING_PAID_APPOINTMENT', orderVersion: 4166 })
  }
  const result = await api.confirmOrderPricing('manager', 'o/1', body)
  assert.equal(result.confirmedSurveyPoleCount, 321)
  assert.equal(result.finalPrice, 481500)
  assert.equal(result.orderVersion, 4166)
})

test('pricing refuses missing/foreign maps, inconsistent Order and blank evidence; existing Farms may reuse prior maps', () => {
  for (const order of [{ ...pricingOrder, orderVersion: 4164 }, { ...pricingOrder, farmId: 'other' }, { ...pricingOrder, tenantId: 'other' }, { ...pricingOrder, requiresBaselineMapping: false }]) assert.throws(() => workflow.pricingConfirmationBody(order, pricingScope, pricingFarm, 'evidence'))
  for (const scope of [{ ...pricingScope, orderStatus: 'COMPLETED' }, { ...pricingScope, currentApprovedBoundary: null }, { ...pricingScope, orderVersion: 0 }, { ...pricingScope, orderVersion: 4294967296 }]) assert.throws(() => workflow.pricingConfirmationBody(pricingOrder, scope, pricingFarm, 'evidence'))
  for (const farm of [{ ...pricingFarm, farmId: 'other' }, { ...pricingFarm, tenantId: 'other' }, { ...pricingFarm, status: 'ARCHIVED' }, { ...pricingFarm, publishedBaseMap: null }, { ...pricingFarm, publishedBaseMap: { ...pricingFarm.publishedBaseMap, id: '00000000-0000-0000-0000-000000000000' } }, { ...pricingFarm, publishedBaseMap: { ...pricingFarm.publishedBaseMap, sourceSurveyOrderId: 'other-order' } }]) assert.throws(() => workflow.pricingConfirmationBody(pricingOrder, pricingScope, farm, 'evidence'))
  for (const evidence of ['', '   ', 'a'.repeat(1001)]) assert.throws(() => workflow.pricingConfirmationBody(pricingOrder, pricingScope, pricingFarm, evidence))
  assert.equal(workflow.pricingConfirmationBody({ ...pricingOrder, requiresBaselineMapping: false }, { ...pricingScope, requiresBaselineMapping: false }, { ...pricingFarm, publishedBaseMap: { ...pricingFarm.publishedBaseMap, sourceSurveyOrderId: 'previous-order' } }, 'checked').expectedOrderVersion, 4165)
})

test('pricing map-version conflicts stay visible and never trigger an automatic retry', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ errorCode: 'SurveyPricing.BaseMapVersionConflict', detail: 'Map changed', traceId: 'pricing-trace' }, { status: 409 }) }
  await assert.rejects(api.confirmOrderPricing('manager', pricingOrder.surveyOrderId, workflow.pricingConfirmationBody(pricingOrder, pricingScope, pricingFarm, 'checked')), error => error.code === 'SurveyPricing.BaseMapVersionConflict' && error.traceId === 'pricing-trace')
  assert.equal(calls, 1)
})

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
  const body = workflow.appointmentBody(page.items[0], { ...current, orderStatus: current.status }, '2099-01-01')
  assert.equal(body.expectedCurrentAppointmentId, 'appointment')
  assert.equal(body.expectedCurrentAppointmentVersion, 2494)
  for (const status of ['RESCHEDULE_REQUESTED', 'PROPOSED', 'CONFIRMED', null]) {
    globalThis.fetch = async () => Response.json({ ...response, items: [{ ...current, currentAppointmentStatus: status }] })
    assert.equal((await api.getAssignedOrders('manager')).items[0].currentAppointmentStatus, status)
  }
})

const scope = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 51, orderStatus: 'AWAITING_BASELINE_APPOINTMENT', requiresBaselineMapping: true }
const order = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 51, status: 'AWAITING_BASELINE_APPOINTMENT', requiresBaselineMapping: true, currentAppointmentId: null, currentAppointmentVersion: null, currentAppointmentStatus: null }
const scheduledDate = '2026-11-10'

test('first paid-service proposal ignores the completed baseline appointment and sends no baseline ID/version', async () => {
  const raw = { ...order, status: 'AWAITING_PAID_APPOINTMENT', currentAppointmentId: 'baseline-appointment', currentAppointmentVersion: 73, currentAppointmentStatus: 'CONFIRMED' }
  const paidScope = { ...scope, orderStatus: raw.status }
  let sent
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      assert.equal(new URL(url).pathname, '/api/system-manager/survey-orders/order/appointments')
      sent = JSON.parse(options.body)
      return Response.json({ appointmentId: 'new-service-appointment', purpose: 'PAID_SERVICE', appointmentStatus: 'PROPOSED' })
    }
    return Response.json({ items: [raw], hasNextPage: false })
  }
  const current = await api.getAssignedOrder('manager', 'order')
  assert.equal(current.orderVersion, raw.orderVersion)
  assert.equal(current.currentAppointmentStatus, null)
  const body = workflow.appointmentBody(current, paidScope, scheduledDate)
  await api.proposeAppointment('manager', 'order', body)
  assert.deepEqual(sent, { purpose: 'PAID_SERVICE', scheduledDate, expectedOrderVersion: 51, expectedCurrentAppointmentId: null, expectedCurrentAppointmentVersion: null })
  assert.equal(raw.currentAppointmentId, 'baseline-appointment')
})

test('paid-service appointments still block duplicate proposals and retain exact versions when rescheduling', async () => {
  const paidScope = { ...scope, orderStatus: 'AWAITING_PAID_APPOINTMENT' }
  for (const status of ['PROPOSED', 'RESCHEDULEREQUESTED']) {
    const raw = { ...order, status: paidScope.orderStatus, currentAppointmentId: 'paid-appointment', currentAppointmentVersion: 91, currentAppointmentStatus: status }
    globalThis.fetch = async () => Response.json({ items: [raw] })
    const current = (await api.getAssignedOrders('manager')).items[0]
    assert.equal(current.currentAppointmentId, 'paid-appointment')
    assert.equal(current.currentAppointmentVersion, 91)
    if (status === 'PROPOSED') assert.throws(() => workflow.appointmentBody(current, paidScope, scheduledDate))
    else assert.deepEqual(workflow.appointmentBody(current, paidScope, scheduledDate), { purpose: 'PAID_SERVICE', scheduledDate, expectedOrderVersion: 51, expectedCurrentAppointmentId: 'paid-appointment', expectedCurrentAppointmentVersion: 91 })
  }
  for (const changes of [{ status: 'AWAITING_PAYMENT' }, { status: 'AWAITING_PAID_APPOINTMENT', requiresBaselineMapping: false }]) {
    const raw = { ...order, ...changes, currentAppointmentId: 'confirmed-appointment', currentAppointmentVersion: 91, currentAppointmentStatus: 'CONFIRMED' }
    globalThis.fetch = async () => Response.json({ items: [raw] })
    assert.equal((await api.getAssignedOrders('manager')).items[0].currentAppointmentId, 'confirmed-appointment')
  }
})

test('unmapped Orders propose Baseline appointment first by sending the chosen day, not a computed UTC window, and retain server versions', () => {
  assert.deepEqual(workflow.appointmentBody(order, scope, scheduledDate), { purpose: 'BASELINE_MAPPING', scheduledDate, expectedOrderVersion: 51, expectedCurrentAppointmentId: null, expectedCurrentAppointmentVersion: null })
  assert.equal(workflow.appointmentBody({ ...order, status: 'AWAITING_PAID_APPOINTMENT' }, { ...scope, orderStatus: 'AWAITING_PAID_APPOINTMENT' }, scheduledDate).purpose, 'PAID_SERVICE')
})

test('appointmentScheduleLabel prefers BE-resolved ScheduledDate/ScheduledStartDate/ScheduledEndDate over deriving the day from raw UTC timestamps', () => {
  assert.equal(surveyWorkflow.appointmentScheduleLabel('2026-11-03', null, null, 'irrelevant', 'irrelevant'), 'Ngày 3/11/2026 (giờ Việt Nam)')
  assert.equal(surveyWorkflow.appointmentScheduleLabel(null, '2026-11-10', '2026-11-12', 'irrelevant', 'irrelevant'), '10/11/2026 – 12/11/2026 (giờ Việt Nam)')
  const partialStart = '2026-11-03T01:00:00.000Z', partialEnd = '2026-11-03T03:00:00.000Z'
  assert.equal(surveyWorkflow.appointmentScheduleLabel(null, null, null, partialStart, partialEnd), `${surveyWorkflow.dateTime(partialStart)} – ${surveyWorkflow.dateTime(partialEnd)}`)
})

test('appointment proposal refuses mismatched contexts, active appointments and malformed dates', () => {
  for (const changes of [{ orderVersion: 50 }, { surveyOrderId: 'other' }, { tenantId: 'other' }, { farmId: 'other' }, { status: 'COMPLETED' }, { currentAppointmentId: 'appointment', currentAppointmentVersion: 4, currentAppointmentStatus: 'PROPOSED' }, { currentAppointmentId: 'appointment', currentAppointmentVersion: null, currentAppointmentStatus: 'RESCHEDULE_REQUESTED' }]) assert.throws(() => workflow.appointmentBody({ ...order, ...changes }, scope, scheduledDate))
  for (const invalid of ['invalid', '', '2026-13-40', '2026-02-30', '2026-11-5']) assert.throws(() => workflow.appointmentBody(order, scope, invalid))
  assert.throws(() => workflow.appointmentBody({ ...order, status: 'AWAITING_BOUNDARY_CAPTURE' }, { ...scope, orderStatus: 'AWAITING_BOUNDARY_CAPTURE' }, scheduledDate))
  assert.throws(() => workflow.appointmentBody({ ...order, requiresBaselineMapping: false }, scope, scheduledDate))
  assert.throws(() => workflow.appointmentBody({ ...order, orderVersion: undefined }, { ...scope, orderVersion: undefined }, scheduledDate))
})

test('rescheduling sends the current appointment ID and exact version, never an assumed default', () => {
  const body = workflow.appointmentBody({ ...order, currentAppointmentId: 'appointment', currentAppointmentVersion: 73, currentAppointmentStatus: 'RESCHEDULE_REQUESTED' }, scope, scheduledDate)
  assert.equal(body.expectedCurrentAppointmentId, 'appointment')
  assert.equal(body.expectedCurrentAppointmentVersion, 73)
})

test('appointment API sends reviewed state and propagates a conflict without retrying', async () => {
  const body = workflow.appointmentBody(order, scope, scheduledDate)
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
