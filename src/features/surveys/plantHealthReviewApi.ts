import { apiRequest } from '../../api/client'
import type {
  FlaggedObservationsResult, ResolveFlagBody, ResolveFlagResult, ReviewObservationBody, ReviewObservationResult,
} from './plantHealthReviewTypes'

const root = (farmId: string) => `/api/system-manager/farms/${encodeURIComponent(farmId)}/plant-health`
const sameId = (a: string | null | undefined, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

// UC-28 (2.5)
export async function reviewPlantObservation(token: string, farmId: string, observationId: string, body: ReviewObservationBody) {
  const payload: ReviewObservationBody = { decision: body.decision, reason: body.reason.trim() }
  if (body.decision === 'CONFIRMED' && body.correctedConditionCode?.trim()) payload.correctedConditionCode = body.correctedConditionCode.trim()
  const data = await apiRequest<ReviewObservationResult>(`${root(farmId)}/observations/${encodeURIComponent(observationId)}/review`, { method: 'PUT', token, body: payload })
  if (!sameId(data.observationId, observationId)) throw new Error('Phản hồi duyệt không khớp vết nhận diện đã chọn.')
  return data
}

// UC-29 (2.6)
export async function getFlaggedObservations(token: string, farmId: string, signal?: AbortSignal) {
  const data = await apiRequest<FlaggedObservationsResult>(`${root(farmId)}/flagged-observations`, { token, signal })
  if (!sameId(data.farmId, farmId)) throw new Error('Danh sách vết lệch không khớp nông trại.')
  return data
}

// UC-29 (2.7). Chỉ gửi đúng các trường của action đã chọn.
export async function resolveFlaggedObservation(token: string, farmId: string, observationId: string, body: ResolveFlagBody) {
  const reason = body.reason.trim()
  const payload = body.action === 'SNAP' ? { action: body.action, targetPlantId: body.targetPlantId, reason }
    : body.action === 'CREATE_NEW_PLANT' ? {
      action: body.action, reason,
      ...(body.newPlantCode?.trim() ? { newPlantCode: body.newPlantCode.trim() } : {}),
      ...(body.zoneId ? { zoneId: body.zoneId } : {}),
    }
    : { action: body.action, reason }
  const data = await apiRequest<ResolveFlagResult>(`${root(farmId)}/observations/${encodeURIComponent(observationId)}/resolve-flag`, { method: 'POST', token, body: payload })
  if (!sameId(data.observationId, observationId)) throw new Error('Phản hồi xử lý không khớp vết lệch đã chọn.')
  return data
}
