import { ApiError } from '../../api/client'
import type { ExistingFarmIntake, Manager, NewFarmIntake, PublicIntake, ReviewChecklist, ReviewCode } from './types'

export const requestStatusLabels: Record<string, string> = { SUBMITTED: 'Chờ xét duyệt', UNDER_REVIEW: 'Đang xét duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', WITHDRAWN: 'Đã rút' }
export const requestKindLabels: Record<string, string> = { NEW_CUSTOMER: 'Khách hàng mới', EXISTING_TENANT_NEW_FARM: 'Nông trại mới', EXISTING_FARM_SURVEY: 'Khảo sát nông trại hiện có' }
export const managerLabels: Record<string, string> = { ACTIVE: 'Hoạt động', SUSPENDED: 'Đình chỉ', AVAILABLE: 'Sẵn sàng', UNAVAILABLE: 'Chưa sẵn sàng', PENDING: 'Chờ xác minh', QUALIFIED: 'Đủ điều kiện', REVOKED: 'Đã thu hồi' }
export const serviceLabels: Record<string, string> = { ACTIVE: 'Đang cung cấp', EXPERIMENTAL: 'Thử nghiệm', RETIRED: 'Ngừng cung cấp' }
export const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có'
export const priceLabel = (amount: number, currency: string) => `${new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount)}/trụ`
export function isEligibleManager(manager: Manager, now = Date.now()) {
  return manager.status === 'ACTIVE' && manager.availability === 'AVAILABLE' && manager.qualificationStatus === 'QUALIFIED' && manager.qualificationExpiresAt !== null && Date.parse(manager.qualificationExpiresAt) > now
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
export const checklistVersion = 'survey-request-review.v6'
export const reviewLabels: Record<ReviewCode, string> = {
  'contact-valid': 'Thông tin liên hệ hợp lệ',
  'dragon-fruit-farm-confirmed': 'Xác nhận đây là nông trại thanh long',
  'service-area-supported': 'Nông trại thuộc khu vực hỗ trợ',
  'candidate-location-sufficient': 'Vị trí cung cấp đủ để xét duyệt sơ bộ, chưa phải ranh giới được xác minh',
  'consent-feasibility': 'Có khả năng thu thập văn bản đồng ý sử dụng dữ liệu',
  'flight-permission-feasibility': 'Có khả năng xin giấy phép bay',
}
export function reviewChecklist(version: string, values: Partial<ReviewChecklist>, approve: boolean): ReviewChecklist {
  if (version !== checklistVersion) throw new Error('Checklist đã thay đổi. Tải lại yêu cầu trước khi xét duyệt.')
  const answers = Object.fromEntries(Object.keys(reviewLabels).map(code => [code, values[code as ReviewCode] === true])) as Record<ReviewCode, boolean>
  if (approve && Object.values(answers).some(value => !value)) throw new Error('Cần xác nhận đủ sáu điều kiện trước khi phê duyệt.')
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
// Keep the key for a retry of the same payload; edited submissions are separate operations.
export function operationFor(previous: { payload: string; key: string } | null, body: unknown) {
  const payload = JSON.stringify(body)
  return previous?.payload === payload ? previous : { payload, key: crypto.randomUUID() }
}
