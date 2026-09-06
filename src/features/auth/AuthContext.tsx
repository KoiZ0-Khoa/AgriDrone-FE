import { createContext, use, useState, type ReactNode } from 'react'
import { loginUser, selectTenant as selectTenantRequest } from './authApi'
import { clearAuthSession, loadAuthSession, saveAuthSession, toAuthSession } from './authStorage'
import type { AuthSession, LoginCredentials, TenantSelectionResponse } from './types'

type LoginOutcome = 'authenticated' | 'tenant-selection-required'

type AuthContextValue = {
  session: AuthSession | null
  tenantSelection: TenantSelectionResponse | null
  login: (credentials: LoginCredentials) => Promise<LoginOutcome>
  selectTenant: (tenantId: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(loadAuthSession)
  const [tenantSelection, setTenantSelection] = useState<TenantSelectionResponse | null>(null)

  async function login(credentials: LoginCredentials): Promise<LoginOutcome> {
    const response = await loginUser(credentials)
    const nextSession = toAuthSession(response)

    if (nextSession) {
      saveAuthSession(nextSession)
      setSession(nextSession)
      setTenantSelection(null)
      return 'authenticated'
    }
    if (response.tenantSelection) {
      setTenantSelection(response.tenantSelection)
      return 'tenant-selection-required'
    }
    throw new Error('Phản hồi đăng nhập không chứa phiên làm việc hợp lệ.')
  }

  async function selectTenant(tenantId: string) {
    if (!tenantSelection) {
      throw new Error('Phiên chọn tenant đã hết hạn. Vui lòng đăng nhập lại.')
    }

    const response = await selectTenantRequest(tenantSelection.selectionToken, tenantId)
    const nextSession = toAuthSession(response)
    if (!nextSession) throw new Error('Không thể tạo phiên làm việc cho tenant đã chọn.')

    saveAuthSession(nextSession)
    setSession(nextSession)
    setTenantSelection(null)
  }

  function logout() {
    clearAuthSession()
    setSession(null)
    setTenantSelection(null)
  }

  return (
    <AuthContext value={{ session, tenantSelection, login, selectTenant, logout }}>
      {children}
    </AuthContext>
  )
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth phải được sử dụng bên trong AuthProvider.')
  return context
}
