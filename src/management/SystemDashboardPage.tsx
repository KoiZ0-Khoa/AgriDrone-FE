import {
  ArrowRightOutlined,
  BankOutlined,
  FileSearchOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert } from 'antd'
import { Link } from 'react-router-dom'
import { checkApiHealth } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import * as api from './api'
import * as surveyApi from '../features/surveys/api'

const number = new Intl.NumberFormat('vi-VN')

export function SystemDashboardPage() {
  const { session } = useAuth()
  const token = session!.accessToken
  const health = useQuery({ queryKey: ['api-health'], queryFn: checkApiHealth, refetchInterval: 30_000 })
  const tenants = useQuery({ queryKey: ['system-tenants', 1], queryFn: () => api.getTenants(token, 1) })
  const managers = useQuery({ queryKey: ['system-managers', 1, {}], queryFn: ({ signal }) => surveyApi.getManagers(token, 1, {}, signal) })
  const requests = useQuery({ queryKey: ['survey-requests', 1, { status: 'SUBMITTED' }], queryFn: ({ signal }) => surveyApi.getRequests(token, 1, { status: 'SUBMITTED' }, signal) })
  const services = useQuery({ queryKey: ['survey-services'], queryFn: ({ signal }) => surveyApi.getServices(token, signal) })
  const hasDataError = tenants.isError || managers.isError || requests.isError || services.isError

  const metrics = [
    { label: 'ĐƠN VỊ', value: tenants.data?.totalCount, detail: 'Đơn vị trên toàn hệ thống', icon: <BankOutlined /> },
    { label: 'CHỜ XÉT DUYỆT', value: requests.data?.totalCount, detail: 'Yêu cầu khảo sát mới gửi', icon: <FileSearchOutlined /> },
    { label: 'SYSTEM MANAGER', value: managers.data?.totalCount, detail: 'Hồ sơ nhân sự vận hành', icon: <TeamOutlined /> },
    { label: 'DỊCH VỤ ĐANG CUNG CẤP', value: services.data?.filter(service => service.status === 'ACTIVE' && service.serviceType === 'PLANT_HEALTH').length, detail: 'Dịch vụ Plant Health đã kích hoạt', icon: <MedicineBoxOutlined /> },
  ]

  const shortcuts = [
    { to: '/system/survey-requests', title: 'Xét duyệt yêu cầu khảo sát', description: 'Kiểm tra khách hàng, chọn Manager và tạo đơn khảo sát.', icon: <FileSearchOutlined /> },
    { to: '/system/managers', title: 'Quản lý System Manager', description: 'Mời nhân sự, kiểm tra chứng chỉ và khả năng nhận việc.', icon: <TeamOutlined /> },
    { to: '/system/survey-services', title: 'Dịch vụ & đơn giá', description: 'Quản lý dịch vụ Plant Health và giá khảo sát theo trụ.', icon: <MedicineBoxOutlined /> },
    { to: '/system/tenants', title: 'Quản lý đơn vị', description: 'Kiểm tra đơn vị, trạng thái truy cập và Owner.', icon: <BankOutlined /> },
  ]

  return <>
    <section className="dashboard-intro" aria-labelledby="system-dashboard-title">
      <div><span className="page-kicker">SYSTEM ADMIN</span><h1 id="system-dashboard-title">Tổng quan hệ thống</h1><p>Theo dõi yêu cầu khảo sát, đội ngũ Manager và dịch vụ đang cung cấp.</p></div>
      <span className={`system-state ${health.isSuccess ? 'is-online' : ''}`} aria-live="polite"><i />{health.isPending ? 'Đang kiểm tra backend' : health.isSuccess ? 'Backend đang hoạt động' : 'Không kết nối được backend'}</span>
    </section>
    {hasDataError ? <Alert className="system-dashboard-alert" type="warning" showIcon title="Một số chỉ số chưa tải được" description="Bạn vẫn có thể mở từng khu vực quản trị để thử tải lại dữ liệu." /> : null}
    <section className="farm-metrics system-metrics" aria-label="Chỉ số toàn hệ thống">
      {metrics.map(metric => <article className="stat-card" key={metric.label}><span className="system-metric-icon" aria-hidden="true">{metric.icon}</span><small>{metric.label}</small><strong>{metric.value == null ? '—' : number.format(metric.value)}</strong><span>{metric.detail}</span></article>)}
    </section>
    <section className="dashboard-panel system-shortcuts" aria-labelledby="system-shortcuts-title">
      <div className="panel-heading"><div><span className="page-kicker">TRUY CẬP NHANH</span><h2 id="system-shortcuts-title">Khu vực quản trị</h2></div><span className="panel-context">Phạm vi toàn hệ thống</span></div>
      <div className="system-shortcut-grid">
        {shortcuts.map(item => <Link className="system-shortcut-card" to={item.to} key={item.to}><span className="system-shortcut-icon" aria-hidden="true">{item.icon}</span><span className="system-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRightOutlined aria-hidden="true" /></Link>)}
      </div>
    </section>
  </>
}
