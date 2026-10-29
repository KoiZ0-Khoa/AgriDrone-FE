import { Alert } from 'antd'
import { Link } from 'react-router-dom'
import { CommonState } from '../components/CommonState'
import { useAuth } from '../features/auth/AuthContext'

export function TeamPage() {
  const { session } = useAuth()
  if (!session?.tenant || !['OWNER', 'TENANT_ADMIN'].includes(session.role)) return <CommonState type="forbidden" />
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">{session.tenant.name}</span><h1>Thành viên đơn vị</h1></div></section>
    <section className="resource-panel">
      <Alert showIcon type="info" title="Quản lý thành viên chưa sẵn sàng" description="Danh sách, lời mời và thay đổi quyền thành viên chưa được hỗ trợ trong phiên bản hiện tại." />
      <div className="workflow-toolbar"><Link className="workflow-detail-link" to="/farms">Xem nông trại →</Link>{session.role === 'OWNER' ? <Link className="workflow-detail-link" to="/survey-payments">Xem đơn và thanh toán →</Link> : null}</div>
    </section>
  </>
}
