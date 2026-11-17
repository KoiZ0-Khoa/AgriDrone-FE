import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'
import { appointmentId, confirmedOrder, history, orderId, ownerOrder, paidServiceOrder, paymentItem } from './owner-payment-fixtures.mjs'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const paymentWorkflowUrl = dataUrl(compile('../src/features/surveys/paymentWorkflow.ts'))
const workflowUrl = dataUrl(compile('../src/features/surveys/ownerOrderWorkflow.ts').replaceAll("'./paymentWorkflow'", JSON.stringify(paymentWorkflowUrl)))
const flow = await import(workflowUrl)
const api = await import(dataUrl(compile('../src/features/surveys/ownerOrderApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl)).replace("'./ownerOrderWorkflow'", JSON.stringify(workflowUrl))))
const paymentApi = await import(dataUrl(compile('../src/features/surveys/orderApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const readPaymentApi = await import(dataUrl(compile('../src/features/surveys/paymentApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const base = 'http://test.local/api/tenant-owner/survey-orders'

test('post-flight final accepts a past or absent appointment, including zero settlement, but still requires the paid deposit', () => {
  const paidDeposit = { ...history, payments: [{ ...paymentItem, status: 'PAID' }] }
  for (const appointment of [null, { ...paidServiceOrder.currentAppointment, startAt: '2026-01-01T01:00:00Z', endAt: '2026-01-01T02:00:00Z' }]) {
    const order = { ...paidServiceOrder, depositAmount: 10000, currentAppointment: appointment }
    assert.equal(flow.paymentRequiresAppointment(order, paidDeposit), false)
    assert.equal(flow.canInitiateOwnerPayment(order, paidDeposit), true)
    assert.equal(flow.canInitiateOwnerPayment(order, history), false)
    assert.equal(flow.canInitiateOwnerPayment({ ...order, remainingAmount: 0 }, paidDeposit), true)
    assert.deepEqual(flow.ownerPaymentBody(order, paidDeposit), { purpose: 'FINAL_BALANCE', expectedOrderVersion: order.orderVersion })
    const pending = { ...paymentItem, purpose: 'FINAL_BALANCE', status: 'PROCESSING', amount: order.remainingAmount }
    assert.equal(flow.canInitiateOwnerPayment(order, { ...paidDeposit, payments: [...paidDeposit.payments, pending] }), false)
  }
  for (const status of ['AWAITING_PRICING', 'READY_FOR_PAID_SERVICE', 'IN_PROGRESS', 'PENDING_REVIEW']) {
    const order = { ...paidServiceOrder, depositAmount: 10000, status }
    assert.equal(flow.paymentPurposeForOrder(order, paidDeposit), null)
    assert.equal(flow.canInitiateOwnerPayment(order, paidDeposit), false)
  }
})

test('Health schedules are view-only for Owner; Manager takes over old proposed appointments', () => {
  for (const status of ['AWAITING_PRICING', 'AWAITING_PAID_APPOINTMENT', 'AWAITING_BASELINE_DEPOSIT', 'READY_FOR_PAID_SERVICE']) {
    for (const appointmentStatus of ['PROPOSED', 'CONFIRMED', 'RESCHEDULE_REQUESTED']) {
      const order = { ...ownerOrder, status, currentAppointment: { ...ownerOrder.currentAppointment, purpose: 'PAID_SERVICE', status: appointmentStatus } }
      assert.equal(flow.canConfirmOwnerAppointment(order), false)
      assert.equal(flow.canRescheduleOwnerAppointment(order, history), false)
    }
  }
  assert.equal(flow.canConfirmOwnerAppointment(ownerOrder), true)
})

test('Follow-up pays deposit after Manager confirms Health schedule, including an elapsed flight day', () => {
  for (const endAt of ['2099-01-01T02:00:00Z', '2026-01-01T02:00:00Z']) {
    const order = { ...confirmedOrder, currentAppointment: { ...confirmedOrder.currentAppointment, purpose: 'PAID_SERVICE', endAt } }
    assert.equal(flow.paymentRequiresAppointment(order, history), false)
    assert.equal(flow.canInitiateOwnerPayment(order, history), true)
    assert.deepEqual(flow.ownerPaymentBody(order, history), { purpose: 'BASELINE_DEPOSIT', expectedOrderVersion: order.orderVersion })
    for (const status of ['PROCESSING', 'PAID', 'ADJUSTMENT_REQUIRED']) assert.equal(flow.canInitiateOwnerPayment(order, { ...history, payments: [{ ...paymentItem, status }] }), false)
  }
  assert.equal(flow.canInitiateOwnerPayment({ ...confirmedOrder, currentAppointment: null }, history), false)
})

test('follow-up deposit is offered before an appointment and remains separate from the final balance', () => {
  for (const status of ['PENDING_BOUNDARY_VERIFICATION', 'AWAITING_PAID_APPOINTMENT']) {
    const order = { ...ownerOrder, status, depositAmount: 5000, currentAppointment: null }
    assert.equal(flow.paymentPurposeForOrder(order, history), 'BASELINE_DEPOSIT')
    assert.equal(flow.payableAmount(order, history), 5000)
    assert.equal(flow.canInitiateOwnerPayment(order, history), true)
    assert.deepEqual(flow.ownerPaymentBody(order, history), { purpose: 'BASELINE_DEPOSIT', expectedOrderVersion: order.orderVersion })
    for (const paymentStatus of ['PENDING', 'PROCESSING', 'ADJUSTMENT_REQUIRED']) {
      assert.equal(flow.canInitiateOwnerPayment(order, { ...history, payments: [{ ...paymentItem, amount: 5000, status: paymentStatus }] }), false)
    }
    const paidDeposit = { ...history, payments: [{ ...paymentItem, amount: 5000, status: 'PAID' }] }
    assert.notEqual(flow.paymentPurposeForOrder(order, paidDeposit), 'BASELINE_DEPOSIT')
    assert.equal(flow.canInitiateOwnerPayment(order, { ...history, surveyOrderId: 'another-order' }), false)
    assert.equal(flow.canInitiateOwnerPayment(order, undefined), false)
  }
  assert.equal(flow.paymentPurposeForOrder({ ...ownerOrder, status: 'COMPLETED' }, history), null)
  assert.equal(flow.canInitiateOwnerPayment({ ...ownerOrder, status: 'AWAITING_BASELINE_DEPOSIT', currentAppointment: null }, history), false)
  assert.equal(flow.canInitiateOwnerPayment({ ...paidServiceOrder, depositAmount: 5000, currentAppointment: null }, history), false)
  const paid = { ...history, payments: [{ ...paymentItem, amount: 5000, status: 'PAID' }] }
  assert.equal(flow.paymentPurposeForOrder({ ...paidServiceOrder, depositAmount: 5000 }, paid), 'FINAL_BALANCE')
})

test('an existing matching PAID final balance can synchronize the order without allowing a duplicate checkout', () => {
  const order = { ...paidServiceOrder, depositAmount: 0 }
  const paidItem = { ...paymentItem, purpose: 'FINAL_BALANCE', status: 'PAID', amount: order.remainingAmount }
  const paidHistory = { ...history, payments: [paidItem] }
  assert.equal(flow.canInitiateOwnerPayment(order, paidHistory), false)
  assert.equal(flow.canSynchronizeOwnerPayment(order, paidHistory), true)
  assert.deepEqual(flow.ownerPaymentBody(order, paidHistory), { purpose: 'FINAL_BALANCE', expectedOrderVersion: order.orderVersion })
  for (const changes of [{ amount: 1 }, { currency: 'USD' }, { status: 'PROCESSING' }, { status: 'REFUNDED' }]) {
    assert.equal(flow.canSynchronizeOwnerPayment(order, { ...history, payments: [{ ...paidItem, ...changes }] }), false)
  }
  assert.equal(flow.canSynchronizeOwnerPayment(order, { ...paidHistory, surveyOrderId: 'another-order' }), false)
  assert.equal(flow.canSynchronizeOwnerPayment({ ...order, currentAppointment: null }, paidHistory), true)
  assert.equal(flow.canSynchronizeOwnerPayment({ ...order, status: 'COMPLETED' }, paidHistory), false)
  assert.equal(flow.canSynchronizeOwnerPayment({ ...order, depositAmount: 5000 }, paidHistory), false)
  assert.equal(flow.canSynchronizeOwnerPayment(order, { ...history, payments: [paidItem, { ...paidItem, status: 'PROCESSING' }] }), false)
})

test('Owner list uses BE pagination/filter enum and bearer, never sends a tenant ID supplied by URL', async () => {
  const abort = new AbortController()
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    assert.equal(parsed.pathname, '/api/tenant-owner/survey-orders')
    assert.equal(parsed.searchParams.get('pageNumber'), '3')
    assert.equal(parsed.searchParams.get('pageSize'), '20')
    assert.equal(parsed.searchParams.get('status'), 'AwaitingBaselineDeposit')
    assert.equal(parsed.searchParams.has('tenantId'), false)
    assert.equal(options.headers.Authorization, 'Bearer owner')
    assert.equal(options.signal, abort.signal)
    return Response.json({ items: [confirmedOrder], pageNumber: 3, pageSize: 20, totalCount: 41 })
  }
  assert.equal((await api.getOwnerOrders('owner', 3, 'AWAITING_BASELINE_DEPOSIT', abort.signal)).totalCount, 41)
  assert.throws(() => api.getOwnerOrders('owner', 1, 'UNSUPPORTED'))
})

test('Owner detail preserves actual totalAmount/startAt/endAt/status and rejects a different order', async () => {
  const abort = new AbortController()
  globalThis.fetch = async (url, options) => { assert.equal(url, base + '/' + orderId); assert.equal(options.signal, abort.signal); return Response.json(ownerOrder) }
  assert.deepEqual(await api.getOwnerOrder('owner', orderId, abort.signal), ownerOrder)
  globalThis.fetch = async () => Response.json({ ...ownerOrder, surveyOrderId: appointmentId })
  await assert.rejects(api.getOwnerOrder('owner', orderId), /không khớp/)
})

test('confirm/reschedule preserve exact observed versions and do not automatically retry conflict', async () => {
  const body = flow.ownerAppointmentBody(ownerOrder)
  assert.deepEqual(body, { expectedOrderVersion: 4165, expectedAppointmentVersion: 73 })
  for (const [run, suffix, payload] of [
    [() => api.confirmOwnerAppointment('owner', orderId, appointmentId, body), 'confirm', body],
    [() => api.requestOwnerReschedule('owner', orderId, appointmentId, { ...body, reason: 'Change time' }), 'request-reschedule', { ...body, reason: 'Change time' }],
  ]) {
    let calls = 0
    globalThis.fetch = async (url, options) => { calls++; assert.equal(url, base + '/' + orderId + '/appointments/' + appointmentId + '/' + suffix); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), payload); return Response.json({ errorCode: 'SurveyAppointment.VersionConflict', traceId: 'owner-trace' }, { status: 409 }) }
    await assert.rejects(run(), error => error.status === 409 && error.traceId === 'owner-trace')
    assert.equal(calls, 1)
  }
})

test('appointment conditions follow BE: proposed can confirm, expired cannot, reschedule closes after work starts or active paid-service payment', () => {
  assert.equal(flow.canConfirmOwnerAppointment(ownerOrder), true)
  assert.equal(flow.canConfirmOwnerAppointment(confirmedOrder), false)
  assert.equal(flow.canConfirmOwnerAppointment(ownerOrder, Date.parse(ownerOrder.currentAppointment.endAt)), false)
  for (const changes of [{ orderVersion: 0 }, { currentAppointment: null }, { status: 'COMPLETED' }, { currentAppointment: { ...ownerOrder.currentAppointment, appointmentVersion: undefined } }, { currentAppointment: { ...ownerOrder.currentAppointment, startAt: 'invalid' } }]) assert.equal(flow.canConfirmOwnerAppointment({ ...ownerOrder, ...changes }), false)
  assert.equal(flow.canRescheduleOwnerAppointment(confirmedOrder, history), true)
  assert.equal(flow.canRescheduleOwnerAppointment(paidServiceOrder, history), false)
  assert.equal(flow.canRescheduleOwnerAppointment({ ...paidServiceOrder, status: 'READY_FOR_PAID_SERVICE' }, history), false)
  assert.equal(flow.canRescheduleOwnerAppointment(paidServiceOrder, { ...history, payments: [{ ...paymentItem, status: 'PAID' }] }), false)
  assert.equal(flow.canRescheduleOwnerAppointment({ ...confirmedOrder, status: 'BASELINE_IN_PROGRESS' }, history), false)
  assert.equal(flow.canRescheduleOwnerAppointment(ownerOrder, undefined), false)
})

test('payment gating blocks duplicate/incomplete/expired contexts and keeps remainingAmount=0 without falling back to totalAmount', () => {
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, history), true)
  assert.equal(flow.canInitiateOwnerPayment({ ...ownerOrder, status: 'BASELINE_READY' }, history), false)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, undefined), false)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, { ...history, surveyOrderId: appointmentId }), false)
  for (const status of ['PENDING', 'PROCESSING', 'PAID', 'ADJUSTMENT_REQUIRED']) assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, { ...history, payments: [{ ...paymentItem, status }] }), false)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, { ...history, payments: [{ ...paymentItem, status: 'FAILED' }] }), true)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, history, Date.parse(confirmedOrder.currentAppointment.endAt)), false)
  assert.equal(flow.canInitiateOwnerPayment({ ...confirmedOrder, currentAppointment: { ...confirmedOrder.currentAppointment, purpose: 'PAID_SERVICE' } }, history), true)
  assert.deepEqual(flow.ownerPaymentBody(paidServiceOrder, history), { purpose: 'FINAL_BALANCE', expectedOrderVersion: 4165 })
  assert.equal(flow.canInitiateOwnerPayment(paidServiceOrder, { ...history, payments: [{ ...paymentItem, status: 'PAID' }] }), true)
  const zero = { ...paidServiceOrder, remainingAmount: 0 }
  assert.equal(flow.payableAmount(zero), 0)
  assert.equal(flow.canInitiateOwnerPayment(zero, history), true)
  assert.throws(() => flow.ownerPaymentBody({ ...ownerOrder, status: 'BASELINE_READY' }, history))
})

