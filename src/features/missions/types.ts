// BE serializes every enum as JsonNamingPolicy.SnakeCaseUpper globally (Program.cs), so every
// enum-backed field below is UPPER_SNAKE_CASE on the wire, not the C# member name.
export type DroneStatus = 'AVAILABLE' | 'IN_MISSION' | 'MAINTENANCE' | 'INACTIVE' | 'RETIRED'
export type Drone = {
  id: string; code: string; name: string; model: string | null; manufacturer: string | null
  specifications: unknown; serialNumber: string | null; registrationNumber: string | null
  registrationDate: string | null; registrationExpiryDate: string | null; weightKg: number | null
  status: DroneStatus; lastMaintenanceAt: string | null; nextMaintenanceAt: string | null
  notes: string | null; createdAt: string; updatedAt: string; version: number
}
export type DroneMaintenanceEntry = {
  id: string; droneId: string; startedAt: string; startedBy: string | null; reason: string | null
  closedAt: string | null; closedBy: string | null; closingStatus: DroneStatus | null; nextMaintenanceAt: string | null
}
export type AvailableDrone = {
  id: string; code: string; name: string; model: string | null; manufacturer: string | null
  specifications: unknown; registrationNumber: string | null; registrationExpiryDate: string | null
  weightKg: number | null; status: DroneStatus; nextMaintenanceAt: string | null
}
export type MissionPurpose = 'BASELINE_MAPPING' | 'PLANT_HEALTH' | 'HARVEST_READINESS'
export type MissionStatus =
  | 'DRAFT' | 'SCHEDULED' | 'IN_FLIGHT' | 'FLIGHT_COMPLETED' | 'UPLOADING' | 'READY_FOR_PROCESSING'
  | 'PROCESSING' | 'AWAITING_REVIEW' | 'COMPLETED' | 'CANCELLED' | 'FLIGHT_FAILED' | 'UPLOAD_FAILED' | 'PROCESSING_FAILED'
// POST .../missions/prepare is the one BE2 endpoint whose purpose/status come from a plain
// `enum.ToString()` call instead of the typed enum property, so it bypasses the global
// SnakeCaseUpper converter and is PascalCase on the wire. missionApi.prepareMissionSet
// normalizes both fields to the same UPPER_SNAKE_CASE as every other endpoint before returning,
// so this type (and everything downstream) only ever sees one casing convention.
export type PreparedMission = {
  missionId: string; purpose: string; status: string
  scheduledAt: string | null; scheduledEndAt: string | null; version: number
}
export type PrepareMissionSetResponse = {
  surveyOrderId: string; farmId: string; reusedExistingSet: boolean; missions: PreparedMission[]
}
// Full mission snapshot. Only the write APIs (transition/reschedule/preflight) return this;
// there is no standalone GET for it, so FE must carry it forward from those responses.
export type MissionResponse = {
  id: string; farmId: string; droneId: string; missionCode: string
  status: MissionStatus; purpose: MissionPurpose | null
  scheduledAt: string | null; scheduledEndAt: string | null
  startedAt: string | null; endedAt: string | null
  surveyOrderId: string | null; version: number
}
export type ChecklistItem = { key: string; prompt: string; required: boolean }
export type ActiveChecklist = { definitionId: string; code: string; versionNumber: number; items: ChecklistItem[] }
export type PreflightChecklistDefinitionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED'
export type PreflightChecklistDefinition = {
  id: string; code: string; versionNumber: number; status: PreflightChecklistDefinitionStatus
  items: ChecklistItem[]; effectiveFrom: string; retiredAt: string | null; createdBy: string; createdAt: string
}
export type IncidentType = 'SIGNAL_LOSS' | 'LOW_BATTERY' | 'INTERRUPTION' | 'FLIGHT_FAILURE'
export type RecoveryDecision = 'ABORT' | 'RESCHEDULE_REQUIRED'
export type MissionType = 'MAPPING' | 'HEALTH_INSPECTION'
export type ProcessingStatus = 'NOT_UPLOADED' | 'UPLOADED' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVIEW_REQUIRED'
export type MissionListItem = {
  id: string; farmId: string; zoneId: string | null; droneId: string; missionCode: string
  missionType: MissionType | null; status: MissionStatus; processingStatus: ProcessingStatus
  scheduledAt: string | null; scheduledEndAt: string | null; startedAt: string | null; endedAt: string | null
  version: number; createdAt: string
}
export type Page<T> = { items: T[]; pageNumber: number; pageSize: number; totalCount: number; hasNextPage: boolean }
