import { CopyReference } from '../../components/RecordReference'
﻿import { CreditCardOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, type UseQueryResult } from '@tanstack/react-query'
import { Alert, Button, Modal, Space, Table, Tag } from 'antd'
import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../../api/client'
import { initiateDepositCheckout } from './v3Api'
import { checkoutStorageKey, depositCheckoutMatchesOrder, forgetCheckout, readCheckout, rememberCheckout, restoredCheckoutMatches } from './checkoutStorage'
import type { PaymentSession } from './orderTypes'
import type { OwnerSurveyOrder } from './ownerOrderTypes'
import { activePaymentStatus, canInitiateOwnerDeposit, historyMatchesOrder, ownerDepositBody, ownerOrderFingerprint } from './ownerOrderWorkflow'
import { money, paymentCheckoutUrl, paymentIsPaid, paymentPurposeLabels, paymentStatusLabels, type PaymentHistory, type PaymentHistoryItem } from './paymentWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime } from './workflow'

export function SurveyPaymentPanel({ order, history, refreshOrder, disabled = false }: { order: OwnerSurveyOrder; history: UseQueryResult<PaymentHistory, Error>; refreshOrder: () => Promise<unknown>; disabled?: boolean }) {
  const { session } = useAuth()
  const confirmButtonId = useId()
  const token = session!.accessToken
  const storageKey = checkoutStorageKey(session!.tenant!.id, session!.email, order.surveyOrderId)
  const [confirm, setConfirm] = useState<OwnerSurveyOrder | null>(null)
  const [checkout, setCheckout] = useState<PaymentSession | null>(() => readCheckout(storageKey, order.surveyOrderId))
  const [restored, setRestored] = useState(true)
  const submitting = useRef(false)
  const payment = useMutation({ mutationKey: ['owner-order-write', session!.tenant!.id, order.surveyOrderId], retry: false,
    mutationFn: async (snapshot: OwnerSurveyOrder) => {
      if (ownerOrderFingerprint(snapshot) !== ownerOrderFingerprint(order) || history.isError || history.isFetching) throw new Error('Đơn đã thay đổi. Tải lại và kiểm tra trước khi thanh toán.')
      const result = await initiateDepositCheckout(token, snapshot.surveyOrderId, ownerDepositBody(snapshot, history.data))
      if (!depositCheckoutMatchesOrder(result, snapshot) || !paymentCheckoutUrl(result, snapshot.surveyOrderId)) {
        throw new Error('Phiên trả cọc không khớp với đơn hoặc lịch bay. Hãy kiểm tra trạng thái giao dịch.')
      }
      return result
    }, onSuccess: async result => { setCheckout(result); setRestored(false); rememberCheckout(storageKey, result); setConfirm(null); await Promise.all([history.refetch(), refreshOrder()]) },
    onError: async () => { setConfirm(null); await Promise.all([history.refetch(), refreshOrder()]) }, onSettled: () => { submitting.current = false } })
  const awaitingDeposit = order.status === 'AWAITING_DEPOSIT'
  const orderHistory = !history.isError && historyMatchesOrder(order, history.data) ? history.data : undefined
  const active = orderHistory?.payments.find(item => item.purpose === 'ORDER_DEPOSIT' && activePaymentStatus(item.status))
  const currentCheckout = checkout && orderHistory?.payments.find(item => item.surveyPaymentId === checkout.surveyPaymentId && item.purpose === 'ORDER_DEPOSIT')
  const checkoutClosed = !!checkout && (!depositCheckoutMatchesOrder(checkout, order) || (!!currentCheckout && !['PENDING', 'PROCESSING'].includes(currentCheckout.status)))
  const canPay = session?.role === 'OWNER' && !disabled && !history.isFetching && !payment.isPending && !payment.error && !checkout && canInitiateOwnerDeposit(order, orderHistory)
  // The shared history endpoint may fail to serialize ORDER_DEPOSIT after creation. Keep the link from the current POST while the order still matches.
  const historyUnavailable = history.error instanceof ApiError && history.error.status >= 500
  const verifiedSession = checkout && restoredCheckoutMatches(checkout, order, orderHistory)
  const freshSession = checkout && !restored && !currentCheckout && (!history.isError || historyUnavailable) && depositCheckoutMatchesOrder(checkout, order)
  let url: string | null = null, checkoutError: Error | null = null
  try { if (checkout && (verifiedSession || freshSession)) url = paymentCheckoutUrl(checkout, order.surveyOrderId) } catch (error) { checkoutError = error as Error }
  useEffect(() => {
    if (checkoutClosed) { forgetCheckout(storageKey); setCheckout(null) }
  }, [checkoutClosed, storageKey])
  async function refresh() { await Promise.all([history.refetch(), refreshOrder()]); if (!payment.isPending) payment.reset() }
  const staleConfirm = confirm !== null && ownerOrderFingerprint(confirm) !== ownerOrderFingerprint(order)
  function start() { if (!confirm || !canPay || staleConfirm || submitting.current) return; submitting.current = true; payment.mutate(confirm) }
  return <section className="resource-panel">
    <div className="resource-panel-heading"><div><strong>Thanh toán</strong><span>Cọc khảo sát và khoản còn lại</span></div><Button icon={<ReloadOutlined />} loading={history.isFetching} disabled={payment.isPending} onClick={() => { void refresh() }}>Kiểm tra trạng thái</Button></div>
    {awaitingDeposit ? <div className="payment-summary"><div><span className="payment-summary-label">Cọc khảo sát</span><strong>{checkout && url ? money(checkout.amount, checkout.currency) : 'Xem số tiền khi tạo phiên trả cọc'}</strong></div><Button type="primary" size="large" icon={<CreditCardOutlined />} disabled={!canPay} loading={payment.isPending} onClick={() => setConfirm(order)}>Trả cọc</Button></div> : null}
    {awaitingDeposit && order.currentAppointment?.status !== 'CONFIRMED' ? <Alert className="workflow-notice" type="info" showIcon title="Xác nhận lịch bay trước khi trả cọc." /> : null}
    {awaitingDeposit && order.currentAppointment?.status === 'CONFIRMED' && Date.parse(order.currentAppointment.endAt) <= Date.now() ? <Alert className="workflow-notice" type="warning" showIcon title="Lịch hẹn đã hết thời gian. Liên hệ Manager để điều chỉnh lịch trước khi trả cọc." /> : null}
    {order.status === 'READY_FOR_CAPTURE' ? <Alert className="workflow-notice" type="success" showIcon title="Đơn đã đủ điều kiện tiền cọc và sẵn sàng chuẩn bị bay." /> : null}
    {awaitingDeposit && active && !url ? <Alert className="workflow-notice" type="warning" showIcon title={active.status === 'ADJUSTMENT_REQUIRED' ? 'Khoản cọc cần được quản trị viên đối soát.' : 'Đã có giao dịch cọc'} description="Kiểm tra lại trạng thái giao dịch. Nếu phiên đã hết hạn hoặc không thể mở lại, liên hệ hỗ trợ." /> : null}
    <SurveyMutationError error={payment.error ?? checkoutError} />
    {history.isError ? <Alert className="workflow-notice" showIcon type="warning" title="Chưa tải được lịch sử thanh toán." description={<SurveyMutationError error={history.error} />} /> : null}
    {payment.error ? <Button onClick={() => { void refresh() }}>Tải lại và kiểm tra trước khi thử lại</Button> : null}
    {checkout && url ? <div className="workflow-notice">
      <Alert showIcon type="info" title="Chờ xác nhận từ máy chủ" description="Sau khi trả cọc, bấm Kiểm tra trạng thái." />
      <p>Số tiền của phiên: <strong>{money(checkout.amount, checkout.currency)}</strong></p>
      <Space className="workflow-toolbar" wrap><Button type="primary" href={url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán</Button><span>Hết hạn: {dateTime(checkout.expiresAt)}</span></Space>
    </div> : null}
    {checkout && !url && !history.isFetching && !history.isPending ? <Button onClick={() => { forgetCheckout(storageKey); setCheckout(null); void refresh() }}>Đóng phiên và tải lại</Button> : null}
    <h2 className="payment-history-title">Lịch sử thanh toán</h2>
    <Table<PaymentHistoryItem> rowKey="surveyPaymentId" loading={history.isPending} dataSource={orderHistory?.payments ?? []} pagination={false} scroll={{ x: 650 }} locale={{ emptyText: history.isError ? 'Chưa tải được lịch sử.' : 'Chưa có giao dịch.' }} columns={[
      { title: 'Khoản thanh toán', render: (_, item) => paymentPurposeLabels[item.purpose] ?? item.purpose },
      { title: 'Số tiền', render: (_, item) => money(item.amount, item.currency) },
      { title: 'Trạng thái', render: (_, item) => <Tag color={paymentIsPaid(item.status) ? 'success' : item.status === 'FAILED' ? 'error' : 'default'}>{paymentStatusLabels[item.status] ?? item.status}</Tag> },
      { title: 'Thời điểm', render: (_, item) => dateTime(item.confirmedAt ?? item.createdAt) },
    ]} expandable={{ expandedRowRender: item => <><CopyReference value={item.providerReference ?? item.surveyPaymentId} label="Sao chép mã giao dịch" /><p>Cổng thanh toán: {item.provider}</p>{item.events.map((event, index) => <p key={index}>{event.eventType} · {dateTime(event.occurredAt)}</p>)}</> }} />
    <Modal title="Trả cọc khảo sát" open={confirm !== null} afterOpenChange={open => { if (open) document.getElementById(confirmButtonId)?.focus() }} onCancel={() => { if (!payment.isPending) setConfirm(null) }} onOk={start} okText="Tạo phiên trả cọc" cancelText="Hủy" confirmLoading={payment.isPending} closable={!payment.isPending} mask={{ closable: !payment.isPending }} cancelButtonProps={{ disabled: payment.isPending }} okButtonProps={{ disabled: !canPay || staleConfirm, autoFocus: true, id: confirmButtonId }}>
      {staleConfirm ? <Alert showIcon type="warning" title="Đơn đã thay đổi. Đóng và kiểm tra lại lịch hẹn trước khi thanh toán." /> : null}
      <p>Số tiền cọc của đơn sẽ hiển thị sau khi tạo phiên. Kiểm tra số tiền trước khi mở trang thanh toán.</p>
    </Modal>
  </section>
}
