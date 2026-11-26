import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { appointmentId, confirmedOrder, history, orderId, ownerInvoice, ownerOrder, paymentItem } from './owner-payment-fixtures.mjs'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const v3WorkflowUrl = dataUrl(compile('../src/features/surveys/v3Workflow.ts'))
const workflowUrl = dataUrl(compile('../src/features/surveys/ownerOrderWorkflow.ts').replace("'./v3Workflow'", JSON.stringify(v3WorkflowUrl)))
const flow = await import(workflowUrl)
const api = await import(dataUrl(compile('../src/features/surveys/ownerOrderApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl)).replace("'./ownerOrderWorkflow'", JSON.stringify(workflowUrl))))
const v3Api = await import(dataUrl(compile('../src/features/surveys/v3Api.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const readPaymentApi = await import(dataUrl(compile('../src/features/surveys/paymentApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const v3Base = 'http://test.local/api/v3/tenant-owner/survey-orders'
const v3Proposed = ownerOrder
const v3Confirmed = confirmedOrder

test('V3 Owner confirms only an appointment for capture', () => {
  assert.equal(flow.canConfirmOwnerAppointment(v3Proposed), true)
  for (const purpose of ['PAID_SERVICE', 'BASELINE_MAPPING']) {
    const wrongPurpose = { ...v3Proposed, currentAppointment: { ...v3Proposed.currentAppointment, purpose } }
    assert.equal(flow.canConfirmOwnerAppointment(wrongPurpose), false, purpose)
    assert.equal(flow.canRescheduleOwnerAppointment(wrongPurpose), false, purpose)
  }
  // Trạng thái đơn của luồng cũ không còn được xác nhận lịch.
  for (const status of ['AWAITING_BASELINE_APPOINTMENT', 'AWAITING_PAID_APPOINTMENT', 'AWAITING_DEPOSIT', 'READY_FOR_CAPTURE']) assert.equal(flow.canConfirmOwnerAppointment({ ...v3Proposed, status }), false, status)
})

test('Owner list uses BE pagination/filter enum and bearer, never sends a tenant ID supplied by URL', async () => {
  const abort = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/v3/tenant-owner/survey-orders')
    assert.equal(parsed.searchParams.get('pageNumber'), '3')
    assert.equal(parsed.searchParams.get('pageSize'), '20')
    assert.equal(parsed.searchParams.get('status'), 'AwaitingReflightDecision')
    assert.equal(parsed.searchParams.has('tenantId'), false)
    assert.equal(options.headers.Authorization, 'Bearer owner')
    assert.equal(options.signal, abort.signal)
    return Response.json({ items: [confirmedOrder], pageNumber: 3, pageSize: 20, totalCount: 41 })
  }
  assert.equal((await api.getOwnerOrders('owner', 3, 'AWAITING_REFLIGHT_DECISION', abort.signal)).totalCount, 41)
  assert.throws(() => api.getOwnerOrders('owner', 1, 'UNSUPPORTED'))
  // Web chỉ lọc theo trạng thái V3: trạng thái của luồng cũ bị chặn trước khi gọi BE.
  assert.throws(() => api.getOwnerOrders('owner', 1, 'AWAITING_BASELINE_DEPOSIT'))
})

test('Owner detail reads the V3 order and capture appointment, and rejects a different order', async () => {
  const abort = new AbortController()
  globalThis.fetch = async (url, options) => { assert.equal(url, v3Base + '/' + orderId); assert.equal(options.signal, abort.signal); return Response.json(ownerOrder) }
  assert.deepEqual(await api.getOwnerOrder('owner', orderId, abort.signal), ownerOrder)
  globalThis.fetch = async () => Response.json({ ...ownerOrder, surveyOrderId: appointmentId })
  await assert.rejects(api.getOwnerOrder('owner', orderId), /không khớp/)
})

test('Owner invoice reads the V3 invoice and distinguishes not finalized from request errors', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, v3Base + '/' + orderId + '/invoice')
    assert.equal(options.headers.Authorization, 'Bearer owner')
    return Response.json(ownerInvoice)
  }
  assert.deepEqual(await api.getOwnerOrderInvoice('owner', orderId), ownerInvoice)
  globalThis.fetch = async () => Response.json({ errorCode: 'Invoice.NotFound' }, { status: 404 })
  assert.equal(await api.getOwnerOrderInvoice('owner', orderId), null)
  globalThis.fetch = async () => new Response(null, { status: 404 })
  await assert.rejects(api.getOwnerOrderInvoice('owner', orderId), { status: 404 })
  globalThis.fetch = async () => Response.json({ ...ownerInvoice, orderId: appointmentId })
  await assert.rejects(api.getOwnerOrderInvoice('owner', orderId), /không khớp/)
})

test('V3 confirm/reschedule use the capture-appointments routes with exact observed versions and do not retry a conflict', async () => {
  assert.equal(api.confirmOwnerAppointment, undefined)
  assert.equal(api.requestOwnerReschedule, undefined)
  const body = flow.ownerAppointmentBody(v3Proposed)
  assert.deepEqual(body, { expectedOrderVersion: 4165, expectedAppointmentVersion: 73 })
  for (const [run, suffix, payload] of [
    [() => v3Api.confirmCaptureAppointment('owner', orderId, appointmentId, body), 'confirm', body],
    [() => v3Api.requestCaptureReschedule('owner', orderId, appointmentId, { ...body, reason: 'Change time' }), 'request-reschedule', { ...body, reason: 'Change time' }],
  ]) {
    let calls = 0
    globalThis.fetch = async (url, options) => { calls++; assert.equal(url, v3Base + '/' + orderId + '/capture-appointments/' + appointmentId + '/' + suffix); assert.equal(options.method, 'POST'); assert.equal(options.headers.Authorization, 'Bearer owner'); assert.deepEqual(JSON.parse(options.body), payload); return Response.json({ errorCode: 'SurveyAppointment.VersionConflict', traceId: 'owner-trace' }, { status: 409 }) }
    await assert.rejects(run(), error => error.status === 409 && error.traceId === 'owner-trace')
    assert.equal(calls, 1)
  }
})

test('V3 appointment conditions follow BE: proposed can confirm, expired cannot, reschedule closes once capture starts', () => {
  assert.equal(flow.canConfirmOwnerAppointment(v3Proposed), true)
  assert.equal(flow.canConfirmOwnerAppointment(v3Confirmed), false)
  assert.equal(flow.canConfirmOwnerAppointment(v3Proposed, Date.parse(v3Proposed.currentAppointment.endAt)), false)
  for (const changes of [{ orderVersion: 0 }, { currentAppointment: null }, { status: 'COMPLETED' }, { currentAppointment: { ...v3Proposed.currentAppointment, appointmentVersion: undefined } }, { currentAppointment: { ...v3Proposed.currentAppointment, startAt: 'invalid' } }]) assert.equal(flow.canConfirmOwnerAppointment({ ...v3Proposed, ...changes }), false)
  // Đổi lịch: lịch chờ xác nhận hoặc đã xác nhận, đơn chưa bay.
  assert.equal(flow.canRescheduleOwnerAppointment(v3Proposed), true)
  assert.equal(flow.canRescheduleOwnerAppointment(v3Confirmed), true)
  assert.equal(flow.canRescheduleOwnerAppointment({ ...v3Confirmed, status: 'READY_FOR_CAPTURE' }), true)
  for (const status of ['CAPTURING', 'AWAITING_CAPTURE_UPLOAD', 'PROCESSING', 'COMPLETED', 'AWAITING_BASELINE_DEPOSIT']) assert.equal(flow.canRescheduleOwnerAppointment({ ...v3Confirmed, status }), false, status)
  assert.equal(flow.canRescheduleOwnerAppointment({ ...v3Confirmed, currentAppointment: { ...v3Confirmed.currentAppointment, status: 'RESCHEDULE_REQUESTED' } }), false)
})

test('mocked V3 appointment and deposit flow reads proposed schedule, confirms, re-reads new version, creates one checkout and waits for BE PAID', async () => {
  const calls = []
  let current = structuredClone(ownerOrder), payments = []
  globalThis.fetch = async (url, options) => {
    calls.push((options.method ?? 'GET') + ' ' + url)
    assert.equal(options.headers.Authorization, 'Bearer owner')
    if (url === v3Base + '/' + orderId && !options.method) return Response.json(current)
    if (url === v3Base + '/' + orderId + '/capture-appointments/' + appointmentId + '/confirm') {
      assert.deepEqual(JSON.parse(options.body), { expectedOrderVersion: 4165, expectedAppointmentVersion: 73 })
      current = structuredClone(confirmedOrder)
      return Response.json({ surveyOrderId: orderId, orderVersion: 4166, appointmentVersion: 74, appointmentStatus: 'CONFIRMED' })
    }
    if (url === v3Base + '/' + orderId + '/deposit-checkouts' && options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), { expectedOrderVersion: 4166 })
      payments = [{ ...paymentItem, amount: 6500 }]
      return Response.json({ surveyOrderId: orderId, surveyPaymentId: 'payment', appointmentId, amount: 6500, currency: 'VND', paymentStatus: 'PROCESSING', redirectUrl: 'https://pay-sandbox.sepay.vn/session', expiresAt: '2099-01-01T00:00:00Z', orderVersion: 4166 }, { status: 201 })
    }
    if (url.endsWith('/payments')) return Response.json({ surveyOrderId: orderId, payments })
    throw new Error('Unexpected request: ' + url)
  }
  let order = await api.getOwnerOrder('owner', orderId)
  await v3Api.confirmCaptureAppointment('owner', orderId, appointmentId, flow.ownerAppointmentBody(order))
  order = await api.getOwnerOrder('owner', orderId)
  const before = await readPaymentApi.getPaymentHistory('owner', orderId)
  const checkout = await v3Api.initiateDepositCheckout('owner', orderId, flow.ownerDepositBody(order, before))
  assert.equal(checkout.paymentStatus, 'PROCESSING')
  assert.equal(checkout.amount, 6500)
  assert.equal(flow.canInitiateOwnerDeposit(order, await readPaymentApi.getPaymentHistory('owner', orderId)), false)
  payments = [{ ...paymentItem, status: 'PAID' }]
  current = { ...confirmedOrder, status: 'READY_FOR_CAPTURE', orderVersion: 4167 }
  assert.equal((await readPaymentApi.getPaymentHistory('owner', orderId)).payments[0].status, 'PAID')
  assert.equal((await api.getOwnerOrder('owner', orderId)).status, 'READY_FOR_CAPTURE')
  assert.equal(calls.filter(call => call.startsWith('POST ') && call.endsWith('/deposit-checkouts')).length, 1)
})

