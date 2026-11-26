import type { AssignedOrder, OrderScope } from './orderTypes'
import type { CaptureAppointmentBody, CaptureNoShowBody } from './v3Types'
import type { GeoJsonPolygon } from '../farms/types'
import type { CaptureSample, CaptureSession, OrthophotoBody } from './orderTypes'
import { v3OrderStageNotices, v3OrderStatusLabels } from './v3Workflow'

// Web chỉ chạy luồng V3: nhãn và hướng dẫn theo trạng thái đơn V3. Bộ lọc trạng thái ở các trang danh sách đơn lấy từ đây.
export const orderStatusLabels: Record<string, string> = v3OrderStatusLabels
export const orderStageNotices: Record<string, { type: 'info' | 'warning'; title: string; description: string } | undefined> = v3OrderStageNotices
export const appointmentStatusLabels: Record<string, string> = { PROPOSED: 'Chờ Owner xác nhận', CONFIRMED: 'Đã xác nhận', RESCHEDULE_REQUESTED: 'Owner yêu cầu đổi lịch', SUPERSEDED: 'Đã có lịch thay thế', CANCELLED: 'Đã hủy' }
export function matchingOrderSnapshot(order: AssignedOrder, scope: OrderScope) {
  return order.surveyOrderId === scope.surveyOrderId && order.farmId === scope.farmId && order.tenantId === scope.tenantId && order.orderVersion === scope.orderVersion && order.status === scope.orderStatus && order.requiresBaselineMapping === scope.requiresBaselineMapping && Number.isSafeInteger(scope.orderVersion) && scope.orderVersion > 0
}

export const serviceIsReviewed = (scope: OrderScope) => typeof scope.serviceReviewedAt === 'string' && Number.isFinite(Date.parse(scope.serviceReviewedAt))
// After internal publication the Order leaves PENDING_REVIEW; the review page stays reachable read-only.
export const canOpenHealthReview = (serviceCode: string, scope: OrderScope) => serviceCode === 'PLANT_HEALTH' &&
  (['PENDING_REVIEW', 'COMPLETED'].includes(scope.orderStatus) || (['AWAITING_PRICING', 'AWAITING_PAYMENT'].includes(scope.orderStatus) && serviceIsReviewed(scope)))
// Lịch hẹn bay V3 (CAPTURE), khớp ProposeSurveyAppointmentCommandHandler + coordinator RecordNoShowAsync của BE.
export function currentAppointment(order: AssignedOrder) {
  return order.currentAppointmentId ? { id: order.currentAppointmentId, version: order.currentAppointmentVersion, status: order.currentAppointmentStatus } : null
}
const validVersion = (value: number | null | undefined): value is number => Number.isSafeInteger(value) && value! > 0
// Manager đề xuất lịch khi đơn chờ chốt lịch và chưa có lịch, hoặc Owner đã yêu cầu đổi lịch.
// Lịch đang PROPOSED (chờ Owner) hay CONFIRMED thì BE từ chối (ActiveAppointmentExists).
export function canProposeCaptureAppointment(order: AssignedOrder, scope: OrderScope) {
  if (!matchingOrderSnapshot(order, scope) || scope.orderStatus !== 'AWAITING_APPOINTMENT') return false
  const current = currentAppointment(order)
  return current
    ? current.status === 'RESCHEDULE_REQUESTED' && validVersion(current.version)
    : order.currentAppointmentVersion === null && order.currentAppointmentStatus === null
}
// Báo khách vắng mặt: đơn đã sẵn sàng bay và lịch đã được Owner xác nhận. BE kiểm thêm giờ vắng mặt nằm sau giờ bắt đầu lịch.
export function canRecordCaptureNoShow(order: AssignedOrder, scope: OrderScope) {
  const current = currentAppointment(order)
  return matchingOrderSnapshot(order, scope) && scope.orderStatus === 'READY_FOR_CAPTURE' && !!current && current.status === 'CONFIRMED' && validVersion(current.version)
}

function isValidScheduledDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// Sends the chosen day as-is; BE (SurveyAppointmentWindow.TryResolveForDate) resolves it to the
// full Asia/Ho_Chi_Minh day Prepare Mission Set expects, so FE no longer does its own UTC/timezone math.
export const operationsDate = (now = Date.now()) => new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
export function captureAppointmentBody(order: AssignedOrder, scope: OrderScope, scheduledDate: string, now = Date.now()): CaptureAppointmentBody {
  if (!matchingOrderSnapshot(order, scope)) throw new Error('Dữ liệu đơn không đồng nhất hoặc thiếu version. Tải lại trước khi đề xuất lịch.')
  if (!canProposeCaptureAppointment(order, scope)) throw new Error('Đơn chưa ở bước chốt lịch bay hoặc đang có lịch chờ Owner xác nhận. Tải lại để kiểm tra.')
  if (!isValidScheduledDate(scheduledDate)) throw new Error('Chọn ngày bay hợp lệ.')
  // BE (SurveyAppointmentWindow.TryResolveForDate) từ chối ngày đã qua; hôm nay thì bắt đầu từ hiện tại + 5 phút.
  if (scheduledDate < operationsDate(now) || Date.parse(`${scheduledDate}T23:55:00+07:00`) <= now) throw new Error('Chọn ngày bay từ hôm nay trở đi, còn thời gian thực hiện theo giờ Việt Nam.')
  const current = currentAppointment(order)
  return { scheduledDate, expectedOrderVersion: scope.orderVersion, expectedCurrentAppointmentId: current?.id ?? null, expectedCurrentAppointmentVersion: current?.version ?? null }
}

export type NoShowValues = { occurredAt: string; reason: string; evidenceReference: string }
// Thân yêu cầu báo vắng mặt, chưa có khóa thao tác (thêm bằng v3OperationFor lúc gửi).
export function captureNoShowBody(order: AssignedOrder, scope: OrderScope, values: NoShowValues, now = Date.now()): Omit<CaptureNoShowBody, 'operationId' | 'payloadFingerprint'> {
  if (!canRecordCaptureNoShow(order, scope)) throw new Error('Chỉ báo vắng mặt khi đơn sẵn sàng bay và lịch đã được Owner xác nhận. Tải lại để kiểm tra.')
  const occurredAt = Date.parse(values.occurredAt)
  if (!Number.isFinite(occurredAt) || occurredAt > now) throw new Error('Chọn thời điểm vắng mặt hợp lệ, không ở tương lai.')
  const reason = values.reason.trim(), evidenceReference = values.evidenceReference.trim()
  if (!reason || reason.length > 500) throw new Error('Nhập lý do từ 1 đến 500 ký tự.')
  if (!evidenceReference || evidenceReference.length > 500) throw new Error('Nhập tham chiếu bằng chứng từ 1 đến 500 ký tự.')
  const current = currentAppointment(order)!
  return { appointmentId: current.id, expectedOrderVersion: scope.orderVersion, expectedAppointmentVersion: current.version!, occurredAt: new Date(occurredAt).toISOString(), reason, evidenceReference }
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
