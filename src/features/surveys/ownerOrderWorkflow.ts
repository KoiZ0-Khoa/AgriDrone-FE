import type { OwnerAppointmentBody, OwnerSurveyOrder } from './ownerOrderTypes'
import type { PaymentPurpose } from './orderTypes'
import type { PaymentHistory } from './paymentWorkflow'
import { paymentIsPaid } from './paymentWorkflow'

// MVC query binding accepts the enum member name; JSON responses use SCREAMING_SNAKE_CASE.
export const ownerOrderStatusQuery: Record<string, string> = Object.fromEntries([
  'PendingBoundaryVerification', 'AwaitingBaselineAppointment', 'AwaitingBaselineDeposit', 'AwaitingBoundaryCapture', 'BaselineReady', 'BaselineInProgress',
  'AwaitingBaselineReview', 'AwaitingPricing', 'AwaitingPaidAppointment', 'AwaitingPayment', 'ReadyForPaidService', 'InProgress', 'PendingReview', 'Completed', 'Cancelled',
].map(value => [value.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(), value]))
export const ownerGuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) && value !== '00000000-0000-0000-0000-000000000000'
export const validOwnerVersion = (value: number) => Number.isInteger(value) && value > 0 && value <= 4_294_967_295
export const ownerOrderFingerprint = (order: OwnerSurveyOrder) => JSON.stringify(order)
export const paymentPurposeForOrder = (order: OwnerSurveyOrder): PaymentPurpose | null => order.status === 'AWAITING_BASELINE_DEPOSIT' ? 'BASELINE_DEPOSIT' : order.status === 'AWAITING_PAYMENT' ? 'FINAL_BALANCE' : null
export const payableAmount = (order: OwnerSurveyOrder) => paymentPurposeForOrder(order) === 'BASELINE_DEPOSIT' ? order.depositAmount : order.remainingAmount ?? order.totalAmount
export function historyMatchesOrder(order: OwnerSurveyOrder, history: PaymentHistory | undefined) { return !!history && history.surveyOrderId.toLowerCase() === order.surveyOrderId.toLowerCase() }
export const activePaymentStatus = (status: string) => ['PENDING', 'PROCESSING', 'PAID', 'CONFIRMED', 'ADJUSTMENT_REQUIRED'].includes(status)

function validAppointmentContext(order: OwnerSurveyOrder) {
  const appointment = order.currentAppointment
  return validOwnerVersion(order.orderVersion) && ownerGuid(order.surveyOrderId) && !!appointment && ownerGuid(appointment.appointmentId) && validOwnerVersion(appointment.appointmentVersion) &&
    ['BASELINE_MAPPING', 'PAID_SERVICE'].includes(appointment.purpose) && Number.isFinite(Date.parse(appointment.startAt)) && Date.parse(appointment.endAt) > Date.parse(appointment.startAt)
}
export function canConfirmOwnerAppointment(order: OwnerSurveyOrder, now = Date.now()) {
  return validAppointmentContext(order) && order.currentAppointment!.status === 'PROPOSED' && Date.parse(order.currentAppointment!.endAt) > now &&
    order.status === (order.currentAppointment!.purpose === 'BASELINE_MAPPING' ? 'AWAITING_BASELINE_APPOINTMENT' : 'AWAITING_PAID_APPOINTMENT')
}
export function canRescheduleOwnerAppointment(order: OwnerSurveyOrder, history: PaymentHistory | undefined) {
  if (!validAppointmentContext(order) || !['PROPOSED', 'CONFIRMED'].includes(order.currentAppointment!.status) || !historyMatchesOrder(order, history)) return false
  if (order.currentAppointment!.purpose === 'BASELINE_MAPPING') return ['AWAITING_BASELINE_APPOINTMENT', 'AWAITING_BASELINE_DEPOSIT', 'AWAITING_BOUNDARY_CAPTURE', 'BASELINE_READY'].includes(order.status)
  return ['AWAITING_PAID_APPOINTMENT', 'AWAITING_PAYMENT'].includes(order.status) && !history!.payments.some(item => activePaymentStatus(item.status))
}
export function ownerAppointmentBody(order: OwnerSurveyOrder): OwnerAppointmentBody {
  if (!validAppointmentContext(order)) throw new Error('Thông tin đơn hoặc lịch hẹn chưa đầy đủ. Tải lại trước khi tiếp tục.')
  return { expectedOrderVersion: order.orderVersion, expectedAppointmentVersion: order.currentAppointment!.appointmentVersion }
}
export function canInitiateOwnerPayment(order: OwnerSurveyOrder, history: PaymentHistory | undefined, now = Date.now()) {
  const purpose = paymentPurposeForOrder(order), amount = payableAmount(order), appointment = order.currentAppointment
  return !!purpose && validAppointmentContext(order) && historyMatchesOrder(order, history) && Number.isFinite(amount) && amount !== null && (purpose === 'BASELINE_DEPOSIT' ? amount > 0 : amount >= 0) &&
    appointment!.status === 'CONFIRMED' && appointment!.purpose === (purpose === 'BASELINE_DEPOSIT' ? 'BASELINE_MAPPING' : 'PAID_SERVICE') && Date.parse(appointment!.endAt) > now &&
    !history!.payments.some(item => item.purpose === purpose && activePaymentStatus(item.status))
}
export function ownerPaymentBody(order: OwnerSurveyOrder, history: PaymentHistory | undefined, now = Date.now()) {
  if (!canInitiateOwnerPayment(order, history, now)) throw new Error('Đơn chưa sẵn sàng thanh toán hoặc đã có giao dịch đang xử lý. Kiểm tra lại lịch hẹn và trạng thái giao dịch.')
  return { purpose: paymentPurposeForOrder(order)!, expectedOrderVersion: order.orderVersion }
}
export function purposeAlreadyPaid(order: OwnerSurveyOrder, history: PaymentHistory | undefined) {
  return historyMatchesOrder(order, history) && history!.payments.some(item => item.purpose === paymentPurposeForOrder(order) && paymentIsPaid(item.status))
}
