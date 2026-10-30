// Prepare response purpose/status are raw C# enum ToString() values (PascalCase),
// unlike most other Mission JSON which uses SCREAMING_SNAKE_CASE — verified against BE source.
export type MissionPurpose = 'BaselineMapping' | 'PlantHealth' | 'HarvestReadiness'
export type AvailableDrone = {
  id: string; code: string; name: string; model: string | null; manufacturer: string | null
  specifications: { capabilities: string[] }
  registrationNumber: string | null; registrationExpiryDate: string | null
  weightKg: number | null; status: string; nextMaintenanceAt: string | null
}
export type PreparedMission = { missionId: string; purpose: string; status: string; scheduledAt: string | null; scheduledEndAt: string | null; version: number }
export type PrepareMissionSetResult = { surveyOrderId: string; farmId: string; reusedExistingSet: boolean; missions: PreparedMission[] }

// Mission list/detail JSON uses real enums (SCREAMING_SNAKE_CASE), unlike PreparedMission above.
export type MissionListItem = {
  id: string; farmId: string; zoneId: string | null; droneId: string; missionCode: string
  missionType: string | null; status: string; processingStatus: string
  scheduledAt: string | null; scheduledEndAt: string | null; startedAt: string | null; endedAt: string | null
  version: number; createdAt: string
}
export type MissionDetail = {
  id: string; tenantId: string; farmId: string; zoneId: string | null; droneId: string; pilotUserId: string | null
  missionCode: string; missionType: string | null; status: string; processingStatus: string
  scheduledAt: string | null; scheduledEndAt: string | null; startedAt: string | null; endedAt: string | null
  sourceMapVersionId: string | null; publishedMapVersionId: string | null
  preflightConfirmedBy: string | null; preflightConfirmedAt: string | null
  notes: string | null; version: number; createdAt: string; updatedAt: string
  surveyOrderId: string | null; purpose: string | null; scopeZoneIds: string[]; requiresBaselineCompletion: boolean
  preflightOperationId: string | null; preflightChecklistVersion: number | null
  preflightChecklistAnswers: Record<string, boolean> | null; preflightSuitableForFlight: boolean | null
  preflightNotes: string | null; farmBoundaryVersionId: string | null
}
export type PreflightChecklistItem = { key: string; prompt: string; required: boolean }
export type ActiveMissionChecklist = { definitionId: string; code: string; versionNumber: number; items: PreflightChecklistItem[] }
export type CompleteMissionPreflightResult = { mission: MissionDetail; reusedOperation: boolean }
