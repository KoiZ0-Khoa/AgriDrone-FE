import { ApiError } from '../../api/client'
import type { AssignedOrder } from '../surveys/orderTypes'
import type { MissionPurpose, OrthophotoBounds, PlantGpsTree } from './missionTypes'

// Bắt buộc người dùng chỉ chấm điểm (ranh giới, chấm thêm trụ...) trong phạm vi ảnh orthophoto, không phải trên nền vệ tinh/OSM xung quanh.
export function isWithinOrthophotoBounds(lat: number, lon: number, bounds: OrthophotoBounds) {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon
}

// Ngược lại với BuildMissionCode (`ORD-{surveyOrderId:N}-{BASE|HEALTH|READY}`, N = 32 hex chữ thường không dấu gạch — xem
// findMissionsBySurveyOrder trong missionApi.ts). missionCode luôn có sẵn từ GET .../missions (kể cả sau khi tải lại trang),
// khác surveyOrderId chỉ có trong MissionDetail (chỉ tới từ response của 1 mutation trong cùng phiên) — tách lại GUID gốc từ
// đây để publish-plant-gps vẫn hoạt động sau khi tải lại trang, không cần thêm API GET 1 Mission riêng.
// Cùng lý do với surveyOrderIdFromMissionCode ở trên: latest.purpose chỉ có trong cùng phiên (MissionListItem — nguồn
// sống sót qua tải lại trang — không có field purpose). Hậu tố cuối của missionCode (BASE|HEALTH|READY) mã hoá đúng
// purpose nên dùng được làm fallback khi latest đã mất.
export function isBaselineMappingMissionCode(missionCode: string): boolean {
  return /-BASE$/.test(missionCode)
}

export function surveyOrderIdFromMissionCode(missionCode: string): string | null {
  const match = /^ORD-([0-9a-f]{32})-/i.exec(missionCode)
  if (!match) return null
  const hex = match[1].toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const missionPurposeLabels: Record<MissionPurpose, string> = {
  BaselineMapping: 'Khảo sát bản đồ nền',
  PlantHealth: 'Sức khỏe cây trồng',
  HarvestReadiness: 'Sẵn sàng thu hoạch',
}
// BE casing for Mission purpose/status is inconsistent: the prepare-mission response uses raw
// enum.ToString() (PascalCase), while Mission list/detail responses use the global SCREAMING_SNAKE_CASE
// converter. Normalize both to SCREAMING_SNAKE_CASE before lookup so labels work for either source.
export function toScreamingSnakeCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
}
const missionPurposeLabelsByCode: Record<string, string> = {
  BASELINE_MAPPING: 'Khảo sát bản đồ nền', PLANT_HEALTH: 'Sức khỏe cây trồng', HARVEST_READINESS: 'Sẵn sàng thu hoạch',
}
const missionStatusLabelsByCode: Record<string, string> = {
  DRAFT: 'Bản nháp', SCHEDULED: 'Đã lên lịch', IN_FLIGHT: 'Đang bay', FLIGHT_COMPLETED: 'Đã hoàn tất chuyến bay',
  UPLOADING: 'Đang tải lên', READY_FOR_PROCESSING: 'Sẵn sàng xử lý', PROCESSING: 'Đang xử lý', AWAITING_REVIEW: 'Chờ duyệt',
  COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', FLIGHT_FAILED: 'Chuyến bay lỗi', UPLOAD_FAILED: 'Lỗi tải lên', PROCESSING_FAILED: 'Lỗi xử lý',
}
export function missionPurposeLabel(raw: string | null) { return raw ? missionPurposeLabelsByCode[toScreamingSnakeCase(raw)] ?? raw : 'Chưa xác định' }
export function missionStatusLabel(raw: string) { return missionStatusLabelsByCode[toScreamingSnakeCase(raw)] ?? raw }

