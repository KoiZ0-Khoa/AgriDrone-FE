import type { MapPlant } from '../baseMaps/types'
import type {
  ComboBlockerResolution, ComboBlockerResolutionValue, ComboFindingDecisionValue, ComboPendingBatch, ComboPendingFinding, ComboReviewOutcome,
  FreezeResultBody, FreezeResultReviewDecision, RecordComboReviewBody, ResultReview,
} from './v3Types'

// G7 — duyệt kết quả V3. Không có import lúc chạy để test nạp trực tiếp. Quy tắc lấy từ BE
// (SurveyResultReviewTransaction.ValidateComboReviewDecisionsAsync, FreezeSurveyInternalResultCommandValidator).

export const findingDecisionLabels: Record<ComboFindingDecisionValue, string> = { Accept: 'Chấp nhận', Exclude: 'Loại' }
export const zoneDecisionLabels: Record<'Approve' | 'Reject', string> = { Approve: 'Duyệt vùng', Reject: 'Từ chối vùng' }
export const blockerResolutionLabels: Record<ComboBlockerResolutionValue, string> = {
  Resolved: 'Đã xử lý',
  AcceptedWithJustification: 'Chấp nhận có giải trình',
  Excluded: 'Loại khỏi kết quả',
  Corrected: 'Đã sửa',
  Unresolved: 'Chưa xử lý',
}
export const outcomeLabels: Record<ComboReviewOutcome, string> = { Approved: 'Duyệt kết quả', Rejected: 'Từ chối kết quả' }
export const comboFindingLabel = (code: string) => ({
  DISEASE_SOFT_ROT: 'Thối mềm', DISEASE_SUN_BURN: 'Cháy nắng', SUNBURN: 'Cháy nắng',
  DISEASE_BROWN_SPOT: 'Đốm nâu', ANTHRACNOSE: 'Thán thư',
  HEALTHY_FRUIT_GREEN: 'Trái xanh khỏe', HEALTHY_FRUIT_RED: 'Trái đỏ khỏe', UNHEALTHY_FRUIT: 'Trái có dấu hiệu bất thường',
}[code.toUpperCase()] ?? code)
export const comboBlockerLabel = (code: string) => ({
  NEEDS_REVIEW: 'Gần ranh giới, cần kiểm tra', OUT_OF_BOUNDARY: 'Ngoài ranh giới', OUTSIDE_BOUNDARY: 'Ngoài ranh giới',
  REQUIRES_REVIEW: 'Phát hiện cần xem lại', CANDIDATEONLYUNRESOLVED: 'Chưa xác định được trụ', UNRESOLVEDIDENTITY: 'Chưa liên kết với trụ',
}[code.toUpperCase()] ?? code)
export const freezeDecisionLabels: Record<FreezeResultReviewDecision, string> = { Approved: 'Duyệt', ApprovedWithObservations: 'Duyệt, có ghi nhận nghi bệnh' }
const resolvedStatuses: readonly ComboBlockerResolutionValue[] = ['Resolved', 'AcceptedWithJustification', 'Excluded', 'Corrected']

export const isFrozen = (review: ResultReview) => !!review.currentApprovedResultRevisionId
export const isCombo = (review: ResultReview) => review.screensDisease || review.serviceCode.toUpperCase() === 'COMBO'

// "SourceType:SourceId:ReasonCode" → khóa BE dùng để đối chiếu. SourceId có thể chứa dấu ":" nên lấy phần đầu và phần cuối.
export type BlockerItem = { key: string; sourceType: string; sourceId: string; reasonCode: string }
export function parseBlockingReason(value: string): BlockerItem | null {
  const parts = value.split(':')
  if (parts.length < 3) return null
  const sourceType = parts[0], reasonCode = parts.at(-1)!, sourceId = parts.slice(1, -1).join(':')
  if (!sourceType || !sourceId || !reasonCode) return null
  return { key: value, sourceType, sourceId, reasonCode }
}
export const blockerItems = (batch: ComboPendingBatch) => batch.blockingReasons.map(parseBlockingReason).filter((item): item is BlockerItem => item !== null)

