import { ApiError } from '../../api/client'

export function isVersionConflict(error: unknown) {
  return error instanceof ApiError && (error.code === 'Farm.ConcurrentUpdate' || error.code === 'FarmZone.ConcurrentUpdate')
}

export function managementError(error: unknown) {
  if (isVersionConflict(error)) return 'Dữ liệu đã được người khác cập nhật. Hãy tải bản mới, kiểm tra lại rồi xác nhận.'
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này. Sửa khu vực cần Owner hoặc người được phân công quản lý khu vực; lưu trữ chỉ dành cho Owner.'
    if (error.status === 404) return 'Nông trại hoặc khu vực không còn tồn tại trong phạm vi truy cập. Hãy quay lại danh sách.'
    if (error.code === 'Farm.ActiveDependenciesExist') return 'Chưa thể lưu trữ nông trại. Hãy lưu trữ các khu vực còn lại và hoàn tất nhiệm vụ bay, công việc đang mở trước.'
    if (error.code === 'FarmZone.ActiveDependenciesExist') return 'Chưa thể lưu trữ khu vực vì còn nhiệm vụ bay hoặc công việc đang mở.'
    if (error.code === 'FarmZone.BoundaryOverlaps') return 'Ranh giới khu vực chồng lấn với khu vực đang hoạt động khác.'
    if (error.code === 'FarmZone.BoundaryOutsideFarm') return 'Ranh giới khu vực phải nằm trong ranh giới nông trại.'
  }
  return error instanceof Error ? error.message : 'Không thể lưu thay đổi. Vui lòng thử lại.'
}
