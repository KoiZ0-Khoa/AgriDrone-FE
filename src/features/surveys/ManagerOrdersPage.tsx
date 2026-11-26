import { CopyReference, readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { ManagerQualityRefundPanel } from './ManagerQualityRefundPanel'
import { getAssignedOrder, getAssignedOrders, getOrderScope } from './orderApi'
import type { Appointment, AssignedOrder } from './orderTypes'
import { appointmentStatusLabels, orderStageNotices, matchingOrderSnapshot, orderStatusLabels, canOpenHealthReview, canProposeCaptureAppointment, canRecordCaptureNoShow } from './orderWorkflow'
import { appointmentScheduleLabel, dateTime, workflowError } from './workflow'
import { AppointmentModal, BoundaryVerificationModal, NoShowModal } from './OrderActionModals'
import type { CaptureNoShowResult } from './v3Types'
import { getCaptureAttempts } from './v3Api'
import { captureAttemptStatusLabels, v3ServiceKind } from './v3Workflow'
import { BoundaryCapturePanel } from './BoundaryCapturePanel'
import { OrthophotoCornersModal } from './BaselineModals'
import { findMissionsBySurveyOrder } from '../missions/missionApi'
import { PrepareMissionModal } from '../missions/PrepareMissionModal'
import { missionPurposeFor, missionPurposeLabels, missionStatusLabel } from '../missions/missionWorkflow'

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
          { title: 'Nông trại', render: (_, order) => <><strong>{order.farmName}</strong><div className="form-hint">{readableCode(order.farmCode)}</div>{readableCode(order.orderNumber) ? <div className="form-hint">{readableCode(order.orderNumber)}</div> : null}</> },
          { title: 'Dịch vụ', dataIndex: 'surveyServiceName' },
          { title: 'Trạng thái', render: (_, order) => <Space orientation="vertical"><Tag>{orderStatusLabels[order.status] ?? order.status}</Tag>{order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED' ? <Tag color="orange">Cần đề xuất lịch mới</Tag> : null}</Space> },
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
  const session = useAuth().session!
  const token = session.accessToken
  const { orderId = '' } = useParams()
  const client = useQueryClient()
  const [action, setAction] = useState<'appointment' | 'no-show' | 'boundary' | 'corners' | 'prepare-mission' | null>(null)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [noShow, setNoShow] = useState<CaptureNoShowResult | null>(null)
  const context = useQuery({ queryKey: ['manager-order-context', orderId], queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal), retry: false, refetchOnWindowFocus: action === null, refetchInterval: value => action === null && value.state.data && !['COMPLETED', 'CANCELLED'].includes(value.state.data.status) ? 10000 : false })
  const query = useQuery({ queryKey: ['manager-order-scope', orderId], queryFn: ({ signal }) => getOrderScope(token, orderId, signal), retry: false, refetchOnWindowFocus: action === null, refetchInterval: value => action === null && value.state.data && !['COMPLETED', 'CANCELLED'].includes(value.state.data.orderStatus) ? 10000 : false })
  const v3Order = v3ServiceKind(context.data?.surveyServiceCode) !== null
  const attempts = useQuery({ queryKey: ['capture-attempts', orderId], queryFn: ({ signal }) => getCaptureAttempts(token, orderId, signal), enabled: v3Order, retry: false })
  const missionsQuery = useQuery({ queryKey: ['order-missions', context.data?.farmId, orderId], queryFn: ({ signal }) => findMissionsBySurveyOrder(token, context.data!.farmId, orderId, signal), enabled: Boolean(context.data) && !v3Order })
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['manager-order-context', orderId] }), client.invalidateQueries({ queryKey: ['manager-order-scope', orderId] }), client.invalidateQueries({ queryKey: ['manager-orders'] }), client.invalidateQueries({ queryKey: ['capture-attempts', orderId] })]) }
  const back = <Link className="back-link" to="/manager/orders"><ArrowLeftOutlined /> Đơn khảo sát được giao</Link>
  if (query.isPending || context.isPending) return <>{back}<CommonState type="loading" /></>
  if (query.isError || context.isError) return <>{back}<CommonState type="error" description={workflowError(query.error ?? context.error)} retry={refresh} /></>
  if (!context.data) return <>{back}<CommonState type="forbidden" description="Đơn không còn thuộc các nông trại bạn đang được phân công." /></>
  const scope = query.data, order = context.data
  const consistent = matchingOrderSnapshot(order, scope)
  const stage = consistent ? orderStageNotices[scope.orderStatus] : undefined
  const busy = query.isFetching || context.isFetching
  const rescheduleRequested = order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED'
  const canPropose = canProposeCaptureAppointment(order, scope)
  const canNoShow = canRecordCaptureNoShow(order, scope)
  const missionPurpose = consistent && !v3Order ? missionPurposeFor(order, scope.orderStatus) : null
  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">ĐƠN KHẢO SÁT</span><h1>{order.farmName}</h1><p>{order.surveyServiceName} · {dateTime(order.createdAt)}</p><CopyReference value={scope.orderNumber} label="Sao chép mã đơn" /></div><Space wrap><Button icon={<CopyOutlined />} onClick={async () => {
      try { await navigator.clipboard.writeText(new URL(`/survey-payments/${encodeURIComponent(orderId)}`, window.location.origin).href); void message.success('Đã sao chép liên kết lịch sử thanh toán cho Owner.') }
      catch { void message.error('Không thể sao chép. Hãy cho phép truy cập bộ nhớ tạm của trình duyệt.') }
    }}>Sao chép liên kết thanh toán</Button><Button icon={<ReloadOutlined />} loading={busy} onClick={() => { setAppointment(null); void refresh() }}>Tải lại</Button></Space></section>
    {!consistent ? <Alert className="workflow-notice" type="warning" showIcon title="Dữ liệu đơn vừa thay đổi. Tải lại trước khi thao tác." /> : null}
    {consistent && rescheduleRequested ? <Alert className="workflow-notice" type="warning" showIcon title="Cần đề xuất lịch bay mới" description="Owner đã yêu cầu đổi lịch hoặc đã ghi nhận vắng mặt. Đề xuất thời gian mới bằng nút bên dưới; Owner cần xác nhận lại lịch trước khi tiếp tục." /> : null}
    {noShow?.orderId === orderId ? <Alert className="workflow-notice" showIcon type={noShow.disposition === 'FreeReschedule' ? 'success' : 'warning'} title={`Đã ghi nhận vắng mặt lần ${noShow.occurrenceIndex}`} description={noShow.disposition === 'FreeReschedule' ? 'Trong số lần được đổi lịch miễn phí. Đề xuất lịch bay mới cho Owner.' : 'Đã vượt số lần đổi lịch miễn phí theo chính sách của đơn. System Admin sẽ xem xét trước khi tiếp tục.'} /> : null}
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Tiến độ khảo sát</strong><span>{orderStatusLabels[scope.orderStatus] ?? scope.orderStatus}</span></div><Tag>{scope.requiresBaselineMapping ? 'Cần bản đồ nền' : 'Đã có bản đồ nền'}</Tag></div>
      <dl className="detail-list"><div><dt>Nông trại</dt><dd><Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}`}>{order.farmName}</Link></dd></div><div><dt>Lịch bay</dt><dd>{order.currentAppointmentStatus ? appointmentStatusLabels[order.currentAppointmentStatus] ?? order.currentAppointmentStatus : 'Chưa có lịch hiện tại'}</dd></div><div><dt>Ranh giới đã xác minh</dt><dd>{scope.currentApprovedBoundary ? `Phiên bản ${scope.currentApprovedBoundary.versionNumber}` : 'Chưa có'}</dd></div><div><dt>Cập nhật</dt><dd>{dateTime(order.updatedAt)}</dd></div></dl>
      <Space wrap>{canPropose ? <Button type="primary" disabled={busy} onClick={() => { setNoShow(null); setAction('appointment') }}>{rescheduleRequested ? 'Đề xuất lịch bay mới' : 'Đề xuất lịch bay'}</Button> : null}
        {canNoShow ? <Button danger disabled={busy} onClick={() => { setAppointment(null); setAction('no-show') }}>Báo khách vắng mặt</Button> : null}
        {consistent && !scope.requiresBaselineMapping && scope.orderStatus === 'PENDING_BOUNDARY_VERIFICATION' ? <Button type="primary" disabled={busy} onClick={() => setAction('boundary')}>Xác minh ranh giới</Button> : null}
        {consistent && scope.requiresBaselineMapping && scope.orderStatus === 'AWAITING_BASELINE_REVIEW' ? <Button type="primary" disabled={busy} onClick={() => setAction('corners')}>Đánh dấu 4 góc trên ảnh trực giao</Button> : null}
        {missionPurpose ? <Button disabled={busy} onClick={() => setAction('prepare-mission')}>Chuẩn bị nhiệm vụ bay · {missionPurposeLabels[missionPurpose]}</Button> : null}</Space>
      {v3Order && attempts.isError ? <Alert className="workflow-notice" type="warning" showIcon title="Không tải được danh sách lần bay" description={workflowError(attempts.error)} /> : null}
      {v3Order && attempts.isSuccess ? <div className="form-hint">
        <strong>Lần bay: </strong>
        {attempts.data.length === 0 ? 'Chưa có lần bay.' : <Space wrap split="·">{attempts.data.map(attempt => {
          const label = `Lần ${attempt.attemptIndex} (${captureAttemptStatusLabels[attempt.status] ?? attempt.status})`
          return attempt.missionId ? <Link key={attempt.captureAttemptId} className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/missions/${encodeURIComponent(attempt.missionId)}?orderId=${encodeURIComponent(orderId)}`}>{label} →</Link> : <span key={attempt.captureAttemptId}>{label}</span>
        })}</Space>}
      </div> : null}
      {!v3Order && missionsQuery.isError ? <Alert className="workflow-notice" type="warning" showIcon title="Không tải được danh sách nhiệm vụ bay của đơn này" description={workflowError(missionsQuery.error)} /> : null}
      {!v3Order && missionsQuery.data && missionsQuery.data.length > 0 ? <div className="form-hint">
        <strong>Nhiệm vụ bay: </strong>
        <Space wrap split="·">{missionsQuery.data.map(mission => <Link key={mission.id} className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/missions/${encodeURIComponent(mission.id)}`}>{readableCode(mission.missionCode)} ({missionStatusLabel(mission.status)}) →</Link>)}</Space>
      </div> : null}
      {canOpenHealthReview(order.surveyServiceCode, scope) ? <p><Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(orderId)}/health-review`}>{scope.orderStatus === 'PENDING_REVIEW' ? 'Kiểm duyệt kết quả sức khỏe cây →' : 'Xem kết quả kiểm duyệt sức khỏe cây →'}</Link></p> : null}
      {scope.requiresBaselineMapping ? <>{stage || scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' ? <p className="form-hint">Chốt lịch khảo sát bản đồ trước. Owner xác nhận lịch và thanh toán cọc trước khi thực hiện. Sau khi có ảnh trực giao, đối chiếu bốn góc ranh giới trước khi duyệt bản đồ nền.</p> : null}<Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/base-map-drafts?surveyOrderId=${encodeURIComponent(order.surveyOrderId)}`}>Duyệt bản đồ nền →</Link></> : null}
      {consistent && order.currentAppointmentStatus === 'PROPOSED' && !appointment ? <p className="form-hint">Lịch bay đang chờ Owner xác nhận.</p> : null}
      {appointment?.surveyOrderId === orderId && appointment.appointmentId === order.currentAppointmentId && order.currentAppointmentStatus === 'PROPOSED' ? <Alert className="workflow-notice" showIcon type="success" title="Đã đề xuất lịch bay, chờ Owner xác nhận" description={appointmentScheduleLabel(appointment.scheduledDate, appointment.scheduledStartDate, appointment.scheduledEndDate, appointment.proposedStartAt, appointment.proposedEndAt)} /> : null}
    </section>
    {stage ? <Alert className="workflow-notice" type={stage.type} showIcon title={stage.title} description={stage.description} /> : null}
    {consistent && order.boundaryCaptureSessionId ? <BoundaryCapturePanel key={orderId} token={token} orderId={orderId} farmId={order.farmId} sessionId={order.boundaryCaptureSessionId} /> : null}
    {consistent && scope.orderStatus === 'COMPLETED' && order.surveyServiceCode === 'PLANT_HEALTH' ? <ManagerQualityRefundPanel key={orderId} token={token} actor={session.email} orderId={orderId} /> : null}
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Phạm vi khu vực</strong><span>Các khu vực được trả về trong phạm vi đơn khảo sát</span></div></div><Table rowKey="zoneId" dataSource={scope.zones} pagination={false} scroll={{ x: 500 }} locale={{ emptyText: 'Chưa có khu vực trong phạm vi đơn.' }} columns={[{ title: 'Mã', dataIndex: 'code' }, { title: 'Khu vực', dataIndex: 'name' }, { title: 'Trạng thái', render: (_, zone) => zone.status === 'ACTIVE' ? 'Đang hoạt động' : zone.status }]} /></section>
    {action === 'appointment' ? <AppointmentModal token={token} order={order} scope={scope} close={() => { setAction(null); void refresh() }} done={async result => { setAppointment(result); setAction(null); await refresh() }} /> : null}
    {action === 'no-show' ? <NoShowModal token={token} order={order} scope={scope} close={() => { setAction(null); void refresh() }} done={async result => { setNoShow(result); setAction(null); await refresh() }} /> : null}
    {action === 'boundary' ? <BoundaryVerificationModal token={token} scope={scope} close={() => { setAction(null); void refresh() }} done={async () => { setAction(null); await refresh() }} /> : null}
    {action === 'corners' ? <OrthophotoCornersModal token={token} scope={scope} close={() => { setAction(null); void refresh() }} done={async () => { setAction(null); await refresh() }} /> : null}
    {action === 'prepare-mission' ? <PrepareMissionModal token={token} order={order} orderStatus={scope.orderStatus} close={() => { setAction(null); void refresh() }} /> : null}
  </>
}