export function comboReviewPlantLinks(batch: ComboPendingBatch, plants: MapPlant[]) {
  const boundaryIds = new Set(batch.boundaryExceptions.map(item => item.sourceReferenceId.toLowerCase()))
  const flaggedIds = new Set(blockerItems(batch)
    .filter(item => ['BOUNDARY_EXCEPTION', 'FINDING_SPATIAL'].includes(item.sourceType.toUpperCase()))
    .map(item => item.sourceId.toLowerCase()))
  // Map detail uses candidate IDs for candidate and historical rows, and plant entity IDs for live rows.
  const candidates = new Map(plants.filter(plant => ['CANDIDATE', 'HISTORICAL'].includes(plant.lifecycleStatus.toUpperCase()))
    .map(plant => [plant.plantId.toLowerCase(), plant]))
  const plantByFinding = new Map<string, MapPlant>()
  const findingsByPlant = new Map<string, ComboPendingFinding[]>()
  const gpsFindings: ComboPendingFinding[] = []
  for (const finding of batch.findings) {
    const id = finding.findingId.toLowerCase()
    if (boundaryIds.has(id)) continue // The same detection already has its own boundary marker.
    const plant = !flaggedIds.has(id) && finding.mappingCandidateId ? candidates.get(finding.mappingCandidateId.toLowerCase()) : undefined
    if (!plant || !Number.isFinite(plant.lat) || !Number.isFinite(plant.lon) || Math.abs(plant.lat) > 90 || Math.abs(plant.lon) > 180) {
      gpsFindings.push(finding)
      continue
    }
    plantByFinding.set(finding.findingId, plant)
    const linked = findingsByPlant.get(plant.plantId) ?? []
    linked.push(finding)
    findingsByPlant.set(plant.plantId, linked)
  }
  return { plantByFinding, findingsByPlant, gpsFindings }
}

// Bằng chứng gửi kèm: ảnh của chính mục đang quyết định; mục chặn tìm theo SourceId (phát hiện / ngoại lệ ranh giới / vùng),
// không tìm được thì dùng toàn bộ ảnh của lô. BE chỉ nhận ảnh thuộc lô này.
export const allBatchEvidence = (batch: ComboPendingBatch) => [...new Set([
  ...batch.findings.flatMap(item => item.evidenceMediaIds), ...batch.boundaryExceptions.flatMap(item => item.evidenceMediaIds), ...batch.diseaseZones.flatMap(item => item.evidenceMediaIds),
])]
export function blockerEvidence(batch: ComboPendingBatch, blocker: BlockerItem) {
  const linked = batch.findings.find(item => item.findingId === blocker.sourceId)?.evidenceMediaIds
    ?? batch.boundaryExceptions.find(item => item.sourceReferenceId === blocker.sourceId)?.evidenceMediaIds
    ?? batch.diseaseZones.find(item => item.sourceProposalId === blocker.sourceId)?.evidenceMediaIds
  return linked?.length ? linked : allBatchEvidence(batch)
}

export type FindingDraft = { decision: ComboFindingDecisionValue; reason: string }
export type ZoneDraft = { decision: 'Approve' | 'Reject'; guidanceId: string | null; reason: string }
export type BlockerDraft = { resolution: ComboBlockerResolutionValue; reason: string }
export type ComboReviewDraft = {
  findings: Record<string, FindingDraft>; zones: Record<string, ZoneDraft>; blockers: Record<string, BlockerDraft>
  outcome: ComboReviewOutcome; reviewReason: string; confirmNoDiseaseObserved: boolean; negativeEvidence: string
}

