import type { AppointmentBody, AssignedOrder, OrderScope } from './orderTypes'
import type { ConfirmPricingBody } from './orderTypes'
import type { FarmContext } from './farmOperationsApi'
import type { GeoJsonPolygon } from '../farms/types'
import type { CaptureSample, CaptureSession, OrthophotoBody } from './orderTypes'

export const orderStatusLabels: Record<string, string> = {
  AWAITING_BASELINE_DEPOSIT: 'Chờ thanh toán cọc bản đồ nền',
  PENDING_BOUNDARY_VERIFICATION: 'Chờ xác minh ranh giới', AWAITING_BASELINE_APPOINTMENT: 'Chờ lịch khảo sát bản đồ',
  AWAITING_BOUNDARY_CAPTURE: 'Chờ thu thập ranh giới', BASELINE_READY: 'Sẵn sàng bay bản đồ', BASELINE_IN_PROGRESS: 'Đang bay bản đồ', AWAITING_BASELINE_REVIEW: 'Chờ duyệt bản đồ',
  AWAITING_PRICING: 'Chờ xác nhận số trụ và giá', AWAITING_PAID_APPOINTMENT: 'Chờ lịch dịch vụ', AWAITING_PAYMENT: 'Chờ thanh toán', READY_FOR_PAID_SERVICE: 'Sẵn sàng dịch vụ', IN_PROGRESS: 'Đang thực hiện', PENDING_REVIEW: 'Chờ duyệt kết quả', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
}
export const appointmentStatusLabels: Record<string, string> = { PROPOSED: 'Chờ Owner xác nhận', CONFIRMED: 'Đã xác nhận', RESCHEDULE_REQUESTED: 'Owner yêu cầu đổi lịch', SUPERSEDED: 'Đã có lịch thay thế', CANCELLED: 'Đã hủy' }
export const baselineStageNotices: Record<string, { type: 'info' | 'warning'; title: string; description: string }> = {
  AWAITING_BASELINE_DEPOSIT: { type: 'info', title: 'Chờ Owner thanh toán cọc bản đồ nền', description: 'Sau khi khoản cọc được xác nhận, đơn chuyển sang bước chuẩn bị bay khảo sát bản đồ nền.' },
  BASELINE_READY: { type: 'info', title: 'Đơn đã chuyển sang bước chuẩn bị bay bản đồ nền', description: 'Kiểm tra lịch hẹn, điều kiện vận hành và phạm vi khảo sát dự kiến trước khi thực hiện chuyến bay. Ranh giới chính thức sẽ được xác lập từ ảnh trực giao sau chuyến bay.' },
  BASELINE_IN_PROGRESS: { type: 'info', title: 'Đang khảo sát và xử lý ảnh bản đồ nền', description: 'Khi ảnh trực giao đã sẵn sàng để xét duyệt, Manager sẽ xác minh ranh giới của nông trại.' },
  AWAITING_BASELINE_REVIEW: { type: 'info', title: 'Chờ xác minh ranh giới từ ảnh trực giao', description: 'Đối chiếu ảnh đã xử lý, xác nhận bốn góc ranh giới, rồi kiểm tra các trụ và ngoại lệ trước khi công bố bản đồ nền.' },
  AWAITING_BOUNDARY_CAPTURE: { type: 'warning', title: 'Đơn thuộc quy trình thu thập ranh giới cũ', description: 'Các điểm GNSS đã lưu được giữ trong lịch sử. Liên hệ quản trị hệ thống để tiếp tục đơn theo quy trình xác lập ranh giới từ ảnh trực giao.' },
}
export function matchingOrderSnapshot(order: AssignedOrder, scope: OrderScope) {
  return order.surveyOrderId === scope.surveyOrderId && order.farmId === scope.farmId && order.tenantId === scope.tenantId && order.orderVersion === scope.orderVersion && order.status === scope.orderStatus && order.requiresBaselineMapping === scope.requiresBaselineMapping && Number.isSafeInteger(scope.orderVersion) && scope.orderVersion > 0
}

