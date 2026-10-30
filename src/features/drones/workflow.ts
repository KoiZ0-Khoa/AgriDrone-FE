import { ApiError } from '../../api/client'
import type { DroneCapability, DroneStatus } from './types'

export const capabilityLabels: Record<DroneCapability, string> = {
  BASELINE_MAPPING: 'Khảo sát ranh giới',
  PLANT_HEALTH: 'Sức khỏe cây trồng',
  HARVEST_READINESS: 'Sẵn sàng thu hoạch',
}
export const droneStatusLabels: Record<DroneStatus, string> = {
  AVAILABLE: 'Sẵn sàng',
  IN_MISSION: 'Đang thực hiện nhiệm vụ',
  MAINTENANCE: 'Bảo trì',
  INACTIVE: 'Ngừng hoạt động',
  RETIRED: 'Đã thanh lý',
}
export const droneStatusColors: Record<DroneStatus, string> = {
  AVAILABLE: 'success',
  IN_MISSION: 'processing',
  MAINTENANCE: 'warning',
  INACTIVE: 'default',
  RETIRED: 'error',
}
export const transitionLabels: Record<DroneStatus, string> = {
  AVAILABLE: 'Hoàn tất bảo trì / Kích hoạt lại',
  IN_MISSION: 'Đang thực hiện nhiệm vụ',
  MAINTENANCE: 'Chuyển sang bảo trì',
  INACTIVE: 'Ngừng hoạt động',
  RETIRED: 'Thanh lý',
}

// Mirrors ChangeDroneStatusCommandHandler.CanTransition in BE — keep in sync if BE's transition map changes.
export function allowedTransitions(status: DroneStatus): DroneStatus[] {
  if (status === 'AVAILABLE') return ['MAINTENANCE', 'INACTIVE', 'RETIRED']
  if (status === 'MAINTENANCE') return ['AVAILABLE', 'RETIRED']
  if (status === 'INACTIVE') return ['AVAILABLE', 'RETIRED']
  return []
}

export const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có'
export const dateOnly = (value: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa có'

export function droneError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      'Drone.CodeAlreadyExists': 'Mã drone đã được dùng cho drone khác.',
      'Drone.SerialNumberAlreadyExists': 'Số serial đã được dùng cho drone khác.',
      'Drone.RegistrationNumberAlreadyExists': 'Số đăng ký đã được dùng cho drone khác.',
      'Drone.InvalidStatusTransition': 'Không thể chuyển sang trạng thái này từ trạng thái hiện tại. Hãy tải lại và kiểm tra.',
      'Drone.InvalidNextMaintenanceTime': 'Lịch bảo trì kế tiếp phải ở thời điểm trong tương lai.',
      'Drone.NextMaintenanceNotApplicable': 'Chỉ nhập lịch bảo trì kế tiếp khi hoàn tất bảo trì (chuyển từ Bảo trì sang Sẵn sàng).',
      'Drone.HasBlockingMission': 'Drone đang được gán cho nhiệm vụ bay (chưa hoàn tất), chưa thể chuyển sang trạng thái này.',
      'Drone.MaintenanceConflict': 'Đã có bản ghi bảo trì khác đang mở cho drone này. Tải lại và kiểm tra.',
      'Drone.NotFound': 'Drone không còn tồn tại trong hệ thống. Hãy tải lại danh sách.',
    }
    if (error.code && messages[error.code]) return messages[error.code]
    if (error.code === 'Drone.VersionConflict' || (error.status === 409 && error.code?.includes('ConcurrentUpdate'))) return 'Drone đã được cập nhật bởi người khác. Tải lại và kiểm tra trước khi tiếp tục.'
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.'
}
