import { apiRequest } from '../../api/client'
import type {
  BoundaryReviewRequest, FindingBatchRequest, FindingReviewItemInput, HealthReviewOutcome, HealthReviewPage, HealthReviewQuery,
  HealthReviewQueue, HealthReviewSummary,
} from './healthReviewTypes'

const root = (orderId: string) => `/api/system-manager/survey-orders/${encodeURIComponent(orderId)}`
const sameId = (a: string | null | undefined, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

export const MAX_REVIEW_PAGE_SIZE = 100
export const MAX_REVIEW_BATCH_ITEMS = 100
export const MAX_REVIEW_REASON_LENGTH = 2000

export const getHealthReviewSummary = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<HealthReviewSummary>(`${root(orderId)}/health-results/review-summary`, { token, signal })

function queryString(query: HealthReviewQuery) {
  const params = new URLSearchParams({ pageNumber: String(query.pageNumber ?? 1), pageSize: String(Math.min(query.pageSize ?? 50, MAX_REVIEW_PAGE_SIZE)) })
  if (query.batchId) params.set('batchId', query.batchId)
  if (query.decision) params.set('decision', query.decision)
  if (query.classCode) params.set('classCode', query.classCode)
  if (query.zoneId) params.set('zoneId', query.zoneId)
  if (query.resolutionState) params.set('resolutionState', query.resolutionState)
  return params
}
const queuePath: Record<HealthReviewQueue, string> = { findings: 'health-findings', exceptions: 'health-boundary-exceptions' }
export async function getHealthReviewQueue(token: string, orderId: string, queue: HealthReviewQueue, query: HealthReviewQuery = {}, signal?: AbortSignal) {
  if (queue !== 'findings' && query.zoneId) throw new Error('Chỉ lọc theo vùng bệnh được với danh sách phát hiện.')
  return apiRequest<HealthReviewPage>(`${root(orderId)}/${queuePath[queue]}?${queryString(query)}`, { token, signal })
}

function validateReason(reason: string) {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('Nhập lý do cho quyết định review.')
  if (trimmed.length > MAX_REVIEW_REASON_LENGTH) throw new Error(`Lý do tối đa ${MAX_REVIEW_REASON_LENGTH} ký tự.`)
  return trimmed
}
// Chỉ gửi đúng các trường BE nhận; trường sửa (corrected*) chỉ đi kèm Correct, và Correct phải có ít nhất 1 trường sửa.
function findingItemBody(item: FindingReviewItemInput) {
  const corrected = item.correctedClassCode?.trim() || item.correctedPlantId || item.correctedPosition
  if ((item.decision === 'Correct') !== Boolean(corrected)) throw new Error('Chỉ quyết định Sửa mới kèm thông tin sửa, và phải sửa ít nhất một trường.')
  return {
    findingId: item.findingId, expectedSourceVersion: item.expectedSourceVersion, expectedReviewVersion: item.expectedReviewVersion,
    decision: item.decision, reason: validateReason(item.reason), evidenceMediaIds: item.evidenceMediaIds,
    ...(item.decision === 'Correct' && item.correctedClassCode?.trim() ? { correctedClassCode: item.correctedClassCode.trim() } : {}),
    ...(item.decision === 'Correct' && item.correctedPlantId ? { correctedPlantId: item.correctedPlantId } : {}),
    ...(item.decision === 'Correct' && item.correctedPosition ? { correctedPosition: item.correctedPosition } : {}),
  }
}

export async function reviewHealthFindings(token: string, orderId: string, request: FindingBatchRequest) {
  if (request.items.length === 0 || request.items.length > MAX_REVIEW_BATCH_ITEMS) throw new Error(`Chọn từ 1 đến ${MAX_REVIEW_BATCH_ITEMS} phát hiện cho mỗi lần review.`)
  if (new Set(request.items.map(item => item.findingId.toLowerCase())).size !== request.items.length) throw new Error('Danh sách review có phát hiện bị trùng.')
  const body = { operationId: request.operationId, batchId: request.batchId, expectedResultVersion: request.expectedResultVersion, items: request.items.map(findingItemBody) }
  return checkOutcome(await apiRequest<HealthReviewOutcome>(`${root(orderId)}/health-findings/review-batch`, { method: 'POST', token, body }), request.operationId)
}

export async function reviewHealthBoundaryException(token: string, orderId: string, exceptionId: string, request: BoundaryReviewRequest) {
  const needsFinding = request.decision !== 'NeedsEvidence'
  if (needsFinding && (!request.findingId || !request.findingReviewId)) throw new Error('Chọn phát hiện đã review để gắn với ngoại lệ này.')
  if (!needsFinding && (request.findingId || request.findingReviewId)) throw new Error('Cần thêm bằng chứng thì không được gắn phát hiện.')
  const body = {
    operationId: request.operationId, batchId: request.batchId, expectedResultVersion: request.expectedResultVersion,
    expectedExceptionVersion: request.expectedExceptionVersion, expectedReviewVersion: request.expectedReviewVersion,
    decision: request.decision, reason: validateReason(request.reason), evidenceMediaIds: request.evidenceMediaIds,
    ...(needsFinding ? { findingId: request.findingId, findingReviewId: request.findingReviewId } : {}),
  }
  return checkOutcome(await apiRequest<HealthReviewOutcome>(`${root(orderId)}/health-boundary-exceptions/${encodeURIComponent(exceptionId)}/review`, { method: 'POST', token, body }), request.operationId)
}

function checkOutcome(outcome: HealthReviewOutcome, operationId: string) {
  if (!sameId(outcome.operationId, operationId)) throw new Error('Phản hồi review không khớp mã thao tác đã gửi.')
  return outcome
}
