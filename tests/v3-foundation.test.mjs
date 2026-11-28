import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = urlFor(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const v3WorkflowUrl = urlFor(compile('../src/features/surveys/v3Workflow.ts'))
const client = await import(clientUrl)
const v3 = await import(v3WorkflowUrl)
const v3Api = await import(urlFor(compile('../src/features/surveys/v3Api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const orderWorkflow = await import(urlFor(compile('../src/features/surveys/orderWorkflow.ts').replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const paymentWorkflowUrl = urlFor(compile('../src/features/surveys/paymentWorkflow.ts'))
const ownerWorkflow = await import(urlFor(compile('../src/features/surveys/ownerOrderWorkflow.ts').replace("'./paymentWorkflow'", JSON.stringify(paymentWorkflowUrl)).replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))
const surveyWorkflow = await import(urlFor(compile('../src/features/surveys/workflow.ts').replace("'../../api/client'", JSON.stringify(clientUrl)).replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl))))

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

// BE SurveyOrderStatus (V3 + kết thúc) và CaptureAttemptStatus, viết tay theo enum BE để test bắt được khi FE lệch.
const beV3OrderStatuses = ['AWAITING_APPOINTMENT', 'AWAITING_DEPOSIT', 'READY_FOR_CAPTURE', 'CAPTURING', 'AWAITING_CAPTURE_UPLOAD', 'AWAITING_INPUT_REVIEW', 'AWAITING_PROCESSING', 'PROCESSING', 'AWAITING_REFLIGHT_DECISION', 'AWAITING_SETTLEMENT', 'COMPLETED', 'CANCELLED']
const beEnumNames = ['AwaitingAppointment', 'AwaitingDeposit', 'ReadyForCapture', 'Capturing', 'AwaitingCaptureUpload', 'AwaitingInputReview', 'AwaitingProcessing', 'Processing', 'AwaitingReflightDecision', 'AwaitingSettlement', 'Completed', 'Cancelled']
const beAttemptStatuses = ['PLANNED', 'PREFLIGHT_READY', 'IN_FLIGHT', 'AWAITING_UPLOAD', 'UPLOADED', 'PROCESSING', 'ACCEPTED', 'REFLIGHT_REQUIRED', 'FLIGHT_FAILED', 'CANCELLED']
const legacyStatuses = ['PENDING_BOUNDARY_VERIFICATION', 'AWAITING_BASELINE_APPOINTMENT', 'AWAITING_BASELINE_DEPOSIT', 'AWAITING_BOUNDARY_CAPTURE', 'BASELINE_READY', 'BASELINE_IN_PROGRESS', 'AWAITING_BASELINE_REVIEW', 'AWAITING_PRICING', 'AWAITING_PAID_APPOINTMENT', 'AWAITING_PAYMENT', 'READY_FOR_PAID_SERVICE', 'IN_PROGRESS', 'PENDING_REVIEW']

test('order status labels and filters cover exactly the V3 statuses, no legacy ones', () => {
  assert.deepEqual(Object.keys(orderWorkflow.orderStatusLabels), beV3OrderStatuses)
  for (const status of legacyStatuses) assert.equal(orderWorkflow.orderStatusLabels[status], undefined, status)
  for (const status of beV3OrderStatuses) assert.ok(orderWorkflow.orderStatusLabels[status].length > 0)
  // Mọi trạng thái còn thao tác đều có hướng dẫn; trạng thái kết thúc thì không.
  for (const status of beV3OrderStatuses.slice(0, 10)) assert.ok(orderWorkflow.orderStageNotices[status]?.title, status)
  assert.equal(orderWorkflow.orderStageNotices.COMPLETED, undefined)
  assert.equal(orderWorkflow.orderStageNotices.AWAITING_BASELINE_DEPOSIT, undefined)
})

test('Owner filter maps each V3 status to the BE enum member name the query binder accepts', () => {
  assert.deepEqual(Object.keys(ownerWorkflow.ownerOrderStatusQuery), beV3OrderStatuses)
  assert.deepEqual(Object.values(ownerWorkflow.ownerOrderStatusQuery), beEnumNames)
  for (const status of legacyStatuses) assert.equal(ownerWorkflow.ownerOrderStatusQuery[status], undefined, status)
})

test('capture attempt labels and active attempt selection follow the BE active-attempt filter', () => {
  assert.deepEqual(Object.keys(v3.captureAttemptStatusLabels), beAttemptStatuses)
  assert.deepEqual([...v3.activeCaptureAttemptStatuses], ['PLANNED', 'PREFLIGHT_READY', 'IN_FLIGHT', 'AWAITING_UPLOAD', 'UPLOADED', 'PROCESSING'])
  const failed = { captureAttemptId: 'a1', attemptIndex: 1, status: 'FLIGHT_FAILED' }
  const reflight = { captureAttemptId: 'a2', attemptIndex: 2, status: 'IN_FLIGHT' }
  assert.equal(v3.activeCaptureAttempt([failed, reflight]).captureAttemptId, 'a2')
  assert.equal(v3.activeCaptureAttempt([failed]), null)
  assert.equal(v3.activeCaptureAttempt([]), null)
  assert.equal(v3.latestCaptureAttempt([reflight, failed]).captureAttemptId, 'a2')
  assert.equal(v3.latestCaptureAttempt([]), null)
})

test('service kind recognises only the V3 MAP and COMBO codes', () => {
  assert.equal(v3.v3ServiceKind('MAP'), 'MAP')
  assert.equal(v3.v3ServiceKind(' combo '), 'COMBO')
  assert.equal(v3.v3ServiceKind('PLANT_HEALTH'), null)
  assert.equal(v3.v3ServiceKind(null), null)
  assert.equal(v3.screensDisease('COMBO'), true)
  assert.equal(v3.screensDisease('MAP'), false)
})

test('V3 operation keeps operationId and fingerprint for the same payload and renews them when it changes', async () => {
  const first = await v3.v3OperationFor(null, { droneId: 'd1', expectedOrderVersion: 3 })
  assert.match(first.operationId, /^[0-9a-f-]{36}$/)
  assert.match(first.payloadFingerprint, /^[0-9a-f]{64}$/)
  assert.equal(await v3.v3OperationFor(first, { droneId: 'd1', expectedOrderVersion: 3 }), first)
  const changed = await v3.v3OperationFor(first, { droneId: 'd2', expectedOrderVersion: 3 })
  assert.notEqual(changed.operationId, first.operationId)
  assert.notEqual(changed.payloadFingerprint, first.payloadFingerprint)
  // Cùng nội dung luôn ra cùng fingerprint, kể cả khi khóa thao tác khác.
  const again = await v3.v3OperationFor(null, { droneId: 'd2', expectedOrderVersion: 3 })
  assert.equal(again.payloadFingerprint, changed.payloadFingerprint)
})

test('client reads coordinator error codes from the problem title, but not ordinary titles', async () => {
  globalThis.fetch = async () => Response.json({ title: 'CAPTURE_VERSION_CONFLICT', detail: 'Capture graph is missing or stale.', status: 409 }, { status: 409 })
  await assert.rejects(client.apiRequest('/x', { token: 't' }), error => error.code === 'CAPTURE_VERSION_CONFLICT' && error.status === 409 && error.message === 'Capture graph is missing or stale.')
  globalThis.fetch = async () => Response.json({ title: 'Conflict', detail: 'Something else.' }, { status: 409 })
  await assert.rejects(client.apiRequest('/x', { token: 't' }), error => error.code === undefined)
  globalThis.fetch = async () => Response.json({ title: 'SOME_TITLE', errorCode: 'Order.NotFound' }, { status: 404 })
  await assert.rejects(client.apiRequest('/x', { token: 't' }), error => error.code === 'Order.NotFound')
})

test('workflowError translates V3 coordinator and module codes, and keeps raw text for unknown ones', () => {
  const error = (status, code, message = 'raw') => new client.ApiError(status, message, code)
  assert.match(surveyWorkflow.workflowError(error(409, 'CAPTURE_VERSION_CONFLICT')), /Lần bay hoặc đơn vừa được cập nhật/)
  assert.match(surveyWorkflow.workflowError(error(409, 'DRONE_CAPABILITY_MISMATCH')), /không đủ khả năng/)
  assert.match(surveyWorkflow.workflowError(error(403, 'CaptureAttempts.ManagerForbidden')), /không còn là Manager được phân công/)
  assert.match(surveyWorkflow.workflowError(error(409, 'Cancellation.RetentionExceedsAllowedCap')), /vượt mức cho phép/)
  assert.equal(surveyWorkflow.workflowError(error(409, 'BRAND_NEW_CODE', 'Detail from BE.')), 'Detail from BE.')
  for (const [code, message] of Object.entries(v3.v3ErrorMessages)) assert.ok(message.trim().length > 10, code)
})

test('getCaptureAttempts calls the V3 manager route with bearer, sorts by attempt index and rejects bad shapes', async () => {
  const controller = new AbortController()
  const attempt = (index, status) => ({ captureAttemptId: `a${index}`, attemptIndex: index, status, version: 1, missionId: `m${index}`, parentAttemptId: null, parentMissionId: null, startedAt: null, endedAt: null, history: [] })
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3/system-manager/survey-orders/order%2F1/capture-attempts')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.signal, controller.signal)
    return Response.json([attempt(2, 'PLANNED'), attempt(1, 'FLIGHT_FAILED')])
  }
  const attempts = await v3Api.getCaptureAttempts('manager', 'order/1', controller.signal)
  assert.deepEqual(attempts.map(item => item.attemptIndex), [1, 2])
  globalThis.fetch = async () => Response.json([])
  assert.deepEqual(await v3Api.getCaptureAttempts('manager', 'order'), [])
  globalThis.fetch = async () => Response.json({ items: [] })
  await assert.rejects(v3Api.getCaptureAttempts('manager', 'order'), /không hợp lệ/)
  globalThis.fetch = async () => Response.json({ title: 'Forbidden', errorCode: 'CaptureAttempts.ManagerForbidden' }, { status: 403 })
  await assert.rejects(v3Api.getCaptureAttempts('manager', 'order'), error => error.code === 'CaptureAttempts.ManagerForbidden')
})

test('V3 flight mutations send the attempt and order versions with exact action evidence', async () => {
  const expected = { expectedOrderVersion: 54, expectedAttemptVersion: 4, operationId: 'flight-operation', payloadFingerprint: 'f'.repeat(64) }
  const at = '2026-11-26T02:03:04.000Z'
  const actions = [
    ['start', v3Api.startCaptureFlight, { ...expected, missionId: 'mission' }, { startedAt: at, status: 'InFlight' }],
    ['complete-flight', v3Api.completeCaptureFlight, { ...expected, endedAt: at, flightCompletedReceipt: 'flight-record' }, { endedAt: at, status: 'AwaitingUpload' }],
    ['fail-flight', v3Api.failCaptureFlight, { ...expected, failedAt: at, failureReason: 'Pin yếu', failureIncidentEvidence: 'blackbox' }, { status: 'FlightFailed' }],
  ]
  for (const [route, send, body, response] of actions) {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).pathname, `/api/v3/system-manager/survey-orders/order%2F1/capture-attempts/attempt%2F1/${route}`)
      assert.equal(options.headers.Authorization, 'Bearer manager')
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), body)
      return Response.json({ success: true, attemptId: 'attempt/1', version: 5, ...response })
    }
    assert.equal((await send('manager', 'order/1', 'attempt/1', body)).status, response.status)
  }
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ title: 'CAPTURE_VERSION_CONFLICT' }, { status: 409 }) }
  await assert.rejects(v3Api.startCaptureFlight('manager', 'order/1', 'attempt/1', { ...expected, missionId: 'mission' }), error => error.code === 'CAPTURE_VERSION_CONFLICT')
  assert.equal(calls, 1)
})

