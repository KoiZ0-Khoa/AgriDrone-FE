import { apiRequest } from '../../api/client'
import type { Page } from './types'
import type { Appointment, AppointmentBody, AssignedOrder, OrderScope, VerifiedBoundary, VerifyBoundaryBody } from './orderTypes'
import type { ApproveRouteBody, CaptureSample, CaptureSession, OrthophotoBody, PaymentPurpose, PaymentSession } from './orderTypes'

const base = '/api/system-manager/survey-orders'
export function getAssignedOrders(token: string, page = 1, status = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  if (status) params.set('status', status)
  return apiRequest<Page<AssignedOrder>>(`${base}?${params}`, { token, signal })
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
export const approveBaselineRoute = (token: string, orderId: string, routePlanId: string, body: ApproveRouteBody) => apiRequest<CaptureSession>(`${base}/${encodeURIComponent(orderId)}/baseline-route-plans/${encodeURIComponent(routePlanId)}/approve`, { method: 'POST', token, body })
export const markOrthophotoCorners = (token: string, orderId: string, body: OrthophotoBody) => apiRequest(`${base}/${encodeURIComponent(orderId)}/farm-boundary/mark-orthophoto-corners`, { method: 'POST', token, body })
// Owner payment amounts and confirmation always come from the server, never from FE input.
export const initiateSurveyPayment = (token: string, orderId: string, body: { expectedOrderVersion: number; purpose: PaymentPurpose }) => apiRequest<PaymentSession>(`/api/tenant-owner/survey-orders/${encodeURIComponent(orderId)}/payments`, { method: 'POST', token, body })
export const getCaptureDrones = (token: string, farmId: string, startAt: string, endAt: string, signal?: AbortSignal) => apiRequest<{ id: string; code: string; name: string; model: string | null }[]>(`/api/system-manager/farms/${encodeURIComponent(farmId)}/drones/available?${new URLSearchParams({ startAt, endAt, purpose: 'BaselineMapping' })}`, { token, signal })
