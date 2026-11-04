import { ApiError } from '../../api/client'
import type { ExistingFarmIntake, Manager, NewFarmIntake, PublicIntake, ReviewChecklist, ReviewCode } from './types'

export const requestStatusLabels: Record<string, string> = { SUBMITTED: 'Chờ xét duyệt', UNDER_REVIEW: 'Đang xét duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', WITHDRAWN: 'Đã rút' }
export const requestKindLabels: Record<string, string> = { NEW_CUSTOMER: 'Khách hàng mới', EXISTING_TENANT_NEW_FARM: 'Nông trại mới', EXISTING_FARM_SURVEY: 'Khảo sát nông trại hiện có' }
export const managerLabels: Record<string, string> = { ACTIVE: 'Hoạt động', SUSPENDED: 'Đình chỉ', AVAILABLE: 'Sẵn sàng', UNAVAILABLE: 'Chưa sẵn sàng' }
export const serviceLabels: Record<string, string> = { ACTIVE: 'Đang cung cấp', EXPERIMENTAL: 'Thử nghiệm', RETIRED: 'Ngừng cung cấp' }
export const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có'
// A Propose Appointment window is always a whole Asia/Ho_Chi_Minh day (00:00 -> 00:00 the next day), matching MissionScheduleWindow.ForDate.
// Show it as that one day instead of a range that visually crosses into the next calendar date.
export function appointmentWindowLabel(startAt: string, endAt: string): string {
  const start = Date.parse(startAt), end = Date.parse(endAt)
  const isFullDay = Number.isFinite(start) && Number.isFinite(end) && end - start === 24 * 3600_000 && (start + 7 * 3600_000) % (24 * 3600_000) === 0
  if (!isFullDay) return `${dateTime(startAt)} – ${dateTime(endAt)}`
  return `Ngày ${new Date(start).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (cả ngày, giờ Việt Nam)`
}
const vnDateOnlyLabel = (value: string) => { const [year, month, day] = value.split('-'); return `${Number(day)}/${Number(month)}/${year}` }
// Prefer BE's own ScheduledDate/ScheduledStartDate/ScheduledEndDate (SurveyAppointmentWindow.ToLocalDates) over deriving the day
// from raw UTC timestamps on the FE; fall back to the UTC-derived label only for older windows BE could not resolve to a clean day.
export function appointmentScheduleLabel(scheduledDate: string | null, scheduledStartDate: string | null, scheduledEndDate: string | null, startAt: string, endAt: string): string {
  if (scheduledDate) return `Ngày ${vnDateOnlyLabel(scheduledDate)} (giờ Việt Nam)`
  if (scheduledStartDate && scheduledEndDate) return `${vnDateOnlyLabel(scheduledStartDate)} – ${vnDateOnlyLabel(scheduledEndDate)} (giờ Việt Nam)`
  return appointmentWindowLabel(startAt, endAt)
}
export const priceLabel = (amount: number, currency: string) => `${new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount)}/trụ`
export function isEligibleManager(manager: Manager) {
  return manager.status === 'ACTIVE' && manager.availability === 'AVAILABLE'
}
export function workflowError(error: unknown) {
  if (error instanceof ApiError && !error.code && [502, 503, 504].includes(error.status) && ['Không thể xử lý yêu cầu.', 'Bad Gateway', 'Service Unavailable', 'Gateway Timeout'].includes(error.message)) return 'Chưa kết nối được máy chủ. Vui lòng thử lại sau.'
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      'Payment.ActivePaymentExists': 'Đơn đã có giao dịch đang xử lý. Kiểm tra lịch sử trước khi thanh toán tiếp.',
      'Payment.OrderNotReady': 'Đơn chưa đủ điều kiện thanh toán. Kiểm tra lịch hẹn đã xác nhận và giá của đơn.',
      'Payment.ProviderUnavailable': 'Chưa kết nối được cổng thanh toán. Vui lòng thử lại sau.',
      'SurveyAppointment.ActivePaymentBlocksReschedule': 'Đơn đã có giao dịch đang hiệu lực nên chưa thể đổi lịch dịch vụ.',
      'SurveyRequest.FarmProfileIncomplete': 'Thông tin nông trại chưa đầy đủ hoặc chưa hợp lệ. Cần có tên, địa chỉ, diện tích lớn hơn 0 và tọa độ tâm hợp lệ. Nhờ Manager phụ trách cập nhật trước khi gửi yêu cầu khảo sát.',
      'SurveyRequest.ApplicantProfileIncomplete': 'Hồ sơ chủ đơn vị thiếu họ tên, email hoặc số điện thoại hợp lệ. Cập nhật hồ sơ tài khoản trước khi gửi yêu cầu.',
      'SurveyRequest.IdempotencyPayloadMismatch': 'Nội dung yêu cầu khác với lần gửi trước nhưng đang dùng lại cùng mã gửi. Tải lại biểu mẫu và kiểm tra trước khi gửi lại.',
      'SurveyRequest.Duplicate': 'Một lượt gửi cùng yêu cầu đang được xử lý. Chờ một lúc rồi thử lại.',
      'SurveyRequest.RequestNumberConflict': 'Chưa cấp được mã yêu cầu khảo sát. Vui lòng thử lại.',
      'SurveyRequest.TenantCodeUnavailable': 'Mã đơn vị đã được sử dụng hoặc giữ chỗ bởi yêu cầu khác. Chọn mã khác trước khi gửi lại.',
    }
    if (error.code && messages[error.code]) return messages[error.code]
    if (error.status === 409 && (error.code?.endsWith('VersionConflict') || error.code?.includes('ConcurrentUpdate'))) return 'Dữ liệu đã được cập nhật. Tải lại và kiểm tra trước khi tiếp tục.'
  }
  if (error instanceof ApiError && error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (error instanceof TypeError) return 'Không kết nối được máy chủ. Hãy kiểm tra kết nối và thử lại.'
  return error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.'
}
export const checklistVersion = 'survey-request-review.v7'
export const reviewLabels: Record<ReviewCode, string> = {
  'contact-valid': 'Thông tin liên hệ hợp lệ',
  'dragon-fruit-farm-confirmed': 'Xác nhận đây là nông trại thanh long',
  'service-area-supported': 'Nông trại thuộc khu vực hỗ trợ',
  'candidate-location-sufficient': 'Vị trí cung cấp đủ để xét duyệt sơ bộ, chưa phải ranh giới được xác minh',
}
export function reviewChecklist(version: string, values: Partial<ReviewChecklist>, approve: boolean): ReviewChecklist {
  if (version !== checklistVersion) throw new Error('Checklist đã thay đổi. Tải lại yêu cầu trước khi xét duyệt.')
  const answers = Object.fromEntries(Object.keys(reviewLabels).map(code => [code, values[code as ReviewCode] === true])) as Record<ReviewCode, boolean>
  if (approve && Object.values(answers).some(value => !value)) throw new Error('Cần xác nhận đủ bốn điều kiện trước khi phê duyệt.')
  return { ...answers, notes: values.notes?.trim() || null }
}
export function validateIntake(body: NewFarmIntake) {
  if (!Number.isFinite(body.longitude) || body.longitude < -180 || body.longitude > 180 || !Number.isFinite(body.latitude) || body.latitude < -90 || body.latitude > 90) throw new Error('Tọa độ nông trại chưa hợp lệ.')
  if (!(body.approximateAreaHa > 0 && body.approximateAreaHa < 100_000_000)) throw new Error('Diện tích nông trại phải lớn hơn 0.')
  validateRequestWindow(body)
}
export function validatePublicTenant(body: Pick<PublicIntake, 'tenantCode' | 'tenantName'>) {
  if (!body.tenantCode.trim() || body.tenantCode.trim().length > 50 || !body.tenantName.trim() || body.tenantName.trim().length > 150) throw new Error('Nhập mã đơn vị tối đa 50 ký tự và tên đơn vị tối đa 150 ký tự.')
}
export function validateRequestWindow(body: ExistingFarmIntake) {
  if (body.estimatedPoleCount !== null && (!Number.isInteger(body.estimatedPoleCount) || body.estimatedPoleCount < 1 || body.estimatedPoleCount > 2147483647)) throw new Error('Số trụ ước tính phải là số nguyên dương hợp lệ.')
  if (Boolean(body.preferredStartAt) !== Boolean(body.preferredEndAt) || (body.preferredStartAt && body.preferredEndAt && (!Number.isFinite(Date.parse(body.preferredStartAt)) || !Number.isFinite(Date.parse(body.preferredEndAt)) || Date.parse(body.preferredEndAt) <= Date.parse(body.preferredStartAt)))) throw new Error('Hãy chọn đủ khoảng thời gian, với giờ kết thúc sau giờ bắt đầu.')
}
// Turns the single "preferred day" picked on intake into the non-binding whole Asia/Ho_Chi_Minh day BE's
// PreferredStartAt/PreferredEndAt pair expects (fixed UTC+7, no DST); empty input means no preference at all.
export function preferredWindowForDate(date: string): [string | null, string | null] {
  if (!date) return [null, null]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Chọn ngày mong muốn hợp lệ.')
  const [year, month, day] = date.split('-').map(Number)
  const calendarCheck = new Date(Date.UTC(year, month - 1, day))
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) throw new Error('Chọn ngày mong muốn hợp lệ.')
  const startAt = new Date(Date.UTC(year, month - 1, day) - 7 * 3600_000)
  return [startAt.toISOString(), new Date(startAt.getTime() + 24 * 3600_000).toISOString()]
}
// Keep the key for a retry of the same payload; edited submissions are separate operations.
export function operationFor(previous: { payload: string; key: string } | null, body: unknown) {
  const payload = JSON.stringify(body)
  return previous?.payload === payload ? previous : { payload, key: crypto.randomUUID() }
}