test('map deposit can be paid while the map schedule is still awaiting Owner confirmation, as BE allows', () => {
  for (const currentAppointment of [null, ownerOrder.currentAppointment, { ...ownerOrder.currentAppointment, status: 'RESCHEDULE_REQUESTED' }]) {
    const order = { ...ownerOrder, currentAppointment }
    assert.equal(flow.paymentPurposeForOrder(order, history), 'BASELINE_DEPOSIT')
    assert.equal(flow.paymentRequiresAppointment(order, history), false)
    assert.equal(flow.payableAmount(order, history), order.depositAmount)
    assert.equal(flow.canInitiateOwnerPayment(order, history), true)
    assert.deepEqual(flow.ownerPaymentBody(order, history), { purpose: 'BASELINE_DEPOSIT', expectedOrderVersion: order.orderVersion })
    for (const status of ['PENDING', 'PROCESSING', 'ADJUSTMENT_REQUIRED']) assert.equal(flow.canInitiateOwnerPayment(order, { ...history, payments: [{ ...paymentItem, status }] }), false)
    const paid = { ...history, payments: [{ ...paymentItem, status: 'PAID' }] }
    assert.equal(flow.paymentPurposeForOrder(order, paid), null)
    assert.equal(flow.canInitiateOwnerPayment(order, paid), false)
    assert.equal(flow.canInitiateOwnerPayment(order, undefined), false)
    assert.equal(flow.paymentPurposeForOrder({ ...order, depositAmount: 0 }, history), null)
  }
})

