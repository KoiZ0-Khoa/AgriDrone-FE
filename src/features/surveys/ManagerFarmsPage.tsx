import { readableCode } from '../../components/RecordReference'
import { ArrowRightOutlined, HomeOutlined, ScheduleOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { checkApiHealth } from '../../api/client'
import { DashboardHeading, DashboardMetric, DashboardSectionHeading, DashboardState, dashboardNumber } from '../../components/dashboard/DashboardUI'
import { useAuth } from '../auth/AuthContext'
import { getAssignedFarms } from './api'
import { getAssignedOrders } from './orderApi'
import { orderStatusLabels } from './orderWorkflow'
import { dateTime, workflowError } from './workflow'

export function ManagerFarmsPage() {
  const { session } = useAuth()
  const token = session!.accessToken
  const farms = useQuery({ queryKey: ['manager-assigned-farms'], queryFn: ({ signal }) => getAssignedFarms(token, signal) })
  const orders = useQuery({ queryKey: ['manager-orders', 1, ''], queryFn: ({ signal }) => getAssignedOrders(token, 1, '', signal), refetchOnWindowFocus: true, refetchInterval: 10000 })
  const health = useQuery({ queryKey: ['api-health'], queryFn: checkApiHealth, refetchInterval: 30_000 })
  const refresh = () => { void Promise.all([farms.refetch(), orders.refetch(), health.refetch()]) }
  const refreshing = farms.isFetching || orders.isFetching || health.isFetching
  const assignedFarms = farms.data ?? []
  const assignedOrders = orders.data?.items ?? []

  return <div className="workspace-dashboard dw-manager">
    <DashboardHeading title="Công việc của bạn" description={session!.fullName} health={health.isPending ? 'loading' : health.isSuccess ? 'online' : 'offline'} refreshing={refreshing} refresh={refresh} action={<Link className="dw-button dw-button-primary" to="/manager/orders"><ScheduleOutlined aria-hidden="true" />Đơn khảo sát</Link>} />
    {farms.isError || orders.isError ? <div className="dw-notice" role="alert"><span>Một số dữ liệu chưa tải được.</span><button className="dw-text-button" type="button" onClick={refresh}>Tải lại</button></div> : null}

    <section className="dw-metrics" aria-label="Công việc được phân công">
      <DashboardMetric label="Nông trại phụ trách" value={farms.data?.length} detail="" icon={<HomeOutlined />} to="/manager" loading={farms.isPending} error={farms.isError} />
      <DashboardMetric label="Đơn khảo sát" value={orders.data?.totalCount} detail="Tất cả trạng thái" icon={<ScheduleOutlined />} to="/manager/orders" loading={orders.isPending} error={orders.isError} />
    </section>

    <div className="dw-main-grid">
      <section className="dw-panel">
        <DashboardSectionHeading title="Nông trại phụ trách" />
        {!farms.data && farms.isPending ? <DashboardState loading empty="" /> : !farms.data && farms.isError ? <DashboardState empty="" error={workflowError(farms.error)} retry={() => { void farms.refetch() }} /> : !assignedFarms.length ? <DashboardState empty="Chưa có nông trại"><p>Nông trại sẽ xuất hiện khi quản trị viên phân công cho bạn.</p></DashboardState> : <div className="dw-farm-list">{assignedFarms.map(farm => <Link className="dw-farm-row" aria-label={'Xem chi tiết: ' + farm.name} to={'/manager/farms/' + encodeURIComponent(farm.farmId)} key={farm.farmId}>
          <span className="dw-farm-mark" aria-hidden="true"><HomeOutlined /></span>
          <span className="dw-row-copy"><strong>{farm.name}</strong>{farm.address ? <small>{farm.address}</small> : null}{farm.areaHectares !== null ? <small>{dashboardNumber(farm.areaHectares)} ha</small> : null}</span>
          <ArrowRightOutlined className="dw-row-arrow" aria-hidden="true" />
        </Link>)}</div>}
      </section>
      <section className="dw-panel">
        <DashboardSectionHeading title="Đơn được giao" to="/manager/orders" />
        {!orders.data && orders.isPending ? <DashboardState loading empty="" /> : !orders.data && orders.isError ? <DashboardState empty="" error={workflowError(orders.error)} retry={() => { void orders.refetch() }} /> : !assignedOrders.length ? <DashboardState empty="Chưa có đơn khảo sát"><p>Các đơn được giao sẽ xuất hiện tại đây.</p></DashboardState> : <div className="dw-request-list">{assignedOrders.slice(0, 4).map(order => <Link className="dw-request-row" to={'/manager/orders/' + encodeURIComponent(order.surveyOrderId)} key={order.surveyOrderId}>
          <span className="dw-row-copy"><span className="dw-row-code">{readableCode(order.orderNumber) ?? dateTime(order.createdAt)}</span><strong>{order.farmName}</strong><small>{order.surveyServiceName}</small><span className={'dw-badge ' + (order.status === 'COMPLETED' ? 'is-green' : order.status === 'CANCELLED' ? 'is-neutral' : 'is-amber')}>{orderStatusLabels[order.status] ?? order.status}</span>{order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED' ? <span className="dw-badge is-amber">Owner yêu cầu đổi lịch</span> : null}</span>
          <ArrowRightOutlined className="dw-row-arrow" aria-hidden="true" />
        </Link>)}</div>}
      </section>
    </div>
  </div>
}