test('V3 deposit is available again after refund or invalidation when BE sends the order back to AWAITING_DEPOSIT', () => {
  for (const status of ['REFUNDED', 'INVALIDATED', 'FAILED']) {
    const clearedHistory = { ...history, payments: [{ ...paymentItem, status }] }
    assert.deepEqual(flow.ownerDepositBody(confirmedOrder, clearedHistory), { expectedOrderVersion: 4166 })
  }
  for (const status of ['PENDING', 'PROCESSING', 'PAID', 'ADJUSTMENT_REQUIRED']) {
    assert.equal(flow.canInitiateOwnerDeposit(confirmedOrder, { ...history, payments: [{ ...paymentItem, status }] }), false)
  }
  for (const change of [{ orderVersion: 0 }, { currentAppointment: null }, { status: 'READY_FOR_CAPTURE' }, { status: 'AWAITING_BASELINE_DEPOSIT' },
    { currentAppointment: { ...confirmedOrder.currentAppointment, endAt: '2000-01-01T00:00:00Z' } }]) {
    assert.throws(() => flow.ownerDepositBody({ ...confirmedOrder, ...change }, history))
  }
  assert.equal(flow.canInitiateOwnerDeposit(confirmedOrder, undefined), false)
  assert.equal(flow.canInitiateOwnerDeposit(confirmedOrder, { ...history, surveyOrderId: appointmentId }), false)
})
