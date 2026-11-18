import { ApiError } from '../../api/client'
import type { BoundaryDecision, BoundaryExceptionOriginal, FindingOriginal, GuidanceDecision, HealthReviewItem, HealthZoneMember, ZoneDecision, ZoneOriginal } from './healthReviewTypes'

// Mã lỗi PlantHealthReview.* lấy từ PlantHealthReviewService*.cs (mốc BE fda57ec).
const errorMessages: Record<string, string> = {
  'PlantHealthReview.NotFound': 'Không tìm thấy kết quả khảo sát sức khỏe cây của đơn này, hoặc bạn không được phân công đơn này.',
  'PlantHealthReview.CurrentUserRequired': 'Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại bằng tài khoản System Manager.',
  'PlantHealthReview.InvalidRequest': 'Yêu cầu review không hợp lệ (thiếu lý do, quá số lượng hoặc bộ lọc sai).',
  'PlantHealthReview.InvalidDecision': 'Quyết định này không áp dụng được cho mục đã chọn.',
  'PlantHealthReview.InvalidEvidence': 'Bằng chứng không hợp lệ. Vị trí sát ranh giới cần kèm ảnh bằng chứng.',
  'PlantHealthReview.InvalidGeometry': 'Vị trí/vùng phải nằm trong ranh giới nông trại lúc bay khảo sát.',
  'PlantHealthReview.InvalidAssociation': 'Liên kết với trụ cây hoặc phát hiện không hợp lệ. Phát hiện cần gắn với một trụ có thật trên bản đồ lúc bay.',
  'PlantHealthReview.CatalogueMismatch': 'Danh mục nhãn bệnh hiện tại không khớp với phiên bản dữ liệu của lần nhận diện. Liên hệ System Admin kiểm tra danh mục.',
  'PlantHealthReview.VersionConflict': 'Dữ liệu review đã thay đổi. Tải lại danh sách rồi thao tác lại.',
  'PlantHealthReview.OperationConflict': 'Mã thao tác đã dùng cho một yêu cầu khác. Tải lại trang rồi thao tác lại.',
  'PlantHealthReview.ResultLocked': 'Kết quả không còn ở trạng thái chờ kiểm duyệt nên không thể review.',
  'PlantHealthReview.BatchChanged': 'Lô dữ liệu nhận diện vừa được thay mới. Tải lại trước khi review.',
  'PlantHealthReview.DependencyChanged': 'Review của phát hiện liên quan đã thay đổi. Tải lại rồi chọn lại.',
  'PlantHealthReview.GuidanceNotApplicable': 'Hướng dẫn xử lý không còn áp dụng cho loại bệnh đã duyệt.',
  // Giai đoạn 3 (PlantHealthReviewService.Approval/Publication/Comparison.cs).
  'PlantHealthReview.ApprovalBlocked': 'Còn mục chưa xử lý hoặc vị trí/bằng chứng chưa hợp lệ nên chưa phê duyệt được. Tải lại để xem mục còn chặn.',
  'PlantHealthReview.ProvenanceIncomplete': 'Thiếu thông tin nguồn gốc (ảnh đầu vào, người duyệt, lý do hoặc bằng chứng) nên không thể phê duyệt/phát hành.',
  'PlantHealthReview.SourceContextChanged': 'Dữ liệu chuyến bay, bản đồ hoặc lô nhận diện gốc đã thay đổi so với lúc review. Tải lại để kiểm tra.',
  'PlantHealthReview.ApprovalSnapshotChanged': 'Bản phê duyệt không còn khớp dữ liệu hiện tại. Tải lại trước khi phát hành.',
  'PlantHealthReview.PublicationBlocked': 'Một quyết định đã duyệt không còn hiệu lực (ví dụ hướng dẫn xử lý hết hạn) nên chưa phát hành được.',
  'PlantHealthReview.InvalidPublication': 'Nội dung phát hành không hợp lệ. Liên hệ quản trị viên kèm mã tra cứu.',
  'PlantHealthReview.PublicationSnapshotChanged': 'Bản phát hành đã lưu không khớp mã xác thực. Liên hệ quản trị viên kèm mã tra cứu.',
}
export function healthReviewError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code && errorMessages[error.code]) return errorMessages[error.code]
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
    if (error.status === 403) return 'Bạn không có quyền review đơn khảo sát này.'
    if (error.status === 404) return errorMessages['PlantHealthReview.NotFound']
    if (error.status === 409) return errorMessages['PlantHealthReview.VersionConflict']
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu review.'
}
export const isReviewVersionConflict = (error: unknown) => error instanceof ApiError &&
  ['PlantHealthReview.VersionConflict', 'PlantHealthReview.BatchChanged', 'PlantHealthReview.DependencyChanged'].includes(error.code ?? '')

