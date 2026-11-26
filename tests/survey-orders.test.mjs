import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const api = await import(dataUrl(compile('../src/features/surveys/orderApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const health = await import(dataUrl(compile('../src/features/surveys/plantHealthApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const v3WorkflowUrl = dataUrl(compile('../src/features/surveys/v3Workflow.ts'))
const v3Api = await import(dataUrl(compile('../src/features/surveys/v3Api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/surveys/orderWorkflow.ts').replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const surveyWorkflow = await import(dataUrl(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl)).replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })


test('assigned Order directory preserves paging/filter, cancellation and Manager authorization', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/system-manager/survey-orders')
    assert.equal(parsed.searchParams.get('pageNumber'), '3')
    assert.equal(parsed.searchParams.get('status'), 'AWAITING_APPOINTMENT')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.signal, controller.signal)
    return Response.json({ items: [{ surveyOrderId: 'order', orderVersion: 31, currentAppointmentId: null, currentAppointmentVersion: null }], totalCount: 41 })
  }
  assert.equal((await api.getAssignedOrders('manager', 3, 'AWAITING_APPOINTMENT', controller.signal)).items[0].orderVersion, 31)
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
  const current = { surveyOrderId: 'order', tenantId: 'tenant', farmId: 'farm', status: 'AWAITING_APPOINTMENT', requiresBaselineMapping: false, orderVersion: 2345, currentAppointmentId: 'appointment', currentAppointmentVersion: 2494, currentAppointmentPurpose: 'CAPTURE' }
  const response = { items: [{ ...current, currentAppointmentStatus: 'RESCHEDULEREQUESTED' }], totalCount: 3, pageNumber: 1, pageSize: 20, hasNextPage: false }
  globalThis.fetch = async () => Response.json(response)
  const page = await api.getAssignedOrders('manager')
  assert.equal(page.items[0].currentAppointmentStatus, 'RESCHEDULE_REQUESTED')
  assert.equal(page.items[0].currentAppointmentVersion, 2494)
  assert.equal(page.items[0].orderVersion, 2345)
  assert.equal(page.totalCount, 3)
  assert.equal((await api.getAssignedOrder('manager', 'order')).currentAppointmentStatus, 'RESCHEDULE_REQUESTED')
  const body = workflow.captureAppointmentBody(page.items[0], { ...current, orderStatus: current.status, serviceReviewedAt: null }, '2099-01-01')
  assert.equal(body.expectedCurrentAppointmentId, 'appointment')
  assert.equal(body.expectedCurrentAppointmentVersion, 2494)
  for (const status of ['RESCHEDULE_REQUESTED', 'PROPOSED', 'CONFIRMED', null]) {
    globalThis.fetch = async () => Response.json({ ...response, items: [{ ...current, currentAppointmentStatus: status }] })
    assert.equal((await api.getAssignedOrders('manager')).items[0].currentAppointmentStatus, status)
  }
})

// G2 — lịch hẹn bay V3 (CAPTURE).
const scope = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 51, orderStatus: 'AWAITING_APPOINTMENT', requiresBaselineMapping: false, serviceReviewedAt: null }
const order = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 51, status: 'AWAITING_APPOINTMENT', requiresBaselineMapping: false, currentAppointmentId: null, currentAppointmentVersion: null, currentAppointmentStatus: null, currentAppointmentPurpose: null }
const scheduledDate = '2099-11-10'
const withAppointment = (status, version = 73) => ({ ...order, currentAppointmentId: 'appointment', currentAppointmentVersion: version, currentAppointmentStatus: status, currentAppointmentPurpose: 'CAPTURE' })

test('V3 capture proposal is open only while the Order awaits an appointment, with no live appointment', () => {
  assert.equal(workflow.canProposeCaptureAppointment(order, scope), true)
  assert.deepEqual(workflow.captureAppointmentBody(order, scope, scheduledDate), { scheduledDate, expectedOrderVersion: 51, expectedCurrentAppointmentId: null, expectedCurrentAppointmentVersion: null })
  // Không còn trường purpose: BE tự tạo lịch CAPTURE.
  assert.equal('purpose' in workflow.captureAppointmentBody(order, scope, scheduledDate), false)
  for (const status of ['AWAITING_DEPOSIT', 'READY_FOR_CAPTURE', 'CAPTURING', 'AWAITING_BASELINE_APPOINTMENT', 'AWAITING_PAID_APPOINTMENT']) {
    const moved = { ...order, status }
    assert.equal(workflow.canProposeCaptureAppointment(moved, { ...scope, orderStatus: status }), false, status)
    assert.throws(() => workflow.captureAppointmentBody(moved, { ...scope, orderStatus: status }, scheduledDate))
  }
  // Lịch chờ Owner xác nhận hoặc đã xác nhận: BE từ chối đề xuất chồng.
  for (const status of ['PROPOSED', 'CONFIRMED']) assert.equal(workflow.canProposeCaptureAppointment(withAppointment(status), scope), false, status)
})

