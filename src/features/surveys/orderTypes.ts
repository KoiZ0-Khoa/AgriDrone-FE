import type { GeoJsonPolygon } from '../farms/types'

export type AssignedOrder = {
  surveyOrderId: string; orderNumber: string; tenantId: string; farmId: string; farmCode: string; farmName: string
  surveyServiceId: string; surveyServiceCode: string; surveyServiceName: string
  status: string; orderVersion: number; requiresBaselineMapping: boolean; farmBoundaryVersionId: string | null
  boundaryCaptureSessionId: string | null; baselineRoutePlanId: string | null
  currentAppointmentId: string | null; currentAppointmentVersion: number | null; currentAppointmentStatus: string | null
  createdAt: string; updatedAt: string
}
export type OrderScope = {
  surveyOrderId: string; orderNumber: string; tenantId: string; farmId: string; orderStatus: string; orderVersion: number; requiresBaselineMapping: boolean
  currentApprovedBoundary: { farmBoundaryId: string; versionNumber: number; version: number; geometry: GeoJsonPolygon; source: string; evidenceReference: string | null; reviewedBy: string | null; reviewedAt: string | null } | null
  zones: { zoneId: string; code: string; name: string; boundary: GeoJsonPolygon | null; status: string; version: number }[]
}
export type AppointmentBody = { purpose: 'BASELINE_MAPPING' | 'PAID_SERVICE'; proposedStartAt: string; proposedEndAt: string; expectedOrderVersion: number; expectedCurrentAppointmentId: string | null; expectedCurrentAppointmentVersion: number | null }
export type Appointment = { surveyOrderId: string; appointmentId: string; purpose: string; revisionNumber: number; proposedStartAt: string; proposedEndAt: string; appointmentStatus: string; appointmentVersion: number; orderStatus: string; orderVersion: number }
export type VerifyBoundaryBody = { boundary: GeoJsonPolygon; reason: string; evidenceReference: string | null; expectedOrderVersion: number; expectedCurrentBoundaryVersionNumber: number | null }
export type VerifiedBoundary = { surveyOrderId: string; farmId: string; farmBoundaryId: string; farmBoundaryVersionNumber: number; currentFarmBaseMapVersionId: string | null; confirmedSurveyPoleCount: number | null; requiresBaselineMapping: boolean; orderStatus: string; orderVersion: number }
