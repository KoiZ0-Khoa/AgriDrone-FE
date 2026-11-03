import { apiRequest } from '../../api/client'
import type { BaseMapDraft, BatchReviewBody, BatchReviewResult, CandidateReviewBody, CandidateReviewResult, MappingValidation, PublishedBaseMap } from './baseMapTypes'

const path = (farmId: string, draftId: string) => `/api/system-manager/farms/${encodeURIComponent(farmId)}/base-map-drafts/${encodeURIComponent(draftId)}`
export async function getCurrentBaseMapDraft(token: string, farmId: string, surveyOrderId?: string, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (surveyOrderId) params.set('surveyOrderId', surveyOrderId)
  const draft = await apiRequest<BaseMapDraft>(`/api/system-manager/farms/${encodeURIComponent(farmId)}/base-map-drafts${params.size ? `?${params}` : ''}`, { token, signal })
  if (draft.farmId.toLowerCase() !== farmId.toLowerCase() || (surveyOrderId && draft.sourceSurveyOrderId.toLowerCase() !== surveyOrderId.toLowerCase())) throw new Error('Bản đồ nháp không khớp nông trại hoặc đơn khảo sát đã chọn.')
  return draft
}
export async function getBaseMapDraft(token: string, farmId: string, draftId: string, signal?: AbortSignal) {
  const draft = await apiRequest<BaseMapDraft>(path(farmId, draftId), { token, signal })
  if (draft.farmId.toLowerCase() !== farmId.toLowerCase() || draft.draftId.toLowerCase() !== draftId.toLowerCase()) throw new Error('Bản đồ nháp không khớp nông trại hoặc mã đã chọn.')
  return draft
}
export const reviewMappingCandidate = (token: string, farmId: string, draftId: string, candidateId: string, body: CandidateReviewBody) => apiRequest<CandidateReviewResult>(`${path(farmId, draftId)}/candidates/${encodeURIComponent(candidateId)}/review`, { method: 'POST', token, body })
export const reviewMappingBatch = (token: string, farmId: string, draftId: string, body: BatchReviewBody) => apiRequest<BatchReviewResult>(`${path(farmId, draftId)}/candidates/review-batch`, { method: 'POST', token, body })
export const validateBaseMapDraft = (token: string, farmId: string, draftId: string) => apiRequest<MappingValidation>(`${path(farmId, draftId)}/validate`, { method: 'POST', token })
export const publishBaseMapDraft = (token: string, farmId: string, draftId: string) => apiRequest<PublishedBaseMap>(`${path(farmId, draftId)}/publish`, { method: 'POST', token })
