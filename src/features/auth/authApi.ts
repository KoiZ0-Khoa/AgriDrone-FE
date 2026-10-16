import { apiRequest } from '../../api/client'
import type {
  ForgotPasswordResponse,
  LoginCredentials,
  LoginUserResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from './types'

export function loginUser(credentials: LoginCredentials) {
  return apiRequest<LoginUserResponse>('/api/auth/login', {
    method: 'POST',
    body: credentials,
  })
}

export function selectTenant(selectionToken: string, tenantId: string) {
  return apiRequest<LoginUserResponse>('/api/auth/select-tenant', {
    method: 'POST',
    body: { selectionToken, tenantId },
  })
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
