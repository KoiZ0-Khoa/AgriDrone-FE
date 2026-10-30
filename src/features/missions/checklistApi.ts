import { apiRequest } from '../../api/client'
import type { PreflightChecklistDefinition, PreflightChecklistItem } from './checklistTypes'

const base = '/api/system/preflight-checklist'

export const getChecklistDefinitions = (token: string, signal?: AbortSignal) => apiRequest<PreflightChecklistDefinition[]>(base, { token, signal })
export const createChecklist = (token: string, items: PreflightChecklistItem[]) => apiRequest(base, { method: 'POST', token, body: { items } })
export const changeChecklistConditions = (token: string, body: { itemsToAdd: PreflightChecklistItem[]; keysToRemove: string[] }) =>
  apiRequest(`${base}/conditions`, { method: 'PATCH', token, body })