test('full mocked baseline flow reads proposed schedule, confirms, re-reads new version, creates one checkout and waits for BE PAID', async () => {
  const calls = []
  let current = structuredClone(ownerOrder), payments = []
  globalThis.fetch = async (url, options) => {
    calls.push((options.method ?? 'GET') + ' ' + url)
    assert.equal(options.headers.Authorization, 'Bearer owner')
    if (url === base + '/' + orderId && !options.method) return Response.json(current)
    if (url.endsWith('/confirm')) {
      assert.deepEqual(JSON.parse(options.body), { expectedOrderVersion: 4165, expectedAppointmentVersion: 73 })
      current = structuredClone(confirmedOrder)
      return Response.json({ surveyOrderId: orderId, orderVersion: 4166, appointmentVersion: 74, appointmentStatus: 'CONFIRMED' })
    }
    if (url.endsWith('/payments') && options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), { purpose: 'BASELINE_DEPOSIT', expectedOrderVersion: 4166 })
      payments = [paymentItem]
      return Response.json({ surveyOrderId: orderId, surveyPaymentId: 'payment', amount: 10000, currency: 'VND', paymentStatus: 'PROCESSING', redirectUrl: 'https://pay-sandbox.sepay.vn/session', expiresAt: '2099-01-01T00:00:00Z', orderVersion: 4166 }, { status: 201 })
    }
    if (url.endsWith('/payments')) return Response.json({ surveyOrderId: orderId, payments })
    throw new Error('Unexpected request: ' + url)
  }
  let order = await api.getOwnerOrder('owner', orderId)
  await api.confirmOwnerAppointment('owner', orderId, appointmentId, flow.ownerAppointmentBody(order))
  order = await api.getOwnerOrder('owner', orderId)
  const before = await readPaymentApi.getPaymentHistory('owner', orderId)
  const checkout = await paymentApi.initiateSurveyPayment('owner', orderId, flow.ownerPaymentBody(order, before))
  assert.equal(checkout.paymentStatus, 'PROCESSING')
  assert.equal(flow.canInitiateOwnerPayment(order, await readPaymentApi.getPaymentHistory('owner', orderId)), false)
  payments = [{ ...paymentItem, status: 'PAID' }]
  current = { ...confirmedOrder, status: 'BASELINE_READY', orderVersion: 4167 }
  assert.equal((await readPaymentApi.getPaymentHistory('owner', orderId)).payments[0].status, 'PAID')
  assert.equal((await api.getOwnerOrder('owner', orderId)).status, 'BASELINE_READY')
  assert.equal(calls.filter(call => call.startsWith('POST ') && call.endsWith('/payments')).length, 1)
})

