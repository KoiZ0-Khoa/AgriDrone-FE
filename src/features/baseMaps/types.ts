import type { OrthophotoBounds } from '../missions/missionTypes'

export type MapVersion = {
  versionId: string; farmId: string; versionNumber: number; status: string
  sourceMissionId: string | null; sourceMissionCode: string | null; flightDate: string | null
  sourceSurveyOrderId: string | null; farmBoundaryVersionId: string | null
  gridBearingDeg: number; rowSpacingM: number; plantSpacingM: number; totalPoles: number
  previewUrl: string | null; publishedAt: string | null; publishedBy: string | null; createdAt: string
  manualChangesCount: number
}
export type MapPlant = { plantId: string; plantCode: string; row: number; col: number; lat: number; lon: number; lifecycleStatus: string }
export type ManualMapChange = {
  eventId: string; plantId: string | null; changeType: string; source: string
  oldRow: number | null; newRow: number | null; oldCol: number | null; newCol: number | null
  oldLat: number | null; oldLon: number | null; newLat: number | null; newLon: number | null
  oldLifecycleStatus: string | null; newLifecycleStatus: string | null; notes: string | null; createdAt: string
}
export type MapVersionDetail = Omit<MapVersion, 'manualChangesCount'> & { boundaryGeoJson: string | null; bounds: OrthophotoBounds | null; plants: MapPlant[]; manualChanges: ManualMapChange[] | null }
export type GeoCoordinate = { lat: number; lon: number }
export type PlantLifecycle = {
  plantId: string; farmId: string; plantCode: string; currentLocation: GeoCoordinate | null
  currentRow: number | null; currentCol: number | null; lifecycleStatus: string
  currentMapVersionId: string | null; mappedAt: string | null; createdAt: string
  timeline: { eventId: string; changeType: string; source: string; summary: string; oldPosition: GeoCoordinate | null; newPosition: GeoCoordinate | null; oldRow: number | null; newRow: number | null; oldCol: number | null; newCol: number | null; notes: string | null; missionId: string | null; missionCode: string | null; createdBy: string | null; createdAt: string; farmBaseMapVersionId: string | null }[]
}
export type MapComparison = {
  farmId: string; fromVersionNumber: number; fromVersionId: string; fromVersionDate: string
  toVersionNumber: number; toVersionId: string; toVersionDate: string
  summary: { polesBefore: number; polesAfter: number; netChange: number; createdCount: number; removedCount: number; relocatedCount: number; replacedCount: number; unchangedCount: number }
  changes: { plantId: string | null; plantCode: string; changeType: string; row: number; col: number; newPosition: GeoCoordinate | null; oldPosition: GeoCoordinate | null; distanceMovedM: number | null; notes: string | null }[]
}
export type MapAnalytics = {
  farmId: string; totalMappingVersions: number; firstMappedAt: string | null; latestMappedAt: string | null; farmAreaHa: number | null
  timeline: { versionId: string; versionNumber: number; status: string; publishedAt: string | null; totalPoles: number; polesDelta: number; densityPolesPerHa: number | null; plantSpacingM: number; rowSpacingM: number; gridBearingDeg: number; manualChangesCount: number }[]
}
