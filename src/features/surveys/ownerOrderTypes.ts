export type OwnerAppointment = {
  appointmentId: string; purpose: string; startAt: string; endAt: string; status: string; appointmentVersion: number
}

export type OwnerSurveyOrder = {
  surveyOrderId: string; orderNumber: string; farmId: string; farmName: string
  serviceCode: string; serviceName: string; status: string; orderVersion: number
  createdAt: string; updatedAt: string; currentAppointment: OwnerAppointment | null
}

export type OwnerSurveyInvoice = {
  orderId: string; invoiceRevisionNumber: number; verifiedBillablePoleCount: number
  pricePerPole: number; currency: string; totalAmount: number; dueAmount: number
}
