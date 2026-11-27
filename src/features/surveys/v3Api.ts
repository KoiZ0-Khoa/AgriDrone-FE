import { apiRequest } from '../../api/client'
import type { Appointment, PaymentSession } from './orderTypes'
import type { CaptureAppointmentBody, CaptureAppointmentOwnerBody, CaptureNoShowBody, CaptureNoShowResult, CaptureRescheduleBody, V3CaptureAttempt } from './v3Types'
import type { FreezeCaptureInputBody, FrozenCaptureInput, V3CompleteFlightBody, V3FailFlightBody, V3FlightResult, V3StartFlightBody } from './v3Types'
import type { ApproveCaptureInputBody, ApproveCaptureInputResult, RecoverCaptureMissionResult, ReopenCaptureInputBody, ReopenCaptureInputResult } from './v3Types'
import type { MarkCaptureBoundaryBody, MarkCaptureBoundaryResult } from './v3Types'
import type { PrepareCaptureAttemptBody, PrepareCaptureAttemptResult, QualityReflightBody, QualityReflightResult } from './v3Types'
import type { ComboReviewResult, FreezeResult, FreezeResultBody, RecordComboReviewBody, ResultReview } from './v3Types'
import type { AdminCancellationBody } from './systemOrderTypes'

// Toàn bộ route api/v3/... của web. Mỗi giai đoạn thêm route của mình vào đây (xem docs/v3-migration-plan-2026-11-26.md).
const managerOrders = '/api/v3/system-manager/survey-orders'
const ownerOrders = '/api/v3/tenant-owner/survey-orders'
const adminOrders = '/api/v3/system-admin/survey-orders'

export const decideOrderCancellation = (token: string, orderId: string, body: AdminCancellationBody) =>
  apiRequest<unknown>(`${adminOrders}/${encodeURIComponent(orderId)}/cancellation-decisions`, { method: 'POST', token, body })
const managerOrderPath = (orderId: string) => `${managerOrders}/${encodeURIComponent(orderId)}`
const ownerOrderPath = (orderId: string) => `${ownerOrders}/${encodeURIComponent(orderId)}`
const ownerAppointmentPath = (orderId: string, appointmentId: string) => `${ownerOrderPath(orderId)}/capture-appointments/${encodeURIComponent(appointmentId)}`
const captureAttemptsPath = (orderId: string) => `${managerOrderPath(orderId)}/capture-attempts`
const captureFlightPath = (orderId: string, attemptId: string) => `${captureAttemptsPath(orderId)}/${encodeURIComponent(attemptId)}`

// Danh sách lần bay của đơn, kèm nhiệm vụ, lần bay cha và lịch sử chuyển trạng thái. [] khi đơn chưa có lần bay.
export async function getCaptureAttempts(token: string, orderId: string, signal?: AbortSignal): Promise<V3CaptureAttempt[]> {
  const attempts = await apiRequest<V3CaptureAttempt[]>(captureAttemptsPath(orderId), { token, signal, cache: 'no-store' })
  if (!Array.isArray(attempts)) throw new Error('Dữ liệu lần bay từ máy chủ không hợp lệ. Tải lại trang.')
  return [...attempts].sort((a, b) => a.attemptIndex - b.attemptIndex)
}

export const prepareCaptureAttempt = (token: string, orderId: string, body: PrepareCaptureAttemptBody) =>
  apiRequest<PrepareCaptureAttemptResult>(captureAttemptsPath(orderId), { method: 'POST', token, body })

export const startCaptureFlight = (token: string, orderId: string, attemptId: string, body: V3StartFlightBody) =>
  apiRequest<V3FlightResult & { startedAt: string }>(`${captureFlightPath(orderId, attemptId)}/start`, { method: 'POST', token, body })
export const completeCaptureFlight = (token: string, orderId: string, attemptId: string, body: V3CompleteFlightBody) =>
  apiRequest<V3FlightResult & { endedAt: string }>(`${captureFlightPath(orderId, attemptId)}/complete-flight`, { method: 'POST', token, body })
export const failCaptureFlight = (token: string, orderId: string, attemptId: string, body: V3FailFlightBody) =>
  apiRequest<V3FlightResult>(`${captureFlightPath(orderId, attemptId)}/fail-flight`, { method: 'POST', token, body })
export const freezeCaptureInput = (token: string, orderId: string, attemptId: string, body: FreezeCaptureInputBody) =>
  apiRequest<FrozenCaptureInput>(`${captureFlightPath(orderId, attemptId)}/input-manifest/freeze`, { method: 'POST', token, body })
export const reopenCaptureInput = (token: string, orderId: string, attemptId: string, body: ReopenCaptureInputBody) =>
  apiRequest<ReopenCaptureInputResult>(`${captureFlightPath(orderId, attemptId)}/input-manifest/reopen`, { method: 'POST', token, body })
export const approveCaptureInput = (token: string, orderId: string, attemptId: string, body: ApproveCaptureInputBody) =>
  apiRequest<ApproveCaptureInputResult>(`${captureFlightPath(orderId, attemptId)}/input-approval`, { method: 'POST', token, body })

export const recoverApprovedCaptureMission = (token: string, orderId: string, attemptId: string) =>
  apiRequest<RecoverCaptureMissionResult>(`${captureFlightPath(orderId, attemptId)}/input-approval/recover`, { method: 'POST', token })

export const markCaptureBoundary = (token: string, orderId: string, attemptId: string, body: MarkCaptureBoundaryBody) =>
  apiRequest<MarkCaptureBoundaryResult>(`${captureFlightPath(orderId, attemptId)}/farm-boundary/mark-orthophoto-corners`, { method: 'POST', token, body })

// G6 — bay lại từ lần bay lỗi / cần bay lại. BE tạo lần bay mới, nhiệm vụ mới và lịch Capture chờ Owner xác nhận.
export const createQualityReflight = (token: string, orderId: string, parentAttemptId: string, body: QualityReflightBody) =>
  apiRequest<QualityReflightResult>(`${captureFlightPath(orderId, parentAttemptId)}/quality-reflights`, { method: 'POST', token, body })

// G7 — duyệt kết quả V3. Lỗi 409 (dữ liệu cũ) → tải lại GET result-review để người dùng xác nhận lại đúng phiên bản.
export const getResultReview = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<ResultReview>(`${managerOrderPath(orderId)}/result-review`, { token, signal, cache: 'no-store' })
export const recordComboReview = (token: string, orderId: string, body: RecordComboReviewBody) =>
  apiRequest<ComboReviewResult>(`${managerOrderPath(orderId)}/result-review/combo-reviews`, { method: 'POST', token, body })
export const freezeResultReview = (token: string, orderId: string, body: FreezeResultBody) =>
  apiRequest<FreezeResult>(`${managerOrderPath(orderId)}/result-review/freeze`, { method: 'POST', token, body })

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

export async function initiateDepositCheckout(token: string, orderId: string, body: { expectedOrderVersion: number }): Promise<PaymentSession> {
  const payment = await apiRequest<PaymentSession>(`${ownerOrderPath(orderId)}/deposit-checkouts`, { method: 'POST', token, body })
  return {
    ...payment,
    appointmentId: [payment.appointmentId, payment.paidServiceAppointmentId].find(value => value && value !== '00000000-0000-0000-0000-000000000000') ?? null,
  }
}
