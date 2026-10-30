import { CopyReference, readableCode } from '../../components/RecordReference'
﻿import { ArrowLeftOutlined, CreditCardOutlined, ReloadOutlined } from '@ant-design/icons'
import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { OwnerAppointmentDialog, type OwnerAppointmentAction } from './OwnerAppointmentDialog'
import { getOwnerOrder, getOwnerOrders } from './ownerOrderApi'
import type { OwnerSurveyOrder } from './ownerOrderTypes'
import { activePaymentStatus, canConfirmOwnerAppointment, canRescheduleOwnerAppointment, ownerGuid, ownerOrderStatusQuery, validOwnerVersion } from './ownerOrderWorkflow'
import { getPaymentHistory } from './paymentApi'
import { money } from './paymentWorkflow'
import { appointmentStatusLabels, orderStatusLabels } from './orderWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { SurveyPaymentPanel } from './SurveyPaymentPanel'
import { dateTime, workflowError } from './workflow'

export function OwnerPaymentsPage() {
  const { session } = useAuth()
  const orderId = useParams().orderId?.toLowerCase()
  const returned = useLocation().pathname === '/survey-payments/return'
  if (session?.role !== 'OWNER' || !session.tenant) return <CommonState type="forbidden" description="Chỉ chủ đơn vị được xem thanh toán khảo sát." />
  if (orderId && !ownerGuid(orderId)) return <CommonState type="error" description="Liên kết đơn khảo sát không hợp lệ." />
  return orderId
    ? <OwnerOrderDetail key={session.tenant.id + ':' + orderId} token={session.accessToken} tenantId={session.tenant.id} orderId={orderId} />
    : <OwnerOrderList token={session.accessToken} tenantId={session.tenant.id} tenantName={session.tenant.name} returned={returned} />
}

