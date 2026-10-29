export type DroneStatus = 'Available' | 'InMission' | 'Maintenance' | 'Inactive' | 'Retired'
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
export type MissionPurpose = 'BaselineMapping' | 'PlantHealth' | 'HarvestReadiness'
export type MissionStatus =
  | 'Draft' | 'Scheduled' | 'InFlight' | 'FlightCompleted' | 'Uploading' | 'ReadyForProcessing'
  | 'Processing' | 'AwaitingReview' | 'Completed' | 'Cancelled' | 'FlightFailed' | 'UploadFailed' | 'ProcessingFailed'
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
export type IncidentType = 'SIGNAL_LOSS' | 'LOW_BATTERY' | 'INTERRUPTION' | 'FLIGHT_FAILURE'
export type RecoveryDecision = 'ABORT' | 'RESCHEDULE_REQUIRED'
