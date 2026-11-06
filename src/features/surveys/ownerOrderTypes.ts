export type OwnerAppointment = {
  appointmentId: string; purpose: 'BASELINE_MAPPING' | 'PAID_SERVICE'; startAt: string; endAt: string; status: string; appointmentVersion: number
  scheduledDate: string | null; scheduledStartDate: string | null; scheduledEndDate: string | null
}
export type OwnerSurveyOrder = {
  surveyOrderId: string; orderNumber: string; farmId: string; farmName: string; status: string; orderVersion: number
  depositAmount: number; totalAmount: number | null; remainingAmount: number | null; currency: string; currentAppointment: OwnerAppointment | null
}
export type OwnerAppointmentBody = { expectedOrderVersion: number; expectedAppointmentVersion: number }
