import { ArrowLeftOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getAssignedOrder, getAssignedOrders, getOrderScope } from './orderApi'
import type { Appointment, AssignedOrder } from './orderTypes'
import { appointmentStatusLabels, baselineStageNotices, matchingOrderSnapshot, orderStatusLabels } from './orderWorkflow'
import { dateTime, workflowError } from './workflow'
import { AppointmentModal, BoundaryVerificationModal } from './OrderActionModals'
import { BoundaryCapturePanel } from './BoundaryCapturePanel'
import { OrthophotoCornersModal } from './BaselineModals'

export function ManagerOrdersPage() {
  const token = useAuth().session!.accessToken
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const query = useQuery({ queryKey: ['manager-orders', page, status], queryFn: ({ signal }) => getAssignedOrders(token, page, status, signal), refetchOnWindowFocus: true, refetchInterval: 10000 })
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">CÔNG VIỆC KHẢO SÁT</span><h1>Đơn khảo sát được giao</h1><p>Theo dõi công việc tại các nông trại bạn đang phụ trách.</p></div><Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel"><div className="workflow-toolbar"><Select aria-label="Trạng thái đơn khảo sát" value={status} onChange={value => { setPage(1); setStatus(value) }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.entries(orderStatusLabels).map(([value, label]) => ({ value, label }))]} /></div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<AssignedOrder> rowKey="surveyOrderId" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: 'Chưa có đơn khảo sát phù hợp.' }} columns={[
          { title: 'Đơn khảo sát', dataIndex: 'orderNumber' },
          { title: 'Nông trại', render: (_, order) => <><strong>{order.farmName}</strong><div className="form-hint">{order.farmCode}</div></> },
          { title: 'Dịch vụ', dataIndex: 'surveyServiceName' },
          { title: 'Trạng thái', render: (_, order) => <Space orientation="vertical"><Tag>{orderStatusLabels[order.status] ?? order.status}</Tag>{order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED' ? <Tag color="orange">Owner yêu cầu đổi lịch</Tag> : null}</Space> },
          { title: 'Ngày tạo', render: (_, order) => dateTime(order.createdAt) },
          { title: 'Thao tác', render: (_, order) => <Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(order.surveyOrderId)}`}>Xem công việc →</Link> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
  </>
}

export function ManagerOrderDetailPage() {
  const { message } = App.useApp()
  const token = useAuth().session!.accessToken
  const { orderId = '' } = useParams()
  const client = useQueryClient()
  const [action, setAction] = useState<'appointment' | 'boundary' | 'corners' | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const context = useQuery({ queryKey: ['manager-order-context', orderId], queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal), retry: false, refetchOnWindowFocus: action === null, refetchInterval: value => action === null && value.state.data && !['COMPLETED', 'CANCELLED'].includes(value.state.data.status) ? 10000 : false })
  const query = useQuery({ queryKey: ['manager-order-scope', orderId], queryFn: ({ signal }) => getOrderScope(token, orderId, signal), retry: false, refetchOnWindowFocus: action === null, refetchInterval: value => action === null && value.state.data && !['COMPLETED', 'CANCELLED'].includes(value.state.data.orderStatus) ? 10000 : false })
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['manager-order-context', orderId] }), client.invalidateQueries({ queryKey: ['manager-order-scope', orderId] }), client.invalidateQueries({ queryKey: ['manager-orders'] })]) }
  const back = <Link className="back-link" to="/manager/orders"><ArrowLeftOutlined /> Đơn khảo sát được giao</Link>
  if (query.isPending || context.isPending) return <>{back}<CommonState type="loading" /></>
  if (query.isError || context.isError) return <>{back}<CommonState type="error" description={workflowError(query.error ?? context.error)} retry={refresh} /></>
  if (!context.data) return <>{back}<CommonState type="forbidden" description="Đơn không còn thuộc các nông trại bạn đang được phân công." /></>
  const scope = query.data, order = context.data
  const consistent = matchingOrderSnapshot(order, scope)
  const stage = consistent && scope.requiresBaselineMapping ? baselineStageNotices[scope.orderStatus] : undefined
  const busy = query.isFetching || context.isFetching
  const rescheduleRequested = order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED'
  const canPropose = consistent && (scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' || scope.orderStatus === 'AWAITING_PAID_APPOINTMENT') && (!order.currentAppointmentId || order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED')
  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">{order.farmCode}</span><h1>{scope.orderNumber}</h1><p>{order.farmName} · {order.surveyServiceName}</p></div><Space wrap><Button icon={<CopyOutlined />} onClick={async () => {
      try { await navigator.clipboard.writeText(new URL(`/survey-payments/${encodeURIComponent(orderId)}`, window.location.origin).href); void message.success('Đã sao chép liên kết lịch sử thanh toán cho Owner.') }
      catch { void message.error('Không thể sao chép. Hãy cho phép truy cập bộ nhớ tạm của trình duyệt.') }
    }}>Sao chép liên kết thanh toán</Button><Button icon={<ReloadOutlined />} loading={busy} onClick={() => { setAppointment(null); void refresh() }}>Tải lại</Button></Space></section>
    {!consistent ? <Alert className="workflow-notice" type="warning" showIcon title="Dữ liệu đơn vừa thay đổi. Tải lại trước khi thao tác." /> : null}
    {consistent && rescheduleRequested ? <Alert className="workflow-notice" type="warning" showIcon title="Owner yêu cầu đổi lịch khảo sát" description="Hãy đề xuất thời gian mới bằng nút bên dưới. Owner cần xác nhận lại lịch trước khi tiếp tục." /> : null}
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Tiến độ khảo sát</strong><span>{orderStatusLabels[scope.orderStatus] ?? scope.orderStatus}</span></div><Tag>{scope.requiresBaselineMapping ? 'Cần bản đồ nền' : 'Đã có bản đồ nền'}</Tag></div>
      <dl className="detail-list"><div><dt>Nông trại</dt><dd><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}`}>{order.farmName}</Link></dd></div><div><dt>Lịch hẹn</dt><dd>{order.currentAppointmentStatus ? appointmentStatusLabels[order.currentAppointmentStatus] ?? order.currentAppointmentStatus : 'Chưa có lịch hiện tại'}</dd></div><div><dt>Ranh giới đã xác minh</dt><dd>{scope.currentApprovedBoundary ? `Phiên bản ${scope.currentApprovedBoundary.versionNumber}` : 'Chưa có'}</dd></div><div><dt>Cập nhật</dt><dd>{dateTime(order.updatedAt)}</dd></div></dl>
      <Space wrap>{canPropose ? <Button type="primary" disabled={busy} onClick={() => setAction('appointment')}>{rescheduleRequested ? 'Đề xuất lịch mới' : `Đề xuất lịch ${scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' ? 'khảo sát bản đồ' : 'dịch vụ'}`}</Button> : null}
        {consistent && !scope.requiresBaselineMapping && scope.orderStatus === 'PENDING_BOUNDARY_VERIFICATION' ? <Button type="primary" disabled={busy} onClick={() => setAction('boundary')}>Xác minh ranh giới</Button> : null}
        {consistent && scope.requiresBaselineMapping && scope.orderStatus === 'AWAITING_BASELINE_REVIEW' ? <Button type="primary" disabled={busy} onClick={() => setAction('corners')}>Đánh dấu 4 góc trên ảnh trực giao</Button> : null}</Space>
      {scope.requiresBaselineMapping ? <><p className="form-hint">Chốt lịch khảo sát bản đồ trước. Owner xác nhận lịch và thanh toán cọc trước khi thực hiện. Sau khi có ảnh trực giao, đối chiếu bốn góc ranh giới trước khi duyệt bản đồ nền.</p><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/base-map-drafts`}>Duyệt bản đồ nền →</Link></> : null}
      {appointment?.surveyOrderId === orderId && appointment.appointmentId === order.currentAppointmentId && order.currentAppointmentStatus === 'PROPOSED' ? <Alert className="workflow-notice" showIcon type="success" title="Đã đề xuất lịch, chờ Owner xác nhận" description={`${dateTime(appointment.proposedStartAt)} – ${dateTime(appointment.proposedEndAt)}`} /> : null}
    </section>
    {stage ? <Alert className="workflow-notice" type={stage.type} showIcon title={stage.title} description={stage.description} /> : null}
    {consistent && order.boundaryCaptureSessionId ? <BoundaryCapturePanel key={orderId} token={token} orderId={orderId} farmId={order.farmId} sessionId={order.boundaryCaptureSessionId} /> : null}
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Phạm vi khu vực</strong><span>Các khu vực được trả về trong phạm vi đơn khảo sát</span></div></div><Table rowKey="zoneId" dataSource={scope.zones} pagination={false} scroll={{ x: 500 }} locale={{ emptyText: 'Chưa có khu vực trong phạm vi đơn.' }} columns={[{ title: 'Mã', dataIndex: 'code' }, { title: 'Khu vực', dataIndex: 'name' }, { title: 'Trạng thái', render: (_, zone) => zone.status === 'ACTIVE' ? 'Đang hoạt động' : zone.status }]} /></section>
    {action === 'appointment' ? <AppointmentModal token={token} order={order} scope={scope} close={() => { setAction(null); void refresh() }} done={async result => { setAppointment(result); setAction(null); await refresh() }} /> : null}
    {action === 'boundary' ? <BoundaryVerificationModal token={token} scope={scope} close={() => { setAction(null); void refresh() }} done={async () => { setAction(null); await refresh() }} /> : null}
    {action === 'corners' ? <OrthophotoCornersModal token={token} scope={scope} close={() => { setAction(null); void refresh() }} done={async () => { setAction(null); await refresh() }} /> : null}
  </>
}
