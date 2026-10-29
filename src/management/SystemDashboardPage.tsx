import { readableCode } from '../components/RecordReference'
import { ArrowRightOutlined, BankOutlined, FileSearchOutlined, FileTextOutlined, MedicineBoxOutlined, TeamOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { checkApiHealth } from '../api/client'
import { DashboardHeading, DashboardMetric, DashboardSectionHeading, DashboardState, dashboardNumber } from '../components/dashboard/DashboardUI'
import { useAuth } from '../features/auth/AuthContext'
import * as surveyApi from '../features/surveys/api'
import { getSystemOrders } from '../features/surveys/systemOrderApi'
import { orderStatusLabels } from '../features/surveys/orderWorkflow'
import { dateTime, requestKindLabels, workflowError } from '../features/surveys/workflow'
import * as api from './api'

export function SystemDashboardPage() {
  const { session } = useAuth()
  const token = session!.accessToken
  const health = useQuery({ queryKey: ['api-health'], queryFn: checkApiHealth, refetchInterval: 30_000 })
  const tenants = useQuery({ queryKey: ['system-tenants', 1], queryFn: () => api.getTenants(token, 1) })
  const managers = useQuery({ queryKey: ['system-managers', 1, {}], queryFn: ({ signal }) => surveyApi.getManagers(token, 1, {}, signal) })
  const requests = useQuery({ queryKey: ['survey-requests', 1, { status: 'SUBMITTED' }], queryFn: ({ signal }) => surveyApi.getRequests(token, 1, { status: 'SUBMITTED' }, signal) })
  const reviewing = useQuery({ queryKey: ['survey-requests', 1, { status: 'UNDER_REVIEW' }], queryFn: ({ signal }) => surveyApi.getRequests(token, 1, { status: 'UNDER_REVIEW' }, signal) })
  const orders = useQuery({ queryKey: ['system-survey-orders', 1, { status: '', tenantId: '', farmId: '' }], queryFn: ({ signal }) => getSystemOrders(token, 1, {}, signal) })
  const services = useQuery({ queryKey: ['survey-services'], queryFn: ({ signal }) => surveyApi.getServices(token, signal) })
  const queries = [health, tenants, managers, requests, reviewing, orders, services]
  const refreshing = queries.some(query => query.isFetching)
  const refresh = () => { void Promise.all(queries.map(query => query.refetch())) }
  const hasDataError = queries.slice(1).some(query => query.isError)
  const activeServices = services.data?.filter(service => service.status === 'ACTIVE' && service.currentPrice !== null).length
  const pending = requests.data?.items ?? []
  const recentOrders = orders.data?.items ?? []

  return <div className="workspace-dashboard dw-admin">
    <DashboardHeading title="Tổng quan vận hành" description="Yêu cầu, khảo sát và nhân sự" health={health.isPending ? 'loading' : health.isSuccess ? 'online' : 'offline'} refreshing={refreshing} refresh={refresh} action={<Link className="dw-button dw-button-primary" to="/system/survey-requests"><FileSearchOutlined aria-hidden="true" />Xét duyệt yêu cầu</Link>} />
    {hasDataError ? <div className="dw-notice" role="alert"><span>Một số dữ liệu chưa tải được.</span><button type="button" className="dw-text-button" onClick={refresh}>Tải lại</button></div> : null}

    <section className="dw-metrics" aria-label="Chỉ số vận hành toàn hệ thống">
      <DashboardMetric label="Chờ xét duyệt" value={requests.data?.totalCount} detail="Yêu cầu mới cần tiếp nhận" icon={<FileSearchOutlined />} to="/system/survey-requests" loading={requests.isPending} error={requests.isError} />
      <DashboardMetric label="Đơn khảo sát" value={orders.data?.totalCount} detail="Tất cả trạng thái" icon={<FileTextOutlined />} to="/system/survey-orders" loading={orders.isPending} error={orders.isError} />
      <DashboardMetric label="System Manager" value={managers.data?.totalCount} detail="Hồ sơ nhân sự vận hành" icon={<TeamOutlined />} to="/system/managers" loading={managers.isPending} error={managers.isError} />
      <DashboardMetric label="Đơn vị" value={tenants.data?.totalCount} detail="Phạm vi toàn hệ thống" icon={<BankOutlined />} to="/system/tenants" loading={tenants.isPending} error={tenants.isError} />
    </section>

    <div className="dw-main-grid">
      <section className="dw-panel">
        <DashboardSectionHeading title="Yêu cầu mới" to="/system/survey-requests" />
        {!requests.data && requests.isPending ? <DashboardState loading empty="" /> : !requests.data && requests.isError ? <DashboardState empty="" error={workflowError(requests.error)} retry={() => { void requests.refetch() }} /> : !pending.length ? <DashboardState empty="Đã xử lý hết yêu cầu mới"><p>Yêu cầu mới gửi sẽ xuất hiện tại đây để bạn tiếp nhận.</p><Link className="dw-text-link" to="/system/survey-requests">Xem các yêu cầu đã nhận <ArrowRightOutlined aria-hidden="true" /></Link></DashboardState> : <div className="dw-request-list">{pending.slice(0, 4).map(request => <Link className="dw-request-row" to={'/system/survey-requests/' + encodeURIComponent(request.id)} key={request.id}>
          <span className="dw-request-mark" aria-hidden="true"><FileSearchOutlined /></span><span className="dw-row-copy"><span className="dw-row-code">{readableCode(request.requestNumber) ?? dateTime(request.createdAt)}</span><strong>{request.farmName}</strong><small>{request.tenantName ?? request.tenantCode ?? 'Khách hàng mới'} · {request.surveyServiceCode}</small></span><span className="dw-request-meta"><span className="dw-badge is-amber">Chờ xét duyệt</span><small>{requestKindLabels[request.kind] ?? request.kind}</small></span><ArrowRightOutlined className="dw-row-arrow" aria-hidden="true" />
        </Link>)}</div>}
        {requests.data && pending.length ? <div className="dw-panel-footer"><span>{Math.min(pending.length, 4)} yêu cầu mới nhất</span></div> : null}
      </section>

      <aside className="dw-feature dw-feature-forest dw-flow-panel">
        <h2>Tiến độ khảo sát</h2>
        <ol className="dw-flow-list">
          {[{ label: 'Chờ xét duyệt', query: requests }, { label: 'Đang xét duyệt', query: reviewing }, { label: 'Đã tạo đơn', query: orders }].map((step, index) => <li key={step.label}><span className="dw-flow-step" aria-hidden="true">{index + 1}</span><div><strong>{step.label}</strong>{step.query.isError ? <small>Chưa tải được</small> : null}</div><b aria-busy={step.query.isPending}>{step.query.data ? dashboardNumber(step.query.data.totalCount) : '—'}</b></li>)}
        </ol>
        <Link className="dw-button dw-button-light" to="/system/survey-orders">Quản lý đơn & giấy tờ <ArrowRightOutlined aria-hidden="true" /></Link>
      </aside>
    </div>

    <section className="dw-panel dw-bottom-panel">
      <DashboardSectionHeading title="Đơn khảo sát gần đây" to="/system/survey-orders" />
      {!orders.data && orders.isPending ? <DashboardState loading empty="" /> : !orders.data && orders.isError ? <DashboardState empty="" error={workflowError(orders.error)} retry={() => { void orders.refetch() }} /> : !recentOrders.length ? <DashboardState empty="Chưa có đơn khảo sát"><p>Đơn khảo sát được tạo sau khi yêu cầu được phê duyệt.</p></DashboardState> : <div className="dw-order-list">{recentOrders.slice(0, 4).map(order => <Link className="dw-order-row" key={order.surveyOrderId} to={'/system/survey-orders/' + encodeURIComponent(order.surveyOrderId) + '/authorizations'}>
        <span className="dw-order-icon" aria-hidden="true"><FileTextOutlined /></span><span className="dw-row-copy"><span className="dw-row-code">{readableCode(order.orderNumber) ?? dateTime(order.createdAt)}</span><strong>{order.farmName}</strong></span><span className="dw-order-service">{order.surveyServiceName}<small>{dateTime(order.createdAt)}</small></span><span className={'dw-badge ' + (order.status === 'COMPLETED' ? 'is-green' : order.status === 'CANCELLED' ? 'is-neutral' : 'is-amber')}>{orderStatusLabels[order.status] ?? order.status}</span><ArrowRightOutlined className="dw-row-arrow" aria-hidden="true" />
      </Link>)}</div>}
    </section>

    <section className="dw-admin-tools" aria-label="Công cụ quản trị">
      <Link className="dw-shortcut" to="/system/managers"><span className="dw-shortcut-icon"><TeamOutlined aria-hidden="true" /></span><span><strong>Đội ngũ vận hành</strong><small>{managers.data ? dashboardNumber(managers.data.totalCount) + ' hồ sơ System Manager' : 'Quản lý hồ sơ và chứng chỉ'}</small></span><ArrowRightOutlined aria-hidden="true" /></Link>
      <Link className="dw-shortcut" to="/system/survey-services"><span className="dw-shortcut-icon"><MedicineBoxOutlined aria-hidden="true" /></span><span><strong>Dịch vụ & đơn giá</strong><small>{activeServices !== undefined ? activeServices + ' dịch vụ hoạt động, đã có giá' : 'Kiểm tra dịch vụ và đơn giá'}</small></span><ArrowRightOutlined aria-hidden="true" /></Link>
      <Link className="dw-shortcut" to="/system/tenants"><span className="dw-shortcut-icon"><BankOutlined aria-hidden="true" /></span><span><strong>Quản lý đơn vị</strong><small>Thông tin, trạng thái và Owner</small></span><ArrowRightOutlined aria-hidden="true" /></Link>
    </section>
  </div>
}