test('V3 replacement proposal after a reschedule request sends the current appointment ID and exact version', () => {
  const current = withAppointment('RESCHEDULE_REQUESTED', 2494)
  assert.equal(workflow.canProposeCaptureAppointment(current, scope), true)
  const body = workflow.captureAppointmentBody(current, scope, scheduledDate)
  assert.equal(body.expectedCurrentAppointmentId, 'appointment')
  assert.equal(body.expectedCurrentAppointmentVersion, 2494)
  assert.equal(workflow.canProposeCaptureAppointment(withAppointment('RESCHEDULE_REQUESTED', null), scope), false)
})

test('V3 proposal refuses mismatched contexts and malformed or past dates, using Vietnam time', () => {
  for (const changes of [{ orderVersion: 50 }, { surveyOrderId: 'other' }, { tenantId: 'other' }, { farmId: 'other' }, { status: 'COMPLETED' }, { requiresBaselineMapping: true }]) assert.throws(() => workflow.captureAppointmentBody({ ...order, ...changes }, scope, scheduledDate))
  for (const invalid of ['invalid', '', '2026-13-40', '2026-02-30', '2026-11-5']) assert.throws(() => workflow.captureAppointmentBody(order, scope, invalid))
  const now = Date.parse('2026-11-16T17:01:00Z') // 00:01 ngày 17/11 giờ Việt Nam.
  assert.equal(workflow.operationsDate(now), '2026-11-17')
  assert.throws(() => workflow.captureAppointmentBody(order, scope, '2026-11-16', now), /hôm nay/)
  assert.equal(workflow.captureAppointmentBody(order, scope, '2026-11-17', now).scheduledDate, '2026-11-17')
  const nearlyMidnight = Date.parse('2026-11-17T16:56:00Z')
  assert.throws(() => workflow.captureAppointmentBody(order, scope, '2026-11-17', nearlyMidnight), /hôm nay/)
  assert.equal(workflow.captureAppointmentBody(order, scope, '2026-11-18', nearlyMidnight).scheduledDate, '2026-11-18')
})

test('appointmentScheduleLabel prefers BE-resolved ScheduledDate/ScheduledStartDate/ScheduledEndDate over deriving the day from raw UTC timestamps', () => {
  assert.equal(surveyWorkflow.appointmentScheduleLabel('2026-11-03', null, null, 'irrelevant', 'irrelevant'), 'Ngày 3/11/2026 (giờ Việt Nam)')
  assert.equal(surveyWorkflow.appointmentScheduleLabel(null, '2026-11-10', '2026-11-12', 'irrelevant', 'irrelevant'), '10/11/2026 – 12/11/2026 (giờ Việt Nam)')
  const partialStart = '2026-11-03T01:00:00.000Z', partialEnd = '2026-11-03T03:00:00.000Z'
  assert.equal(surveyWorkflow.appointmentScheduleLabel(null, null, null, partialStart, partialEnd), `${surveyWorkflow.dateTime(partialStart)} – ${surveyWorkflow.dateTime(partialEnd)}`)
})

test('V3 proposal API posts to the capture-appointments route and propagates a conflict without retrying', async () => {
  assert.equal(api.proposeAppointment, undefined)
  const body = workflow.captureAppointmentBody(order, scope, scheduledDate)
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'http://test.local/api/v3/system-manager/survey-orders/o%2F1/capture-appointments')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ errorCode: 'SurveyAppointment.VersionConflict', traceId: 'trace' }, { status: 409 })
  }
  await assert.rejects(v3Api.proposeCaptureAppointment('manager', 'o/1', body), error => error.code === 'SurveyAppointment.VersionConflict' && error.traceId === 'trace')
  assert.equal(calls, 1)
  globalThis.fetch = async () => Response.json({ appointmentId: 'new', purpose: 'CAPTURE', appointmentStatus: 'PROPOSED', orderStatus: 'AWAITINGAPPOINTMENT' }, { status: 201 })
  assert.equal((await v3Api.proposeCaptureAppointment('manager', 'o/1', body)).appointmentId, 'new')
})

