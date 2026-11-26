import type { AppRole, AuthSession, LoginUserResponse, TenantRole } from './types'

const AUTH_STORAGE_KEY = 'agridrone.auth:v1'

const tenantRoleMap: Record<string | number, TenantRole> = {
  0: 'OWNER',
  1: 'TENANT_ADMIN',
  2: 'MEMBER',
  Owner: 'OWNER',
  TenantAdmin: 'TENANT_ADMIN',
  Member: 'MEMBER',
  OWNER: 'OWNER',
  TENANT_ADMIN: 'TENANT_ADMIN',
  MEMBER: 'MEMBER',
}

type JwtClaims = { system_role?: string | string[]; tenant_role?: string; sub?: unknown }

function readJwtClaims(token: string): JwtClaims | undefined {
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return undefined

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as JwtClaims
  } catch {
    return undefined
  }
}

function readJwtRole(token: string): AppRole | undefined {
  const claims = readJwtClaims(token)
  const systemRoles = Array.isArray(claims?.system_role) ? claims.system_role : [claims?.system_role]
  if (systemRoles.includes('SYSTEM_ADMIN')) return 'SYSTEM_ADMIN'
  if (systemRoles.includes('SYSTEM_MANAGER')) return 'SYSTEM_MANAGER'
  return claims?.tenant_role ? tenantRoleMap[claims.tenant_role] : undefined
}

export function readAuthUserId(token: string) {
  const sub = readJwtClaims(token)?.sub
  if (typeof sub !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sub) || sub === '00000000-0000-0000-0000-000000000000') return null
  return sub
}

export function toAuthSession(response: LoginUserResponse): AuthSession | null {
  if (!response.session) return null

  const tenant = response.session.tenant
  const role = tenant ? tenantRoleMap[tenant.role] : readJwtRole(response.session.accessToken)
  if (!role) return null

  return {
    email: response.email,
    fullName: response.fullName,
    phone: response.phone,
    accessToken: response.session.accessToken,
    expiresAt: response.session.expiresAt,
    tenant: tenant ? { id: tenant.id, code: tenant.code, name: tenant.name } : null,
    role,
  }
}

export function loadAuthSession(): AuthSession | null {
  try {
    const rawSession = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!rawSession) return null

    const session = JSON.parse(rawSession) as AuthSession
    if (!session.accessToken || Date.parse(session.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function saveAuthSession(session: AuthSession) {
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ứng dụng vẫn hoạt động trong bộ nhớ nếu trình duyệt chặn sessionStorage.
  }
}

export function clearAuthSession() {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // Không cần chặn đăng xuất khi trình duyệt chặn sessionStorage.
  }
}