// Bản nháp mặc định: lấy lại quyết định của lần duyệt trước nếu có; ngược lại chấp nhận mọi phát hiện, duyệt mọi vùng
// (chọn sẵn hướng dẫn nếu chỉ có một), mục chặn để "Chưa xử lý".
export function initialComboReviewDraft(review: ResultReview): ComboReviewDraft {
  const batch = review.comboPendingBatch!
  const previous = review.currentComboReview
  const findings: Record<string, FindingDraft> = {}, zones: Record<string, ZoneDraft> = {}, blockers: Record<string, BlockerDraft> = {}
  for (const finding of batch.findings) {
    const old = previous?.findingDecisions.find(item => item.findingId === finding.findingId)
    findings[finding.findingId] = { decision: old?.decision === 'Exclude' ? 'Exclude' : 'Accept', reason: old?.reason ?? '' }
  }
  for (const zone of batch.diseaseZones) {
    const old = previous?.zoneDecisions.find(item => item.sourceProposalId === zone.sourceProposalId)
    zones[zone.sourceProposalId] = {
      decision: old?.decision === 'Reject' ? 'Reject' : 'Approve',
      guidanceId: old?.selectedGuidanceId ?? (zone.guidanceCandidates.length === 1 ? zone.guidanceCandidates[0].guidanceId : null),
      reason: old?.reason ?? '',
    }
  }
  for (const blocker of blockerItems(batch)) {
    const old = previous?.blockerResolutions.find(item => item.sourceType === blocker.sourceType && item.sourceId === blocker.sourceId && item.reasonCode === blocker.reasonCode)
    blockers[blocker.key] = { resolution: old?.resolution ?? 'Unresolved', reason: old?.reason ?? '' }
  }
  return {
    findings, zones, blockers, outcome: 'Approved', reviewReason: '',
    confirmNoDiseaseObserved: previous?.confirmNoDiseaseObserved ?? false, negativeEvidence: previous?.negativeResultConfirmationEvidence ?? '',
  }
}

const tooLong = (value: string) => value.trim().length > 500
// Các lỗi người dùng cần sửa trước khi gửi, theo đúng thứ tự BE kiểm tra.
export function comboReviewProblems(review: ResultReview, draft: ComboReviewDraft): string[] {
  const batch = review.comboPendingBatch
  if (!batch) return ['Chưa có kết quả phân tích COMBO để duyệt.']
  const problems: string[] = []
  for (const finding of batch.findings) {
    const item = draft.findings[finding.findingId]
    if (!item) problems.push(`Chưa quyết định phát hiện ${finding.suspectedClassCode}.`)
    else if (item.decision === 'Exclude' && !item.reason.trim()) problems.push(`Nhập lý do loại phát hiện ${finding.suspectedClassCode}.`)
    else if (tooLong(item.reason)) problems.push('Lý do của mỗi phát hiện tối đa 500 ký tự.')
  }
  for (const zone of batch.diseaseZones) {
    const item = draft.zones[zone.sourceProposalId]
    if (!item) { problems.push(`Chưa quyết định vùng ${zone.suspectedClassCode}.`); continue }
    if (item.decision === 'Reject' && !item.reason.trim()) problems.push(`Nhập lý do từ chối vùng ${zone.suspectedClassCode}.`)
    if (item.decision === 'Approve' && zone.guidanceCandidates.length > 0 && !zone.guidanceCandidates.some(candidate => candidate.guidanceId === item.guidanceId)) problems.push(`Chọn hướng dẫn xử lý cho vùng ${zone.suspectedClassCode}.`)
    if (item.decision === 'Approve' && zone.memberships.some(member => draft.findings[member.findingId]?.decision !== 'Accept')) problems.push(`Vùng ${zone.suspectedClassCode} có phát hiện đã bị loại; từ chối vùng hoặc chấp nhận lại các phát hiện trong vùng.`)
    if (tooLong(item.reason)) problems.push('Lý do của mỗi vùng tối đa 500 ký tự.')
  }
  const blockers = blockerItems(batch)
  for (const blocker of blockers) {
    const item = draft.blockers[blocker.key]
    if (!item) { problems.push(`Chưa xử lý mục chặn ${blocker.reasonCode}.`); continue }
    if (resolvedStatuses.includes(item.resolution) && !item.reason.trim()) problems.push(`Nhập giải trình cho mục chặn ${blocker.reasonCode}.`)
    if (item.resolution === 'Excluded' && draft.findings[blocker.sourceId] && draft.findings[blocker.sourceId].decision !== 'Exclude') problems.push(`Mục chặn ${blocker.reasonCode} được loại nên phát hiện liên quan cũng phải bị loại.`)
    if (tooLong(item.reason)) problems.push('Giải trình mỗi mục chặn tối đa 500 ký tự.')
  }
  if (draft.outcome === 'Approved') {
    if (blockers.some(blocker => (draft.blockers[blocker.key]?.resolution ?? 'Unresolved') === 'Unresolved')) problems.push('Còn mục chặn chưa xử lý nên chưa duyệt được kết quả.')
    const accepted = batch.findings.filter(finding => draft.findings[finding.findingId]?.decision === 'Accept').length
    if (accepted === 0 && !draft.confirmNoDiseaseObserved) problems.push('Không còn phát hiện nào được chấp nhận: xác nhận "Không ghi nhận nghi bệnh" trước khi duyệt.')
    if (accepted === 0 && batch.findings.length > 0 && !draft.negativeEvidence.trim()) problems.push('Nhập bằng chứng cho kết luận không ghi nhận nghi bệnh.')
  }
  if (tooLong(draft.negativeEvidence)) problems.push('Bằng chứng kết luận âm tính tối đa 500 ký tự.')
  if (!draft.reviewReason.trim() || tooLong(draft.reviewReason)) problems.push('Nhập lý do duyệt từ 1 đến 500 ký tự.')
  return problems
}

