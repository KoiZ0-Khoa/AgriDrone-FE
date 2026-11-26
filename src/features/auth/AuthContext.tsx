import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, setAccessTokenRefresher } from '../../api/client'
import { loginUser, logoutSession, refreshSession, selectTenant as selectTenantRequest } from './authApi'
import { clearAuthSession, loadAuthSession, saveAuthSession, toAuthSession } from './authStorage'
import type { AuthSession, LoginCredentials, TenantSelectionResponse } from './types'
import { useQueryClient } from '@tanstack/react-query'
import { assertTenantSelectionFresh } from './authErrors'
import { clearSavedCheckouts } from '../surveys/checkoutStorage'

type LoginOutcome = 'authenticated' | 'tenant-selection-required'

type AuthContextValue = {
  session: AuthSession | null
  // true trong lúc thử khôi phục phiên bằng refresh cookie khi mở app/tab mới (chưa có access token trong sessionStorage).
  restoring: boolean
  tenantSelection: TenantSelectionResponse | null
  login: (credentials: LoginCredentials) => Promise<LoginOutcome>
  selectTenant: (tenantId: string) => Promise<void>
  logout: () => void
  updateProfile: (profile: { fullName: string; phone: string | null }) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Refresh sớm hơn hạn access token một chút để request đang chạy không bị 401.
const REFRESH_AHEAD_MS = 60_000
const MIN_REFRESH_DELAY_MS = 5_000

function isTransientRefreshFailure(error: unknown) {
  // 409 RefreshConflict: tab khác vừa xoay vòng cookie cùng lúc — cookie mới đã có, thử lại là được.
  return error instanceof ApiError ? error.status === 409 || error.status >= 500 : true
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AuthSession | null>(loadAuthSession)
  const [restoring, setRestoring] = useState(() => session === null)
  const [tenantSelection, setTenantSelection] = useState<TenantSelectionResponse | null>(null)
  const sessionRef = useRef(session)
  const refreshInFlight = useRef<Promise<string | null> | null>(null)

  function applySession(next: AuthSession) {
    saveAuthSession(next)
    sessionRef.current = next
    setSession(next)
  }

  function clearLocalSession() {
    clearSavedCheckouts()
    void queryClient.cancelQueries()
    queryClient.clear()
    clearAuthSession()
    sessionRef.current = null
    setSession(null)
    setTenantSelection(null)
  }

  async function runRefresh(): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const next = toAuthSession(await refreshSession())
        if (!next) throw new ApiError(401, 'Phiên làm việc không hợp lệ.')
        // Giữ thông tin hồ sơ vừa sửa trong phiên hiện tại nếu cùng tài khoản.
        const current = sessionRef.current
        applySession(current && current.email === next.email ? { ...next, fullName: current.fullName, phone: current.phone } : next)
        return next.accessToken
      } catch (error) {
        if (attempt < 1 && error instanceof ApiError && error.status === 409) {
          await new Promise(resolve => setTimeout(resolve, 300))
          continue
        }
        throw error
      }
    }
  }

  // Một lần refresh cho mọi request 401 cùng lúc (BE xoay vòng cookie, gọi song song sẽ bị coi là dùng lại token).
  function refreshAccessToken(): Promise<string | null> {
    refreshInFlight.current ??= runRefresh()
      .catch(error => {
        // Phiên thật sự hết hạn/bị thu hồi → về màn đăng nhập. Lỗi mạng/tạm thời → giữ phiên, để request sau thử lại.
        if (!isTransientRefreshFailure(error) && sessionRef.current) clearLocalSession()
        return null
      })
      .finally(() => { refreshInFlight.current = null })
    return refreshInFlight.current
  }

  useEffect(() => {
    setAccessTokenRefresher(async expiredToken => {
      const current = sessionRef.current
      if (!current) return null
      // Một request khác đã refresh xong trong lúc request này đang chạy → dùng luôn token mới.
      if (current.accessToken !== expiredToken) return current.accessToken
      return refreshAccessToken()
    })
    return () => setAccessTokenRefresher(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mở app/tab mới: sessionStorage trống nhưng refresh cookie có thể còn → khôi phục phiên không cần đăng nhập lại.
  useEffect(() => {
    if (!restoring) return
    let cancelled = false
    refreshSession()
      .then(response => {
        const next = toAuthSession(response)
        if (!cancelled && next && !sessionRef.current) applySession(next)
      })
      .catch(() => { /* Không có/hết refresh cookie → giữ trạng thái chưa đăng nhập. */ })
      .finally(() => { if (!cancelled) setRestoring(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chủ động refresh trước khi access token hết hạn.
  useEffect(() => {
    if (!session) return
    const delay = Math.max(MIN_REFRESH_DELAY_MS, Date.parse(session.expiresAt) - Date.now() - REFRESH_AHEAD_MS)
    if (!Number.isFinite(delay)) return
    const timer = setTimeout(() => { void refreshAccessToken() }, Math.min(delay, 2_147_000_000))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, session?.expiresAt])

  async function login(credentials: LoginCredentials): Promise<LoginOutcome> {
    const response = await loginUser(credentials)
    const nextSession = toAuthSession(response)

    if (nextSession) {
      queryClient.clear()
      applySession(nextSession)
      setRestoring(false)
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
    assertTenantSelectionFresh(tenantSelection)

    const response = await selectTenantRequest(tenantSelection.selectionToken, tenantId)
    const nextSession = toAuthSession(response)
    if (!nextSession) throw new Error('Không thể tạo phiên làm việc cho tenant đã chọn.')

    queryClient.clear()
    applySession(nextSession)
    setRestoring(false)
    setTenantSelection(null)
  }

  function logout() {
    // Thu hồi refresh session phía server; đăng xuất cục bộ ngay, không chờ mạng.
    void logoutSession().catch(() => undefined)
    clearLocalSession()
  }

  function updateProfile(profile: { fullName: string; phone: string | null }) {
    if (!session) return
    applySession({ ...session, ...profile })
  }

  return (
    <AuthContext value={{ session, restoring, tenantSelection, login, selectTenant, logout, updateProfile }}>
      {children}
    </AuthContext>
  )
}

export function useAuth() {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth phải được sử dụng bên trong AuthProvider.')
  return context
}
