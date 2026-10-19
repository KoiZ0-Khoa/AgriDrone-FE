import { apiRequest } from '../../api/client'

export type PlantHealthLabel = { id: string; code: string; name: string; scientificName: string | null; conditionType: string; labelKind: 'SUSPECTED_DISEASE' | 'CONFUSING_NON_DISEASE'; revisionNumber: number; datasetVersion: string; annotationRuleVersion: string; teamLabelLimitation: string }
export type SourcedGuidance = { id: string; code: string; versionNumber: number; plantConditionId: string; plantConditionRevisionNumber: number; suspectedClassCode: string; sourceTitle: string; sourceReference: string; guidanceText: string; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; effectiveFrom: string; effectiveTo: string | null; version: number }
export type PlantHealthMasterData = { labels: PlantHealthLabel[]; guidance: SourcedGuidance[]; evaluatedAt: string; resultNature: string; claimBoundary: string }
export type GuidanceBody = { code: string; plantConditionId: string; sourceTitle: string; sourceReference: string; guidanceText: string; effectiveFrom: string | null; effectiveTo: string | null }
const base = '/api/system-admin/plant-health/guidance'
export const getPlantHealth = (token: string, signal?: AbortSignal) => apiRequest<PlantHealthMasterData>('/api/catalog/plant-health', { token, signal })
export const getGuidanceHistory = (token: string, signal?: AbortSignal) => apiRequest<SourcedGuidance[]>(base, { token, signal })
export const createGuidance = (token: string, body: GuidanceBody) => apiRequest<SourcedGuidance>(base, { method: 'POST', token, body })
export const changeGuidanceState = (token: string, guidanceId: string, state: 'activate' | 'retire', expectedVersion: number) => apiRequest<SourcedGuidance>(`${base}/${encodeURIComponent(guidanceId)}/${state}`, { method: 'POST', token, body: { expectedVersion } })
