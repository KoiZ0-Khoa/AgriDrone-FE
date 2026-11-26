import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { session, restoring } = useAuth()
  const location = useLocation()

  // Chờ khôi phục phiên bằng refresh cookie (mở tab mới / tải lại sau khi token hết hạn) trước khi đá về /login.
  if (!session && restoring) return <CommonState type="loading" title="Đang khôi phục phiên đăng nhập" />
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <Outlet />
}