function OwnerOrderList({ token, tenantId, tenantName, returned }: { token: string; tenantId: string; tenantName: string; returned: boolean }) {
  const [params, setParams] = useSearchParams()
  const rawPage = Number(params.get('page') ?? '1')
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  const rawStatus = params.get('status') ?? ''
  const status = Object.hasOwn(ownerOrderStatusQuery, rawStatus) ? rawStatus : ''
  const query = useQuery({ queryKey: ['owner-survey-orders', tenantId, page, status], queryFn: ({ signal }) => getOwnerOrders(token, page, status, signal), retry: false })
  function changePage(next: number) { const value = new URLSearchParams(params); value.set('page', String(next)); setParams(value) }
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">{tenantName}</span><h1>Đơn khảo sát & thanh toán</h1><p>Xem lịch hẹn, xác nhận thời gian và thanh toán dịch vụ.</p></div><Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    {returned ? <Alert className="workflow-notice" showIcon type="info" title="Kiểm tra kết quả thanh toán" description="Chọn đơn vừa thanh toán để xem kết quả từ máy chủ. Nếu giao dịch đang xử lý, chờ hệ thống cập nhật trước khi thao tác tiếp." /> : null}
    <section className="resource-panel"><div className="workflow-toolbar"><Select aria-label="Trạng thái đơn khảo sát của Owner" value={status} onChange={value => { const next = new URLSearchParams(); if (value) next.set('status', value); next.set('page', '1'); setParams(next) }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.keys(ownerOrderStatusQuery).map(value => ({ value, label: orderStatusLabels[value] ?? value }))]} /></div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<OwnerSurveyOrder> rowKey="surveyOrderId" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: 'Chưa có đơn khảo sát phù hợp.' }} columns={[
          { title: 'Nông trại', render: (_, order) => <><strong>{order.farmName}</strong>{readableCode(order.orderNumber) ? <div className="form-hint">{readableCode(order.orderNumber)}</div> : null}</> },
          { title: 'Trạng thái', render: (_, order) => <Tag>{orderStatusLabels[order.status] ?? order.status}</Tag> },
          { title: 'Lịch hiện tại', render: (_, order) => order.currentAppointment ? <>{dateTime(order.currentAppointment.startAt)}<div className="form-hint">{appointmentStatusLabels[order.currentAppointment.status] ?? order.currentAppointment.status}</div></> : 'Chờ Manager đề xuất' },
          { title: 'Tổng tiền', render: (_, order) => money(order.totalAmount, order.currency) },
          { title: 'Thao tác', render: (_, order) => <Link className="workflow-detail-link" to={'/survey-payments/' + encodeURIComponent(order.surveyOrderId)}>Xem đơn & thanh toán →</Link> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={changePage} />
      </>}
    </section>
  </>
}

function OwnerOrderDetail({ token, tenantId, orderId }: { token: string; tenantId: string; orderId: string }) {
  const client = useQueryClient()
  const writes = useIsMutating({ mutationKey: ['owner-order-write', tenantId, orderId] })
  const [action, setAction] = useState<OwnerAppointmentAction | null>(null)
  const [notice, setNotice] = useState('')
  const query = useQuery({ queryKey: ['owner-survey-order', tenantId, orderId], queryFn: ({ signal }) => getOwnerOrder(token, orderId, signal), retry: false,
    refetchOnWindowFocus: writes === 0, refetchInterval: value => writes === 0 && value.state.data && !['COMPLETED', 'CANCELLED'].includes(value.state.data.status) ? 10000 : false })
  const history = useQuery({ queryKey: ['owner-payment-history', tenantId, orderId], queryFn: ({ signal }) => getPaymentHistory(token, orderId, signal), retry: false,
    enabled: !!query.data && !query.isError, refetchOnWindowFocus: writes === 0,
    refetchInterval: value => writes === 0 && value.state.data?.payments.some(item => ['PENDING', 'PROCESSING'].includes(item.status)) ? 10000 : false })
  const refetchOrder = query.refetch
  const refreshOrder = useCallback(async () => {
    await refetchOrder()
    await client.invalidateQueries({ queryKey: ['owner-survey-orders', tenantId] })
  }, [client, refetchOrder, tenantId])
  useEffect(() => { if (history.dataUpdatedAt) void refreshOrder() }, [history.dataUpdatedAt, refreshOrder])
  async function refresh() { setAction(null); await Promise.all([refreshOrder(), history.refetch()]) }
  const back = <Link className="back-link" to="/survey-payments"><ArrowLeftOutlined /> Đơn khảo sát & thanh toán</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải đơn khảo sát" /></>
  if (!query.data) return <>{back}<SurveyMutationError error={query.error} /><Button onClick={() => { void query.refetch() }}>Tải lại đơn</Button></>
  const order = query.data, appointment = order.currentAppointment
  const showDeposit = ['AWAITING_BASELINE_APPOINTMENT', 'AWAITING_BASELINE_DEPOSIT', 'AWAITING_BOUNDARY_CAPTURE', 'BASELINE_READY', 'BASELINE_IN_PROGRESS', 'AWAITING_BASELINE_REVIEW'].includes(order.status) || history.data?.payments.some(item => item.purpose === 'BASELINE_DEPOSIT')
  const busy = query.isFetching || query.isError || writes > 0
  const rescheduleBlockedByPayment = appointment?.purpose === 'PAID_SERVICE' && history.data?.payments.some(item => activePaymentStatus(item.status))
  return <>{back}
    <section className="resource-page-heading"><div><span className="page-kicker">ĐƠN KHẢO SÁT & THANH TOÁN</span><h1>{order.farmName}</h1><p>{orderStatusLabels[order.status] ?? order.status}</p><CopyReference value={order.orderNumber} label="Sao chép mã đơn" /></div><Button icon={<ReloadOutlined />} disabled={writes > 0 || !!action} loading={query.isFetching} onClick={() => { void refresh() }}>Tải lại</Button></section>
    {notice ? <Alert className="workflow-notice" showIcon type="success" title={notice} /> : null}
    <SurveyMutationError error={query.isError ? query.error : null} />
    {!validOwnerVersion(order.orderVersion) ? <Alert className="workflow-notice" showIcon type="warning" title="Thông tin đơn chưa đầy đủ. Tải lại trước khi xác nhận lịch hoặc thanh toán." /> : null}
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Lịch khảo sát</strong><span>{appointment?.purpose === 'BASELINE_MAPPING' ? 'Khảo sát bản đồ nền' : appointment?.purpose === 'PAID_SERVICE' ? 'Khảo sát dịch vụ' : 'Thời gian do Manager đề xuất'}</span></div>{appointment ? <Tag>{appointmentStatusLabels[appointment.status] ?? appointment.status}</Tag> : null}</div>
      {appointment ? <><dl className="detail-list"><div><dt>Bắt đầu</dt><dd>{dateTime(appointment.startAt)}</dd></div><div><dt>Kết thúc</dt><dd>{dateTime(appointment.endAt)}</dd></div></dl>
        <Space wrap>{canConfirmOwnerAppointment(order) ? <Button type="primary" disabled={busy || !!action} onClick={() => { setNotice(''); setAction({ kind: 'confirm', snapshot: order }) }}>Xác nhận lịch</Button> : null}
          <Button disabled={busy || !!action || history.isFetching || history.isPending || history.isError || !canRescheduleOwnerAppointment(order, history.data)} onClick={() => { setNotice(''); setAction({ kind: 'reschedule', snapshot: order }) }}>Yêu cầu đổi lịch</Button>
        </Space>
        {appointment.status === 'PROPOSED' && Date.parse(appointment.endAt) <= Date.now() ? <p className="form-hint">Lịch hẹn đã hết thời gian xác nhận. Hãy yêu cầu Manager đề xuất lại.</p> : null}
        {appointment.status === 'RESCHEDULE_REQUESTED' ? <p className="form-hint">Đã gửi yêu cầu đổi lịch. Chờ Manager đề xuất thời gian mới.</p> : null}
        {rescheduleBlockedByPayment ? <p className="form-hint">Đơn đã có giao dịch đang hiệu lực. Liên hệ hỗ trợ nếu cần đổi lịch dịch vụ.</p> : null}
      </> : <p>Chờ Manager đề xuất lịch. Khi có lịch, bạn có thể xác nhận hoặc gửi yêu cầu đổi thời gian.</p>}
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Chi phí khảo sát</strong><span>Số tiền theo thông tin của hệ thống</span></div><CreditCardOutlined aria-hidden="true" /></div><dl className="detail-list">{showDeposit ? <div><dt>Cọc bản đồ nền</dt><dd>{money(order.depositAmount, order.currency)}</dd></div> : null}<div><dt>Tổng tiền dịch vụ</dt><dd>{money(order.totalAmount, order.currency)}</dd></div><div><dt>Số tiền còn lại</dt><dd>{money(order.remainingAmount, order.currency)}</dd></div></dl></section>
    <div className="workflow-section"><SurveyPaymentPanel order={order} history={history} refreshOrder={refreshOrder} disabled={busy || !!action} /></div>
    {action ? <OwnerAppointmentDialog token={token} tenantId={tenantId} action={action} current={order} history={history.isError ? undefined : history.data} disabled={query.isFetching || query.isError || history.isFetching} close={() => { setAction(null); void refresh() }} done={async () => {
      setNotice(action.kind === 'confirm' ? 'Đã xác nhận lịch. Kiểm tra khoản thanh toán bên dưới.' : 'Đã gửi yêu cầu đổi lịch. Chờ Manager đề xuất lại.')
      setAction(null); await refresh()
    }} /> : null}
  </>
}
