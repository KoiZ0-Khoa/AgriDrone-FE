import { apiRequest } from '../../api/client'
import type { Drone } from '../drones/types'
import type { Page } from '../surveys/types'
import type { ActiveMissionChecklist, AvailableDrone, CompleteMissionPreflightResult, MissionDetail, MissionListItem, MissionPurpose, PrepareMissionSetResult } from './missionTypes'

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
