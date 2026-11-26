import { ApiError, apiRequest } from '../../api/client'
import type {
  ForgotPasswordResponse,
  LoginCredentials,
  LoginUserResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from './types'

// BE (AuthController) chỉ cấp/đọc refresh cookie (HttpOnly, Path=/api/auth) khi có header này và Origin nằm trong allowlist.
export const SESSION_HEADER = { 'X-AgriDrone-Session': '1' } as const
const sessionRequest = { credentials: 'include', headers: SESSION_HEADER, skipAuthRefresh: true } as const

// Origin chưa được BE cho phép dùng cookie (RefreshSession:AllowedOrigins / Cors:AllowedOrigins chưa cấu hình):
// đăng nhập vẫn phải chạy được, chỉ là không có refresh cookie → hết hạn access token thì đăng nhập lại như trước.
function isCookieSessionRejected(error: unknown) {
  return error instanceof ApiError && error.status === 403 &&
    (error.code === 'Authentication.InvalidOrigin' || error.code === 'Authentication.SessionHeaderRequired')
}

async function withSessionCookie<T>(path: string, body: unknown) {
  try {
    return await apiRequest<T>(path, { method: 'POST', body, ...sessionRequest })
  } catch (error) {
    if (!isCookieSessionRejected(error)) throw error
    return apiRequest<T>(path, { method: 'POST', body })
  }
}

export function loginUser(credentials: LoginCredentials) {
  return withSessionCookie<LoginUserResponse>('/api/auth/login', credentials)
}

export function selectTenant(selectionToken: string, tenantId: string) {
  return withSessionCookie<LoginUserResponse>('/api/auth/select-tenant', { selectionToken, tenantId })
}

// Đổi refresh cookie lấy access token mới (BE xoay vòng cookie mỗi lần gọi).
// Chỉ cho một request refresh chạy tại một thời điểm trong tab: BE coi việc gửi lại một refresh token đã dùng là
// token bị lộ và thu hồi cả phiên, nên mọi nơi gọi cùng lúc (StrictMode, nhiều request 401) phải dùng chung kết quả.
let refreshInFlight: Promise<LoginUserResponse> | null = null
export function refreshSession() {
  refreshInFlight ??= apiRequest<LoginUserResponse>('/api/auth/refresh', { method: 'POST', ...sessionRequest })
    .finally(() => { refreshInFlight = null })
  return refreshInFlight
}

// Thu hồi refresh session phía server và xóa cookie. BE luôn trả 204, kể cả khi phiên đã hết.
export function logoutSession() {
  return apiRequest<void>('/api/auth/logout', { method: 'POST', ...sessionRequest })
}

export function forgotPassword(email: string) {
  return apiRequest<ForgotPasswordResponse>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export function resetPassword(request: ResetPasswordRequest) {
  return apiRequest<ResetPasswordResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: request,
  })
}
