import type { BaseMapDraft, BatchReviewBody, CandidateReviewBody, MappingCandidate, MappingValidation, ReviewDecision } from './baseMapTypes'

export const validGuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
export const stateToken = (value: string | null) => (value ?? '').replaceAll('_', '').toUpperCase()
export const decisionLabels: Record<ReviewDecision | 'Pending', string> = {
  Pending: 'Chưa duyệt', MatchExisting: 'Ghép cây hiện có', Relocate: 'Sửa vị trí cây', CreateNew: 'Tạo cây mới', Replace: 'Thay thế cây cũ', Reject: 'Loại bỏ điểm',
}
export function decisionLabel(value: string) { return Object.entries(decisionLabels).find(([key]) => stateToken(key) === stateToken(value))?.[1] ?? value }
export const editableDraft = (draft: BaseMapDraft) => stateToken(draft.status) === 'DRAFT' && ['PENDINGREVIEW', 'REVIEWINPROGRESS'].includes(stateToken(draft.batchStatus)) && !!draft.batchId
export const draftFingerprint = (draft: BaseMapDraft) => JSON.stringify(draft)
export type ReviewValues = { decision: ReviewDecision; longitude?: number | null; latitude?: number | null; row?: number | null; column?: number | null; plantId?: string | null; reason?: string | null }
export function candidateReviewBody(candidate: MappingCandidate, values: ReviewValues): CandidateReviewBody {
  if (!Object.hasOwn(decisionLabels, values.decision) || values.decision === ('Pending' as string)) throw new Error('Chọn một quyết định duyệt hợp lệ.')
  const longitude = values.longitude ?? null, latitude = values.latitude ?? null
  if ((longitude === null) !== (latitude === null)) throw new Error('Nhập đủ cả kinh độ và vĩ độ.')
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude! < -90 || latitude! > 90)) throw new Error('Tọa độ phải nằm trong phạm vi hợp lệ.')
  for (const value of [values.row, values.column]) if (value != null && (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)) throw new Error('Hàng và cột phải là số nguyên dương.')
  const plantId = values.plantId?.trim() || null
  if (plantId && !validGuid(plantId)) throw new Error('Mã cây hiện có phải là GUID hợp lệ, khác rỗng.')
  if (['MatchExisting', 'Relocate', 'Replace'].includes(values.decision) && !plantId) throw new Error('Cần chọn mã cây hiện có để ghép, di chuyển hoặc thay thế.')
  if (values.decision === 'Relocate' && longitude === null) throw new Error('Sửa vị trí cần kinh độ và vĩ độ mới.')
  const reason = values.reason?.trim() || null
  if (reason && reason.length > 2000) throw new Error('Lý do tối đa 2.000 ký tự.')
  if (!validGuid(candidate.candidateId)) throw new Error('Điểm nhận diện thiếu mã hợp lệ. Tải lại bản đồ.')
  return { decision: values.decision, correctedLongitude: longitude, correctedLatitude: latitude, correctedRowIndex: values.row ?? null, correctedColumnIndex: values.column ?? null,
    correctedMatchedPlantId: values.decision === 'CreateNew' || values.decision === 'Reject' ? null : plantId, reason }
}
export function batchReviewBody(draft: BaseMapDraft, selected: string[], decision: 'CreateNew' | 'MatchExisting' | 'Reject', reason: string): BatchReviewBody {
  if (!editableDraft(draft) || !selected.length || selected.length > 500 || new Set(selected).size !== selected.length) throw new Error('Chọn từ 1 đến 500 điểm khác nhau trong bản nháp đang duyệt.')
  if (!['CreateNew', 'MatchExisting', 'Reject'].includes(decision)) throw new Error('Quyết định này cần duyệt riêng từng điểm.')
  const candidates = new Map(draft.zones.flatMap(zone => zone.candidates).map(item => [item.candidateId, item]))
  return { batchReason: reason.trim() || null, reviews: selected.map(candidateId => {
    const candidate = candidates.get(candidateId)
    if (!candidate) throw new Error('Có điểm không còn nằm trong bản đồ nháp. Tải lại trước khi duyệt.')
    return { candidateId, ...candidateReviewBody(candidate, { decision, longitude: candidate.correctedLongitude, latitude: candidate.correctedLatitude, row: candidate.correctedRowIndex, column: candidate.correctedColumnIndex,
      plantId: candidate.correctedMatchedPlantId ?? candidate.proposedMatchedPlantId, reason }) }
  }) }
}
export function canPublishDraft(draft: BaseMapDraft, validation: MappingValidation | null, validatedFingerprint: string | null) {
  return editableDraft(draft) && draft.pendingCount === 0 && !!validation && validation.isValid && validation.pendingCount === 0 && validation.confirmedPublishablePoleCount > 0 &&
    validation.totalCandidates === draft.totalCandidates && !validation.issues.some(issue => stateToken(issue.severity) === 'ERROR') && validatedFingerprint === draftFingerprint(draft)
}
