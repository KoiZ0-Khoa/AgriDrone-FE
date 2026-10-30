import { apiRequest } from '../../api/client'
import type { Appointment } from './orderTypes'
import type { OwnerAppointmentBody, OwnerSurveyOrder } from './ownerOrderTypes'
import { ownerOrderStatusQuery } from './ownerOrderWorkflow'
import type { Page } from './types'

const base = '/api/tenant-owner/survey-orders'
export function getOwnerOrders(token: string, pageNumber = 1, status = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: '20' })
  if (status) {
    if (!ownerOrderStatusQuery[status]) throw new Error('Trạng thái lọc đơn không hợp lệ.')
    params.set('status', ownerOrderStatusQuery[status])
  }
  return apiRequest<Page<OwnerSurveyOrder>>(`${base}?${params}`, { token, signal })
}
export async function getOwnerOrder(token: string, orderId: string, signal?: AbortSignal) {
  const order = await apiRequest<OwnerSurveyOrder>(`${base}/${encodeURIComponent(orderId)}`, { token, signal })
  if (order.surveyOrderId.toLowerCase() !== orderId.toLowerCase()) throw new Error('Thông tin đơn không khớp yêu cầu. Tải lại để kiểm tra.')
  return order
}
export const confirmOwnerAppointment = (token: string, orderId: string, appointmentId: string, body: OwnerAppointmentBody) => apiRequest<Appointment>(`${base}/${encodeURIComponent(orderId)}/appointments/${encodeURIComponent(appointmentId)}/confirm`, { method: 'POST', token, body })
export const requestOwnerReschedule = (token: string, orderId: string, appointmentId: string, body: OwnerAppointmentBody & { reason: string }) => apiRequest<Appointment>(`${base}/${encodeURIComponent(orderId)}/appointments/${encodeURIComponent(appointmentId)}/request-reschedule`, { method: 'POST', token, body })
