import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { confirmedOrder, history, orderId, paymentItem } from './owner-payment-fixtures.mjs'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const workflowUrl = dataUrl(compile('../src/features/surveys/paymentWorkflow.ts'))
const storage = await import(dataUrl(compile('../src/features/surveys/checkoutStorage.ts').replace("'./paymentWorkflow'", JSON.stringify(workflowUrl))))
const payment = { surveyPaymentId: 'payment', surveyOrderId: orderId, appointmentId: confirmedOrder.currentAppointment.appointmentId, paidServiceAppointmentId: confirmedOrder.currentAppointment.appointmentId, amount: 10000, currency: 'VND', paymentStatus: 'PROCESSING', redirectUrl: 'https://pay-sandbox.sepay.vn/session', expiresAt: '2099-01-01T00:00:00Z', paymentVersion: 80, orderVersion: 4166, clientToken: 'must-not-save', accessToken: 'must-not-save' }

test('checkout survives reload without storing bearer/client token and must match server payment/appointment before reuse', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const values = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: index => [...values.keys()][index], get length() { return values.size } } })
  try {
    const key = storage.checkoutStorageKey('tenant', 'owner@example.test', orderId)
    storage.rememberCheckout(key, payment)
    assert.doesNotMatch(values.get(key), /clientToken|accessToken|must-not-save/)
    const restored = storage.readCheckout(key, orderId)
    assert.equal(restored.redirectUrl, payment.redirectUrl)
    assert.equal(storage.restoredCheckoutMatches(restored, confirmedOrder, undefined), false)
    assert.equal(storage.restoredCheckoutMatches(restored, confirmedOrder, history), false)
    assert.equal(storage.restoredCheckoutMatches(restored, confirmedOrder, { ...history, payments: [paymentItem] }), true)
    for (const changes of [{ amount: 1 }, { status: 'PAID' }, { status: 'FAILED' }, { currency: 'USD' }, { surveyPaymentId: 'other' }]) assert.equal(storage.restoredCheckoutMatches(restored, confirmedOrder, { ...history, payments: [{ ...paymentItem, ...changes }] }), false)
    assert.equal(storage.restoredCheckoutMatches(restored, { ...confirmedOrder, currentAppointment: { ...confirmedOrder.currentAppointment, appointmentId: orderId } }, { ...history, payments: [paymentItem] }), false)
    assert.equal(storage.readCheckout(storage.checkoutStorageKey('another-tenant', 'owner@example.test', orderId), orderId), null)
    assert.equal(storage.readCheckout(storage.checkoutStorageKey('tenant', 'other@example.test', orderId), orderId), null)
    values.set(key, JSON.stringify({ ...payment, expiresAt: '2000-01-01T00:00:00Z' }))
    assert.equal(storage.readCheckout(key, orderId), null)
    assert.equal(values.has(key), false)
    values.set(key, JSON.stringify({ ...payment, paymentStatus: 'PAID' }))
    assert.equal(storage.readCheckout(key, orderId), null)
    storage.rememberCheckout(key, payment)
    values.set('unrelated-key', 'keep')
    storage.clearSavedCheckouts()
    assert.deepEqual([...values.keys()], ['unrelated-key'])
  } finally { if (original) Object.defineProperty(globalThis, 'sessionStorage', original); else delete globalThis.sessionStorage }
})
