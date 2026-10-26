import { apiRequest } from '../../api/client'
import type { Page } from './types'
import type { AuthorizationEvidence, AuthorizationType, CaptureAuthorization, SystemOrder, SystemOrderFilters, VerifyAuthorizationValues } from './systemOrderTypes'

const orders = '/api/system-admin/survey-orders'
const authorizations = (orderId: string) => `${orders}/${encodeURIComponent(orderId)}/capture-authorizations`
export const authorizationRoutes: Record<AuthorizationType, string> = { WRITTEN_DATA_USE_CONSENT: 'consent', FLIGHT_PERMISSION: 'flight-permission' }

export function getSystemOrders(token: string, page: number, filters: SystemOrderFilters, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return apiRequest<Page<SystemOrder>>(`${orders}?${params}`, { token, signal })
}
export const getCaptureAuthorizations = (token: string, orderId: string, signal?: AbortSignal) => apiRequest<CaptureAuthorization[]>(authorizations(orderId), { token, signal })
export const getCaptureAuthorization = (token: string, orderId: string, type: AuthorizationType, signal?: AbortSignal) => apiRequest<CaptureAuthorization>(`${authorizations(orderId)}/${authorizationRoutes[type]}`, { token, signal })
export const getAuthorizationEvidence = (token: string, orderId: string, type: AuthorizationType) => apiRequest<AuthorizationEvidence>(`${authorizations(orderId)}/${authorizationRoutes[type]}/evidence-url`, { token })

export function assertAuthorization(authorization: CaptureAuthorization, orderId: string, type: AuthorizationType) {
  if (authorization.surveyOrderId !== orderId || authorization.type !== type || !authorization.id || !Number.isSafeInteger(authorization.version) || authorization.version < 0 || authorization.version > 4_294_967_295) throw new Error('Giấy tờ không khớp đơn hoặc thiếu phiên bản. Tải lại trước khi thao tác.')
}
export function authorizationForm(authorization: CaptureAuthorization, values: VerifyAuthorizationValues) {
  if (!['PENDING', 'VERIFIED'].includes(authorization.status)) throw new Error('Giấy tờ đã thu hồi không thể xác minh lại.')
  const issued = Date.parse(values.issuedAt), expires = values.expiresAt ? Date.parse(values.expiresAt) : null
  if (!Number.isFinite(issued) || (expires !== null && (!Number.isFinite(expires) || expires <= issued || expires <= Date.now()))) throw new Error('Kiểm tra ngày cấp và hạn hiệu lực. Ngày hết hạn phải sau ngày cấp và thời điểm hiện tại.')
  const form = new FormData()
  if (values.mode === 'file') {
    const file = values.file
    if (!file || file.size < 1 || file.size > 10 * 1024 * 1024 || !/\.(jpe?g|png|pdf)$/i.test(file.name)) throw new Error('Chọn file JPG, PNG hoặc PDF có dữ liệu, tối đa 10 MB.')
    form.set('File', file)
  } else if (values.mode === 'mock') {
    const reference = values.mockReference?.trim()
    if (!reference || reference.length > 200) throw new Error('Nhập mã bằng chứng giả lập, tối đa 200 ký tự.')
    form.set('MockReference', reference)
  } else throw new Error('Chọn cách cung cấp bằng chứng.')
  form.set('IssuedAt', new Date(issued).toISOString())
  if (expires !== null) form.set('ExpiresAt', new Date(expires).toISOString())
  form.set('ExpectedVersion', String(authorization.version))
  return form
}
export function verifyCaptureAuthorization(token: string, orderId: string, type: AuthorizationType, authorization: CaptureAuthorization, values: VerifyAuthorizationValues) {
  assertAuthorization(authorization, orderId, type)
  return apiRequest<CaptureAuthorization>(`${authorizations(orderId)}/${authorizationRoutes[type]}/verify`, { method: 'PUT', token, body: authorizationForm(authorization, values) })
}
export function revokeCaptureAuthorization(token: string, orderId: string, type: AuthorizationType, authorization: CaptureAuthorization, reason: string) {
  assertAuthorization(authorization, orderId, type)
  if (authorization.status !== 'VERIFIED' || !reason.trim() || reason.trim().length > 2000) throw new Error('Chỉ thu hồi giấy tờ đã xác minh; cần lý do tối đa 2.000 ký tự.')
  return apiRequest<CaptureAuthorization>(`${authorizations(orderId)}/${authorizationRoutes[type]}/revoke`, { method: 'PUT', token, body: { reason: reason.trim(), expectedVersion: authorization.version } })
}
export function evidenceDownloadUrl(authorization: CaptureAuthorization, evidence: AuthorizationEvidence) {
  if (evidence.surveyOrderId !== authorization.surveyOrderId || evidence.type !== authorization.type || evidence.evidenceReference !== authorization.evidenceReference) throw new Error('Bằng chứng đã thay đổi hoặc không khớp giấy tờ. Đóng và tải lại để kiểm tra.')
  if (evidence.isMock || !evidence.downloadUrl) return null
  const url = new URL(evidence.downloadUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Liên kết bằng chứng không hợp lệ.')
  if (!evidence.urlExpiresAt || !Number.isFinite(Date.parse(evidence.urlExpiresAt)) || Date.parse(evidence.urlExpiresAt) <= Date.now()) throw new Error('Liên kết bằng chứng đã hết hạn. Lấy liên kết mới để tiếp tục.')
  return url.href
}
