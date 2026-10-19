import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getAssignedOrder, getAssignedOrders, getOrderScope } from './orderApi'
import type { Appointment, AssignedOrder } from './orderTypes'
import { appointmentStatusLabels, matchingOrderSnapshot, orderStatusLabels } from './orderWorkflow'
import { dateTime, workflowError } from './workflow'
import { AppointmentModal, BoundaryVerificationModal } from './OrderActionModals'

export function ManagerOrdersPage() {
  const token = useAuth().session!.accessToken
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const query = useQuery({ queryKey: ['manager-orders', page, status], queryFn: ({ signal }) => getAssignedOrders(token, page, status, signal) })
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">CÔNG VIỆC KHẢO SÁT</span><h1>Đơn khảo sát được giao</h1><p>Theo dõi công việc tại các nông trại bạn đang phụ trách.</p></div><Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel"><div className="workflow-toolbar"><Select aria-label="Trạng thái đơn khảo sát" value={status} onChange={value => { setPage(1); setStatus(value) }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.entries(orderStatusLabels).map(([value, label]) => ({ value, label }))]} /></div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<AssignedOrder> rowKey="surveyOrderId" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: 'Chưa có đơn khảo sát phù hợp.' }} columns={[
          { title: 'Đơn khảo sát', dataIndex: 'orderNumber' },
          { title: 'Nông trại', render: (_, order) => <><strong>{order.farmName}</strong><div className="form-hint">{order.farmCode}</div></> },
          { title: 'Dịch vụ', dataIndex: 'surveyServiceName' },
          { title: 'Trạng thái', render: (_, order) => <Tag>{orderStatusLabels[order.status] ?? order.status}</Tag> },
          { title: 'Ngày tạo', render: (_, order) => dateTime(order.createdAt) },
          { title: 'Thao tác', render: (_, order) => <Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(order.surveyOrderId)}`}>Xem công việc →</Link> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
  </>
}

export function ManagerOrderDetailPage() {
  const token = useAuth().session!.accessToken
  const { orderId = '' } = useParams()
  const client = useQueryClient()
  const [action, setAction] = useState<'appointment' | 'boundary' | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const context = useQuery({ queryKey: ['manager-order-context', orderId], queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal), retry: false })
  const query = useQuery({ queryKey: ['manager-order-scope', orderId], queryFn: ({ signal }) => getOrderScope(token, orderId, signal), retry: false })
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['manager-order-context', orderId] }), client.invalidateQueries({ queryKey: ['manager-order-scope', orderId] }), client.invalidateQueries({ queryKey: ['manager-orders'] })]) }
  const back = <Link className="back-link" to="/manager/orders"><ArrowLeftOutlined /> Đơn khảo sát được giao</Link>
  if (query.isPending || context.isPending) return <>{back}<CommonState type="loading" /></>
  if (query.isError || context.isError) return <>{back}<CommonState type="error" description={workflowError(query.error ?? context.error)} retry={refresh} /></>
  if (!context.data) return <>{back}<CommonState type="forbidden" description="Đơn không còn thuộc các nông trại bạn đang được phân công." /></>
  const scope = query.data, order = context.data
  const consistent = matchingOrderSnapshot(order, scope)
  const busy = query.isFetching || context.isFetching
  const canPropose = consistent && (scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' || scope.orderStatus === 'AWAITING_PAID_APPOINTMENT') && (!order.currentAppointmentId || order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED')
  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">{order.farmCode}</span><h1>{scope.orderNumber}</h1><p>{order.farmName} · {order.surveyServiceName}</p></div><Button icon={<ReloadOutlined />} loading={busy} onClick={() => { setAppointment(null); void refresh() }}>Tải lại</Button></section>
    {!consistent ? <Alert className="workflow-notice" type="warning" showIcon title="Dữ liệu đơn vừa thay đổi. Tải lại trước khi thao tác." /> : null}
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Tiến độ khảo sát</strong><span>{orderStatusLabels[scope.orderStatus] ?? scope.orderStatus}</span></div><Tag>{scope.requiresBaselineMapping ? 'Cần bản đồ nền' : 'Đã có bản đồ nền'}</Tag></div>
      <dl className="detail-list"><div><dt>Nông trại</dt><dd><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}`}>{order.farmName}</Link></dd></div><div><dt>Lịch hẹn</dt><dd>{order.currentAppointmentStatus ? appointmentStatusLabels[order.currentAppointmentStatus] ?? order.currentAppointmentStatus : 'Chưa có lịch hiện tại'}</dd></div><div><dt>Ranh giới đã xác minh</dt><dd>{scope.currentApprovedBoundary ? `Phiên bản ${scope.currentApprovedBoundary.versionNumber}` : 'Chưa có'}</dd></div><div><dt>Cập nhật</dt><dd>{dateTime(order.updatedAt)}</dd></div></dl>
      <Space wrap>{canPropose ? <Button type="primary" disabled={busy} onClick={() => setAction('appointment')}>Đề xuất lịch {scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' ? 'khảo sát bản đồ' : 'dịch vụ'}</Button> : null}
        {consistent && !scope.requiresBaselineMapping && scope.orderStatus === 'PENDING_BOUNDARY_VERIFICATION' ? <Button type="primary" disabled={busy} onClick={() => setAction('boundary')}>Xác minh ranh giới</Button> : null}</Space>
      {scope.requiresBaselineMapping ? <p className="form-hint">Chốt lịch khảo sát bản đồ trước. Sau khi Owner xác nhận, Manager thu thập ranh giới tại buổi khảo sát; không xác minh bằng cách nhập polygon trực tiếp cho Farm chưa có bản đồ.</p> : null}
      {scope.orderStatus === 'AWAITING_BOUNDARY_CAPTURE' ? <Alert className="workflow-notice" showIcon type="info" title="Bước tiếp theo: thu thập ranh giới tại hiện trường" description="Phiên thu thập GPS và kế hoạch đường bay chưa được tích hợp trên web. Không thể dùng nút xác minh ranh giới để thay thế bước này." /> : null}
      {appointment?.surveyOrderId === orderId ? <Alert className="workflow-notice" showIcon type="success" title="Đã đề xuất lịch, chờ Owner xác nhận" description={`${dateTime(appointment.proposedStartAt)} – ${dateTime(appointment.proposedEndAt)}`} /> : null}
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Phạm vi khu vực</strong><span>Các khu vực được trả về trong phạm vi đơn khảo sát</span></div></div><Table rowKey="zoneId" dataSource={scope.zones} pagination={false} scroll={{ x: 500 }} locale={{ emptyText: 'Chưa có khu vực trong phạm vi đơn.' }} columns={[{ title: 'Mã', dataIndex: 'code' }, { title: 'Khu vực', dataIndex: 'name' }, { title: 'Trạng thái', render: (_, zone) => zone.status === 'ACTIVE' ? 'Đang hoạt động' : zone.status }]} /></section>
    {action === 'appointment' ? <AppointmentModal token={token} order={order} scope={scope} close={() => { setAction(null); void refresh() }} done={async result => { setAppointment(result); setAction(null); await refresh() }} /> : null}
    {action === 'boundary' ? <BoundaryVerificationModal token={token} scope={scope} close={() => { setAction(null); void refresh() }} done={async () => { setAction(null); await refresh() }} /> : null}
  </>
}
