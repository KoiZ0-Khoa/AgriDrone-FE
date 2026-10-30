import { ApiError } from '../../api/client'
import type { AssignedOrder } from '../surveys/orderTypes'
import type { MissionPurpose } from './missionTypes'

export const missionPurposeLabels: Record<MissionPurpose, string> = {
  BaselineMapping: 'Khảo sát bản đồ nền',
  PlantHealth: 'Sức khỏe cây trồng',
  HarvestReadiness: 'Sẵn sàng thu hoạch',
}
// BE casing for Mission purpose/status is inconsistent: the prepare-mission response uses raw
// enum.ToString() (PascalCase), while Mission list/detail responses use the global SCREAMING_SNAKE_CASE
// converter. Normalize both to SCREAMING_SNAKE_CASE before lookup so labels work for either source.
function toScreamingSnakeCase(value: string) {
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
    }
    if (error.code && messages[error.code]) return messages[error.code]
    if (error.code === 'Mission.ConcurrentUpdate' || (error.status === 409 && error.code?.includes('ConcurrentUpdate'))) return 'Nhiệm vụ bay đã được cập nhật bởi người khác. Tải lại và kiểm tra trước khi tiếp tục.'
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.'
}
