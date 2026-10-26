import type { AssignedOrder } from './orderTypes'

export type SystemOrder = AssignedOrder
export type SystemOrderFilters = { status?: string; tenantId?: string; farmId?: string }
export type AuthorizationType = 'WRITTEN_DATA_USE_CONSENT' | 'FLIGHT_PERMISSION'
export type CaptureAuthorization = {
  id: string; surveyOrderId: string; type: AuthorizationType; status: 'PENDING' | 'VERIFIED' | 'REVOKED'
  evidenceReference: string | null; issuedAt: string | null; verifiedAt: string | null
  expiresAt: string | null; revokedAt: string | null; verifiedBy: string | null; version: number
}
export type AuthorizationEvidence = {
  surveyOrderId: string; type: AuthorizationType; status: string; evidenceReference: string
  isMock: boolean; downloadUrl: string | null; urlExpiresAt: string | null; note: string | null
}
export type VerifyAuthorizationValues = {
  issuedAt: string; expiresAt?: string; mode: 'file' | 'mock'; file?: File; mockReference?: string
}