test('V3 capture input freeze sends the mission and observed versions and preserves the manifest receipt', async () => {
  const body = { missionId: 'mission', expectedOrderVersion: 55, expectedAttemptVersion: 5, operationId: 'freeze-operation', payloadFingerprint: 'a'.repeat(64) }
  const receipt = { success: true, attemptId: 'attempt/1', manifestId: 'manifest', manifestFingerprint: 'A'.repeat(64), totalFileCount: 190, totalSizeBytes: 104857600, status: 'Uploaded', version: 6, processingJobId: 'job', orderVersion: 56 }
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3/system-manager/survey-orders/order%2F1/capture-attempts/attempt%2F1/input-manifest/freeze')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json(receipt)
  }
  assert.deepEqual(await v3Api.freezeCaptureInput('manager', 'order/1', 'attempt/1', body), receipt)
  globalThis.fetch = async () => Response.json({ title: 'CAPTURE_MEDIA_INCOMPLETE' }, { status: 409 })
  await assert.rejects(v3Api.freezeCaptureInput('manager', 'order/1', 'attempt/1', body), error => error.code === 'CAPTURE_MEDIA_INCOMPLETE')
})

test('V3 capture review sends the current manifest and versions to reopen or approve', async () => {
  const base = { manifestId: 'manifest', expectedOrderVersion: 56, expectedAttemptVersion: 6, operationId: 'operation', payloadFingerprint: 'a'.repeat(64) }
  const actions = [
    [v3Api.reopenCaptureInput, 'input-manifest/reopen', { ...base, reason: 'Thiếu telemetry' },
      { status: 'AwaitingUpload', missionId: 'mission', supersededManifestId: 'manifest', orderVersion: 57 }],
    [v3Api.approveCaptureInput, 'input-approval', { ...base, manifestFingerprint: 'A'.repeat(64), processingJobId: 'job', notes: 'Đã kiểm tra ảnh và log' },
      { status: 'Processing', approvalId: 'approval' }],
    [v3Api.reopenCaptureInput, 'input-manifest/reopen', { ...base, expectedOrderVersion: 57, expectedAttemptVersion: 7,
      reason: 'Thay ảnh chuyến bay bệnh', replaceApprovedInput: true },
      { status: 'AwaitingUpload', missionId: 'mission', supersededManifestId: 'manifest', orderVersion: 58, version: 8 }],
  ]
  for (const [send, route, body, response] of actions) {
    const receipt = { success: true, attemptId: 'attempt/1', version: 7, ...response }
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).pathname, `/api/v3/system-manager/survey-orders/order%2F1/capture-attempts/attempt%2F1/${route}`)
      assert.equal(options.headers.Authorization, 'Bearer manager')
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), body)
      return Response.json(receipt, { status: route === 'input-approval' ? 201 : 200 })
    }
    assert.deepEqual(await send('manager', 'order/1', 'attempt/1', body), receipt)
  }

  let attempts = 0
  globalThis.fetch = async () => {
    attempts++
    return Response.json({ title: 'CAPTURE_TELEMETRY_NOT_FROZEN' }, { status: 409 })
  }
  await assert.rejects(v3Api.approveCaptureInput('manager', 'order/1', 'attempt/1', actions[1][2]),
    error => error.status === 409 && error.code === 'CAPTURE_TELEMETRY_NOT_FROZEN')
  assert.equal(attempts, 1)
})

