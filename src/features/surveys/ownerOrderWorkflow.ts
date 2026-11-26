import type { OwnerSurveyOrder } from './ownerOrderTypes'
import type { CaptureAppointmentOwnerBody } from './v3Types'
import type { PaymentPurpose } from './orderTypes'
import type { PaymentHistory } from './paymentWorkflow'
import { paymentIsPaid } from './paymentWorkflow'
import { v3OrderStatusEnumName, v3OrderStatuses } from './v3Workflow'

// MVC query binding accepts the enum member name; JSON responses use SCREAMING_SNAKE_CASE. Web chỉ lọc theo trạng thái V3.
export const ownerOrderStatusQuery: Record<string, string> = Object.fromEntries(v3OrderStatuses.map(status => [status, v3OrderStatusEnumName(status)]))
export const ownerGuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) && value !== '00000000-0000-0000-0000-000000000000'
export const validOwnerVersion = (value: number) => Number.isInteger(value) && value > 0 && value <= 4_294_967_295
export const ownerOrderFingerprint = (order: OwnerSurveyOrder) => JSON.stringify(order)
// Mirrors BE SurveyOrder.CanAcceptDepositPayment: the deposit may be paid before the map schedule is confirmed.
const depositEligibleStatuses = ['PENDING_BOUNDARY_VERIFICATION', 'AWAITING_BASELINE_APPOINTMENT', 'AWAITING_PAID_APPOINTMENT']
const hasPaidDeposit = (order: OwnerSurveyOrder, history: PaymentHistory) => history.payments.some(item => item.purpose === 'BASELINE_DEPOSIT' && paymentIsPaid(item.status) && item.amount === order.depositAmount && item.currency === order.currency)
// BE reopens the deposit when it was refunded after the invoice was finalized; it must be repaid before the final balance.
export const depositRefundedAfterInvoice = (order: OwnerSurveyOrder, history?: PaymentHistory) => order.status === 'AWAITING_PAYMENT' && order.depositAmount > 0 &&
  historyMatchesOrder(order, history) && !hasPaidDeposit(order, history!) && history!.payments.some(item => item.purpose === 'BASELINE_DEPOSIT' && item.status === 'REFUNDED')
export function paymentPurposeForOrder(order: OwnerSurveyOrder, history?: PaymentHistory): PaymentPurpose | null {
  if (order.status === 'AWAITING_BASELINE_DEPOSIT' || depositRefundedAfterInvoice(order, history)) return 'BASELINE_DEPOSIT'
  if (depositEligibleStatuses.includes(order.status) && order.depositAmount > 0 && historyMatchesOrder(order, history) &&
    !hasPaidDeposit(order, history!)) return 'BASELINE_DEPOSIT'
  return order.status === 'AWAITING_PAYMENT' ? 'FINAL_BALANCE' : null
}
export const payableAmount = (order: OwnerSurveyOrder, history?: PaymentHistory) => paymentPurposeForOrder(order, history) === 'BASELINE_DEPOSIT' ? order.depositAmount : order.remainingAmount ?? order.totalAmount
export const paymentRequiresAppointment = (order: OwnerSurveyOrder, history?: PaymentHistory) => paymentPurposeForOrder(order, history) === 'BASELINE_DEPOSIT' && order.status === 'AWAITING_BASELINE_DEPOSIT' && order.currentAppointment?.purpose !== 'PAID_SERVICE'
export function historyMatchesOrder(order: OwnerSurveyOrder, history: PaymentHistory | undefined) { return !!history && history.surveyOrderId.toLowerCase() === order.surveyOrderId.toLowerCase() }
export const activePaymentStatus = (status: string) => ['PENDING', 'PROCESSING', 'PAID', 'CONFIRMED', 'ADJUSTMENT_REQUIRED'].includes(status)

// Lịch hẹn bay V3: đơn V3 chỉ có lịch CAPTURE nên không xét `purpose`. BE (TenantOwnerSurveyOrderResponseMapper) hiện trả
// mọi lịch không phải bản đồ nền là "PAID_SERVICE", kể cả lịch CAPTURE — lỗi nhỏ phía BE (BE-6), FE bỏ qua trường này.
function validAppointmentContext(order: OwnerSurveyOrder) {
  const appointment = order.currentAppointment
  return validOwnerVersion(order.orderVersion) && ownerGuid(order.surveyOrderId) && !!appointment && ownerGuid(appointment.appointmentId) && validOwnerVersion(appointment.appointmentVersion) &&
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
export function canInitiateOwnerPayment(order: OwnerSurveyOrder, history: PaymentHistory | undefined, now = Date.now()) {
  const purpose = paymentPurposeForOrder(order, history), amount = payableAmount(order, history), appointment = order.currentAppointment
  const validSchedule = !paymentRequiresAppointment(order, history) || (validAppointmentContext(order) &&
    appointment!.status === 'CONFIRMED' && Date.parse(appointment!.endAt) > now)
  if (purpose === 'FINAL_BALANCE' && order.depositAmount > 0 && (!historyMatchesOrder(order, history) || !hasPaidDeposit(order, history!))) return false
  return !!purpose && ownerGuid(order.surveyOrderId) && validOwnerVersion(order.orderVersion) && validSchedule && historyMatchesOrder(order, history) && Number.isFinite(amount) && amount !== null && (purpose === 'BASELINE_DEPOSIT' ? amount > 0 : amount >= 0) &&
    !history!.payments.some(item => item.purpose === purpose && activePaymentStatus(item.status))
}
export function canSynchronizeOwnerPayment(order: OwnerSurveyOrder, history: PaymentHistory | undefined) {
  if (paymentPurposeForOrder(order, history) !== 'FINAL_BALANCE' || !historyMatchesOrder(order, history) || !ownerGuid(order.surveyOrderId) || !validOwnerVersion(order.orderVersion)) return false
  if (order.depositAmount > 0 && !hasPaidDeposit(order, history!)) return false
  const active = history!.payments.filter(item => item.purpose === 'FINAL_BALANCE' && activePaymentStatus(item.status))
  return active.length === 1 && paymentIsPaid(active[0].status) && active[0].amount === payableAmount(order, history) && active[0].currency === order.currency
}
export function ownerPaymentBody(order: OwnerSurveyOrder, history: PaymentHistory | undefined, now = Date.now()) {
  if (!canInitiateOwnerPayment(order, history, now) && !canSynchronizeOwnerPayment(order, history)) throw new Error('Đơn chưa sẵn sàng thanh toán hoặc đã có giao dịch đang xử lý. Kiểm tra lại đơn và trạng thái giao dịch.')
  return { purpose: paymentPurposeForOrder(order, history)!, expectedOrderVersion: order.orderVersion }
}
export function purposeAlreadyPaid(order: OwnerSurveyOrder, history: PaymentHistory | undefined) {
  return historyMatchesOrder(order, history) && history!.payments.some(item => item.purpose === paymentPurposeForOrder(order, history) && paymentIsPaid(item.status) && item.amount === payableAmount(order, history) && item.currency === order.currency)
}
