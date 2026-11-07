import { apiRequest, apiRequestFile } from '../../api/client'
import type { Drone } from '../drones/types'
import type { Page } from '../surveys/types'
import type { ActiveMissionChecklist, AvailableDrone, CompleteMissionPreflightResult, DetectMissionTreesOptions, DetectMissionTreesResult, FinalizeUploadResult, GeoJsonPolygon, ImportTelemetryPointInput, ImportTelemetryResult, MediaDownloadUrl, MediaUploadItemResult, MissionDetail, MissionListItem, MissionMedia, MissionPurpose, NormalizedTelemetryLog, OrthophotoStatus, PlantGpsPublishPayload, PlantGpsPublishResult, PlantGpsResult, PlantGpsTree, PrepareMissionSetResult, ProcessMetashapeOptions, ProcessMetashapeResult, ReplacePlantGpsResult, ResetMissionUploadResult, SliceTilesResult, UploadReadiness } from './missionTypes'

const farmPath = (farmId: string) => `/api/system-manager/farms/${encodeURIComponent(farmId)}`
const missionPath = (farmId: string, missionId: string) => `${farmPath(farmId)}/missions/${encodeURIComponent(missionId)}`

export function getAvailableDrones(token: string, farmId: string, startAt: string, endAt: string, purpose?: MissionPurpose, signal?: AbortSignal) {
  const params = new URLSearchParams({ startAt, endAt })
  if (purpose) params.set('purpose', purpose)
  return apiRequest<AvailableDrone[]>(`${farmPath(farmId)}/drones/available?${params}`, { token, signal })
}
export const prepareMissionSet = (token: string, surveyOrderId: string, body: { droneId: string; baselineDate?: string; serviceDate?: string }, key: string) =>
  apiRequest<PrepareMissionSetResult>(`/api/system-manager/survey-orders/${encodeURIComponent(surveyOrderId)}/missions/prepare`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })

export const getFarmDroneDetails = (token: string, farmId: string, droneId: string, signal?: AbortSignal) =>
  apiRequest<Drone>(`${farmPath(farmId)}/drones/${encodeURIComponent(droneId)}`, { token, signal })
export function getFarmMissions(token: string, farmId: string, pageNumber = 1, pageSize = 20, signal?: AbortSignal) {
  return apiRequest<Page<MissionListItem>>(`${farmPath(farmId)}/missions?${new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })}`, { token, signal })
}
// No single-mission GET exists for System Manager; find it by paging the farm's mission list (bounded).
export async function findMissionById(token: string, farmId: string, missionId: string, signal?: AbortSignal): Promise<MissionListItem | null> {
  for (let page = 1; page <= 25; page++) {
    const result = await getFarmMissions(token, farmId, page, 50, signal)
    const found = result.items.find(item => item.id === missionId)
    if (found) return found
    if (!result.hasNextPage) return null
  }
  return null
}
// No GET-by-surveyOrderId endpoint either. missionCode is deterministic from surveyOrderId
// (see PrepareMissionSetCommandHandler.BuildMissionCode: `ORD-{surveyOrderId:N}-{BASE|HEALTH|READY}`,
// surveyOrderId:N = lowercase, no dashes — under the 50-char cap for every purpose, so never truncated),
// so page through the farm's mission list and match by that prefix instead of mutating via prepare-mission-set.
export async function findMissionsBySurveyOrder(token: string, farmId: string, surveyOrderId: string, signal?: AbortSignal): Promise<MissionListItem[]> {
  const prefix = `ORD-${surveyOrderId.replace(/-/g, '')}-`
  const matches: MissionListItem[] = []
  for (let page = 1; page <= 25; page++) {
    const result = await getFarmMissions(token, farmId, page, 50, signal)
    matches.push(...result.items.filter(item => item.missionCode.startsWith(prefix)))
    if (!result.hasNextPage) break
  }
  return matches
}
export const getMissionVersion = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<{ id: string; version: number }>(`${missionPath(farmId, missionId)}/version`, { token, signal })
export const getActivePreflightChecklist = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<ActiveMissionChecklist>(`${missionPath(farmId, missionId)}/preflight/checklist`, { token, signal })
export const completeMissionPreflight = (token: string, farmId: string, missionId: string, body: { expectedMissionVersion: number; checklistDefinitionId: string; checklistVersion: number; answers: Record<string, boolean>; suitableForFlight: boolean; notes: string | null; deviceCompletedAt: string }, key: string) =>
  apiRequest<CompleteMissionPreflightResult>(`${missionPath(farmId, missionId)}/preflight`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
export const startMission = (token: string, farmId: string, missionId: string, expectedMissionVersion: number) =>
  apiRequest<MissionDetail>(`${missionPath(farmId, missionId)}/start`, { method: 'POST', token, body: { expectedMissionVersion } })
export const completeFlightMission = (token: string, farmId: string, missionId: string, expectedMissionVersion: number) =>
  apiRequest<MissionDetail>(`${missionPath(farmId, missionId)}/complete-flight`, { method: 'POST', token, body: { expectedMissionVersion } })
export const cancelMission = (token: string, farmId: string, missionId: string, expectedMissionVersion: number, reason: string) =>
  apiRequest<MissionDetail>(`${missionPath(farmId, missionId)}/cancel`, { method: 'POST', token, body: { expectedMissionVersion, reason } })
export const failFlightMission = (token: string, farmId: string, missionId: string, body: { expectedMissionVersion: number; reason: string; incidentType: string; incidentOutcome: string; recoveryDecision: string; evidenceReference: string }, key: string) =>
  apiRequest<MissionDetail>(`${missionPath(farmId, missionId)}/fail-flight`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })
