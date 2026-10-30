import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const clientUrl = dataUrl(compile('../src/api/client.ts').replace('import.meta.env.VITE_API_BASE_URL', "'http://test.local'"))
const payments = await import(dataUrl(compile('../src/features/surveys/paymentApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const orders = await import(dataUrl(compile('../src/features/surveys/orderApi.ts').replace("'../../api/client'", JSON.stringify(clientUrl))))
const workflow = await import(dataUrl(compile('../src/features/surveys/paymentWorkflow.ts')))
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('Owner history uses the existing authorized read endpoint and cancellation; mismatched orders are rejected', async () => {
  const abort = new AbortController()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://test.local/api/tenant-owner/survey-orders/order%2F1/payments')
    assert.equal(options.headers.Authorization, 'Bearer owner')
    assert.equal(options.signal, abort.signal)
    assert.equal(options.body, undefined)
    return Response.json({ surveyOrderId: 'order/1', payments: [{ amount: 10000, status: 'PAID' }] })
  }
  assert.equal((await payments.getPaymentHistory('owner', 'order/1', abort.signal)).payments[0].status, 'PAID')
  globalThis.fetch = async () => Response.json({ surveyOrderId: 'other', payments: [] })
  await assert.rejects(payments.getPaymentHistory('owner', 'order/1'), /không khớp/)
})

test('zero balance with actual BE PAID status is settled without navigating about:blank', async () => {
  let calls = 0
  globalThis.fetch = async (_url, options) => {
    calls++
    assert.deepEqual(JSON.parse(options.body), { purpose: 'FINAL_BALANCE', expectedOrderVersion: 4165 })
    return Response.json({ surveyOrderId: 'order', amount: 0, paymentStatus: 'PAID', paymentVersion: 0, orderVersion: 4166, redirectUrl: 'about:blank' }, { status: 201 })
  }
  const result = await orders.initiateSurveyPayment('owner', 'order', { purpose: 'FINAL_BALANCE', expectedOrderVersion: 4165 })
  assert.equal(result.redirectUrl, null)
  assert.equal(workflow.paymentCheckoutUrl(result, 'order'), null)
  assert.equal(calls, 1)
})

test('payment conflict is surfaced once, retaining server trace; no automatic new version or retry', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ errorCode: 'SurveyPayment.VersionConflict', traceId: 'trace' }, { status: 409 }) }
  await assert.rejects(orders.initiateSurveyPayment('owner', 'order', { purpose: 'BASELINE_DEPOSIT', expectedOrderVersion: 4165 }), error => error.status === 409 && error.traceId === 'trace')
  assert.equal(calls, 1)
})

const session = { surveyOrderId: 'order', amount: 10000, paymentStatus: 'PROCESSING', expiresAt: '2099-01-01T00:00:00Z', redirectUrl: 'https://pay-sandbox.sepay.vn/session' }
test('checkout only accepts matching, unexpired HTTP(S) sessions; return URLs never mark a payment paid', () => {
  assert.equal(workflow.paymentCheckoutUrl(session, 'order'), session.redirectUrl)
  for (const changes of [{ surveyOrderId: 'other' }, { amount: -1 }, { amount: NaN }, { expiresAt: '2000-01-01T00:00:00Z' }, { expiresAt: 'invalid' }, { redirectUrl: 'javascript:alert(1)' }, { redirectUrl: 'data:text/html,example' }, { redirectUrl: 'https://user:password@example.test' }, { redirectUrl: null }]) assert.throws(() => workflow.paymentCheckoutUrl({ ...session, ...changes }, 'order'))
  for (const paymentStatus of ['PAID', 'CONFIRMED', 'FAILED', 'REFUNDED', 'ADJUSTMENT_REQUIRED']) assert.equal(workflow.paymentCheckoutUrl({ ...session, paymentStatus }, 'order'), null)
  assert.equal(workflow.paymentIsPaid('PROCESSING'), false)
})
