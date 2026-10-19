import type { AppointmentBody, AssignedOrder, OrderScope } from './orderTypes'
import type { GeoJsonPolygon } from '../farms/types'

export const orderStatusLabels: Record<string, string> = {
  PENDING_BOUNDARY_VERIFICATION: 'Chờ xác minh ranh giới', AWAITING_BASELINE_APPOINTMENT: 'Chờ lịch khảo sát bản đồ',
  AWAITING_BOUNDARY_CAPTURE: 'Chờ thu thập ranh giới', BASELINE_READY: 'Sẵn sàng bay bản đồ', BASELINE_IN_PROGRESS: 'Đang bay bản đồ', AWAITING_BASELINE_REVIEW: 'Chờ duyệt bản đồ',
  AWAITING_PRICING: 'Chờ xác nhận số trụ và giá', AWAITING_PAID_APPOINTMENT: 'Chờ lịch dịch vụ', AWAITING_PAYMENT: 'Chờ thanh toán', READY_FOR_PAID_SERVICE: 'Sẵn sàng dịch vụ', IN_PROGRESS: 'Đang thực hiện', PENDING_REVIEW: 'Chờ duyệt kết quả', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
}
export const appointmentStatusLabels: Record<string, string> = { PROPOSED: 'Chờ Owner xác nhận', CONFIRMED: 'Đã xác nhận', RESCHEDULE_REQUESTED: 'Owner yêu cầu đổi lịch', SUPERSEDED: 'Đã có lịch thay thế', CANCELLED: 'Đã hủy' }
export function matchingOrderSnapshot(order: AssignedOrder, scope: OrderScope) {
  return order.surveyOrderId === scope.surveyOrderId && order.farmId === scope.farmId && order.tenantId === scope.tenantId && order.orderVersion === scope.orderVersion && order.status === scope.orderStatus && order.requiresBaselineMapping === scope.requiresBaselineMapping && Number.isSafeInteger(scope.orderVersion) && scope.orderVersion > 0
}

export function appointmentBody(order: AssignedOrder, scope: OrderScope, start: string, end: string, now = Date.now()): AppointmentBody {
  if (!matchingOrderSnapshot(order, scope)) throw new Error('Dữ liệu đơn không đồng nhất hoặc thiếu version. Tải lại trước khi đề xuất lịch.')
  const purpose = scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' && scope.requiresBaselineMapping ? 'BASELINE_MAPPING' : scope.orderStatus === 'AWAITING_PAID_APPOINTMENT' ? 'PAID_SERVICE' : null
  if (!purpose) throw new Error('Trạng thái đơn chưa cho phép đề xuất lịch.')
  if (order.currentAppointmentId && (order.currentAppointmentStatus !== 'RESCHEDULE_REQUESTED' || !Number.isSafeInteger(order.currentAppointmentVersion) || order.currentAppointmentVersion! < 1)) throw new Error('Đơn đã có lịch đang hoạt động hoặc thiếu version lịch. Tải lại để kiểm tra.')
  if (!order.currentAppointmentId && order.currentAppointmentVersion !== null) throw new Error('Dữ liệu lịch không đồng nhất. Tải lại trước khi tiếp tục.')
  const startMs = Date.parse(start), endMs = Date.parse(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= now || endMs <= startMs) throw new Error('Chọn thời gian bắt đầu trong tương lai và kết thúc sau bắt đầu.')
  return { purpose, proposedStartAt: new Date(startMs).toISOString(), proposedEndAt: new Date(endMs).toISOString(), expectedOrderVersion: scope.orderVersion, expectedCurrentAppointmentId: order.currentAppointmentId, expectedCurrentAppointmentVersion: order.currentAppointmentVersion }
}

export function polygonFromPoints(points: { longitude: number; latitude: number }[], interiorRings: number[][][] = []): GeoJsonPolygon {
  if (points.length < 3 || points.some(point => !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude) || point.longitude < -180 || point.longitude > 180 || point.latitude < -90 || point.latitude > 90)) throw new Error('Nhập ít nhất ba điểm ranh giới với kinh độ, vĩ độ hợp lệ.')
  const coordinates = points.map(point => [point.longitude, point.latitude])
  if (new Set(coordinates.map(point => point.join(','))).size < 3) throw new Error('Ranh giới cần ít nhất ba điểm khác nhau.')
  const first = coordinates[0], last = coordinates.at(-1)!
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first])
  return { type: 'Polygon', coordinates: [coordinates, ...interiorRings] }
}
