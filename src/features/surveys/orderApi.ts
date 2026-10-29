import { apiRequest } from '../../api/client'
import type { Page } from './types'
import type { Appointment, AppointmentBody, AssignedOrder, OrderScope, VerifiedBoundary, VerifyBoundaryBody } from './orderTypes'
import type { ApproveRouteBody, CaptureSample, CaptureSession, OrthophotoBody, PaymentPurpose, PaymentSession } from './orderTypes'

const base = '/api/system-manager/survey-orders'
export async function getAssignedOrders(token: string, page = 1, status = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  if (status) params.set('status', status)
  const result = await apiRequest<Page<AssignedOrder>>(`${base}?${params}`, { token, signal })
  // The assigned-order mapper uses ToUpperInvariant(), so RescheduleRequested
  // arrives without underscores. Keep the UI's appointment status vocabulary
  // consistent with the Owner and appointment mutation responses.
  return { ...result, items: result.items.map(order => order.currentAppointmentStatus === 'RESCHEDULEREQUESTED'
    ? { ...order, currentAppointmentStatus: 'RESCHEDULE_REQUESTED' }
    : order) }
}
export async function getAssignedOrder(token: string, orderId: string, signal?: AbortSignal) {
  let pageNumber = 1
  while (true) {
    const page = await getAssignedOrders(token, pageNumber, '', signal)
    const order = page.items.find(item => item.surveyOrderId === orderId)
    if (order) return order
    if (!page.hasNextPage) return null
    pageNumber++
  }
}
export const getOrderScope = (token: string, orderId: string, signal?: AbortSignal) => apiRequest<OrderScope>(`${base}/${encodeURIComponent(orderId)}/boundary-scope`, { token, signal })
export const proposeAppointment = (token: string, orderId: string, body: AppointmentBody) => apiRequest<Appointment>(`${base}/${encodeURIComponent(orderId)}/appointments`, { method: 'POST', token, body })
export const verifyOrderBoundary = (token: string, orderId: string, body: VerifyBoundaryBody) => apiRequest<VerifiedBoundary>(`${base}/${encodeURIComponent(orderId)}/boundary-scope/verify`, { method: 'POST', token, body })

const capturePath = (orderId: string, sessionId?: string) => `${base}/${encodeURIComponent(orderId)}/boundary-capture-sessions${sessionId ? `/${encodeURIComponent(sessionId)}` : ''}`
export const getCaptureSession = (token: string, orderId: string, sessionId: string, signal?: AbortSignal) => apiRequest<CaptureSession>(capturePath(orderId, sessionId), { token, signal })
export const startCapture = (token: string, orderId: string, body: { droneId: string; operationId: string; expectedOrderVersion: number }) => apiRequest<CaptureSession>(capturePath(orderId), { method: 'POST', token, body })
export const syncCapture = (token: string, orderId: string, sessionId: string, body: { expectedSessionVersion: number; samples: CaptureSample[] }) => apiRequest<CaptureSession>(`${capturePath(orderId, sessionId)}/samples:sync`, { method: 'POST', token, body })
export const finalizeCapture = (token: string, orderId: string, sessionId: string, body: { evidenceReference: string; expectedOrderVersion: number; expectedSessionVersion: number; expectedCurrentBoundaryVersionNumber: number | null }) => apiRequest<CaptureSession>(`${capturePath(orderId, sessionId)}/finalize`, { method: 'POST', token, body })
export const abortCapture = (token: string, orderId: string, sessionId: string, body: { reason: string; expectedSessionVersion: number }) => apiRequest<CaptureSession>(`${capturePath(orderId, sessionId)}/abort`, { method: 'POST', token, body })
/** @deprecated Legacy API; the current Baseline UI uses orthophoto marking after flight. */
export const approveBaselineRoute = (token: string, orderId: string, routePlanId: string, body: ApproveRouteBody) => apiRequest<CaptureSession>(`${base}/${encodeURIComponent(orderId)}/baseline-route-plans/${encodeURIComponent(routePlanId)}/approve`, { method: 'POST', token, body })
export const markOrthophotoCorners = (token: string, orderId: string, body: OrthophotoBody) => apiRequest(`${base}/${encodeURIComponent(orderId)}/farm-boundary/mark-orthophoto-corners`, { method: 'POST', token, body })
// Owner payment amounts and confirmation always come from the server, never from FE input.
export async function initiateSurveyPayment(token: string, orderId: string, body: { expectedOrderVersion: number; purpose: PaymentPurpose }): Promise<PaymentSession> {
  const payment = await apiRequest<PaymentSession>(`/api/tenant-owner/survey-orders/${encodeURIComponent(orderId)}/payments`, { method: 'POST', token, body })
  return {
    ...payment,
    appointmentId: payment.appointmentId ?? payment.paidServiceAppointmentId ?? null,
    // A confirmed zero balance is settled by BE; there is no payment page to open.
    redirectUrl: payment.amount === 0 && ['PAID', 'CONFIRMED'].includes(payment.paymentStatus) ? null : payment.redirectUrl,
  }
}