test('no-show is open only for a confirmed appointment on a ready Order, and sends UTC time with trimmed evidence', () => {
  const ready = { ...withAppointment('CONFIRMED', 9), status: 'READY_FOR_CAPTURE' }
  const readyScope = { ...scope, orderStatus: 'READY_FOR_CAPTURE' }
  assert.equal(workflow.canRecordCaptureNoShow(ready, readyScope), true)
  for (const [changes, scopeChanges] of [[{ currentAppointmentStatus: 'PROPOSED' }, {}], [{ status: 'AWAITING_DEPOSIT' }, { orderStatus: 'AWAITING_DEPOSIT' }], [{ status: 'CAPTURING' }, { orderStatus: 'CAPTURING' }], [{ currentAppointmentVersion: null }, {}], [{ orderVersion: 50 }, {}]]) {
    assert.equal(workflow.canRecordCaptureNoShow({ ...ready, ...changes }, { ...readyScope, ...scopeChanges }), false, JSON.stringify(changes))
  }
  const now = Date.parse('2026-11-21T03:00:00Z')
  const body = workflow.captureNoShowBody(ready, readyScope, { occurredAt: '2026-11-20T09:30', reason: '  Gọi 3 lần không nghe  ', evidenceReference: ' CALL-123 ' }, now)
  assert.equal(body.appointmentId, 'appointment')
  assert.equal(body.expectedAppointmentVersion, 9)
  assert.equal(body.expectedOrderVersion, 51)
  assert.match(body.occurredAt, /Z$/)
  assert.equal(body.reason, 'Gọi 3 lần không nghe')
  assert.equal(body.evidenceReference, 'CALL-123')
  assert.throws(() => workflow.captureNoShowBody(ready, readyScope, { occurredAt: '2099-01-01T00:00', reason: 'r', evidenceReference: 'e' }, now), /tương lai/)
  for (const values of [{ reason: ' ', evidenceReference: 'e' }, { reason: 'r', evidenceReference: '' }, { reason: 'r'.repeat(501), evidenceReference: 'e' }]) assert.throws(() => workflow.captureNoShowBody(ready, readyScope, { occurredAt: '2026-11-20T09:30', ...values }, now))
  assert.throws(() => workflow.captureNoShowBody({ ...ready, currentAppointmentStatus: 'PROPOSED' }, readyScope, { occurredAt: '2026-11-20T09:30', reason: 'r', evidenceReference: 'e' }, now))
})

test('no-show API sends the operation key and fingerprint and reads the coordinator conflict code from the title', async () => {
  const body = { appointmentId: 'appointment', expectedOrderVersion: 51, expectedAppointmentVersion: 9, occurredAt: '2026-11-20T02:30:00.000Z', reason: 'r', evidenceReference: 'e', operationId: 'op', payloadFingerprint: 'f'.repeat(64) }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/v3/system-manager/survey-orders/o%2F1/capture-appointments/no-show')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ success: true, orderId: 'o/1', appointmentId: 'appointment', noShowId: 'ns', occurrenceIndex: 2, disposition: 'AdminReviewRequired', orderStatus: 'AwaitingAppointment', appointmentStatus: 'RescheduleRequested' }, { status: 201 })
  }
  assert.equal((await v3Api.recordCaptureNoShow('manager', 'o/1', body)).disposition, 'AdminReviewRequired')
  globalThis.fetch = async () => Response.json({ title: 'NO_SHOW_TIME_INVALID', detail: 'No-show evidence can only be recorded in UTC after the appointment starts.', status: 409 }, { status: 409 })
  await assert.rejects(v3Api.recordCaptureNoShow('manager', 'o/1', body), error => error.code === 'NO_SHOW_TIME_INVALID' && /không hợp lệ/.test(surveyWorkflow.workflowError(error)))
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

test('health review stays reachable read-only after internal publication, but not for unreviewed or other-service orders', () => {
  const reviewed = { serviceReviewedAt: '2026-11-16T03:00:00Z' }
  for (const orderStatus of ['PENDING_REVIEW', 'COMPLETED']) assert.equal(workflow.canOpenHealthReview('PLANT_HEALTH', { orderStatus, serviceReviewedAt: null }), true)
  for (const orderStatus of ['AWAITING_PRICING', 'AWAITING_PAYMENT']) {
    assert.equal(workflow.canOpenHealthReview('PLANT_HEALTH', { orderStatus, ...reviewed }), true)
    assert.equal(workflow.canOpenHealthReview('PLANT_HEALTH', { orderStatus, serviceReviewedAt: null }), false)
    assert.equal(workflow.canOpenHealthReview('PLANT_HEALTH', { orderStatus, serviceReviewedAt: undefined }), false)
    assert.equal(workflow.canOpenHealthReview('BASELINE_MAPPING', { orderStatus, ...reviewed }), false)
  }
  for (const orderStatus of ['AWAITING_PAID_APPOINTMENT', 'READY_FOR_PAID_SERVICE', 'IN_PROGRESS']) assert.equal(workflow.canOpenHealthReview('PLANT_HEALTH', { orderStatus, ...reviewed }), false)
})