export function pricingSnapshotError(order: AssignedOrder, scope: OrderScope, farm: FarmContext): string | null {
  if (!matchingOrderSnapshot(order, scope) || scope.orderVersion > 4294967295) return 'Dữ liệu đơn không đồng nhất. Đóng biểu mẫu và tải lại trước khi xác nhận.'
  if (scope.orderStatus !== 'AWAITING_PRICING') return 'Đơn chưa ở bước xác nhận số trụ và giá.'
  if (farm.farmId !== scope.farmId || farm.tenantId !== scope.tenantId) return 'Thông tin nông trại không khớp đơn khảo sát.'
  if (!['ACTIVE', '0'].includes(String(farm.status).toUpperCase())) return 'Nông trại không còn hoạt động.'
  if (!scope.currentApprovedBoundary) return 'Cần xác minh ranh giới và phạm vi khảo sát trước khi xác nhận giá.'
  const map = farm.publishedBaseMap
  if (!map || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(map.id) || map.id === '00000000-0000-0000-0000-000000000000' || !Number.isSafeInteger(map.versionNumber) || map.versionNumber < 1) return 'Chưa có bản đồ nền đã phát hành hợp lệ. Hoàn tất duyệt và phát hành bản đồ trước.'
  if (!map.sourceSurveyOrderId || (map.sourceSurveyOrderId === scope.surveyOrderId) !== scope.requiresBaselineMapping) return 'Bản đồ hiện hành không khớp nguồn khảo sát của đơn. Đóng biểu mẫu và tải lại để kiểm tra.'
  return null
}

export function pricingConfirmationBody(order: AssignedOrder, scope: OrderScope, farm: FarmContext, evidence: string): ConfirmPricingBody {
  const problem = pricingSnapshotError(order, scope, farm)
  if (problem) throw new Error(problem)
  const evidenceReference = evidence.trim()
  if (!evidenceReference || evidenceReference.length > 1000) throw new Error('Nhập bằng chứng xác nhận từ 1 đến 1.000 ký tự.')
  return { expectedFarmBaseMapVersionId: farm.publishedBaseMap!.id, evidenceReference, expectedOrderVersion: scope.orderVersion }
}

function isValidScheduledDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// Sends the chosen day as-is; BE (SurveyAppointmentWindow.TryResolveForDate) resolves it to the
// full Asia/Ho_Chi_Minh day Prepare Mission Set expects, so FE no longer does its own UTC/timezone math.
export function appointmentBody(order: AssignedOrder, scope: OrderScope, scheduledDate: string): AppointmentBody {
  if (!matchingOrderSnapshot(order, scope)) throw new Error('Dữ liệu đơn không đồng nhất hoặc thiếu version. Tải lại trước khi đề xuất lịch.')
  const purpose = scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' && scope.requiresBaselineMapping ? 'BASELINE_MAPPING' : scope.orderStatus === 'AWAITING_PAID_APPOINTMENT' ? 'PAID_SERVICE' : null
  if (!purpose) throw new Error('Trạng thái đơn chưa cho phép đề xuất lịch.')
  if (order.currentAppointmentId && (order.currentAppointmentStatus !== 'RESCHEDULE_REQUESTED' || !Number.isSafeInteger(order.currentAppointmentVersion) || order.currentAppointmentVersion! < 1)) throw new Error('Đơn đã có lịch đang hoạt động hoặc thiếu version lịch. Tải lại để kiểm tra.')
  if (!order.currentAppointmentId && order.currentAppointmentVersion !== null) throw new Error('Dữ liệu lịch không đồng nhất. Tải lại trước khi tiếp tục.')
  if (!isValidScheduledDate(scheduledDate)) throw new Error('Chọn ngày khảo sát hợp lệ.')
  return { purpose, scheduledDate, expectedOrderVersion: scope.orderVersion, expectedCurrentAppointmentId: order.currentAppointmentId, expectedCurrentAppointmentVersion: order.currentAppointmentVersion }
}

