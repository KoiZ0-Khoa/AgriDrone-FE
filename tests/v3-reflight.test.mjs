import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

// G6 — lịch sử chuyến bay và bay lại (quality re-flight).
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const v3WorkflowUrl = urlFor(compile('../src/features/surveys/v3Workflow.ts'))
const v3 = await import(v3WorkflowUrl)
const v3Api = await import(urlFor(compile('../src/features/surveys/v3Api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(urlFor(compile('../src/features/surveys/orderWorkflow.ts').replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const surveyWorkflow = await import(urlFor(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl)).replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const attempt = (index, status, extra = {}) => ({ captureAttemptId: `a${index}`, attemptIndex: index, status, version: 10 + index, missionId: `m${index}`, parentAttemptId: index > 1 ? `a${index - 1}` : null, parentMissionId: index > 1 ? `m${index - 1}` : null, startedAt: null, endedAt: null, history: [], ...extra })
const order = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 31, status: 'AWAITING_REFLIGHT_DECISION', requiresBaselineMapping: false, surveyServiceCode: 'COMBO', currentAppointmentId: null, currentAppointmentVersion: null, currentAppointmentStatus: null, currentAppointmentPurpose: null }
const scope = { surveyOrderId: 'order', farmId: 'farm', tenantId: 'tenant', orderVersion: 31, orderStatus: 'AWAITING_REFLIGHT_DECISION', requiresBaselineMapping: false, serviceReviewedAt: null }
const values = { droneId: 'drone-2', scheduledDate: '2099-03-04', reason: '  Ảnh mờ do gió mạnh  ', technicalQualityEvidence: ' LOG-778 ' }

test('reflight parent is the latest attempt when it failed or needs a reflight, and only while nothing is active', () => {
  assert.equal(v3.reflightParentAttempt([attempt(1, 'FLIGHT_FAILED')]).captureAttemptId, 'a1')
  assert.equal(v3.reflightParentAttempt([attempt(1, 'ACCEPTED'), attempt(2, 'REFLIGHT_REQUIRED')]).captureAttemptId, 'a2')
  // Lần cũ lỗi nhưng đã có lần bay lại mới hơn: không lấy lần cũ.
  assert.equal(v3.reflightParentAttempt([attempt(1, 'FLIGHT_FAILED'), attempt(2, 'PLANNED')]), null)
  for (const status of ['ACCEPTED', 'CANCELLED', 'IN_FLIGHT', 'PROCESSING']) assert.equal(v3.reflightParentAttempt([attempt(1, status)]), null, status)
  assert.equal(v3.reflightParentAttempt([attempt(1, 'FLIGHT_FAILED', { version: 0 })]), null)
  assert.equal(v3.reflightParentAttempt([]), null)
  assert.equal(v3.canCreateQualityReflight('AWAITING_REFLIGHT_DECISION', [attempt(1, 'FLIGHT_FAILED')]), true)
  for (const status of ['READY_FOR_CAPTURE', 'CAPTURING', 'AWAITING_APPOINTMENT', 'CANCELLED']) assert.equal(v3.canCreateQualityReflight(status, [attempt(1, 'FLIGHT_FAILED')]), false, status)
})

test('drones for a reflight must cover every pinned service capability', () => {
  assert.equal(v3.droneSupportsService(['BASELINE_MAPPING'], 'MAP'), true)
  assert.equal(v3.droneSupportsService(['baseline_mapping'], 'MAP'), true)
  assert.equal(v3.droneSupportsService(['BASELINE_MAPPING'], 'COMBO'), false)
  assert.equal(v3.droneSupportsService(['BASELINE_MAPPING', 'PLANT_HEALTH'], 'COMBO'), true)
  assert.equal(v3.droneSupportsService(['PLANT_HEALTH'], 'COMBO'), false)
  assert.equal(v3.droneSupportsService(undefined, 'MAP'), false)
  assert.equal(v3.droneSupportsService(['BASELINE_MAPPING'], null), false)
})

test('reflight body uses the observed Order and parent versions and trims the text', () => {
  const now = Date.parse('2099-03-01T00:00:00Z')
  const { parentAttemptId, body } = workflow.qualityReflightBody(order, scope, [attempt(1, 'FLIGHT_FAILED')], values, now)
  assert.equal(parentAttemptId, 'a1')
  assert.deepEqual(body, { droneId: 'drone-2', scheduledDate: '2099-03-04', expectedOrderVersion: 31, expectedParentAttemptVersion: 11, reason: 'Ảnh mờ do gió mạnh', technicalQualityEvidence: 'LOG-778' })
})

test('reflight body refuses stale contexts, missing drone, past dates and invalid text', () => {
  const now = Date.parse('2099-03-01T00:00:00Z')
  const failed = [attempt(1, 'FLIGHT_FAILED')]
  assert.throws(() => workflow.qualityReflightBody({ ...order, orderVersion: 30 }, scope, failed, values, now), /không đồng nhất/)
  assert.throws(() => workflow.qualityReflightBody({ ...order, status: 'CAPTURING' }, { ...scope, orderStatus: 'CAPTURING' }, failed, values, now), /chờ quyết định bay lại/)
  assert.throws(() => workflow.qualityReflightBody(order, scope, [attempt(1, 'ACCEPTED')], values, now), /chờ quyết định bay lại/)
  assert.throws(() => workflow.qualityReflightBody(order, scope, failed, { ...values, droneId: undefined }, now), /drone/)
  for (const scheduledDate of ['', '2099-02-30', 'tomorrow']) assert.throws(() => workflow.qualityReflightBody(order, scope, failed, { ...values, scheduledDate }, now), /hợp lệ/)
  assert.throws(() => workflow.qualityReflightBody(order, scope, failed, { ...values, scheduledDate: '2099-02-28' }, now), /hôm nay/)
  for (const changes of [{ reason: '  ' }, { reason: 'r'.repeat(501) }, { technicalQualityEvidence: '' }, { technicalQualityEvidence: 'e'.repeat(501) }]) assert.throws(() => workflow.qualityReflightBody(order, scope, failed, { ...values, ...changes }, now))
})

test('reflight API posts to the parent attempt route and reads coordinator errors from the title', async () => {
  const body = { droneId: 'drone-2', scheduledDate: '2099-03-04', expectedOrderVersion: 31, expectedParentAttemptVersion: 11, reason: 'r', technicalQualityEvidence: 'e', operationId: 'op', payloadFingerprint: 'f'.repeat(64) }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/v3/system-manager/survey-orders/o%2F1/capture-attempts/a%2F1/quality-reflights')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json({ success: true, successorAttemptId: 'a2', successorAttemptIndex: 2, newMissionId: 'm2', status: 'Planned', version: 1 }, { status: 201 })
  }
  const result = await v3Api.createQualityReflight('manager', 'o/1', 'a/1', body)
  assert.equal(result.successorAttemptIndex, 2)
  assert.equal(result.newMissionId, 'm2')
  for (const [code, pattern] of [['REFLIGHT_VERSION_CONFLICT', /vừa được cập nhật/], ['DEPOSIT_NOT_SATISFIED', /cọc/], ['DRONE_NOT_READY', /Drone/], ['APPOINTMENT_WINDOW_INVALID', /khung giờ/]]) {
    globalThis.fetch = async () => Response.json({ title: code, detail: 'English detail', status: 409 }, { status: 409 })
    await assert.rejects(v3Api.createQualityReflight('manager', 'o/1', 'a/1', body), error => error.code === code && pattern.test(surveyWorkflow.workflowError(error)))
  }
})

test('every BE capture attempt action has a Vietnamese history label', () => {
  for (const action of ['CreateInitial', 'CreateSuccessor', 'MarkPreflightReady', 'InvalidatePreflight', 'StartFlight', 'RecordFlightCompleted', 'RecordFlightFailed', 'MarkUploaded', 'StartProcessing', 'AcceptProcessing', 'RequireReflight', 'Cancel']) {
    assert.ok(v3.captureAttemptActionLabels[action], action)
  }
})
