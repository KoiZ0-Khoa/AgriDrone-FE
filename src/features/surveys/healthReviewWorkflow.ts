import { ApiError } from '../../api/client'
import type { BoundaryExceptionOriginal, FindingOriginal, HealthReviewItem } from './healthReviewTypes'

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
  UnresolvedBoundaryException: 'Chưa xử lý', StaleBoundaryAssociation: 'Review phát hiện liên quan đã đổi',
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
export const unapprovableRows = (rows: FindingRow[]) => rows.filter(row => !row.originalPlantId)

// Dựng body review-batch từ đúng các item của response danh sách mới nhất (batchId/resultVersion/version lấy từ đó).
export function buildFindingBatch(page: { batchId: string; resultVersion: number }, items: HealthReviewItem[], decision: BulkFindingDecision, reason: string, operationId: string) {
  return {
    operationId, batchId: page.batchId, expectedResultVersion: page.resultVersion,
    items: items.map(item => ({ ...findingVersions(item), decision, reason, evidenceMediaIds: [] as string[] })),
  }
}

// Lỗi mà gửi lại cũng vô ích — chỉ nên đóng hộp thoại và tải lại danh sách.
export const isStaleReviewError = (error: unknown) => isReviewVersionConflict(error) || (error instanceof ApiError && error.code === 'PlantHealthReview.ResultLocked')

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

// Giá trị optimistic-concurrency cho 1 mục review, lấy từ item trong response danh sách mới nhất.
export function findingVersions(item: HealthReviewItem) {
  if (item.sourceVersion === null) throw new Error('Phát hiện thiếu sourceVersion — tải lại danh sách.')
  return { findingId: item.id, expectedSourceVersion: item.sourceVersion, expectedReviewVersion: item.review?.version ?? null }
}
export function boundaryVersions(item: HealthReviewItem) {
  return { expectedExceptionVersion: item.sourceRowVersion, expectedReviewVersion: item.review?.version ?? null }
}