export const findingDecisionLabels: Record<string, string> = {
  Pending: 'Chưa review', Approve: 'Xác nhận bệnh', Correct: 'Đã sửa', Reject: 'Bác bỏ', NonDisease: 'Không phải bệnh', Ambiguous: 'Chưa chắc chắn',
}
export const boundaryDecisionLabels: Record<string, string> = {
  AcceptCorrectedPosition: 'Chấp nhận vị trí', ExcludeEvidence: 'Loại bỏ chứng cứ', NeedsEvidence: 'Cần thêm bằng chứng',
}
export const resolutionStateLabels: Record<string, string> = { PENDING_REVIEW: 'Chờ review', NEEDS_REVIEW: 'Cần xử lý', RESOLVED: 'Đã xử lý' }
export const blockingReasonLabels: Record<string, string> = {
  Unreviewed: 'Chưa review', Ambiguous: 'Đánh dấu chưa chắc chắn', AnnotationRuleChanged: 'Quy tắc gán nhãn đã đổi',
  CatalogueChanged: 'Danh mục bệnh đã đổi', PlantAssociationChanged: 'Trụ cây liên kết đã đổi',
  UnresolvedBoundaryException: 'Chưa có quyết định cuối cùng', StaleBoundaryAssociation: 'Review phát hiện liên quan đã đổi',
  InvalidExclusion: 'Chỉ loại bỏ được khi phát hiện bị bác bỏ', InvalidBoundaryResolution: 'Phát hiện liên quan chưa được xác nhận hợp lệ',
  UnreviewedZone: 'Vùng chưa review', AmbiguousZone: 'Vùng chưa chắc chắn', UnresolvedZoneMembers: 'Vùng chưa có thành viên',
  StaleMemberReview: 'Review thành viên đã đổi', MissingGuidanceDecision: 'Chưa chọn hướng dẫn', GuidanceNotApplicable: 'Hướng dẫn không còn áp dụng',
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : null
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
function point(value: unknown): [number | null, number | null] {
  const coordinates = isRecord(value) && Array.isArray(value.Coordinates) ? value.Coordinates : null
  return coordinates && coordinates.length === 2 ? [num(coordinates[0]), num(coordinates[1])] : [null, null]
}
const mediaIds = (value: unknown) => Array.isArray(value) ? value.flatMap(item => isRecord(item) && str(item.MediaAssetId) ? [item.MediaAssetId as string] : []) : []
// Ảnh bằng chứng theo vai trò BE gắn lúc gửi kết quả (MissionPlantHealthPublisher.EvidenceMedia).
export type FindingImages = { source: string | null; annotated: string | null; crop: string | null }
export function findingImages(evidenceMedia: unknown): FindingImages {
  const byRole = (role: string) => Array.isArray(evidenceMedia)
    ? evidenceMedia.find(item => isRecord(item) && item.Role === role && str(item.MediaAssetId))?.MediaAssetId as string | undefined ?? null : null
  return { source: byRole('source_image'), annotated: byRole('annotated_image'), crop: byRole('crop_image') }
}
export const hasFindingImages = (images: FindingImages) => Boolean(images.source || images.annotated || images.crop)
// Mission bay bệnh của đơn: missionCode = ORD-{orderId:N}-HEALTH (findMissionsBySurveyOrder trả mọi mission của đơn).
export const healthMissionOf = <T extends { missionCode: string }>(missions: T[]) => missions.find(mission => mission.missionCode.endsWith('-HEALTH')) ?? null

export function readFindingOriginal(original: unknown): FindingOriginal {
  const value = isRecord(original) ? original : {}
  const [lon, lat] = point(value.Position)
  return {
    findingId: str(value.FindingId), plantId: str(value.PlantId), mappingCandidateId: str(value.MappingCandidateId), lon, lat,
    observedAt: str(value.ObservedAt), suspectedClassCode: str(value.SuspectedClassCode), confidence: num(value.Confidence),
    uncertainty: str(value.Uncertainty), evidenceMediaIds: mediaIds(value.EvidenceMedia),
  }
}
export function readBoundaryOriginal(original: unknown): BoundaryExceptionOriginal {
  const value = isRecord(original) ? original : {}
  const [lon, lat] = point(value.OriginalPosition)
  return {
    sourceReferenceId: str(value.SourceReferenceId), lon, lat, boundaryClassification: str(value.BoundaryClassification),
    measuredBoundaryDistanceM: num(value.MeasuredBoundaryDistanceM), boundaryThresholdM: num(value.BoundaryThresholdM),
    evidenceMediaIds: mediaIds(value.EvidenceMedia),
  }
}
// Snapshot của review hiện tại (HealthReviewSnapshot, PascalCase): trụ/loại bệnh/vị trí sau khi review.
export function readReviewSnapshot(snapshot: unknown) {
  const value = isRecord(snapshot) ? snapshot : {}
  const position = Array.isArray(value.Position) && value.Position.length === 2 ? [num(value.Position[0]), num(value.Position[1])] : [null, null]
  return { plantId: str(value.PlantId), classCode: str(value.ClassCode), lon: position[0], lat: position[1], boundFindingId: str(value.BoundFindingId) }
}

// Một dòng của bảng findings (B3): gộp dữ liệu AI gốc với review hiện tại; trụ/loại bệnh ưu tiên giá trị sau review.
export type FindingRow = {
  id: string; observedAt: string; resolutionState: string
  originalClass: string | null; reviewedClass: string | null; className: string
  confidence: number | null; lat: number | null; lon: number | null
  plantId: string | null; plantLabel: string
  // Giá trị AI gốc — BE luôn lấy giá trị gốc làm nền cho Approve/Correct (CorrectedX ?? finding gốc), không phải giá trị của lần review trước.
  originalPlantId: string | null; originalLat: number | null; originalLon: number | null
  decision: string; decisionLabel: string; reviewReason: string | null; reviewedAt: string | null
  blockingReasons: string[]
  images: FindingImages
}
export function findingRow(item: HealthReviewItem, plantCodes: ReadonlyMap<string, string>, classNames: ReadonlyMap<string, string>): FindingRow {
  const original = readFindingOriginal(item.original)
  const reviewed = item.review ? readReviewSnapshot(item.review.snapshot) : null
  const reviewedClass = reviewed?.classCode ?? null
  const classCode = reviewedClass ?? original.suspectedClassCode
  const plantId = reviewed?.plantId ?? original.plantId
  const decision = item.review?.decision ?? 'Pending'
  return {
    id: item.id, observedAt: item.observedAt, resolutionState: item.resolutionState,
    originalClass: original.suspectedClassCode, reviewedClass,
    className: classCode ? classNames.get(classCode.toUpperCase()) ?? classCode : 'Không rõ',
    confidence: original.confidence,
    lat: reviewed?.lat ?? original.lat, lon: reviewed?.lon ?? original.lon,
    plantId, plantLabel: plantId ? plantCodes.get(plantId.toLowerCase()) ?? 'Trụ ngoài bản đồ hiện tại' : 'Chưa gắn trụ',
    originalPlantId: original.plantId, originalLat: original.lat, originalLon: original.lon,
    decision, decisionLabel: findingDecisionLabels[decision] ?? decision,
    reviewReason: item.review?.reason ?? null, reviewedAt: item.review?.reviewedAt ?? null,
    blockingReasons: item.blockingReasons.map(reason => blockingReasonLabels[reason] ?? reason),
    images: findingImages(isRecord(item.original) ? item.original.EvidenceMedia : null),
  }
}

// B4 — các quyết định review hàng loạt (Correct cần form riêng ở B5).
export type BulkFindingDecision = 'Reject' | 'NonDisease' | 'Approve'
export const bulkDecisionCopy: Record<BulkFindingDecision, { title: string; button: string; hint: string }> = {
  Reject: { title: 'Bác bỏ phát hiện', button: 'Bác bỏ', hint: 'AI nhận nhầm (nhiễu, phản quang, vật thể lạ). Phát hiện không được tính vào kết quả.' },
  NonDisease: { title: 'Xác nhận không phải bệnh', button: 'Không phải bệnh', hint: 'Đối tượng có thật nhưng khỏe mạnh bình thường, không nhiễm bệnh.' },
  Approve: { title: 'Xác nhận đúng là bệnh', button: 'Xác nhận bệnh', hint: 'Giữ nguyên loại bệnh AI đề xuất. Chỉ áp dụng cho phát hiện AI đã gắn với một trụ cây.' },
}
// Approve giữ nguyên trụ AI gắn ban đầu; phát hiện chưa gắn trụ phải dùng "Sửa" (B5) để chọn trụ.
// Dòng chưa xử lý xong: chưa review, hoặc đã review nhưng còn mục chặn (cần review lại). Dùng cho "chọn tất cả".
export const openRows = <T extends { decision: string; resolutionState: string }>(rows: T[]) =>
  rows.filter(row => row.decision === 'Pending' || row.resolutionState !== 'RESOLVED')
// Các dòng sẽ bị đổi quyết định (đã có quyết định khác với quyết định sắp gửi) — hộp thoại phải cảnh báo rõ.
export const decisionChanges = <T extends { decision: string }>(rows: T[], next: string) =>
  rows.filter(row => row.decision !== 'Pending' && row.decision !== next)
export const unapprovableRows =(rows: FindingRow[]) => rows.filter(row => !row.originalPlantId)

// Dựng body review-batch từ đúng các item của response danh sách mới nhất (batchId/resultVersion/version lấy từ đó).
export function buildFindingBatch(page: { batchId: string; resultVersion: number }, items: HealthReviewItem[], decision: BulkFindingDecision, reason: string, operationId: string) {
  return {
    operationId, batchId: page.batchId, expectedResultVersion: page.resultVersion,
    items: items.map(item => ({ ...findingVersions(item), decision, reason, evidenceMediaIds: [] as string[] })),
  }
}

// Lỗi mà gửi lại cũng vô ích — chỉ nên đóng hộp thoại và tải lại danh sách.
export const isStaleReviewError = (error: unknown) => isReviewVersionConflict(error) || (error instanceof ApiError && error.code === 'PlantHealthReview.ResultLocked')
// Giai đoạn 3: thêm các lỗi "dữ liệu đã đổi" của phê duyệt/phát hành.
export const isStaleReleaseError = (error: unknown) => isStaleReviewError(error) || (error instanceof ApiError &&
  ['PlantHealthReview.ApprovalBlocked', 'PlantHealthReview.ApprovalSnapshotChanged', 'PlantHealthReview.SourceContextChanged', 'PlantHealthReview.OperationConflict'].includes(error.code ?? ''))

// Giai đoạn 3 — trạng thái panel phê duyệt & phát hành.
export type ReleaseStage = 'blocked' | 'ready' | 'approved' | 'published'
export function releaseStage(orderStatus: string, summary: { readyForApproval: boolean }, approval: { currentStatus: string } | null): ReleaseStage {
  if (approval?.currentStatus === 'PUBLISHED' || (approval && orderStatus !== 'PENDING_REVIEW')) return 'published'
  if (approval) return 'approved'
  return orderStatus === 'PENDING_REVIEW' && summary.readyForApproval ? 'ready' : 'blocked'
}
// Review chỉ còn sửa được khi đơn chờ duyệt và kết quả chưa được phê duyệt (sau phê duyệt BE trả ResultLocked).
export const reviewEditable = (orderStatus: string, approval: unknown) => orderStatus === 'PENDING_REVIEW' && !approval
export const conclusionLabels: Record<string, string> = {
  NO_ACCEPTED_SUSPECTED_FINDINGS: 'Không có phát hiện nghi bệnh nào được xác nhận',
  HAS_REVIEWED_SUSPECTED_FINDINGS: 'Có phát hiện nghi bệnh đã được xác nhận',
}
export const expectedConclusion = (acceptedFindings: number) => acceptedFindings === 0 ? 'NO_ACCEPTED_SUSPECTED_FINDINGS' : 'HAS_REVIEWED_SUSPECTED_FINDINGS'
// Bước tiếp theo sau phát hành, theo trạng thái đơn BE trả về (đơn thanh toán sau bay → AWAITING_PRICING, còn lại → COMPLETED).
export function nextStepAfterPublish(orderStatus: string) {
  if (orderStatus === 'COMPLETED') return 'Đơn đã hoàn tất. Chủ nông trại đã được thông báo và xem được kết quả.'
  if (orderStatus === 'AWAITING_PRICING') return 'Bước tiếp theo: chốt số trụ và giá ở trang đơn khảo sát. Chủ nông trại chỉ xem được kết quả sau khi thanh toán phần còn lại.'
  if (orderStatus === 'AWAITING_PAYMENT') return 'Đã chốt giá, đang chờ chủ nông trại thanh toán phần còn lại. Kết quả mở cho chủ nông trại sau khi thanh toán.'
  return null
}

// B5 — "Sửa" (Correct) một phát hiện. Correct cũng là xác nhận đúng là bệnh, kèm thông tin đã sửa.
export type CorrectionForm = { classCode: string; plantId: string | null; lat: number | null; lon: number | null }
type CorrectionOriginal = { originalClass: string | null; originalPlantId: string | null; originalLat: number | null; originalLon: number | null }
const sameText = (a: string | null, b: string | null) => (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
const samePoint = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) < 1e-9
// Chỉ gửi trường KHÁC giá trị AI gốc. Nhờ vậy lần sửa trước vẫn được giữ (form mặc định là giá trị hiện hành),
// và nếu mọi trường trùng gốc thì không phải "Sửa" — dùng "Xác nhận bệnh".
export function correctionFields(row: CorrectionOriginal, form: CorrectionForm) {
  if (!form.classCode.trim()) throw new Error('Chọn loại bệnh.')
  if (!form.plantId) throw new Error('Chọn trụ cây cho phát hiện. Phát hiện được xác nhận bệnh phải gắn với một trụ.')
  if (form.lat === null || form.lon === null || !Number.isFinite(form.lat) || !Number.isFinite(form.lon) || Math.abs(form.lat) > 90 || Math.abs(form.lon) > 180)
    throw new Error('Vị trí không hợp lệ.')
  const fields: { correctedClassCode?: string; correctedPlantId?: string; correctedPosition?: { type: 'Point'; coordinates: [number, number] } } = {}
  if (!sameText(form.classCode, row.originalClass)) fields.correctedClassCode = form.classCode.trim()
  if (!sameText(form.plantId, row.originalPlantId)) fields.correctedPlantId = form.plantId
  if (!samePoint(form.lat, row.originalLat) || !samePoint(form.lon, row.originalLon)) fields.correctedPosition = { type: 'Point', coordinates: [form.lon, form.lat] }
  if (Object.keys(fields).length === 0) throw new Error('Không có gì khác với kết quả AI. Dùng "Xác nhận bệnh" thay vì "Sửa".')
  return fields
}

// Khoảng cách xấp xỉ (equirectangular) — đủ chính xác trong phạm vi một vườn.
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180, x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad), y = (lat2 - lat1) * rad
  return Math.sqrt(x * x + y * y) * 6_371_000
}
export function plantsByDistance<T extends { lat: number; lon: number }>(plants: T[], lat: number | null, lon: number | null) {
  if (lat === null || lon === null) return plants.map(plant => ({ plant, distance: null as number | null }))
  return plants.map(plant => ({ plant, distance: distanceMeters(lat, lon, plant.lat, plant.lon) as number | null })).sort((a, b) => a.distance! - b.distance!)
}

