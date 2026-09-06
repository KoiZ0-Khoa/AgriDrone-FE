export type TenantRole = 'OWNER' | 'TENANT_ADMIN' | 'MEMBER'
export type AppRole = 'SYSTEM_ADMIN' | TenantRole

export type TenantOptionResponse = {
  id: string
  code: string
  name: string
  role: TenantRole | 'Owner' | 'TenantAdmin' | 'Member' | 0 | 1 | 2
}

export type AuthenticationSessionResponse = {
  accessToken: string
  expiresAt: string
  tenant: TenantOptionResponse | null
}

export type TenantSelectionResponse = {
  selectionToken: string
  expiresAt: string
  tenants: TenantOptionResponse[]
}

export type LoginUserResponse = {
  email: string
  fullName: string
  phone: string | null
  session: AuthenticationSessionResponse | null
  tenantSelection: TenantSelectionResponse | null
}

export type LoginCredentials = { email: string; password: string }

export type AuthSession = {
  email: string
  fullName: string
  phone: string | null
  accessToken: string
  expiresAt: string
  tenant: { id: string; code: string; name: string } | null
  role: AppRole
}
