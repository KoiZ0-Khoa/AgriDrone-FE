import { CopyReference, readableCode } from '../../components/RecordReference'
﻿import { ArrowLeftOutlined, CreditCardOutlined, ReloadOutlined } from '@ant-design/icons'
import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { OwnerBalanceCheckout } from './OwnerBalanceCheckout'
import { OwnerAppointmentDialog, type OwnerAppointmentAction } from './OwnerAppointmentDialog'
import { cancelOwnerOrder, getOwnerOrder, getOwnerOrderInvoice, getOwnerOrders } from './ownerOrderApi'
import type { OwnerSurveyOrder } from './ownerOrderTypes'
import { canConfirmOwnerAppointment, canRescheduleOwnerAppointment, ownerGuid, ownerOrderStatusQuery, validOwnerVersion } from './ownerOrderWorkflow'
import { getPaymentHistory } from './paymentApi'
import { appointmentStatusLabels, orderStatusLabels } from './orderWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { SurveyPaymentPanel } from './SurveyPaymentPanel'
import { SurveyInvoiceLines } from './SurveyInvoiceLines'
import { v3OperationFor, type V3Operation } from './v3Workflow'
import { appointmentScheduleLabel, dateTime, workflowError } from './workflow'

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
          { title: 'Dịch vụ', dataIndex: 'serviceName' },
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
  const [cancelAction, setCancelAction] = useState<Action | null>(null)
  const query = useQuery({ queryKey: ['owner-survey-order', tenantId, orderId], queryFn: ({ signal }) => getOwnerOrder(token, orderId, signal), retry: false,
    refetchOnWindowFocus: writes === 0, refetchInterval: value => writes === 0 && value.state.data && !['COMPLETED', 'CANCELLED'].includes(value.state.data.status) ? 10000 : false })
  const invoiceKey = ['owner-survey-invoice', tenantId, orderId] as const
  const canViewInvoice = query.data?.status === 'AWAITING_SETTLEMENT' || query.data?.status === 'COMPLETED'
  const invoice = useQuery({ queryKey: invoiceKey, queryFn: ({ signal }) => getOwnerOrderInvoice(token, orderId, signal),
    enabled: canViewInvoice && !query.isError, retry: false })
  const history = useQuery({ queryKey: ['owner-payment-history', tenantId, orderId], queryFn: ({ signal }) => getPaymentHistory(token, orderId, signal), retry: false,
    enabled: !!query.data && !query.isError, refetchOnWindowFocus: writes === 0,
    refetchInterval: value => writes === 0 && value.state.data?.payments.some(item => ['PENDING', 'PROCESSING'].includes(item.status)) ? 10000 : false })
  const refetchOrder = query.refetch
  const refreshOrder = useCallback(async () => {
    await refetchOrder()
    await client.invalidateQueries({ queryKey: ['owner-survey-orders', tenantId] })
  }, [client, refetchOrder, tenantId])
  useEffect(() => { if (history.dataUpdatedAt) void refreshOrder() }, [history.dataUpdatedAt, refreshOrder])
  async function refresh() { setAction(null); await Promise.all([refreshOrder(), history.refetch()]); await client.invalidateQueries({ queryKey: invoiceKey }) }
  const back = <Link className="back-link" to="/survey-payments"><ArrowLeftOutlined /> Đơn khảo sát & thanh toán</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải đơn khảo sát" /></>
  if (!query.data) return <>{back}<SurveyMutationError error={query.error} /><Button onClick={() => { void query.refetch() }}>Tải lại đơn</Button></>
  const order = query.data, appointment = order.currentAppointment
  const busy = query.isFetching || query.isError || writes > 0
  const canCancel = validOwnerVersion(order.orderVersion) && ['AWAITING_APPOINTMENT', 'AWAITING_DEPOSIT', 'READY_FOR_CAPTURE'].includes(order.status)
  function askToCancel() {
    let operation: V3Operation | null = null
    setCancelAction({
      title: 'Hủy đơn khảo sát',
      description: 'Máy chủ sẽ áp dụng chính sách hủy đã chốt của đơn và ghi nhận khoản phải hoàn nếu có.',
      danger: true,
      fields: [{ key: 'reason', label: 'Lý do hủy', kind: 'multiline', max: 500 }],
      run: async values => {
        const body = { expectedOrderVersion: order.orderVersion, reasonCode: 'CUSTOMER_BEFORE_CAPTURE', reasonDescription: text(values, 'reason') }
        operation = await v3OperationFor(operation, body)
        const { operationId, payloadFingerprint } = operation
        const result = await cancelOwnerOrder(token, orderId, { ...body, operationId, payloadFingerprint })
        if (!result.success || result.orderId.toLowerCase() !== orderId) throw new Error('Chưa xác nhận được kết quả hủy. Hãy tải lại đơn khảo sát.')
      },
      after: refresh,
      success: 'Đã hủy đơn khảo sát',
    })
  }
  return <>{back}
    <section className="resource-page-heading"><div><span className="page-kicker">Đơn khảo sát & thanh toán</span><h1>{order.farmName}</h1><p>{orderStatusLabels[order.status] ?? order.status}</p><CopyReference value={order.orderNumber} label="Sao chép mã đơn" /></div><Button icon={<ReloadOutlined />} disabled={writes > 0 || !!action} loading={query.isFetching} onClick={() => { void refresh() }}>Tải lại</Button></section>
    {notice ? <Alert className="workflow-notice" showIcon type="success" title={notice} /> : null}
    <SurveyMutationError error={query.isError ? query.error : null} />
    {order.status === 'COMPLETED' ? <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><strong>Kết quả khảo sát</strong>
        <Link className="workflow-detail-link" to={`/survey-payments/${encodeURIComponent(orderId)}/result`}>Xem kết quả đã phát hành →</Link>
      </div>
    </section> : null}
    {!validOwnerVersion(order.orderVersion) ? <Alert className="workflow-notice" showIcon type="warning" title="Thông tin đơn chưa đầy đủ. Tải lại trước khi xác nhận lịch hoặc thanh toán." /> : null}
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Lịch bay</strong><span>{appointment ? 'Manager đề xuất, bạn xác nhận' : 'Chờ Manager đề xuất lịch'}</span></div>{appointment ? <Tag>{appointmentStatusLabels[appointment.status] ?? appointment.status}</Tag> : null}</div>
      {appointment ? <><dl className="detail-list"><div><dt>Ngày bay</dt><dd>{appointmentScheduleLabel(null, null, null, appointment.startAt, appointment.endAt)}</dd></div></dl>
        <Space wrap>{canConfirmOwnerAppointment(order) ? <Button type="primary" disabled={busy || !!action} onClick={() => { setNotice(''); setAction({ kind: 'confirm', snapshot: order }) }}>Xác nhận lịch</Button> : null}
          {canRescheduleOwnerAppointment(order) ? <Button disabled={busy || !!action} onClick={() => { setNotice(''); setAction({ kind: 'reschedule', snapshot: order }) }}>Yêu cầu đổi lịch</Button> : null}
        </Space>
        {appointment.status === 'PROPOSED' && Date.parse(appointment.endAt) <= Date.now() ? <p className="form-hint">Lịch hẹn đã hết thời gian xác nhận. Hãy yêu cầu Manager đề xuất lại.</p> : null}
        {appointment.status === 'RESCHEDULE_REQUESTED' ? <p className="form-hint">Lịch đang chờ đổi (bạn đã yêu cầu đổi lịch hoặc Manager ghi nhận vắng mặt). Chờ Manager đề xuất thời gian mới.</p> : null}
      </> : <p>Chờ Manager đề xuất lịch bay. Lịch chỉ chính thức khi bạn xác nhận.</p>}
    </section>
    <div className="workflow-section"><SurveyPaymentPanel order={order} history={history} refreshOrder={refreshOrder} disabled={busy || !!action || !!cancelAction} /></div>
    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Hóa đơn khảo sát</strong></div><CreditCardOutlined aria-hidden="true" /></div>
      {canViewInvoice && invoice.isError ? <SurveyMutationError error={invoice.error} />
        : canViewInvoice && invoice.data ? <><SurveyInvoiceLines invoice={invoice.data} />
          <OwnerBalanceCheckout token={token} tenantId={tenantId} order={order} invoice={invoice.data}
            disabled={busy || !!action || !!cancelAction || invoice.isFetching} refresh={refresh} />
        </>
        : canViewInvoice && invoice.isFetching ? <p>Đang tải hóa đơn…</p>
        : <p className="form-hint">Hóa đơn được hiển thị sau khi chốt kết quả khảo sát.</p>}
    </section>
    {canCancel ? <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Hủy đơn khảo sát</strong></div>
        <Button danger disabled={busy || !!action || !!cancelAction} onClick={askToCancel}>Hủy đơn</Button>
      </div>
    </section> : null}
    {cancelAction ? <ActionModal action={cancelAction} close={() => setCancelAction(null)} /> : null}
    {action ? <OwnerAppointmentDialog token={token} tenantId={tenantId} action={action} current={order} disabled={query.isFetching || query.isError} close={() => { setAction(null); void refresh() }} done={async () => {
      setNotice(action.kind === 'confirm' ? 'Đã xác nhận lịch bay. Trả cọc nếu còn thiếu; khoản còn lại được chốt sau khi duyệt kết quả.' : 'Đã gửi yêu cầu đổi lịch. Chờ Manager đề xuất lại.')
      setAction(null); await refresh()
    }} /> : null}
  </>
}