export function comboReviewBody(review: ResultReview, draft: ComboReviewDraft): Omit<RecordComboReviewBody, 'operationId'> {
  const problems = comboReviewProblems(review, draft)
  if (problems.length) throw new Error(problems[0])
  const batch = review.comboPendingBatch!
  const text = (value: string) => value.trim() || null
  const blockerResolutions: ComboBlockerResolution[] = blockerItems(batch).map(blocker => {
    const item = draft.blockers[blocker.key]
    const resolved = resolvedStatuses.includes(item.resolution)
    return { sourceType: blocker.sourceType, sourceId: blocker.sourceId, reasonCode: blocker.reasonCode, resolution: item.resolution, reason: text(item.reason), evidenceMediaIds: resolved ? blockerEvidence(batch, blocker) : [] }
  })
  const noFindingsAccepted = batch.findings.every(finding => draft.findings[finding.findingId].decision !== 'Accept')
  return {
    expectedOrderVersion: review.orderVersion,
    expectedBatchId: batch.batchId,
    expectedSourceRevision: batch.sourceRevision,
    expectedBatchFingerprint: batch.canonicalFingerprint,
    expectedPreviousReviewId: review.currentComboReview?.reviewRevisionId ?? null,
    outcome: draft.outcome,
    reviewReason: draft.reviewReason.trim(),
    findingDecisions: batch.findings.map(finding => {
      const item = draft.findings[finding.findingId]
      return { findingId: finding.findingId, decision: item.decision, reason: text(item.reason), evidenceMediaIds: item.decision === 'Exclude' ? (finding.evidenceMediaIds.length ? finding.evidenceMediaIds : allBatchEvidence(batch)) : [] }
    }),
    zoneDecisions: batch.diseaseZones.map(zone => {
      const item = draft.zones[zone.sourceProposalId]
      const guidance = item.decision === 'Approve' ? zone.guidanceCandidates.find(candidate => candidate.guidanceId === item.guidanceId) ?? null : null
      return {
        sourceProposalId: zone.sourceProposalId, decision: item.decision, reviewedGeometry: null, reviewedFindingIds: null,
        selectedGuidanceId: guidance?.guidanceId ?? null, selectedGuidanceVersionNumber: guidance?.versionNumber ?? null,
        reason: text(item.reason), evidenceMediaIds: item.decision === 'Reject' ? (zone.evidenceMediaIds.length ? zone.evidenceMediaIds : allBatchEvidence(batch)) : [],
      }
    }),
    blockerResolutions,
    confirmNoDiseaseObserved: draft.outcome === 'Approved' && noFindingsAccepted ? draft.confirmNoDiseaseObserved : false,
    negativeResultConfirmationEvidence: draft.outcome === 'Approved' && noFindingsAccepted ? text(draft.negativeEvidence) : null,
  }
}