test('a deposit refunded after the invoice is repaid before the final balance, mirroring BE CanAcceptDepositPayment', () => {
  const order = { ...paidServiceOrder, depositAmount: 10000, currentAppointment: null }
  const refunded = { ...history, payments: [{ ...paymentItem, status: 'REFUNDED' }] }
  assert.equal(flow.paymentPurposeForOrder(order, refunded), 'BASELINE_DEPOSIT')
  assert.equal(flow.payableAmount(order, refunded), 10000)
  assert.equal(flow.paymentRequiresAppointment(order, refunded), false)
  assert.equal(flow.canInitiateOwnerPayment(order, refunded), true)
  assert.equal(flow.canSynchronizeOwnerPayment(order, refunded), false)
  assert.deepEqual(flow.ownerPaymentBody(order, refunded), { purpose: 'BASELINE_DEPOSIT', expectedOrderVersion: order.orderVersion })
  for (const status of ['PENDING', 'PROCESSING', 'ADJUSTMENT_REQUIRED']) {
    assert.equal(flow.canInitiateOwnerPayment(order, { ...refunded, payments: [...refunded.payments, { ...paymentItem, surveyPaymentId: 'retry', status }] }), false)
  }
  const repaid = { ...refunded, payments: [...refunded.payments, { ...paymentItem, surveyPaymentId: 'retry', status: 'PAID' }] }
  assert.equal(flow.paymentPurposeForOrder(order, repaid), 'FINAL_BALANCE')
  assert.equal(flow.canInitiateOwnerPayment(order, repaid), true)
  // Never-paid or failed deposits are not a refund: the final balance stays blocked without reopening the deposit.
  for (const payments of [[], [{ ...paymentItem, status: 'FAILED' }]]) {
    assert.equal(flow.paymentPurposeForOrder(order, { ...history, payments }), 'FINAL_BALANCE')
    assert.equal(flow.canInitiateOwnerPayment(order, { ...history, payments }), false)
  }
  assert.equal(flow.paymentPurposeForOrder(order, { ...refunded, surveyOrderId: 'another-order' }), 'FINAL_BALANCE')
  assert.equal(flow.paymentPurposeForOrder({ ...order, status: 'COMPLETED' }, refunded), null)
})
