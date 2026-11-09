import { ApiError } from '../../api/client'
import type { PlantHealthStatus } from './plantHealthMapTypes'

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
