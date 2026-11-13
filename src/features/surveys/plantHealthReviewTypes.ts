import type { GeoJsonPolygon } from '../farms/types'

// Contract lấy từ BE: PlantHealthReviewController.cs + Contracts/Farms/PlantHealthReviewContracts.cs
// + Features/PlantHealth/PlantHealthReviewCommands.cs (mốc BE fda57ec). Xem task A1 trong
// docs/plant-health-review-phase2-2026-11-13.md.

// UC-28 — BE tự trim + uppercase, nhưng FE luôn gửi đúng hoa.
export type ObservationReviewDecision = 'CONFIRMED' | 'REJECTED'
export type ReviewObservationBody = {
  decision: ObservationReviewDecision
  reason: string
  // Mã trong plant.plant_conditions (BE uppercase rồi tra theo `code`), KHÔNG phải tên lớp AI như "Disease_Sun_Burn".
  // BE chỉ áp dụng khi decision = CONFIRMED.
  correctedConditionCode?: string | null
}
export type ReviewObservationResult = { observationId: string; newStatus: string; resolvedPlantId: string | null; reason: string }

// UC-29 — mọi trường số/tọa độ đều nullable ở BE.
export type FlaggedObservation = {
  observationId: string; missionId: string
  detectedLat: number | null; detectedLon: number | null
  gpsDistanceMeters: number | null; detectionConfidence: number | null
  matchingParametersJson: string | null; suggestedPlantId: string | null
}
export type FlaggedObservationsResult = { farmId: string; count: number; items: FlaggedObservation[] }

export type ResolveFlagAction = 'SNAP' | 'CREATE_NEW_PLANT' | 'DISMISS'
export type ResolveFlagBody =
  | { action: 'SNAP'; targetPlantId: string; reason: string }
  | { action: 'CREATE_NEW_PLANT'; newPlantCode?: string | null; zoneId?: string | null; reason: string }
  | { action: 'DISMISS'; reason: string }
// SNAP/DISMISS → 200, CREATE_NEW_PLANT → 201 Created (cùng shape).
export type ResolveFlagResult = {
  observationId: string; action: ResolveFlagAction; newStatus: string
  resolvedPlantId: string | null; newPlantId: string | null; newPlantCode: string | null
}

// UC-30 — chỉ áp dụng cho vùng PROPOSED; boundary/memberships thành công thì vùng chuyển REVIEWED và khóa.
export type MergeDiseaseZonesBody = { zoneIds: string[]; mergedGeometry: GeoJsonPolygon }
export type MergeDiseaseZonesResult = { mergedZoneId: string; totalTrees: number; mergedZoneCount: number }
export type UpdateZoneBoundaryResult = { zoneId: string; geometryGeoJson: string; totalEnclosedTrees: number }
export type UpdateZoneMembershipsBody = { addPlantIds: string[]; removePlantIds: string[] }
export type UpdateZoneMembershipsResult = { zoneId: string; totalEnclosedTrees: number; addedCount: number; removedCount: number }

// Các khóa snake_case thật trong cột matching_parameters (jsonb) — BE GetFarmPlantHealthMapQueryHandler đọc cùng các khóa này.
export type FlaggedMatchingParameters = {
  className: string | null; imageName: string | null
  cropImageUrl: string | null; annotatedImageUrl: string | null; detectionId: string | null
}