test('V3 boundary uses the CaptureAttempt endpoint and the current Order, Mission and Farm boundary versions', async () => {
  const corners = [[106.491, 10.461], [106.492, 10.461], [106.492, 10.462], [106.491, 10.462]]
    .map(([longitude, latitude], index) => ({ sequence: index + 1, longitude, latitude }))
  const body = { expectedOrderVersion: 41, expectedMissionVersion: 43, expectedBoundaryVersionNumber: 2, corners }
  const receipt = { surveyOrderId: 'order/1', farmBoundaryId: 'boundary', boundaryVersionNumber: 3, orderVersion: 44, missionVersion: 44 }
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3/system-manager/survey-orders/order%2F1/capture-attempts/attempt%2F1/farm-boundary/mark-orthophoto-corners')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.deepEqual(JSON.parse(options.body), body)
    return Response.json(receipt)
  }
  assert.deepEqual(await v3Api.markCaptureBoundary('manager', 'order/1', 'attempt/1', body), receipt)
})

test('V3 recovery sends a bodyless POST for the approved attempt and surfaces a 409', async () => {
  const receipt = {
    success: true, attemptId: 'attempt/1', missionId: 'mission', approvalId: 'approval',
    manifestId: 'manifest', processingJobId: 'job', missionVersion: 42, alreadyReady: true,
  }
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3/system-manager/survey-orders/order%2F1/capture-attempts/attempt%2F1/input-approval/recover')
    assert.equal(options.headers.Authorization, 'Bearer manager')
    assert.equal(options.method, 'POST')
    assert.equal(options.body, undefined)
    return Response.json(receipt)
  }
  assert.deepEqual(await v3Api.recoverApprovedCaptureMission('manager', 'order/1', 'attempt/1'), receipt)

  globalThis.fetch = async () => Response.json({ title: 'CAPTURE_APPROVAL_NOT_CURRENT' }, { status: 409 })
  await assert.rejects(v3Api.recoverApprovedCaptureMission('manager', 'order/1', 'attempt/1'),
    error => error.status === 409 && error.code === 'CAPTURE_APPROVAL_NOT_CURRENT')
})
