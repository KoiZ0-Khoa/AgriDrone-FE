import { apiRequest } from '../../api/client'
import type { Appointment } from './orderTypes'
import type { CaptureAppointmentBody, CaptureAppointmentOwnerBody, CaptureNoShowBody, CaptureNoShowResult, CaptureRescheduleBody, V3CaptureAttempt } from './v3Types'

// Toàn bộ route api/v3/... của web. Mỗi giai đoạn thêm route của mình vào đây (xem docs/v3-migration-plan-2026-11-26.md).
const managerOrders = '/api/v3/system-manager/survey-orders'
const ownerOrders = '/api/v3/tenant-owner/survey-orders'
const managerOrderPath = (orderId: string) => `${managerOrders}/${encodeURIComponent(orderId)}`
const ownerOrderPath = (orderId: string) => `${ownerOrders}/${encodeURIComponent(orderId)}`
const ownerAppointmentPath = (orderId: string, appointmentId: string) => `${ownerOrderPath(orderId)}/capture-appointments/${encodeURIComponent(appointmentId)}`

// Danh sách lần bay của đơn, kèm nhiệm vụ, lần bay cha và lịch sử chuyển trạng thái. [] khi đơn chưa có lần bay.
export async function getCaptureAttempts(token: string, orderId: string, signal?: AbortSignal): Promise<V3CaptureAttempt[]> {
  const attempts = await apiRequest<V3CaptureAttempt[]>(`${managerOrderPath(orderId)}/capture-attempts`, { token, signal, cache: 'no-store' })
  if (!Array.isArray(attempts)) throw new Error('Dữ liệu lần bay từ máy chủ không hợp lệ. Tải lại trang.')
  return [...attempts].sort((a, b) => a.attemptIndex - b.attemptIndex)
}

// G2 — lịch hẹn bay (Capture). Response dùng chung SurveyAppointmentApiResponse với route cũ; riêng orderStatus của response
// bị BE viết liền không gạch dưới cho trạng thái V3 (vd. AWAITINGDEPOSIT), nên FE luôn tải lại đơn thay vì đọc trường này.
export const proposeCaptureAppointment = (token: string, orderId: string, body: CaptureAppointmentBody) =>
  apiRequest<Appointment>(`${managerOrderPath(orderId)}/capture-appointments`, { method: 'POST', token, body })
export const confirmCaptureAppointment = (token: string, orderId: string, appointmentId: string, body: CaptureAppointmentOwnerBody) =>
  apiRequest<Appointment>(`${ownerAppointmentPath(orderId, appointmentId)}/confirm`, { method: 'POST', token, body })
export const requestCaptureReschedule = (token: string, orderId: string, appointmentId: string, body: CaptureRescheduleBody) =>
  apiRequest<Appointment>(`${ownerAppointmentPath(orderId, appointmentId)}/request-reschedule`, { method: 'POST', token, body })
export const recordCaptureNoShow = (token: string, orderId: string, body: CaptureNoShowBody) =>
  apiRequest<CaptureNoShowResult>(`${managerOrderPath(orderId)}/capture-appointments/no-show`, { method: 'POST', token, body })
