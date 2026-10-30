import { ApiError } from '../../api/client'
import type { PreflightChecklistStatus } from './checklistTypes'

export const checklistStatusLabels: Record<PreflightChecklistStatus, string> = {
  DRAFT: 'Bản nháp',
  ACTIVE: 'Đang áp dụng',
  RETIRED: 'Đã ngừng dùng',
}
export const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có'

export function checklistError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      'MissionPreflight.ChecklistAlreadyExists': 'Checklist dùng chung đã được tạo trước đó. Hãy thêm hoặc sửa điều kiện thay vì tạo mới.',
      'MissionPreflight.ChecklistNotFound': 'Chưa có checklist nào được tạo. Hãy tạo checklist trước.',
      'MissionPreflight.InvalidConditionChange': 'Khóa cần xóa không còn tồn tại trong checklist hiện hành. Tải lại và kiểm tra.',
      'MissionPreflight.InvalidDefinition': 'Khóa phải là duy nhất, tối đa 100 ký tự và câu hỏi không được để trống.',
      'MissionPreflight.ConcurrentDefinitionUpdate': 'Một quản trị viên khác vừa thay đổi checklist. Tải lại và kiểm tra trước khi tiếp tục.',
    }
    if (error.code && messages[error.code]) return messages[error.code]
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  }
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.'
}