export function polygonFromPoints(points: { longitude: number; latitude: number }[], interiorRings: number[][][] = []): GeoJsonPolygon {
  if (points.length < 3 || points.some(point => !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude) || point.longitude < -180 || point.longitude > 180 || point.latitude < -90 || point.latitude > 90)) throw new Error('Nhập ít nhất ba điểm ranh giới với kinh độ, vĩ độ hợp lệ.')
  const coordinates = points.map(point => [point.longitude, point.latitude])
  if (new Set(coordinates.map(point => point.join(','))).size < 3) throw new Error('Ranh giới cần ít nhất ba điểm khác nhau.')
  const first = coordinates[0], last = coordinates.at(-1)!
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first])
  return { type: 'Polygon', coordinates: [coordinates, ...interiorRings] }
}

export function matchingCapture(scope: OrderScope, session: CaptureSession) {
  return session.surveyOrderId === scope.surveyOrderId && session.farmId === scope.farmId && session.orderVersion === scope.orderVersion && Number.isSafeInteger(session.sessionVersion) && session.sessionVersion >= 0
}
export function orthophotoBody(scope: OrderScope, points: { longitude: number; latitude: number }[], reason?: string, evidenceReference?: string): OrthophotoBody {
  if (!Number.isSafeInteger(scope.orderVersion) || scope.orderVersion < 1 || !['AWAITING_BASELINE_REVIEW', 'PENDING_BOUNDARY_VERIFICATION'].includes(scope.orderStatus)) throw new Error('Trạng thái đơn hoặc phiên bản chưa cho phép đánh dấu ranh giới trên ảnh trực giao.')
  polygonFromPoints(points)
  if (points.length !== 4 || new Set(points.map(p => `${p.longitude},${p.latitude}`)).size !== 4) throw new Error('Cần đúng bốn góc khác nhau, theo thứ tự quanh nông trại.')
  return { expectedOrderVersion: scope.orderVersion, corners: points.map((point, index) => ({ sequence: index + 1, ...point })), reason: reason?.trim() || null, evidenceReference: evidenceReference?.trim() || null }
}
export function parseCaptureSamples(json: string, existing: CaptureSample[] = []): CaptureSample[] {
  let input: unknown
  try { input = JSON.parse(json) } catch { throw new Error('Tệp điểm GPS không phải JSON hợp lệ.') }
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) throw new Error('Mỗi lần đồng bộ cần từ 1 đến 500 điểm GPS.')
  const ids = new Set<string>(), sequences = new Set<number>()
  return input.map(value => {
    if (!value || typeof value !== 'object') throw new Error('Dữ liệu điểm GPS không hợp lệ.')
    const p = value as CaptureSample
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.clientOperationId ?? '') || !Number.isSafeInteger(p.sequenceNumber) || p.sequenceNumber < 0 || !Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180 || !Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90 || !Number.isFinite(p.horizontalAccuracyMeters) || p.horizontalAccuracyMeters < 0.01 || p.horizontalAccuracyMeters > 1000 || typeof p.capturedAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(p.capturedAt) || !Number.isFinite(Date.parse(p.capturedAt))) throw new Error('Kiểm tra mã điểm, thứ tự, kinh độ, vĩ độ, sai số GPS và thời gian đo có múi giờ trong tệp.')
    if (ids.has(p.clientOperationId) || sequences.has(p.sequenceNumber)) throw new Error('Tệp có mã điểm hoặc số thứ tự trùng nhau.')
    ids.add(p.clientOperationId); sequences.add(p.sequenceNumber)
    const sample = { clientOperationId: p.clientOperationId, sequenceNumber: p.sequenceNumber, latitude: p.latitude, longitude: p.longitude, horizontalAccuracyMeters: p.horizontalAccuracyMeters, capturedAt: new Date(p.capturedAt).toISOString() }
    const previous = existing.find(item => item.clientOperationId === sample.clientOperationId || item.sequenceNumber === sample.sequenceNumber)
    if (previous && (previous.clientOperationId !== sample.clientOperationId || previous.sequenceNumber !== sample.sequenceNumber || previous.longitude !== sample.longitude || previous.latitude !== sample.latitude || previous.horizontalAccuracyMeters !== sample.horizontalAccuracyMeters || Date.parse(previous.capturedAt) !== Date.parse(sample.capturedAt))) throw new Error('Điểm đã đồng bộ có nội dung khác. Không thể dùng lại mã điểm hoặc số thứ tự.')
    return sample
  })
}
