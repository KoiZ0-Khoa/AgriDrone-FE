export type OwnerAppointment = {
  appointmentId: string; purpose: 'BASELINE_MAPPING' | 'PAID_SERVICE'; startAt: string; endAt: string; status: string; appointmentVersion: number
  scheduledDate: string | null; scheduledStartDate: string | null; scheduledEndDate: string | null
}
export type OwnerSurveyOrder = {
  confirmedMappingPoleCount: number | null; confirmedPlantHealthPoleCount: number | null
  mappingPricePerPole: number | null; plantHealthPricePerPole: number | null
  mappingSubtotal: number | null; plantHealthSubtotal: number | null
  comboDiscountPercentage: number | null; comboDiscountAmount: number | null
  surveyOrderId: string; orderNumber: string; farmId: string; farmName: string; status: string; orderVersion: number
  depositAmount: number; totalAmount: number | null; remainingAmount: number | null; currency: string; currentAppointment: OwnerAppointment | null
}
export type OwnerAppointmentBody = { expectedOrderVersion: number; expectedAppointmentVersion: number }