// Literal strings from UploadMissionMediaItemResponse — not run through the SCREAMING_SNAKE_CASE enum converter.
export const mediaUploadStatusLabels: Record<string, string> = { Completed: 'Thành công', Failed: 'Lỗi', NotAttempted: 'Chưa thử (đợt dừng do file trước lỗi)' }
export const mediaTypeLabels: Record<string, string> = { IMAGE: 'Ảnh', VIDEO: 'Video' }
export const mediaRoleLabels: Record<string, string> = { RAW_VIDEO: 'Video gốc', RAW_IMAGE: 'Ảnh gốc', PROCESSED_IMAGE: 'Ảnh đã xử lý', THUMBNAIL: 'Ảnh thu nhỏ', OTHER: 'Khác' }
export const fileSizeLabel = (bytes: number | null) => bytes == null ? '—' : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${bytes} B`

// Codes from FinalizeMissionUploadError — returned as MissionUploadReadinessResponse.blockers (reasons, not thrown errors).
const uploadBlockerLabelsByCode: Record<string, string> = {
  'MissionUpload.StatusNotAllowed': 'Nhiệm vụ không ở trạng thái Đang tải lên.',
  'MissionUpload.ActiveSessionsExist': 'Còn phiên upload đang xử lý, chưa thể hoàn tất.',
  'MissionUpload.RequiredMediaMissing': 'Thiếu ảnh/video hợp lệ theo đúng loại nhiệm vụ.',
  'MissionUpload.TelemetryMissing': 'Chưa import telemetry hoặc chưa đủ điểm (tối thiểu 2).',
  'MissionUpload.TelemetryInconsistent': 'Dữ liệu telemetry không khớp giữa số điểm khai báo và đã lưu. Liên hệ hỗ trợ.',
  'MissionUpload.FlightRouteMissing': 'Đường bay thực tế chưa hợp lệ.',
}
export const uploadBlockerLabel = (code: string) => uploadBlockerLabelsByCode[code] ?? code

// Task-level status from the external photogrammetry service — a separate vocabulary from Mission status, never normalized through toScreamingSnakeCase.
const orthophotoStatusLabelsByCode: Record<string, string> = { NOT_STARTED: 'Chưa bắt đầu', QUEUED: 'Đang chờ xử lý', COMPLETED: 'Đã hoàn tất', ERROR: 'Lỗi xử lý', FAILED: 'Xử lý thất bại' }
export const orthophotoStatusLabel = (raw: string) => orthophotoStatusLabelsByCode[raw] ?? raw
export const isOrthophotoTerminal = (raw: string) => raw === 'COMPLETED' || raw === 'ERROR' || raw === 'FAILED'

// Auto-closes the ring (first point repeated at the end) only when building the GeoJSON to send — the on-map point list stays open/distinct.
export function closedBoundaryPolygon(points: [number, number][]) {
  if (points.length < 3) throw new Error('Cần tối thiểu 3 điểm để tạo ranh giới.')
  const coordinates = [...points, points[0]] as [number, number][]
  return { type: 'Polygon' as const, coordinates: [coordinates] }
}
// Planar equirectangular approximation around the centroid latitude — adequate for farm-scale plots, not a geodesic calculation.
export function estimateAreaHectares(points: [number, number][]) {
  if (points.length < 3) return 0
  const avgLat = points.reduce((sum, point) => sum + point[1], 0) / points.length
  const metersPerDegLat = 111_320
  const metersPerDegLon = 111_320 * Math.cos(avgLat * Math.PI / 180)
  const projected = points.map(([lng, lat]) => [lng * metersPerDegLon, lat * metersPerDegLat])
  let area = 0
  for (let i = 0; i < projected.length; i++) {
    const [x1, y1] = projected[i]
    const [x2, y2] = projected[(i + 1) % projected.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) / 2 / 10_000
}

// Mirrors PrepareMissionSetCommandHandler: BASELINE_READY needs BaselineMapping; READY_FOR_PAID_SERVICE needs the order's own service purpose.
export function missionPurposeFor(order: AssignedOrder, orderStatus: string): MissionPurpose | null {
  if (orderStatus === 'BASELINE_READY') return 'BaselineMapping'
  if (orderStatus === 'READY_FOR_PAID_SERVICE') {
    if (order.surveyServiceCode === 'PLANT_HEALTH') return 'PlantHealth'
    if (order.surveyServiceCode === 'HARVEST_READINESS') return 'HarvestReadiness'
  }
  return null
}

// Mirrors MissionScheduleWindow.ForDate (Asia/Ho_Chi_Minh, fixed UTC+7, no DST).
export function scheduleWindowForDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const startAt = new Date(Date.UTC(year, month - 1, day) - 7 * 3600_000)
  const endAt = new Date(startAt.getTime() + 24 * 3600_000)
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() }
}

export const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có'

export function missionError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      'MissionPlanning.OrderNotFound': 'Đơn khảo sát không còn tồn tại.',
      'MissionPlanning.OrderNotReady': 'Đơn chưa đủ điều kiện để chuẩn bị nhiệm vụ bay. Kiểm tra lịch hẹn, thanh toán và trạng thái đơn, rồi tải lại.',
      'MissionPlanning.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'MissionPlanning.CrossTenantOrder': 'Đơn không thuộc nông trại được phân công.',
      'MissionPlanning.InvalidOrderContext': 'Dữ liệu đơn không hợp lệ để chuẩn bị nhiệm vụ bay. Liên hệ quản trị hệ thống.',
      'MissionPlanning.BaselineWindowRequired': 'Chọn ngày bay khảo sát bản đồ nền.',
      'MissionPlanning.ServiceWindowRequired': 'Chọn ngày bay dịch vụ.',
      'MissionPlanning.ServiceWindowNotAllowed': 'Đơn đang ở bước khảo sát bản đồ nền, chưa thể chọn ngày bay dịch vụ.',
      'MissionPlanning.BaselineWindowNotAllowed': 'Nông trại đã có bản đồ nền, không cần chọn ngày bay khảo sát bản đồ nền nữa.',
      'MissionPlanning.ScheduleOutsideAppointment': 'Ngày bay phải nằm trong khoảng lịch hẹn đã được Owner xác nhận. Kiểm tra lại lịch hẹn.',
      'MissionPlanning.ScheduleOverlap': 'Lịch bay bản đồ nền và dịch vụ không được trùng nhau.',
      'MissionPlanning.BaselineMustPrecedeService': 'Phải hoàn tất bay bản đồ nền trước ngày bay dịch vụ.',
      'MissionPlanning.DroneNotAvailable': 'Drone đã chọn không còn khả dụng cho ngày này. Hãy chọn drone khác hoặc tải lại danh sách.',
      'MissionPlanning.ConcurrentPreparation': 'Một yêu cầu khác đang chuẩn bị nhiệm vụ cho đơn này. Thử lại sau ít giây.',
      'MissionPlanning.ExistingMissionSetRequiresRecovery': 'Nhiệm vụ bay hiện có của đơn này không hợp lệ, đã hủy hoặc lỗi. Liên hệ quản trị hệ thống trước khi chuẩn bị lại.',
      'Mission.UserContextRequired': 'Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.',
      'Mission.DroneNotFound': 'Drone không còn tồn tại trong hệ thống.',
      'Mission.DroneNotAvailable': 'Drone đã chọn không còn khả dụng cho khoảng thời gian này.',
      'Mission.ScheduleConflict': 'Drone đã chọn có nhiệm vụ bay khác trùng thời gian.',
      'Mission.VersionConflict': 'Nhiệm vụ bay đã được cập nhật bởi người khác. Tải lại và kiểm tra trước khi tiếp tục.',
      'Mission.InvalidTransition': 'Không thể chuyển sang trạng thái này từ trạng thái hiện tại của nhiệm vụ bay.',
      'Mission.ReasonRequired': 'Cần nhập lý do cho thao tác này.',
      'Drone.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'MissionPreflight.FarmAccessDenied': 'Bạn không được phân công hoặc chưa đủ điều kiện bay cho nông trại này.',
      'MissionPreflight.MissionNotFound': 'Nhiệm vụ bay không còn tồn tại trong phạm vi được phân công.',
      'MissionPreflight.InvalidMissionState': 'Chỉ nạp được checklist khi nhiệm vụ đang ở trạng thái Đã lên lịch.',
      'MissionPreflight.DefinitionNotConfigured': 'Chưa có checklist preflight nào được thiết lập. Liên hệ System Admin tạo checklist trước.',
      'MissionPreflight.StaleChecklistDefinition': 'Checklist đã được System Admin thay đổi. Tải lại checklist mới nhất và hoàn tất lại.',
      'MissionPreflight.MissionNotOrderBound': 'Chỉ hoàn tất preflight cho nhiệm vụ gắn với đơn khảo sát.',
      'MissionPreflight.InvalidStatus': 'Nhiệm vụ không ở trạng thái Đã lên lịch, chưa thể hoàn tất preflight.',
      'MissionPreflight.OperationPayloadConflict': 'Yêu cầu trước đó đã dùng mã gửi này với nội dung khác. Tải lại và thử lại.',
      'MissionPreflight.AlreadyCompleted': 'Checklist của nhiệm vụ này đã được hoàn tất và không thể sửa.',
      'MissionPreflight.SuitableAnswersRequired': 'Không thể đánh dấu phù hợp để bay khi còn câu trả lời "Không".',
      'MissionPreflight.ConcurrentCompletion': 'Một lượt hoàn tất checklist khác đã tồn tại. Tải lại và kiểm tra trước khi thử lại.',
      'MissionOperation.FarmAccessDenied': 'Bạn không được phân công hoặc chưa đủ điều kiện bay cho nông trại này.',
      'MissionOperation.MissionNotOrderBound': 'Chỉ thực hiện được thao tác này cho nhiệm vụ gắn với đơn khảo sát.',
      'MissionOperation.OrderContextUnavailable': 'Chưa lấy được dữ liệu đơn khảo sát để kiểm tra. Thử lại sau.',
      'MissionOperation.OrderNotFound': 'Đơn khảo sát của nhiệm vụ này không còn tồn tại.',
      'MissionOperation.InvalidOrderContext': 'Dữ liệu đơn khảo sát không còn khớp với nhiệm vụ bay. Liên hệ quản trị hệ thống.',
      'MissionOperation.OrderNotReady': 'Đơn khảo sát chưa sẵn sàng cho thao tác bay này.',
      'MissionOperation.ScheduleWindowClosed': 'Thời điểm hiện tại nằm ngoài khung giờ đã lên lịch cho nhiệm vụ.',
      'MissionOperation.AppointmentWindowClosed': 'Thời điểm hiện tại nằm ngoài khung giờ lịch hẹn Owner đã xác nhận.',
      'MissionOperation.PreflightRequired': 'Cần hoàn tất checklist preflight với kết quả phù hợp để bay trước khi bắt đầu.',
      'MissionOperation.PreflightStale': 'Checklist preflight đã đổi version. Hoàn tất lại checklist hiện hành trước khi bay.',
      'MissionOperation.ReasonRequired': 'Cần nhập lý do cho thao tác này.',
      'MissionOperation.FailureIncidentRequired': 'Báo lỗi chuyến bay cần đủ loại sự cố, kết quả xử lý, quyết định khắc phục và bằng chứng.',
      'MissionOperation.RecoveryDecisionRequired': 'Chuyến bay lỗi chưa có quyết định "Cần lên lịch lại" để phục hồi.',
      'MissionOperation.RecoveryWindowRequired': 'Lịch bay phục hồi phải sau thời điểm lỗi và trong tương lai.',
      'MissionOperation.DroneNotOperational': 'Drone của nhiệm vụ này không khả dụng, hết hạn đăng ký hoặc đang chờ bảo trì.',
      'MissionOperation.BaselineNotCompleted': 'Chưa hoàn tất bản đồ nền bắt buộc cho nhiệm vụ dịch vụ này.',
      'MissionTelemetry.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'MissionTelemetry.MissionNotOrderBound': 'Nhiệm vụ cũ không gắn đơn khảo sát, không thể nhập telemetry.',
      'TelemetryImport.MissionStatusNotAllowed': 'Chỉ nhập telemetry khi nhiệm vụ đã kết thúc chuyến bay hoặc đang tải lên.',
      'TelemetryImport.OperationPayloadConflict': 'Mã gửi này đã dùng với dữ liệu telemetry khác. Tải lại và thử lại.',
      'TelemetryImport.FlightTimelineMissing': 'Nhiệm vụ chưa có thời điểm bắt đầu/kết thúc chuyến bay thật.',
      'TelemetryImport.TimestampOutsideMission': 'Có điểm telemetry nằm ngoài khoảng thời gian chuyến bay thật của nhiệm vụ.',
      'TelemetryImport.ConcurrentUpdate': 'Nhiệm vụ hoặc dữ liệu telemetry vừa thay đổi. Tải lại và thử lại.',
      'MissionUpload.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'MissionUpload.ConcurrentUpdate': 'Nhiệm vụ vừa thay đổi. Tải lại và thử lại.',
      'MissionUpload.CannotResetInCurrentStatus': 'Chỉ reset được khi nhiệm vụ đang Đang tải lên, Lỗi tải lên, Sẵn sàng xử lý, hoặc Lỗi xử lý.',
      'MissionUpload.MissionNotOrderBound': 'Nhiệm vụ cũ không gắn đơn khảo sát, không thể reset upload.',
      'OrthophotoStatus.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'ProcessMetashape.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'ProcessMetashape.NoImages': 'Nhiệm vụ chưa có ảnh gốc nào để ghép bản đồ. Upload ảnh trước.',
      'SliceTiles.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'DetectTrees.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'DownloadCsv.FarmAccessDenied': 'Bạn không được phân công quản lý nông trại này.',
      'DownloadCsv.NotFound': 'Chưa có file CSV. Hãy chạy nhận diện cây (YOLO) trước.',
      // Trả về khi lưu nháp GPS cây có kèm boundary (set/đổi ranh giới farm trong cùng request) — mã lỗi xác minh trực
      // tiếp từ FarmError.cs/FarmZoneError.cs (BE), không đoán theo tên hàm C#.
      'FarmZone.BoundaryOutsideFarm': 'Ranh giới vừa vẽ không bao trọn 1 khu vực (Zone) đã có sẵn của nông trại. Vẽ lại ranh giới rộng hơn hoặc xử lý khu vực đó trước.',
      'FarmBoundary.ConcurrentModification': 'Ranh giới nông trại vừa được cập nhật bởi thao tác khác (có thể do publish 2 lần liên tiếp). Tải lại trang rồi thử lại.',
      'FarmBoundary.UnmappedRequiresCaptureSession': 'Nông trại chưa có ranh giới và cần đi qua luồng thu thập ranh giới (capture session) trước, không thể set trực tiếp ở đây.',
    }
    if (error.code && messages[error.code]) return messages[error.code]
    if (error.code === 'Mission.ConcurrentUpdate' || (error.status === 409 && error.code?.includes('ConcurrentUpdate'))) return 'Nhiệm vụ bay đã được cập nhật bởi người khác. Tải lại và kiểm tra trước khi tiếp tục.'
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
    if (error.status === 404) return 'Không tìm thấy nhiệm vụ bay hoặc dữ liệu trong phạm vi được phân công.'
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.'
}

export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

// PublishPlantGps' Conflict/Invalid responses carry no errorCode (see MissionPlantGpsPublisher) — match the known literal
// English messages instead so the user still sees a Vietnamese explanation for the most likely cases.
const publishPlantGpsMessagesByText: Record<string, string> = {
  'Payload survey order does not match a baseline mapping mission.': 'Chỉ đưa GPS cây vào hệ thống chính thức cho nhiệm vụ Khảo sát bản đồ nền (Baseline Mapping).',
  'No saved plant GPS rows were found for this mission.': 'Chưa có GPS cây nào được lưu nháp cho nhiệm vụ này.',
  'Payload candidates must match every saved CSV tree_id exactly once.': 'Danh sách cây vừa gửi không khớp với dữ liệu đã lưu nháp (thiếu/dư/trùng mã cây). Hãy nhận diện lại rồi thử lại.',
  'Payload candidate fields must match the saved plant GPS rows.': 'Dữ liệu cây vừa gửi không khớp với dữ liệu đã lưu nháp. Hãy nhận diện lại rồi thử lại.',
  'Each candidate must include valid row, col, coordinates, confidence, status, and source.': 'Có cây với dữ liệu không hợp lệ (hàng/cột/tọa độ/độ tin cậy/trạng thái/nguồn).',
  'Idempotency-Key has already been used for another event.': 'Mã gửi (Idempotency-Key) đã được dùng cho một yêu cầu khác. Hãy thử lại để tạo mã mới.',
}
export function publishPlantGpsError(error: unknown) {
  if (error instanceof ApiError && error.message && publishPlantGpsMessagesByText[error.message]) return publishPlantGpsMessagesByText[error.message]
  return missionError(error)
}

// Mirrors the validation in SystemManagerMissionsController.ReplacePlantGps.
export function parsePlantGpsTrees(json: string): PlantGpsTree[] {
  let input: unknown
  try { input = JSON.parse(json) } catch { throw new Error('Danh sách cây không phải JSON hợp lệ.') }
  if (!Array.isArray(input) || input.length < 1 || input.length > 10000) throw new Error('Cần từ 1 đến 10.000 cây.')
  const ids = new Set<string>()
  return input.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Dữ liệu cây không hợp lệ.')
    const raw = value as Record<string, unknown>
    const treeId = typeof raw.treeId === 'string' ? raw.treeId.trim() : ''
    const row = Number(raw.row), col = Number(raw.col)
    const latitude = Number(raw.latitude), longitude = Number(raw.longitude), confidence = Number(raw.confidence)
    const status = raw.status
    const source = typeof raw.source === 'string' ? raw.source.trim() : ''
    if (!treeId || treeId.length > 100) throw new Error('Mỗi cây cần mã (treeId) không trống, tối đa 100 ký tự.')
    if (ids.has(treeId)) throw new Error(`Mã cây "${treeId}" bị trùng.`)
    if (!Number.isInteger(row) || row < 1 || !Number.isInteger(col) || col < 1) throw new Error(`Cây "${treeId}": row/col phải là số nguyên bắt đầu từ 1.`)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error(`Cây "${treeId}": tọa độ không hợp lệ.`)
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error(`Cây "${treeId}": confidence phải từ 0 đến 1.`)
    if (status !== 'DETECTED' && status !== 'MISSING') throw new Error(`Cây "${treeId}": status phải là DETECTED hoặc MISSING.`)
    if (!source || source.length > 100) throw new Error(`Cây "${treeId}": cần nguồn (source), tối đa 100 ký tự.`)
    ids.add(treeId)
    return { treeId, row, col, latitude, longitude, confidence, status, source }
  })
}
