import { apiRequest } from '../../api/client'
import type { LoginCredentials, LoginUserResponse } from './types'

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