// B6 — ngoại lệ ranh giới. BE (MissionPlantHealthPublisher) tạo 1 ngoại lệ cho mỗi phát hiện sát/ngoài ranh giới,
// với SourceReferenceId = FindingId gốc của phát hiện đó ⇒ khớp qua original.FindingId.
export const boundaryClassificationLabels: Record<string, string> = { NEEDS_REVIEW: 'Sát ranh giới', OUT_OF_BOUNDARY: 'Ngoài ranh giới' }
export function linkedFinding(exception: HealthReviewItem, findings: HealthReviewItem[]) {
  const reference = readBoundaryOriginal(exception.original).sourceReferenceId?.toLowerCase()
  if (!reference) return null
  return findings.find(item => readFindingOriginal(item.original).findingId?.toLowerCase() === reference) ?? null
}
// Quyết định hợp lệ theo trạng thái review của phát hiện liên quan (BE ReviewBoundaryAsync + BoundaryIssues).
export function boundaryOptions(finding: HealthReviewItem | null): { allowed: BoundaryDecision[]; hint: string | null } {
  if (!finding) return { allowed: ['NeedsEvidence'], hint: 'Không tìm thấy phát hiện tương ứng trong lô hiện tại — chỉ có thể đánh dấu cần thêm bằng chứng.' }
  const decision = finding.review?.decision
  if (!decision || decision === 'Ambiguous') return { allowed: ['NeedsEvidence'], hint: 'Review phát hiện liên quan trước (Bác bỏ / Không phải bệnh để loại bỏ chứng cứ; Xác nhận / Sửa để chấp nhận vị trí).' }
  if (decision === 'Reject' || decision === 'NonDisease') return { allowed: ['ExcludeEvidence', 'NeedsEvidence'], hint: null }
  if (finding.blockingReasons.length > 0) return { allowed: ['NeedsEvidence'], hint: 'Phát hiện liên quan còn mục chặn — xử lý xong phát hiện đó trước khi chấp nhận vị trí.' }
  return { allowed: ['AcceptCorrectedPosition', 'NeedsEvidence'], hint: null }
}
// Xử lý hàng loạt: chỉ cho quyết định mà MỌI ngoại lệ đã chọn đều hợp lệ (bỏ NeedsEvidence vì nó không giải quyết được gì).
export type BulkBoundaryDecision = 'ExcludeEvidence' | 'AcceptCorrectedPosition'
export function bulkBoundaryDecision(findings: (HealthReviewItem | null)[], decision: BulkBoundaryDecision): { ok: boolean; blocked: number } {
  const blocked = findings.filter(finding => !boundaryOptions(finding).allowed.includes(decision)).length
  return { ok: findings.length > 0 && blocked === 0, blocked }
}
// Ngoại lệ chưa xử lý xong (chưa có quyết định hoặc còn mục chặn) — dùng cho "chọn tất cả".
export const openBoundaryItems = <T extends { item: HealthReviewItem }>(rows: T[]) => rows.filter(row => !row.item.review || row.item.blockingReasons.length > 0)
export const boundaryDecisionHints: Record<BoundaryDecision, string> = {
  ExcludeEvidence: 'Phát hiện liên quan đã bị Bác bỏ hoặc đánh Không phải bệnh — loại bằng chứng này khỏi kết quả. Ngoại lệ được tính là đã xử lý.',
  AcceptCorrectedPosition: 'Giữ phát hiện đã xác nhận, chấp nhận vị trí hiện tại của nó. BE kiểm tra vị trí phải nằm trong ranh giới lúc bay; nếu đang ở ngoài, hãy "Sửa" vị trí phát hiện trước.',
  NeedsEvidence: 'Chưa đủ thông tin để quyết định. Ngoại lệ VẪN chặn phê duyệt cho tới khi được xử lý.',
}
export function buildBoundaryReview(page: { batchId: string; resultVersion: number }, exception: HealthReviewItem, finding: HealthReviewItem | null, decision: BoundaryDecision, reason: string, operationId: string) {
  const link = decision === 'NeedsEvidence' ? {} : (() => {
    if (!finding?.review) throw new Error('Phát hiện liên quan chưa được review.')
    return { findingId: finding.id, findingReviewId: finding.review.reviewId }
  })()
  return { operationId, batchId: page.batchId, expectedResultVersion: page.resultVersion, ...boundaryVersions(exception), decision, reason, evidenceMediaIds: [] as string[], ...link }
}

