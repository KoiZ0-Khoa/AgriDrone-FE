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
  assert.equal(flow.canRescheduleOwnerAppointment(paidServiceOrder, history), true)
  assert.equal(flow.canRescheduleOwnerAppointment(paidServiceOrder, { ...history, payments: [{ ...paymentItem, status: 'PAID' }] }), false)
  assert.equal(flow.canRescheduleOwnerAppointment({ ...confirmedOrder, status: 'BASELINE_IN_PROGRESS' }, history), false)
  assert.equal(flow.canRescheduleOwnerAppointment(ownerOrder, undefined), false)
})

test('payment gating blocks duplicate/incomplete/expired contexts and keeps remainingAmount=0 without falling back to totalAmount', () => {
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, history), true)
  assert.equal(flow.canInitiateOwnerPayment(ownerOrder, history), false)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, undefined), false)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, { ...history, surveyOrderId: appointmentId }), false)
  for (const status of ['PENDING', 'PROCESSING', 'PAID', 'ADJUSTMENT_REQUIRED']) assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, { ...history, payments: [{ ...paymentItem, status }] }), false)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, { ...history, payments: [{ ...paymentItem, status: 'FAILED' }] }), true)
  assert.equal(flow.canInitiateOwnerPayment(confirmedOrder, history, Date.parse(confirmedOrder.currentAppointment.endAt)), false)
  assert.equal(flow.canInitiateOwnerPayment({ ...confirmedOrder, currentAppointment: { ...confirmedOrder.currentAppointment, purpose: 'PAID_SERVICE' } }, history), false)
  assert.deepEqual(flow.ownerPaymentBody(paidServiceOrder, history), { purpose: 'FINAL_BALANCE', expectedOrderVersion: 4165 })
  assert.equal(flow.canInitiateOwnerPayment(paidServiceOrder, { ...history, payments: [{ ...paymentItem, status: 'PAID' }] }), true)
  const zero = { ...paidServiceOrder, remainingAmount: 0 }
  assert.equal(flow.payableAmount(zero), 0)
  assert.equal(flow.canInitiateOwnerPayment(zero, history), true)
  assert.throws(() => flow.ownerPaymentBody(ownerOrder, history))
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
