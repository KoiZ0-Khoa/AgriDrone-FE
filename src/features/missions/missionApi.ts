import { apiRequest } from '../../api/client'
import type { IncidentType, MissionListItem, MissionResponse, MissionStatus, MissionType, Page, PrepareMissionSetResponse, RecoveryDecision } from './types'
import { normalizeEnumCode } from './workflow'

const id = encodeURIComponent

export function getMissions(
  token: string,
  farmId: string,
  params: { pageNumber?: number; pageSize?: number; zoneId?: string; droneId?: string; missionType?: MissionType; status?: MissionStatus; search?: string } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ pageNumber: String(params.pageNumber ?? 1), pageSize: String(params.pageSize ?? 20) })
  if (params.zoneId) query.set('zoneId', params.zoneId)
  if (params.droneId) query.set('droneId', params.droneId)
  if (params.missionType) query.set('missionType', params.missionType)
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  return apiRequest<Page<MissionListItem>>(`/api/system-manager/farms/${id(farmId)}/missions?${query}`, { token, signal })
}

export async function prepareMissionSet(
  token: string,
  surveyOrderId: string,
  body: { droneId: string; baselineDate?: string; serviceDate?: string },
  idempotencyKey: string,
) {
  const response = await apiRequest<PrepareMissionSetResponse>(
    `/api/system-manager/survey-orders/${id(surveyOrderId)}/missions/prepare`,
    { method: 'POST', token, headers: { 'Idempotency-Key': idempotencyKey }, body },
  )
  // This endpoint builds purpose/status via enum.ToString() server-side, bypassing the global
  // SnakeCaseUpper JSON converter every other BE2 endpoint goes through. Normalize here so the
  // rest of FE only ever handles one casing.
  return {
    ...response,
    missions: response.missions.map(mission => ({
      ...mission,
      purpose: normalizeEnumCode(mission.purpose),
      status: normalizeEnumCode(mission.status),
    })),
  }
}

const missionBase = (farmId: string, missionId: string) => `/api/system-manager/farms/${id(farmId)}/missions/${id(missionId)}`

export const getMissionVersion = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<{ id: string; version: number }>(`${missionBase(farmId, missionId)}/version`, { token, signal })

// Idempotency-Key is a header here (like prepare), not a body field.
export const completePreflight = (
  token: string,
  farmId: string,
  missionId: string,
  idempotencyKey: string,
  body: {
    expectedMissionVersion: number; checklistDefinitionId: string; checklistVersion: number
    answers: Record<string, boolean>; suitableForFlight: boolean; notes: string | null; deviceCompletedAt?: string
  },
) => apiRequest<{ mission: MissionResponse; reusedOperation: boolean }>(
  `${missionBase(farmId, missionId)}/preflight`,
  { method: 'POST', token, headers: { 'Idempotency-Key': idempotencyKey }, body },
)

export const startMission = (token: string, farmId: string, missionId: string, expectedMissionVersion: number) =>
  apiRequest<MissionResponse>(`${missionBase(farmId, missionId)}/start`, { method: 'POST', token, body: { expectedMissionVersion } })

export const completeFlight = (token: string, farmId: string, missionId: string, expectedMissionVersion: number) =>
  apiRequest<MissionResponse>(`${missionBase(farmId, missionId)}/complete-flight`, { method: 'POST', token, body: { expectedMissionVersion } })

export const failFlight = (
  token: string,
  farmId: string,
  missionId: string,
  body: {
    expectedMissionVersion: number; reason: string; incidentIdempotencyKey: string
    incidentType: IncidentType; incidentOutcome: string; recoveryDecision: RecoveryDecision; evidenceReference: string | null
  },
) => apiRequest<MissionResponse>(`${missionBase(farmId, missionId)}/fail-flight`, { method: 'POST', token, body })

export const cancelMission = (token: string, farmId: string, missionId: string, body: { expectedMissionVersion: number; reason: string }) =>
  apiRequest<MissionResponse>(`${missionBase(farmId, missionId)}/cancel`, { method: 'POST', token, body })

export const rescheduleMission = (
  token: string,
  farmId: string,
  missionId: string,
  body: { expectedVersion: number; scheduledDate: string; replacementDroneId?: string },
) => apiRequest<MissionResponse>(`${missionBase(farmId, missionId)}/reschedule`, { method: 'POST', token, body })
