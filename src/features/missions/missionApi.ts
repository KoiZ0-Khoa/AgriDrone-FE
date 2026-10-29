import { apiRequest } from '../../api/client'
import type { IncidentType, MissionResponse, PrepareMissionSetResponse, RecoveryDecision } from './types'

const id = encodeURIComponent

export const prepareMissionSet = (
  token: string,
  surveyOrderId: string,
  body: { droneId: string; baselineDate?: string; serviceDate?: string },
  idempotencyKey: string,
) => apiRequest<PrepareMissionSetResponse>(
  `/api/system-manager/survey-orders/${id(surveyOrderId)}/missions/prepare`,
  { method: 'POST', token, headers: { 'Idempotency-Key': idempotencyKey }, body },
)

const missionBase = (farmId: string, missionId: string) => `/api/system-manager/farms/${id(farmId)}/missions/${id(missionId)}`

export const getMissionVersion = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<{ id: string; version: number }>(`${missionBase(farmId, missionId)}/version`, { token, signal })

export const completePreflight = (
  token: string,
  farmId: string,
  missionId: string,
  body: {
    idempotencyKey: string; expectedMissionVersion: number; checklistDefinitionId: string; checklistVersion: number
    answers: Record<string, boolean>; suitableForFlight: boolean; notes: string | null; deviceCompletedAt?: string
  },
) => apiRequest<{ mission: MissionResponse; reusedOperation: boolean }>(`${missionBase(farmId, missionId)}/preflight`, { method: 'POST', token, body })

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
