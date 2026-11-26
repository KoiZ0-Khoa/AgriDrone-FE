import type { OwnerSurveyOrder } from './ownerOrderTypes'
import type { CaptureAppointmentOwnerBody } from './v3Types'
import type { PaymentHistory } from './paymentWorkflow'
import { v3OrderStatusEnumName, v3OrderStatuses } from './v3Workflow'

// MVC query binding accepts the enum member name; JSON responses use SCREAMING_SNAKE_CASE. Web chỉ lọc theo trạng thái V3.
export const ownerOrderStatusQuery: Record<string, string> = Object.fromEntries(v3OrderStatuses.map(status => [status, v3OrderStatusEnumName(status)]))
export const ownerGuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) && value !== '00000000-0000-0000-0000-000000000000'
export const validOwnerVersion = (value: number) => Number.isInteger(value) && value > 0 && value <= 4_294_967_295
export const ownerOrderFingerprint = (order: OwnerSurveyOrder) => JSON.stringify(order)
export function historyMatchesOrder(order: OwnerSurveyOrder, history: PaymentHistory | undefined) { return !!history && history.surveyOrderId.toLowerCase() === order.surveyOrderId.toLowerCase() }
export const activePaymentStatus = (status: string) => ['PENDING', 'PROCESSING', 'PAID', 'CONFIRMED', 'ADJUSTMENT_REQUIRED'].includes(status)

// Điều kiện thao tác dựa vào lịch CAPTURE trả từ GET đơn V3.
function validAppointmentContext(order: OwnerSurveyOrder) {
  const appointment = order.currentAppointment
  return validOwnerVersion(order.orderVersion) && ownerGuid(order.surveyOrderId) && appointment?.purpose === 'CAPTURE' && ownerGuid(appointment.appointmentId) && validOwnerVersion(appointment.appointmentVersion) &&
    Number.isFinite(Date.parse(appointment.startAt)) && Date.parse(appointment.endAt) > Date.parse(appointment.startAt)
}
// Owner xác nhận lịch Manager đề xuất khi đơn đang chờ chốt lịch; sau đó đơn sang chờ cọc hoặc sẵn sàng bay (nếu đã đủ cọc).
export function canConfirmOwnerAppointment(order: OwnerSurveyOrder, now = Date.now()) {
  return validAppointmentContext(order) && order.currentAppointment!.status === 'PROPOSED' && Date.parse(order.currentAppointment!.endAt) > now && order.status === 'AWAITING_APPOINTMENT'
}
// Owner xin đổi lịch khi lịch còn chờ xác nhận hoặc đã xác nhận và chưa bay. BE còn chặn khi Manager đã chuẩn bị lần bay.
const reschedulableStatuses = ['AWAITING_APPOINTMENT', 'AWAITING_DEPOSIT', 'READY_FOR_CAPTURE']
export function canRescheduleOwnerAppointment(order: OwnerSurveyOrder) {
  return validAppointmentContext(order) && ['PROPOSED', 'CONFIRMED'].includes(order.currentAppointment!.status) && reschedulableStatuses.includes(order.status)
}
export function ownerAppointmentBody(order: OwnerSurveyOrder): CaptureAppointmentOwnerBody {
  if (!validAppointmentContext(order)) throw new Error('Thông tin đơn hoặc lịch hẹn chưa đầy đủ. Tải lại trước khi tiếp tục.')
  return { expectedOrderVersion: order.orderVersion, expectedAppointmentVersion: order.currentAppointment!.appointmentVersion }
}
export function canInitiateOwnerDeposit(order: OwnerSurveyOrder, history: PaymentHistory | undefined, now = Date.now()) {
  return order.status === 'AWAITING_DEPOSIT' &&
    validAppointmentContext(order) && order.currentAppointment!.status === 'CONFIRMED' && Date.parse(order.currentAppointment!.endAt) > now &&
    !!history && historyMatchesOrder(order, history) && !history.payments.some(item => item.purpose === 'ORDER_DEPOSIT' && activePaymentStatus(item.status))
}
export function ownerDepositBody(order: OwnerSurveyOrder, history: PaymentHistory | undefined, now = Date.now()) {
  if (!canInitiateOwnerDeposit(order, history, now)) throw new Error('Đơn chưa sẵn sàng trả cọc hoặc đã có giao dịch cần kiểm tra. Hãy tải lại đơn và lịch sử thanh toán.')
  return { expectedOrderVersion: order.orderVersion }
}
