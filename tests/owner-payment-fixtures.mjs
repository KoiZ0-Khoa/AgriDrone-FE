export const orderId = '8394b473-54c7-44b9-84c7-b25f95127d2a'
export const appointmentId = '9394b473-54c7-44b9-84c7-b25f95127d2a'
export const ownerOrder = {
  surveyOrderId: orderId, orderNumber: 'SO-OWNER-1', farmId: '7394b473-54c7-44b9-84c7-b25f95127d2a', farmName: 'Long An', status: 'AWAITING_BASELINE_APPOINTMENT',
  orderVersion: 4165, depositAmount: 10000, totalAmount: null, remainingAmount: null, currency: 'VND',
  currentAppointment: { appointmentId, purpose: 'BASELINE_MAPPING', startAt: '2099-01-01T00:00:00Z', endAt: '2099-01-01T02:00:00Z', status: 'PROPOSED', appointmentVersion: 73 },
}
export const confirmedOrder = { ...ownerOrder, status: 'AWAITING_BASELINE_DEPOSIT', orderVersion: 4166, currentAppointment: { ...ownerOrder.currentAppointment, status: 'CONFIRMED', appointmentVersion: 74 } }
export const paidServiceOrder = { ...ownerOrder, status: 'AWAITING_PAYMENT', totalAmount: 60000, remainingAmount: 50000, currentAppointment: { ...ownerOrder.currentAppointment, purpose: 'PAID_SERVICE', status: 'CONFIRMED' } }
export const history = { surveyOrderId: orderId, payments: [] }
export const paymentItem = { surveyPaymentId: 'payment', purpose: 'BASELINE_DEPOSIT', amount: 10000, currency: 'VND', provider: 'sepay', providerReference: 'ref-1', status: 'PROCESSING', createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z', confirmedAt: null, paymentVersion: 80, events: [] }
