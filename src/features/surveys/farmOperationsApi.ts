import { apiRequest } from '../../api/client'
import type { GeneralStatus, GeoJsonPoint, GeoJsonPolygon } from '../farms/types'

export type FarmContext = {
  farmId: string; tenantId: string; code: string; name: string; address: string | null; status: GeneralStatus; areaHectares: number | null; version: number
  centerPoint?: GeoJsonPoint | null
  approvedBoundary: { id: string; versionNumber: number; geometry: GeoJsonPolygon | null; source: string; evidenceReference: string | null; reviewedAt: string | null; reviewReason: string | null; version: number } | null
  zones: { id: string; code: string; name: string; status: GeneralStatus; areaHectares: number | null; boundary: GeoJsonPolygon | null; version: number }[]
  publishedBaseMap: { id: string; versionNumber: number; sourceSurveyOrderId: string; publishedAt: string | null; version: number } | null
}
export type BoundaryException = {
  id: string; farmId: string; farmBoundaryVersionId: string; source: string; sourceReferenceId: string
  originalPosition: GeoJsonPoint; correctedPosition: GeoJsonPoint | null; state: string; decision: string | null
  measuredDistanceMeters: number; thresholdMeters: number; reviewReason: string | null; version: number; createdAt: string
}
export type BoundaryVerification = { boundary: GeoJsonPolygon; reason: string; evidenceReference: string | null; expectedFarmVersion: number; expectedCurrentBoundaryVersionNumber: number }
export type PointClassification = { point: GeoJsonPoint; source: 4; sourceReferenceId: string; nearBoundaryThresholdMeters: number }
export type ClassifiedPoint = { classification: string; distanceMeters: number; boundaryExceptionId: string | null; state: string | null }
export type ExceptionReview = { decision: 1 | 2 | 3; correctedPosition: GeoJsonPoint | null; reason: string; evidence: { reference: string } | null; expectedVersion: number }
const farmPath = (farmId: string) => `/api/system-manager/farms/${encodeURIComponent(farmId)}`
export const getFarmContext = (token: string, farmId: string, signal?: AbortSignal) => apiRequest<FarmContext>(`${farmPath(farmId)}/operational-context`, { token, signal })
export const verifyFarmBoundary = (token: string, farmId: string, body: BoundaryVerification) => apiRequest(`${farmPath(farmId)}/boundary/verify`, { method: 'POST', token, body })
export const classifyFarmPoint = (token: string, farmId: string, body: PointClassification) => apiRequest<ClassifiedPoint>(`${farmPath(farmId)}/boundary-exceptions/classify`, { method: 'POST', token, body })
export const getBoundaryExceptions = (token: string, farmId: string, state = '', signal?: AbortSignal) => apiRequest<BoundaryException[]>(`${farmPath(farmId)}/boundary-exceptions${state ? `?${new URLSearchParams({ state })}` : ''}`, { token, signal })
export const reviewBoundaryException = (token: string, farmId: string, exceptionId: string, body: ExceptionReview) => apiRequest(`${farmPath(farmId)}/boundary-exceptions/${encodeURIComponent(exceptionId)}/review`, { method: 'POST', token, body })
