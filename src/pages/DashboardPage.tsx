import { ArrowRightOutlined, BorderOutlined, EnvironmentOutlined, HomeOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { checkApiHealth } from '../api/client'
import { CommonState } from '../components/CommonState'
import { DashboardHeading, DashboardMetric, DashboardSectionHeading, DashboardState, dashboardNumber } from '../components/dashboard/DashboardUI'
import { useAuth } from '../features/auth/AuthContext'
import { getFarms } from '../features/farms/farmsApi'
import { workflowError } from '../features/surveys/workflow'
import { farmPageSummary } from './dashboardData'

export function DashboardPage() {
  const { session } = useAuth()
  const tenantId = session?.tenant?.id
  const canManage = session?.role === 'OWNER' || session?.role === 'TENANT_ADMIN'
  const owner = session?.role === 'OWNER'
  const health = useQuery({ queryKey: ['api-health'], queryFn: checkApiHealth, enabled: Boolean(session), refetchInterval: 30_000 })
  const farms = useQuery({ queryKey: ['farms', tenantId, 1], queryFn: ({ signal }) => getFarms(session!.accessToken, 1, 20, signal), enabled: Boolean(tenantId && canManage) })

  if (!session) return null
  if (!session.tenant) return <CommonState type="forbidden" description="Chọn đơn vị làm việc để mở tổng quan nông trại." />

  const healthStatus = health.isPending ? 'loading' : health.isSuccess ? 'online' : 'offline'
  const refreshing = health.isFetching || farms.isFetching
  const refresh = () => { void Promise.all([health.refetch(), ...(canManage ? [farms.refetch()] : [])]) }
  const firstName = session.fullName.trim().split(/\s+/).at(-1) ?? session.fullName

  // The current BE no longer exposes tenant-member or personal farm-assignment reads.
  if (!canManage) return <div className="workspace-dashboard dw-tenant">
    <DashboardHeading title={'Chào ' + firstName} description={session.tenant.name} health={healthStatus} refreshing={refreshing} refresh={refresh} />
    <section className="dw-panel"><DashboardState empty="Phân công chưa khả dụng"><p>Phiên bản hiện tại chưa hỗ trợ xem phân công thành viên. Liên hệ quản trị viên để được hỗ trợ.</p><Link className="dw-text-link" to="/account">Tài khoản của tôi <ArrowRightOutlined aria-hidden="true" /></Link></DashboardState></section>
  </div>

  const visibleFarms = farms.data?.items ?? []
  const summary = farmPageSummary(visibleFarms)

  return <div className="workspace-dashboard dw-tenant">
    <DashboardHeading title={'Chào ' + firstName} description={session.tenant.name} health={healthStatus} refreshing={refreshing} refresh={refresh} action={<Link className="dw-button dw-button-primary" to={owner ? '/survey-requests/new' : '/farms'}>{owner ? <PlusOutlined aria-hidden="true" /> : <HomeOutlined aria-hidden="true" />}{owner ? 'Đăng ký khảo sát' : 'Xem nông trại'}</Link>} />

    {farms.isError ? <div className="dw-notice" role="alert"><span>Chưa tải được nông trại.</span><button type="button" className="dw-text-button" onClick={refresh}>Tải lại</button></div> : null}

    <section className="dw-metrics" aria-label="Chỉ số trong phạm vi làm việc">
      <DashboardMetric label="Nông trại" value={farms.data?.totalCount} detail="" icon={<HomeOutlined />} to="/farms" loading={farms.isPending} error={farms.isError} />
      <DashboardMetric label="Diện tích ghi nhận" value={farms.data ? summary.area : null} suffix="ha" detail={'Từ ' + summary.knownAreas + ' nông trại'} icon={<BorderOutlined />} to="/farms" loading={farms.isPending} error={farms.isError} />
      <DashboardMetric label="Đã có ranh giới" value={farms.data ? summary.withBoundary : null} detail={'Trong ' + visibleFarms.length + ' nông trại đã tải'} icon={<EnvironmentOutlined />} to="/farms" loading={farms.isPending} error={farms.isError} />
    </section>

    <div className="dw-main-grid">
      <section className="dw-panel dw-farm-panel">
        <DashboardSectionHeading title="Nông trại của bạn" to="/farms" />
        {!farms.data && farms.isPending ? <DashboardState loading empty="" /> : !farms.data && farms.isError ? <DashboardState error={workflowError(farms.error)} empty="" retry={() => { void farms.refetch() }} /> : !visibleFarms.length ? <DashboardState empty="Chưa có nông trại"><p>{owner ? 'Gửi yêu cầu khảo sát để bắt đầu.' : 'Nông trại sẽ xuất hiện sau khi hoàn tất tiếp nhận.'}</p>{owner ? <Link className="dw-text-link" to="/survey-requests/new">Đăng ký khảo sát <ArrowRightOutlined aria-hidden="true" /></Link> : null}</DashboardState> : <div className="dw-farm-list">{visibleFarms.slice(0, 4).map(farm => <Link className="dw-farm-row" to={'/farms/' + encodeURIComponent(farm.id)} key={farm.id}>
          <span className="dw-farm-mark" aria-hidden="true"><HomeOutlined /></span>
          <span className="dw-row-copy"><strong>{farm.name}</strong>{farm.address ? <small>{farm.address}</small> : null}</span>
          <span className="dw-farm-meta"><span className={'dw-badge ' + ([0, 'Active', 'ACTIVE'].includes(farm.status) ? 'is-green' : 'is-neutral')}>{[0, 'Active', 'ACTIVE'].includes(farm.status) ? 'Hoạt động' : 'Ngừng hoạt động'}</span>{farm.areaHectares !== null ? <small>{dashboardNumber(farm.areaHectares)} ha</small> : null}</span>
          <ArrowRightOutlined className="dw-row-arrow" aria-hidden="true" />
        </Link>)}</div>}
        {farms.data && visibleFarms.length ? <div className="dw-panel-footer"><span>{Math.min(visibleFarms.length, 4)} / {dashboardNumber(farms.data.totalCount)} nông trại</span></div> : null}
      </section>

      <aside className="dw-feature dw-feature-forest">
        <div className="dw-field-art" aria-hidden="true"><span /><span /><span /><span /><i /></div>
        <div className="dw-feature-copy"><h2>{owner ? 'Cần khảo sát nông trại?' : 'Khu vực canh tác'}</h2><p>{owner ? 'Gửi nhu cầu. Đội ngũ sẽ liên hệ và đề xuất lịch.' : 'Xem các khu vực thuộc nông trại của đơn vị.'}</p><Link className="dw-button dw-button-light" to={owner ? '/survey-requests/new' : '/zones'}>{owner ? 'Đăng ký khảo sát' : 'Xem khu vực'}<ArrowRightOutlined aria-hidden="true" /></Link></div>
      </aside>
    </div>

    <section className="dw-panel dw-bottom-panel">
      <DashboardSectionHeading title="Truy cập nhanh" />
      <div className="dw-shortcuts">
        <Link className="dw-shortcut" to="/farms"><span className="dw-shortcut-icon"><HomeOutlined aria-hidden="true" /></span><span><strong>Nông trại</strong></span><ArrowRightOutlined aria-hidden="true" /></Link>
        <Link className="dw-shortcut" to="/zones"><span className="dw-shortcut-icon"><EnvironmentOutlined aria-hidden="true" /></span><span><strong>Khu vực</strong></span><ArrowRightOutlined aria-hidden="true" /></Link>
        <Link className="dw-shortcut" to="/account"><span className="dw-shortcut-icon"><UserOutlined aria-hidden="true" /></span><span><strong>Tài khoản</strong></span><ArrowRightOutlined aria-hidden="true" /></Link>
      </div>
    </section>
    <footer className="dw-page-foot"><small>Diện tích và ranh giới tính trên {visibleFarms.length} nông trại đã tải.</small></footer>
  </div>
}
