import { Navigate, Outlet } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from './AuthContext'
import { homeForRole } from './navigation'

export function SystemAdminRoute() {
  const { session } = useAuth()
  if (session && session.role !== 'SYSTEM_ADMIN') return <Navigate to={homeForRole(session.role)} replace />
  return <Outlet />
}

export function SystemManagerRoute() {
  const { session } = useAuth()
  if (session && session.role !== 'SYSTEM_MANAGER') return <Navigate to={homeForRole(session.role)} replace />
  return <Outlet />
}

export function TenantRoute() {
  const { session } = useAuth()
  if (session?.role === 'SYSTEM_ADMIN') return <Navigate to="/system" replace />
  if (session?.role === 'SYSTEM_MANAGER') return <Navigate to="/manager" replace />
  if (!session?.tenant) return <CommonState type="forbidden" description="Phiên đăng nhập chưa có phạm vi đơn vị." />
  return <Outlet />
}

export function AuthenticatedHome() {
  const { session } = useAuth()
  return <Navigate to={session ? homeForRole(session.role) : '/login'} replace />
}
