import type { PaymentSession } from './orderTypes'
import type { OwnerSurveyOrder } from './ownerOrderTypes'
import type { PaymentHistory } from './paymentWorkflow'
import { paymentCheckoutUrl } from './paymentWorkflow'

const prefix = 'agridrone.checkout.'
export const checkoutStorageKey = (tenantId: string, email: string, orderId: string) => prefix + JSON.stringify([tenantId, email, orderId])
export function rememberCheckout(key: string, payment: PaymentSession) {
  try {
    if (!['PENDING', 'PROCESSING'].includes(payment.paymentStatus) || !paymentCheckoutUrl(payment, payment.surveyOrderId)) { forgetCheckout(key); return }
    // Explicit allowlist: never persist the provider clientToken or the user's bearer token.
    sessionStorage.setItem(key, JSON.stringify({ surveyPaymentId: payment.surveyPaymentId, surveyOrderId: payment.surveyOrderId,
      paidServiceAppointmentId: payment.paidServiceAppointmentId, appointmentId: payment.appointmentId, amount: payment.amount, currency: payment.currency,
      paymentStatus: payment.paymentStatus, redirectUrl: payment.redirectUrl, expiresAt: payment.expiresAt, paymentVersion: payment.paymentVersion, orderVersion: payment.orderVersion }))
  } catch { /* Checkout still works in memory when session storage is unavailable. */ }
}
export function forgetCheckout(key: string) { try { sessionStorage.removeItem(key) } catch { /* Storage may be unavailable. */ } }
export function readCheckout(key: string, orderId: string): PaymentSession | null {
  try {
    const item = JSON.parse(sessionStorage.getItem(key) ?? 'null') as PaymentSession | null
    if (!item || typeof item.surveyPaymentId !== 'string' || typeof item.currency !== 'string' || !['PENDING', 'PROCESSING'].includes(item.paymentStatus) || !paymentCheckoutUrl(item, orderId)) { forgetCheckout(key); return null }
    return item
  } catch { forgetCheckout(key); return null }
}
export function restoredCheckoutMatches(payment: PaymentSession, order: OwnerSurveyOrder, history: PaymentHistory | undefined) {
  if (!history || history.surveyOrderId !== order.surveyOrderId || payment.surveyOrderId !== order.surveyOrderId || !order.currentAppointment || payment.appointmentId !== order.currentAppointment.appointmentId) return false
  return history.payments.some(item => item.surveyPaymentId === payment.surveyPaymentId && item.amount === payment.amount && item.currency === payment.currency && ['PENDING', 'PROCESSING'].includes(item.status))
}
export function clearSavedCheckouts() {
  try { for (let index = sessionStorage.length - 1; index >= 0; index--) { const key = sessionStorage.key(index); if (key?.startsWith(prefix)) sessionStorage.removeItem(key) } } catch { /* Logout must work even without storage. */ }
}
