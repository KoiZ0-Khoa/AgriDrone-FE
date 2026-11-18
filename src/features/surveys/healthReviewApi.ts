import { ApiError, apiRequest } from '../../api/client'
import type {
  BoundaryReviewRequest, FindingBatchRequest, FindingReviewItemInput, GuidanceReviewRequest, HealthApproval, HealthApproveRequest, HealthGuidanceOption,
  HealthPublication, HealthPublishRequest, HealthPublishResult, HealthReviewOutcome,
  HealthReviewPage, HealthReviewQuery, HealthReviewQueue, HealthReviewSummary, ZoneReviewRequest,
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
const queuePath: Record<HealthReviewQueue, string> = { findings: 'health-findings', exceptions: 'health-boundary-exceptions', zones: 'disease-zones' }
export async function getHealthReviewQueue(token: string, orderId: string, queue: HealthReviewQueue, query: HealthReviewQuery = {}, signal?: AbortSignal) {
  if (queue !== 'findings' && query.zoneId) throw new Error('Chỉ lọc theo vùng bệnh được với danh sách phát hiện.')
  return apiRequest<HealthReviewPage>(`${root(orderId)}/${queuePath[queue]}?${queryString(query)}`, { token, signal })
}

// Toàn bộ findings của lô (gom các trang 100) — dùng để khớp ngoại lệ ranh giới với phát hiện của nó.
// Dừng nếu lô đổi giữa chừng để không trộn dữ liệu 2 lô.
export async function getAllHealthFindings(token: string, orderId: string, signal?: AbortSignal) {
  const first = await getHealthReviewQueue(token, orderId, 'findings', { pageNumber: 1, pageSize: MAX_REVIEW_PAGE_SIZE }, signal)
  const items = [...first.items]
  const pages = Math.ceil(first.totalCount / MAX_REVIEW_PAGE_SIZE)
  for (let pageNumber = 2; pageNumber <= Math.min(pages, 50); pageNumber++) {
    const next = await getHealthReviewQueue(token, orderId, 'findings', { pageNumber, pageSize: MAX_REVIEW_PAGE_SIZE, batchId: first.batchId }, signal)
    if (next.batchId !== first.batchId || next.resultVersion !== first.resultVersion) throw new Error('Dữ liệu review vừa thay đổi trong lúc tải. Tải lại để thử lại.')
    items.push(...next.items)
  }
  return { ...first, pageSize: items.length, items }
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

export async function reviewHealthZone(token: string, orderId: string, zoneId: string, request: ZoneReviewRequest) {
  const corrected = Boolean(request.correctedGeometry || request.correctedClassCode?.trim() || request.members)
  if ((request.decision === 'Correct') !== corrected) throw new Error('Chỉ quyết định Sửa mới kèm thông tin sửa, và phải sửa ít nhất một trường.')
  if (request.members && (request.members.length === 0 || new Set(request.members.map(member => member.findingId.toLowerCase())).size !== request.members.length))
    throw new Error('Danh sách thành viên vùng phải có ít nhất 1 phát hiện và không trùng.')
  const body = {
    operationId: request.operationId, batchId: request.batchId, expectedResultVersion: request.expectedResultVersion,
    expectedZoneVersion: request.expectedZoneVersion, expectedReviewVersion: request.expectedReviewVersion,
    decision: request.decision, reason: validateReason(request.reason), evidenceMediaIds: request.evidenceMediaIds,
    ...(request.decision === 'Correct' && request.correctedGeometry ? { correctedGeometry: request.correctedGeometry } : {}),
    ...(request.decision === 'Correct' && request.correctedClassCode?.trim() ? { correctedClassCode: request.correctedClassCode.trim() } : {}),
    ...(request.decision === 'Correct' && request.members ? { members: request.members } : {}),
  }
  return checkOutcome(await apiRequest<HealthReviewOutcome>(`${root(orderId)}/disease-zones/${encodeURIComponent(zoneId)}/review`, { method: 'POST', token, body }), request.operationId)
}

// BE chỉ trả lựa chọn khi vùng đã được Xác nhận/Sửa (409 DependencyChanged nếu chưa).
export const getZoneGuidanceOptions = (token: string, orderId: string, zoneId: string, signal?: AbortSignal) =>
  apiRequest<HealthGuidanceOption[]>(`${root(orderId)}/disease-zones/${encodeURIComponent(zoneId)}/guidance-options`, { token, signal })

export async function reviewZoneGuidance(token: string, orderId: string, zoneId: string, request: GuidanceReviewRequest) {
  if ((request.decision === 'Select') !== Boolean(request.guidanceId)) throw new Error('Chọn một hướng dẫn khi quyết định "Áp dụng hướng dẫn"; quyết định khác không kèm hướng dẫn.')
  const body = {
    operationId: request.operationId, batchId: request.batchId, expectedResultVersion: request.expectedResultVersion,
    expectedZoneVersion: request.expectedZoneVersion, expectedReviewVersion: request.expectedReviewVersion, zoneReviewId: request.zoneReviewId,
    decision: request.decision, reason: validateReason(request.reason), evidenceMediaIds: request.evidenceMediaIds,
    ...(request.decision === 'Select' ? { guidanceId: request.guidanceId } : {}),
  }
  return checkOutcome(await apiRequest<HealthReviewOutcome>(`${root(orderId)}/disease-zones/${encodeURIComponent(zoneId)}/guidance-review`, { method: 'POST', token, body }), request.operationId)
}

// Giai đoạn 3. GET approval trả 404 khi chưa phê duyệt → null (không coi là lỗi).
export async function getHealthApproval(token: string, orderId: string, signal?: AbortSignal) {
  try { return await apiRequest<HealthApproval>(`${root(orderId)}/health-results/approval`, { token, signal }) }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
}
export async function approveHealthResult(token: string, orderId: string, request: HealthApproveRequest) {
  if (!Number.isSafeInteger(request.expectedReviewRevision) || request.expectedReviewRevision < 0) throw new Error('Lượt review không hợp lệ. Tải lại trước khi phê duyệt.')
  const body = { operationId: request.operationId, batchId: request.batchId, expectedResultVersion: request.expectedResultVersion, expectedReviewRevision: request.expectedReviewRevision, reason: validateReason(request.reason) }
  const result = await apiRequest<HealthApproval>(`${root(orderId)}/health-results/approve`, { method: 'POST', token, body })
  if (!sameId(result.operationId, request.operationId) || !sameId(result.batchId, request.batchId)) throw new Error('Phản hồi phê duyệt không khớp yêu cầu đã gửi.')
  return result
}
export async function publishHealthResult(token: string, orderId: string, request: HealthPublishRequest) {
  // BE yêu cầu đúng fingerprint 64 ký tự của bản phê duyệt — chặn sớm thay vì gửi rồi nhận 400.
  if (request.approvalFingerprint.length !== 64) throw new Error('Thiếu mã xác thực bản phê duyệt. Tải lại trước khi phát hành.')
  const body = { operationId: request.operationId, batchId: request.batchId, expectedResultVersion: request.expectedResultVersion, expectedReviewRevision: request.expectedReviewRevision, approvalFingerprint: request.approvalFingerprint }
  const result = await apiRequest<HealthPublishResult>(`${root(orderId)}/health-results/publish`, { method: 'POST', token, body })
  if (!sameId(result.operationId, request.operationId) || !sameId(result.batchId, request.batchId)) throw new Error('Phản hồi phát hành không khớp yêu cầu đã gửi.')
  return result
}
// BE chỉ trả khi đơn đã COMPLETED (đơn thanh toán sau bay ở AWAITING_PRICING nhận 404).
export const getHealthPublication = (token: string, orderId: string, signal?: AbortSignal) =>
  apiRequest<HealthPublication>(`${root(orderId)}/health-results/publication`, { token, signal })

function checkOutcome(outcome: HealthReviewOutcome, operationId: string) {
  if (!sameId(outcome.operationId, operationId)) throw new Error('Phản hồi review không khớp mã thao tác đã gửi.')
  return outcome
}
