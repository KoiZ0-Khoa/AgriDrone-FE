import {
  AreaChartOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  InboxOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { checkApiHealth } from '../api/client'
import { useAuth } from '../features/auth/AuthContext'

export function DashboardPage() {
  const { session } = useAuth()
  const apiHealth = useQuery({
    queryKey: ['api-health'],
    queryFn: checkApiHealth,
    refetchInterval: 30_000,
  })

  if (!session) return null

  const apiStatus = apiHealth.isPending
    ? 'Đang kiểm tra kết nối'
    : apiHealth.isSuccess
      ? 'Hệ thống đang hoạt động'
      : 'Không kết nối được backend'

  return (
    <>
      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <div>
          <span className="page-kicker">TỔNG QUAN</span>
          <h1 id="dashboard-title">Tổng quan nông trại</h1>
          <p>Theo dõi cây trồng, nhiệm vụ bay và tình trạng vận hành trong một màn hình.</p>
        </div>
        <span className={`system-state ${apiHealth.isSuccess ? 'is-online' : ''}`} aria-live="polite">
          <i /> {apiStatus}
        </span>
      </section>

      <section className="farm-metrics" aria-label="Các chỉ số nông trại">
        <article className="stat-card">
          <small>TỔNG SỐ CÂY</small>
          <strong>—</strong>
          <span>Chưa có dữ liệu</span>
        </article>
        <article className="stat-card">
          <small>KHỎE MẠNH</small>
          <strong>—</strong>
          <span>Chưa có dữ liệu</span>
        </article>
        <article className="stat-card">
          <small>CẦN THEO DÕI</small>
          <strong>—</strong>
          <span>Chưa có dữ liệu</span>
        </article>
        <article className="stat-card">
          <small>NGHIÊM TRỌNG</small>
          <strong>—</strong>
          <span>Chưa có dữ liệu</span>
        </article>
      </section>

      <section className="dashboard-panel map-panel" aria-labelledby="map-title">
        <div className="panel-heading">
          <div>
            <span className="page-kicker">BẢN ĐỒ</span>
            <h2 id="map-title">Phân bố cây trồng</h2>
          </div>
          <span className="panel-context"><EnvironmentOutlined aria-hidden="true" /> {session.tenant?.name ?? 'Toàn hệ thống'}</span>
        </div>
        <div className="panel-empty map-empty">
          <span className="empty-icon"><GlobalOutlined aria-hidden="true" /></span>
          <strong>Chưa có dữ liệu bản đồ</strong>
          <p>Bản đồ tương tác sẽ xuất hiện khi Farm, Zone và Plant đã được đồng bộ từ backend.</p>
        </div>
      </section>

      <div className="dashboard-lower-grid">
        <section className="dashboard-panel" aria-labelledby="trend-title">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">SỨC KHỎE</span>
              <h2 id="trend-title">Xu hướng bệnh</h2>
            </div>
            <AreaChartOutlined className="panel-heading-icon" aria-hidden="true" />
          </div>
          <div className="panel-empty compact-empty">
            <span className="empty-icon"><CheckCircleOutlined aria-hidden="true" /></span>
            <strong>Chưa có dữ liệu sức khỏe</strong>
            <p>Kết quả kiểm tra chính thức sẽ được tổng hợp tại đây.</p>
          </div>
        </section>

        <section className="dashboard-panel" aria-labelledby="missions-title">
          <div className="panel-heading">
            <div>
              <span className="page-kicker">NHIỆM VỤ</span>
              <h2 id="missions-title">Nhiệm vụ gần đây</h2>
            </div>
            <RocketOutlined className="panel-heading-icon" aria-hidden="true" />
          </div>
          <div className="panel-empty compact-empty">
            <span className="empty-icon"><InboxOutlined aria-hidden="true" /></span>
            <strong>Chưa có nhiệm vụ nào</strong>
            <p>Nhiệm vụ bay mới nhất sẽ xuất hiện khi API danh sách được triển khai.</p>
          </div>
        </section>
      </div>
    </>
  )
}
