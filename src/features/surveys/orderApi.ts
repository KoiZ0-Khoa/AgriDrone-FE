import { apiRequest } from '../../api/client'
import type { Page } from './types'
import type { Appointment, AppointmentBody, AssignedOrder, OrderScope, VerifiedBoundary, VerifyBoundaryBody } from './orderTypes'

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
