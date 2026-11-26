export type OwnerAppointment = {
  // purpose: BE trả 'PAID_SERVICE' cả với lịch CAPTURE của đơn V3 (BE-6), FE không dùng.
  appointmentId: string; purpose: string; startAt: string; endAt: string; status: string; appointmentVersion: number
  scheduledDate: string | null; scheduledStartDate: string | null; scheduledEndDate: string | null
}
export type OwnerSurveyOrder = {
  confirmedMappingPoleCount: number | null; confirmedPlantHealthPoleCount: number | null
  mappingPricePerPole: number | null; plantHealthPricePerPole: number | null
  mappingSubtotal: number | null; plantHealthSubtotal: number | null
  comboDiscountPercentage: number | null; comboDiscountAmount: number | null
  surveyOrderId: string; orderNumber: string; farmId: string; farmName: string; status: string; orderVersion: number
  serviceType: string
  depositAmount: number; totalAmount: number | null; remainingAmount: number | null; currency: string; currentAppointment: OwnerAppointment | null
}
