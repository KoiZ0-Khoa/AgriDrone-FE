import {
  ArrowRightOutlined,
  BankOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert } from 'antd'
import { Link } from 'react-router-dom'
import { checkApiHealth } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'
import * as api from './api'

const number = new Intl.NumberFormat('vi-VN')

export function SystemDashboardPage() {
  const { session } = useAuth()
  const token = session!.accessToken
  const health = useQuery({ queryKey: ['api-health'], queryFn: checkApiHealth, refetchInterval: 30_000 })
  const tenants = useQuery({ queryKey: ['system-tenants', 1], queryFn: () => api.getTenants(token, 1) })
  const users = useQuery({ queryKey: ['system-users', 1], queryFn: () => api.getUsers(token, 1) })
  const conditions = useQuery({ queryKey: ['system-plant-conditions'], queryFn: () => api.getPlantConditions(token) })
  const grades = useQuery({ queryKey: ['system-harvest-quality-grades'], queryFn: () => api.getHarvestQualityGrades(token) })
  const healthLevels = useQuery({ queryKey: ['system-health-levels'], queryFn: () => api.getHealthLevels(token) })
  const hasDataError = tenants.isError || users.isError || conditions.isError || grades.isError || healthLevels.isError

  const metrics = [
    { label: 'ĐƠN VỊ', value: tenants.data?.totalCount, detail: 'Đơn vị trên toàn hệ thống', icon: <BankOutlined /> },
    { label: 'NGƯỜI DÙNG', value: users.data?.totalCount, detail: 'Tài khoản đã được ghi nhận', icon: <TeamOutlined /> },
    { label: 'TÌNH TRẠNG CÂY', value: conditions.data?.length, detail: 'Mục đang hoạt động', icon: <MedicineBoxOutlined /> },
    { label: 'CẤP THU HOẠCH', value: grades.data?.length, detail: 'Cấp chất lượng đang dùng', icon: <TrophyOutlined /> },
  ]

  const shortcuts = [
    { to: '/system/tenants', title: 'Quản lý đơn vị', description: 'Tạo đơn vị, thay đổi trạng thái và mời Owner.', icon: <BankOutlined /> },
    { to: '/system/users', title: 'Quản lý người dùng', description: 'Kiểm tra người dùng và quyền tham gia từng đơn vị.', icon: <TeamOutlined /> },
    { to: '/system/plant-conditions', title: 'Danh mục tình trạng cây', description: 'Quản lý bệnh và các dạng tổn thương cây trồng.', icon: <MedicineBoxOutlined /> },
    { to: '/system/harvest-quality-grades', title: 'Chất lượng thu hoạch', description: 'Quản lý các cấp phân loại kết quả thu hoạch.', icon: <TrophyOutlined /> },
  ]

  return <>
    <section className="dashboard-intro" aria-labelledby="system-dashboard-title">
      <div><span className="page-kicker">SYSTEM ADMIN</span><h1 id="system-dashboard-title">Tổng quan hệ thống</h1><p>Theo dõi quy mô tài khoản, đơn vị và các danh mục nghiệp vụ dùng chung.</p></div>
      <span className={`system-state ${health.isSuccess ? 'is-online' : ''}`} aria-live="polite"><i />{health.isPending ? 'Đang kiểm tra backend' : health.isSuccess ? 'Backend đang hoạt động' : 'Không kết nối được backend'}</span>
    </section>
    {hasDataError ? <Alert className="system-dashboard-alert" type="warning" showIcon title="Một số chỉ số chưa tải được" description="Bạn vẫn có thể mở từng khu vực quản trị để thử tải lại dữ liệu." /> : null}
    <section className="farm-metrics system-metrics" aria-label="Chỉ số toàn hệ thống">
      {metrics.map(metric => <article className="stat-card" key={metric.label}><span className="system-metric-icon" aria-hidden="true">{metric.icon}</span><small>{metric.label}</small><strong>{metric.value == null ? '—' : number.format(metric.value)}</strong><span>{metric.detail}</span></article>)}
    </section>
    <section className="dashboard-panel system-shortcuts" aria-labelledby="system-shortcuts-title">
      <div className="panel-heading"><div><span className="page-kicker">TRUY CẬP NHANH</span><h2 id="system-shortcuts-title">Khu vực quản trị</h2></div><span className="panel-context">{healthLevels.data ? `${healthLevels.data.length} mức sức khỏe cây` : 'Phạm vi toàn hệ thống'}</span></div>
      <div className="system-shortcut-grid">
        {shortcuts.map(item => <Link className="system-shortcut-card" to={item.to} key={item.to}><span className="system-shortcut-icon" aria-hidden="true">{item.icon}</span><span className="system-shortcut-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRightOutlined aria-hidden="true" /></Link>)}
      </div>
    </section>
  </>
}
