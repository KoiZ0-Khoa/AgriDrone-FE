import { ApiError } from '../../api/client'
import type { PlantHealthStatus } from './plantHealthMapTypes'
import type { FlaggedMatchingParameters } from './plantHealthReviewTypes'

export const healthStatusLabels: Record<PlantHealthStatus, string> = {
  NORMAL: 'Bình thường', HEALTHY_FRUIT: 'Có trái khỏe', DISEASE: 'Phát hiện bệnh',
}
// Giữ đúng bảng màu app hiện có (global.css :root) thay vì màu tối/cyan của map_picker.
// NORMAL dùng xanh dương tươi riêng (không phải --muted xám) để nổi rõ trên nền ảnh vườn.
export const healthStatusColors: Record<PlantHealthStatus, string> = {
  NORMAL: '#2f7df6', HEALTHY_FRUIT: 'var(--mint)', DISEASE: '#b42318',
}
export const diseaseZoneStatusLabels: Record<string, string> = {
  PROPOSED: 'Đề xuất, chưa duyệt', REVIEWED: 'Đã duyệt', REJECTED: 'Đã gộp/loại bỏ',
}

export function plantHealthMapError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bạn không được phân công quản lý nông trại này.'
    if (error.status === 404) return 'Nông trại chưa có bản đồ sức khỏe cây — cần publish bản đồ nền trước.'
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể tải dữ liệu.'
}

// Mã lỗi lấy từ các handler trong BE Features/PlantHealth (mốc fda57ec).
const reviewErrorMessages: Record<string, string> = {
  'PlantHealth.V4ReviewRequired': 'Vết này thuộc kết quả khảo sát đang chờ kiểm duyệt — hãy duyệt trong màn kiểm duyệt của đơn khảo sát.',
  'ReviewObservation.InvalidDecision': 'Quyết định duyệt không hợp lệ (chỉ Xác nhận hoặc Bác bỏ).',
  'ReviewObservation.NotFound': 'Không tìm thấy vết nhận diện này — có thể đã bị xử lý. Hãy tải lại bản đồ.',
  'ResolveFlagged.InvalidAction': 'Hành động xử lý không hợp lệ.',
  'ResolveFlagged.NotFound': 'Không tìm thấy vết lệch này — hãy tải lại danh sách.',
  'ResolveFlagged.NotPending': 'Vết lệch này đã được xử lý trước đó. Hãy tải lại danh sách.',
  'ResolveFlagged.TargetPlantRequired': 'Chọn trụ cây để gắn vết lệch vào.',
  'ResolveFlagged.TargetPlantNotFound': 'Trụ cây đích không còn hoạt động trong nông trại này.',
  'ResolveFlagged.NoDetectedLocation': 'Vết lệch không có tọa độ phát hiện nên không thể tạo trụ mới tại đó.',
  'ResolveFlagged.OutsideBoundary': 'Vị trí phát hiện nằm ngoài ranh giới nông trại đã duyệt, không thể tạo trụ mới.',
  'ResolveFlagged.PlantCodeExists': 'Mã trụ này đã tồn tại. Nhập mã khác hoặc để trống cho hệ thống tự sinh.',
  'MergeZones.MinimumZones': 'Cần chọn ít nhất 2 vùng bệnh để gộp.',
  'MergeZones.ZoneNotFound': 'Có vùng bệnh không còn tồn tại — hãy tải lại bản đồ.',
  'MergeZones.InvalidStatus': 'Chỉ gộp được các vùng đang ở trạng thái Đề xuất, chưa duyệt.',
  'MergeZones.EmptyMembership': 'Các vùng đã chọn không có cây thành viên nào để gộp.',
  'UpdateZoneBoundary.ZoneNotFound': 'Không tìm thấy vùng bệnh — hãy tải lại bản đồ.',
  'UpdateZoneBoundary.InvalidStatus': 'Vùng bệnh đã duyệt hoặc đã gộp nên không thể chỉnh viền nữa.',
  'UpdateZoneMemberships.ZoneNotFound': 'Không tìm thấy vùng bệnh — hãy tải lại bản đồ.',
  'UpdateZoneMemberships.InvalidStatus': 'Vùng bệnh đã duyệt hoặc đã gộp nên không thể sửa thành viên nữa.',
  'UpdateZoneMemberships.PlantNotFound': 'Có trụ cây không còn hoạt động trong nông trại này.',
}
export function plantHealthReviewError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code && reviewErrorMessages[error.code]) return reviewErrorMessages[error.code]
    if (error.code?.endsWith('.FarmAccessDenied') || error.status === 403) return 'Bạn không được phân công quản lý nông trại này.'
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  }
  return plantHealthMapError(error)
}

const stringOrNull = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : null
// matchingParametersJson của vết lệch là JSON thô (cột jsonb). JSON hỏng/không phải object → null, không ném lỗi.
export function parseMatchingParameters(json: string | null | undefined): FlaggedMatchingParameters | null {
  if (!json) return null
  let root: unknown
  try { root = JSON.parse(json) } catch { return null }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null
  const value = root as Record<string, unknown>
  return {
    className: stringOrNull(value.class_name), imageName: stringOrNull(value.image_name),
    cropImageUrl: stringOrNull(value.crop_image_url), annotatedImageUrl: stringOrNull(value.annotated_image_url),
    detectionId: stringOrNull(value.detection_id),
  }
}