// Chốt kết quả nội bộ: đơn và lần bay đang xử lý, chưa chốt; COMBO cần lần duyệt mới nhất là "Approved", không còn mục chặn.
export function freezeBlocker(review: ResultReview): string | null {
  if (isFrozen(review)) return 'Kết quả đã được chốt nội bộ.'
  if (review.orderStatus.toUpperCase() !== 'PROCESSING') return 'Đơn không còn ở bước xử lý và duyệt kết quả.'
  if (review.captureAttemptStatus.toUpperCase() !== 'PROCESSING') return 'Lần bay chưa ở bước xử lý.'
  if (!isCombo(review)) return null
  if (!review.comboPendingBatch) return 'Chưa có kết quả phân tích COMBO.'
  const current = review.currentComboReview
  if (!current) return 'Cần duyệt phát hiện, vùng bệnh và mục chặn trước khi chốt.'
  if (current.outcome !== 'Approved') return 'Lần duyệt gần nhất đang từ chối kết quả; duyệt lại trước khi chốt.'
  if (current.unresolvedBlockersCount > 0) return 'Còn mục chặn chưa xử lý.'
  if (!review.expectedFreezeTokens.expectedComboReviewRevisionId || !review.expectedFreezeTokens.expectedComboReviewFingerprint) return 'Chưa có lần duyệt COMBO hợp lệ để chốt. Tải lại để kiểm tra.'
  return null
}
export const defaultFreezeDecision = (review: ResultReview): FreezeResultReviewDecision =>
  isCombo(review) && (review.currentComboReview?.acceptedFindingsCount ?? 0) > 0 ? 'ApprovedWithObservations' : 'Approved'

export function freezeResultBody(review: ResultReview, values: { reviewDecision: FreezeResultReviewDecision; freezeReason: string }): Omit<FreezeResultBody, 'operationId'> {
  const blocker = freezeBlocker(review)
  if (blocker) throw new Error(blocker)
  const freezeReason = values.freezeReason.trim()
  if (!freezeReason || freezeReason.length > 500) throw new Error('Nhập lý do chốt từ 1 đến 500 ký tự.')
  if (!['Approved', 'ApprovedWithObservations'].includes(values.reviewDecision)) throw new Error('Chọn kết luận duyệt hợp lệ.')
  const tokens = review.expectedFreezeTokens
  const combo = isCombo(review)
  return {
    expectedOrderVersion: tokens.expectedOrderVersion,
    expectedAttemptId: tokens.expectedAttemptId,
    expectedCountSnapshotId: tokens.expectedCountSnapshotId,
    expectedCountFingerprint: tokens.expectedCountFingerprint,
    reviewDecision: values.reviewDecision,
    freezeReason,
    // MAP không được gửi token COMBO (FreezeResult.ComboTokensInvalidForMap).
    expectedComboBatchId: combo ? tokens.expectedComboBatchId : null,
    expectedComboSourceRevision: combo ? tokens.expectedComboSourceRevision : null,
    expectedComboBatchFingerprint: combo ? tokens.expectedComboBatchFingerprint : null,
    expectedComboReviewRevisionId: combo ? tokens.expectedComboReviewRevisionId : null,
    expectedComboReviewFingerprint: combo ? tokens.expectedComboReviewFingerprint : null,
  }
}

// 409 của bước duyệt/chốt nghĩa là dữ liệu đã đổi: tải lại GET result-review và cho người dùng xem lại trước khi gửi tiếp.
export const isStaleReviewError = (error: unknown) => !!error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 409
