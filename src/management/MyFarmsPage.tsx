import { Alert } from 'antd'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { CommonState } from '../components/CommonState'

export function MyFarmsPage() {
  const { session } = useAuth()
  if (!session?.tenant) return <CommonState type="forbidden" />
  if (session.role === 'OWNER' || session.role === 'TENANT_ADMIN') return <Navigate to="/farms" replace />
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">{session.tenant.name}</span><h1>Nông trại được giao</h1></div></section>
    <section className="resource-panel">
      <Alert showIcon type="info" title="Thông tin phân công chưa sẵn sàng" description="Chức năng xem phân công hiện chưa được hỗ trợ trong phiên bản này. Liên hệ quản trị viên để kiểm tra phạm vi làm việc của bạn." />
      <div className="workflow-toolbar"><Link className="workflow-detail-link" to="/account">Xem tài khoản →</Link></div>
    </section>
  </>
}
