import { apiRequest } from '../../api/client'
import type { ActiveChecklist, ChecklistItem } from './types'

const base = '/api/system/preflight-checklist'
const id = encodeURIComponent

export type ChecklistDefinitionSummary = { definitionId: string; code: string; versionNumber: number; effectiveFrom: string }

export const createChecklist = (token: string, items: ChecklistItem[]) =>
  apiRequest<ChecklistDefinitionSummary>(base, { method: 'POST', token, body: { items } })

export const changeChecklistConditions = (
  token: string,
  itemsToAdd: ChecklistItem[],
  keysToRemove: string[],
) => apiRequest<ChecklistDefinitionSummary>(`${base}/conditions`, { method: 'PATCH', token, body: { itemsToAdd, keysToRemove } })

export const getActiveChecklist = (token: string, farmId: string, missionId: string, signal?: AbortSignal) =>
  apiRequest<ActiveChecklist>(`/api/system-manager/farms/${id(farmId)}/missions/${id(missionId)}/preflight/checklist`, { token, signal })