// B7 — vùng bệnh theo đơn. Quy tắc lấy từ PlantHealthReviewService.Commands.cs (ReviewZoneAsync/ReviewGuidanceAsync)
// và .Validation.cs (ZoneIssues).
export const zoneDecisionLabels: Record<string, string> = { Pending: 'Chưa review', Approve: 'Xác nhận vùng', Correct: 'Đã sửa', Reject: 'Bác bỏ vùng', Ambiguous: 'Chưa chắc chắn' }
export const guidanceDecisionLabels: Record<string, string> = { Select: 'Áp dụng hướng dẫn', RejectAll: 'Không áp dụng hướng dẫn nào', NeedsEvidence: 'Cần thêm bằng chứng' }
export const isAccepted = (decision: string | null | undefined) => decision === 'Approve' || decision === 'Correct'

const ringOf = (value: unknown): [number, number][] | null => {
  if (!Array.isArray(value) || value.length < 4) return null
  if (!value.every(point => Array.isArray(point) && point.length >= 2 && num(point[0]) !== null && num(point[1]) !== null)) return null
  return value.map(point => [(point as number[])[0], (point as number[])[1]] as [number, number])
}
export function readZoneOriginal(original: unknown): ZoneOriginal {
  const value = isRecord(original) ? original : {}
  const geometry = isRecord(value.Geometry) ? value.Geometry : null
  const ring = geometry && Array.isArray(geometry.Coordinates) ? ringOf(geometry.Coordinates[0]) : null
  const memberships = Array.isArray(value.Memberships) ? value.Memberships.filter(isRecord).map(member => ({
    plantId: str(member.PlantId), mappingCandidateId: str(member.MappingCandidateId), confidence: num(member.Confidence),
  })) : []
  return { sourceProposalId: str(value.SourceProposalId), suspectedClassCode: str(value.SuspectedClassCode), ring, memberships }
}
// Vòng [lon, lat] của vùng hiện hành: hình trong review hiện tại (snapshot.Geometry) nếu có, nếu không thì hình đề xuất.
export function zoneRing(item: HealthReviewItem): [number, number][] | null {
  const snapshot = item.review && isRecord(item.review.snapshot) ? item.review.snapshot : null
  const reviewed = snapshot && Array.isArray(snapshot.Geometry) ? ringOf(snapshot.Geometry[0]) : null
  return reviewed ?? readZoneOriginal(item.original).ring
}
export const zoneClass = (item: HealthReviewItem) => (item.review ? readReviewSnapshot(item.review.snapshot).classCode : null) ?? readZoneOriginal(item.original).suspectedClassCode
export function zoneMemberCount(item: HealthReviewItem) {
  const snapshot = item.review && isRecord(item.review.snapshot) ? item.review.snapshot : null
  return snapshot && Array.isArray(snapshot.Members) ? snapshot.Members.length : readZoneOriginal(item.original).memberships.length
}
// Ray casting trên mặt phẳng lon/lat — đủ chính xác cho đa giác nhỏ trong một vườn. Điểm nằm đúng trên cạnh có thể khác PostGIS.
export function pointInRing(lon: number, lat: number, ring: [number, number][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Phát hiện đủ điều kiện làm thành viên vùng: đã Xác nhận/Sửa, không còn mục chặn, đúng loại bệnh, có trụ.
export type ZoneMemberCandidate = HealthZoneMember & { plantId: string; lat: number | null; lon: number | null; insideZone: boolean | null }
export function zoneMemberCandidates(findings: HealthReviewItem[], classCode: string, ring: [number, number][] | null): ZoneMemberCandidate[] {
  return findings.flatMap(item => {
    if (!item.review || !isAccepted(item.review.decision) || item.blockingReasons.length > 0 || item.sourceVersion === null) return []
    const value = readReviewSnapshot(item.review.snapshot)
    if (!value.plantId || !value.classCode || value.classCode.toUpperCase() !== classCode.toUpperCase()) return []
    const insideZone = ring && value.lat !== null && value.lon !== null ? pointInRing(value.lon, value.lat, ring) : null
    return [{ findingId: item.id, sourceVersion: item.sourceVersion, findingReviewId: item.review.reviewId, plantId: value.plantId, lat: value.lat, lon: value.lon, insideZone }]
  })
}
// Mô phỏng cách BE tự suy thành viên khi Approve (không gửi Members): mỗi membership đề xuất phải khớp ĐÚNG 1 phát hiện
// đã chấp nhận cùng loại, theo PlantId hoặc MappingCandidateId gốc của phát hiện.
export function resolveOriginalMembers(zone: HealthReviewItem, findings: HealthReviewItem[], classCode: string) {
  const candidates = new Map(zoneMemberCandidates(findings, classCode, readZoneOriginal(zone.original).ring).map(candidate => [candidate.findingId, candidate]))
  return readZoneOriginal(zone.original).memberships.map(membership => {
    const matches = findings.filter(item => {
      if (!candidates.has(item.id)) return false
      const original = readFindingOriginal(item.original)
      return (membership.plantId !== null && original.plantId?.toLowerCase() === membership.plantId.toLowerCase())
        || (membership.mappingCandidateId !== null && original.mappingCandidateId?.toLowerCase() === membership.mappingCandidateId.toLowerCase())
    }).map(item => candidates.get(item.id)!)
    return { membership, matches }
  })
}
// Approve chỉ thành công khi mọi thành viên đề xuất tự khớp được duy nhất và không trùng trụ.
export function approveReadiness(zone: HealthReviewItem, findings: HealthReviewItem[]): { ready: boolean; reason: string | null } {
  const classCode = readZoneOriginal(zone.original).suspectedClassCode
  if (!classCode) return { ready: false, reason: 'Vùng không có loại bệnh đề xuất.' }
  const resolved = resolveOriginalMembers(zone, findings, classCode)
  if (resolved.length === 0) return { ready: false, reason: 'Vùng đề xuất không có thành viên — dùng "Sửa" để chọn thành viên.' }
  const missing = resolved.filter(entry => entry.matches.length === 0).length
  const ambiguous = resolved.filter(entry => entry.matches.length > 1).length
  if (missing > 0) return { ready: false, reason: `${missing}/${resolved.length} cây trong vùng chưa có phát hiện "${classCode}" được xác nhận. Xác nhận các phát hiện đó trước, hoặc dùng "Sửa" để chọn thành viên.` }
  if (ambiguous > 0) return { ready: false, reason: `${ambiguous} cây khớp nhiều phát hiện cùng lúc — dùng "Sửa" để chọn rõ thành viên.` }
  const outside = resolved.filter(entry => entry.matches[0].insideZone === false).length
  if (outside > 0) return { ready: false, reason: `${outside} phát hiện thành viên nằm ngoài hình vùng đề xuất — BE sẽ từ chối. Dùng "Sửa" để chọn lại thành viên.` }
  const plants = resolved.map(entry => entry.matches[0].plantId.toLowerCase())
  if (new Set(plants).size !== plants.length) return { ready: false, reason: 'Hai thành viên trùng một trụ — dùng "Sửa" để chọn lại.' }
  return { ready: true, reason: null }
}

// Quyết định hướng dẫn chỉ còn hiệu lực khi gắn với review vùng HIỆN TẠI (snapshot.BoundReviewId); review lại vùng thì phải chọn lại.
export function guidanceIsCurrent(zone: HealthReviewItem) {
  const snapshot = zone.guidanceReview && isRecord(zone.guidanceReview.snapshot) ? zone.guidanceReview.snapshot : null
  return Boolean(zone.review && snapshot && str(snapshot.BoundReviewId)?.toLowerCase() === zone.review.reviewId.toLowerCase())
}

export function buildZoneReview(page: { batchId: string; resultVersion: number }, zone: HealthReviewItem, decision: ZoneDecision, reason: string, operationId: string,
  correction: { classCode?: string; members?: HealthZoneMember[] } = {}) {
  return {
    operationId, batchId: page.batchId, expectedResultVersion: page.resultVersion,
    expectedZoneVersion: zone.sourceRowVersion, expectedReviewVersion: zone.review?.version ?? null,
    decision, reason, evidenceMediaIds: [] as string[],
    ...(decision === 'Correct' && correction.classCode ? { correctedClassCode: correction.classCode } : {}),
    ...(decision === 'Correct' && correction.members ? { members: correction.members.map(({ findingId, sourceVersion, findingReviewId }) => ({ findingId, sourceVersion, findingReviewId })) } : {}),
  }
}
export function buildGuidanceReview(page: { batchId: string; resultVersion: number }, zone: HealthReviewItem, decision: GuidanceDecision, reason: string, operationId: string, guidanceId?: string) {
  if (!zone.review || !isAccepted(zone.review.decision)) throw new Error('Xác nhận hoặc sửa vùng trước khi chọn hướng dẫn.')
  return {
    operationId, batchId: page.batchId, expectedResultVersion: page.resultVersion,
    expectedZoneVersion: zone.sourceRowVersion, expectedReviewVersion: zone.guidanceReview?.version ?? null,
    zoneReviewId: zone.review.reviewId, decision, reason, evidenceMediaIds: [] as string[],
    ...(decision === 'Select' && guidanceId ? { guidanceId } : {}),
  }
}

// Giá trị optimistic-concurrency cho 1 mục review, lấy từ item trong response danh sách mới nhất.
export function findingVersions(item: HealthReviewItem) {
  if (item.sourceVersion === null) throw new Error('Phát hiện thiếu sourceVersion — tải lại danh sách.')
  return { findingId: item.id, expectedSourceVersion: item.sourceVersion, expectedReviewVersion: item.review?.version ?? null }
}
export function boundaryVersions(item: HealthReviewItem) {
  return { expectedExceptionVersion: item.sourceRowVersion, expectedReviewVersion: item.review?.version ?? null }
}
