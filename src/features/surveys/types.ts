export type Page<T> = { items: T[]; pageNumber: number; pageSize: number; totalCount: number; hasNextPage: boolean }
export type Manager = {
  id: string; userId: string; email: string; fullName: string
  status: 'ACTIVE' | 'SUSPENDED'; availability: 'AVAILABLE' | 'UNAVAILABLE'
  qualificationStatus: 'PENDING' | 'QUALIFIED' | 'SUSPENDED' | 'REVOKED'
  qualificationExpiresAt: string | null; version: number
}
export type ServicePrice = { priceVersionId: string; amountPerPole: number; currency: string; effectiveFrom: string; effectiveTo: string | null }
export type SurveyService = {
  surveyServiceId: string; code: string; name: string; description: string; serviceType: string
  status: 'ACTIVE' | 'EXPERIMENTAL' | 'RETIRED'; version: number; currentPrice: ServicePrice | null
}
export type PublicService = Pick<SurveyService, 'surveyServiceId' | 'code' | 'name' | 'description' | 'serviceType'> & { isExperimental: boolean; indicativePrice: Omit<ServicePrice, 'priceVersionId'> }
export type PriceHistory = { priceVersionId: string; pricePerPole: number | null; legacyPricePerHa: number | null; currency: string; effectiveFrom: string; effectiveTo: string | null; isLegacyPerHectarePrice: boolean }
export type RequestKind = 'NEW_CUSTOMER' | 'EXISTING_TENANT_NEW_FARM' | 'EXISTING_FARM_SURVEY'
export type RequestStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
export type SurveyRequest = {
  id: string; requestNumber: string; kind: RequestKind; status: RequestStatus
  surveyServiceId: string; surveyServiceCode: string; tenantId: string | null; farmId: string | null
  applicantName: string; farmName: string; approximateAreaHa: number; estimatedPoleCount: number | null
  createdAt: string; updatedAt: string; version: number
}
export type RequestDetail = SurveyRequest & {
  surveyServiceName: string; applicantEmail: string; applicantPhone: string; farmAddress: string
  candidateLocation: { longitude: number; latitude: number; isApprovedFarmBoundary: boolean }
  preferredStartAt: string | null; preferredEndAt: string | null; notes: string | null
  checklistVersion: string; checklistItems: { code: string; description: string }[]
  reviews: { id: string; decision: string; reason: string; reviewedAt: string; checklistSnapshot: unknown }[]
}
export type ReviewChecklist = { version: string; contactValid: boolean; isServiceAreaSupported: boolean; isPreliminaryLegalAndFlightFeasible: boolean; notes: string | null }
export type ReviewDecision = { expectedVersion: number; reason: string; checklist: ReviewChecklist }
export type Approval = { surveyRequestId: string; requestNumber: string; surveyOrderId: string; orderNumber: string; orderStatus: string; tenantId: string; farmId: string; requiresBaselineMapping: boolean }
export type RequestReceipt = { id: string; requestNumber: string; kind: RequestKind; status: RequestStatus; createdAt: string }
export type ExistingFarmIntake = { surveyServiceId: string; estimatedPoleCount: number | null; preferredStartAt: string | null; preferredEndAt: string | null; notes: string | null }
export type NewFarmIntake = ExistingFarmIntake & { farmName: string; farmAddress: string; approximateAreaHa: number; longitude: number; latitude: number }
export type PublicIntake = NewFarmIntake & { applicantName: string; applicantEmail: string; applicantPhone: string }
export type AssignedFarm = { tenantId: string; farmId: string; code: string; name: string; address: string | null; areaHectares: number | null; assignedAt: string }