// Note: this endpoint's field is `expectedVersion`, unlike `expectedMissionVersion` used by every other mission transition route.
export const rescheduleMission = (token: string, farmId: string, missionId: string, body: { expectedVersion: number; scheduledDate: string; replacementDroneId?: string }) =>
  apiRequest<MissionDetail>(`${missionPath(farmId, missionId)}/reschedule`, { method: 'POST', token, body })
export const getMissionPlantGps = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<PlantGpsResult>(`${missionPath(farmId, missionId)}/plant-gps`, { token, signal })
export const replaceMissionPlantGps = (token: string, farmId: string, missionId: string, trees: PlantGpsTree[]) =>
  apiRequest<ReplacePlantGpsResult>(`${missionPath(farmId, missionId)}/plant-gps`, { method: 'POST', token, body: { trees } })
export const publishMissionPlantGps = (token: string, farmId: string, missionId: string, payload: PlantGpsPublishPayload, key: string) =>
  apiRequest<PlantGpsPublishResult>(`${missionPath(farmId, missionId)}/plant-gps/publish`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body: { payload } })

// Separate route prefix (api/missions/{missionId}/farms/{farmId}/...) — a different controller than SystemManagerMissionsController above.
const mediaPath = (farmId: string, missionId: string) => `/api/missions/${encodeURIComponent(missionId)}/farms/${encodeURIComponent(farmId)}/media`
export function uploadMissionMedia(token: string, farmId: string, missionId: string, files: File[]) {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return apiRequest<MediaUploadItemResult[]>(mediaPath(farmId, missionId), { method: 'POST', token, body: form })
}
export function getMissionMedia(token: string, farmId: string, missionId: string, pageNumber = 1, pageSize = 20, signal?: AbortSignal) {
  return apiRequest<Page<MissionMedia>>(`${mediaPath(farmId, missionId)}?${new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })}`, { token, signal })
}
export const getMissionMediaDownloadUrl = (token: string, farmId: string, missionId: string, mediaId: string, signal?: AbortSignal) =>
  apiRequest<MediaDownloadUrl>(`${mediaPath(farmId, missionId)}/${encodeURIComponent(mediaId)}/download-url`, { token, signal })

const telemetryPath = (farmId: string, missionId: string) => `/api/missions/${encodeURIComponent(missionId)}/farms/${encodeURIComponent(farmId)}/telemetry`
export function normalizeTelemetryLog(token: string, farmId: string, missionId: string, file: File) {
  const form = new FormData()
  form.append('File', file)
  return apiRequest<NormalizedTelemetryLog>(`${telemetryPath(farmId, missionId)}/normalize`, { method: 'POST', token, body: form })
}
export const importMissionTelemetry = (token: string, farmId: string, missionId: string, body: { sourceFileName: string; sourceChecksum: string; expectedMissionVersion: number; segments: { segmentIndex: number; points: ImportTelemetryPointInput[] }[] }, key: string) =>
  apiRequest<ImportTelemetryResult>(`${telemetryPath(farmId, missionId)}/imports`, { method: 'POST', token, headers: { 'Idempotency-Key': key }, body })

const uploadPath = (farmId: string, missionId: string) => `/api/missions/${encodeURIComponent(missionId)}/farms/${encodeURIComponent(farmId)}/upload`
export const getUploadReadiness = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<UploadReadiness>(`${uploadPath(farmId, missionId)}/readiness`, { token, signal })
export const finalizeMissionUpload = (token: string, farmId: string, missionId: string, expectedMissionVersion: number) =>
  apiRequest<FinalizeUploadResult>(`${uploadPath(farmId, missionId)}/finalize`, { method: 'POST', token, body: { expectedMissionVersion } })
export const resetMissionUpload = (token: string, farmId: string, missionId: string, expectedMissionVersion: number, resetTelemetry: boolean) =>
  apiRequest<ResetMissionUploadResult>(`${uploadPath(farmId, missionId)}/reset`, { method: 'POST', token, body: { expectedMissionVersion, resetTelemetry } })

const processingPath = (farmId: string, missionId: string) => `/api/missions/${encodeURIComponent(missionId)}/farms/${encodeURIComponent(farmId)}`
export const processMetashape = (token: string, farmId: string, missionId: string, options?: ProcessMetashapeOptions) =>
  apiRequest<ProcessMetashapeResult>(`${processingPath(farmId, missionId)}/process-metashape`, { method: 'POST', token, body: options ?? {} })
export const processOdm = (token: string, farmId: string, missionId: string, options?: ProcessMetashapeOptions) =>
  apiRequest<ProcessMetashapeResult>(`${processingPath(farmId, missionId)}/process-odm`, { method: 'POST', token, body: options ?? {} })
export const getOrthophotoStatus = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<OrthophotoStatus>(`${processingPath(farmId, missionId)}/orthophoto-status`, { token, signal })
export const sliceMissionTiles = (token: string, farmId: string, missionId: string, polygonGeoJson: GeoJsonPolygon, options: { tileSize?: number; overlap?: number; dualScale?: boolean } = {}) =>
  apiRequest<SliceTilesResult>(`${processingPath(farmId, missionId)}/tiling-slice`, { method: 'POST', token, body: { tileSize: options.tileSize ?? 640, overlap: options.overlap ?? 64, dualScale: options.dualScale ?? true, polygonGeoJson } })
export const detectMissionTrees = (token: string, farmId: string, missionId: string, options: DetectMissionTreesOptions = {}) =>
  apiRequest<DetectMissionTreesResult>(`${processingPath(farmId, missionId)}/yolo-detect`, { method: 'POST', token, body: options })
export const downloadMissionTreesCsv = (token: string, farmId: string, missionId: string) =>
  apiRequestFile(`${processingPath(farmId, missionId)}/yolo-csv`, { token, fallbackFileName: `trees_${missionId}.csv` })
