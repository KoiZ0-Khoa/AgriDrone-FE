import { CopyReference } from '../../components/RecordReference'
﻿import { CreditCardOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, type UseQueryResult } from '@tanstack/react-query'
import { Alert, Button, Modal, Space, Table, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { initiateSurveyPayment } from './orderApi'
import { checkoutStorageKey, forgetCheckout, readCheckout, rememberCheckout, restoredCheckoutMatches } from './checkoutStorage'
import type { PaymentSession } from './orderTypes'
import type { OwnerSurveyOrder } from './ownerOrderTypes'
import { activePaymentStatus, canInitiateOwnerPayment, ownerOrderFingerprint, ownerPaymentBody, payableAmount, paymentPurposeForOrder, purposeAlreadyPaid } from './ownerOrderWorkflow'
import { money, paymentCheckoutUrl, paymentIsPaid, paymentPurposeLabels, paymentStatusLabels, type PaymentHistory, type PaymentHistoryItem } from './paymentWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime } from './workflow'

export function SurveyPaymentPanel({ order, history, refreshOrder, disabled = false }: { order: OwnerSurveyOrder; history: UseQueryResult<PaymentHistory, Error>; refreshOrder: () => Promise<unknown>; disabled?: boolean }) {
  const { session } = useAuth()
  const token = session!.accessToken
  const storageKey = checkoutStorageKey(session!.tenant!.id, session!.email, order.surveyOrderId)
  const [confirm, setConfirm] = useState<OwnerSurveyOrder | null>(null)
  const [checkout, setCheckout] = useState<PaymentSession | null>(() => readCheckout(storageKey, order.surveyOrderId))
  const [restored, setRestored] = useState(true)
  const submitting = useRef(false)
  const payment = useMutation({ mutationKey: ['owner-order-write', session!.tenant!.id, order.surveyOrderId], retry: false,
    mutationFn: async (snapshot: OwnerSurveyOrder) => {
      if (ownerOrderFingerprint(snapshot) !== ownerOrderFingerprint(order) || history.isError || history.isFetching) throw new Error('Đơn đã thay đổi. Tải lại và kiểm tra trước khi thanh toán.')
      const result = await initiateSurveyPayment(token, snapshot.surveyOrderId, ownerPaymentBody(snapshot, history.data))
      paymentCheckoutUrl(result, snapshot.surveyOrderId)
      return result
    }, onSuccess: async result => { setCheckout(result); setRestored(false); rememberCheckout(storageKey, result); setConfirm(null); await Promise.all([history.refetch(), refreshOrder()]) },
    onError: async () => { setConfirm(null); await history.refetch() }, onSettled: () => { submitting.current = false } })
  const purpose = paymentPurposeForOrder(order), amount = payableAmount(order)
  const paid = purposeAlreadyPaid(order, history.data)
  const active = purpose ? history.data?.payments.find(item => item.purpose === purpose && activePaymentStatus(item.status)) : undefined
  const canPay = session?.role === 'OWNER' && !disabled && !history.isError && !history.isPending && !history.isFetching && !payment.isPending && !payment.error && !checkout && canInitiateOwnerPayment(order, history.data)
  const currentCheckout = checkout ? history.data?.payments.find(item => item.surveyPaymentId === checkout.surveyPaymentId) : undefined
  const checkoutState = currentCheckout?.status ?? (restored ? undefined : checkout?.paymentStatus)
  const checkoutPaid = checkoutState ? paymentIsPaid(checkoutState) : false
  const checkoutAmount = currentCheckout?.amount ?? (restored ? null : checkout?.amount ?? null)
  const checkoutCurrency = currentCheckout?.currency ?? checkout?.currency ?? order.currency
  let url: string | null = null, checkoutError: Error | null = null
  const verifiedSession = !restored || (checkout !== null && restoredCheckoutMatches(checkout, order, history.data))
  try { if (checkout && !checkoutPaid && !history.isError && verifiedSession) url = paymentCheckoutUrl({ ...checkout, paymentStatus: checkoutState! }, order.surveyOrderId) } catch (error) { checkoutError = error as Error }
  useEffect(() => { if (currentCheckout && !['PENDING', 'PROCESSING'].includes(currentCheckout.status)) forgetCheckout(storageKey) }, [currentCheckout?.status, storageKey])
  async function refresh() { await Promise.all([history.refetch(), refreshOrder()]); if (!payment.isPending) payment.reset() }
  const staleConfirm = confirm !== null && ownerOrderFingerprint(confirm) !== ownerOrderFingerprint(order)
  function start() { if (!confirm || !canPay || staleConfirm || submitting.current) return; submitting.current = true; payment.mutate(confirm) }
  return <section className="resource-panel">
    <div className="resource-panel-heading"><div><strong>Thanh toán</strong><span>Cọc bản đồ nền và khoản còn lại</span></div><Button icon={<ReloadOutlined />} loading={history.isFetching} disabled={payment.isPending} onClick={() => { void refresh() }}>Kiểm tra trạng thái</Button></div>
    {purpose ? <div className="payment-summary"><div><span>{paymentPurposeLabels[purpose]}</span><strong>{money(amount, order.currency)}</strong></div><Button type="primary" icon={<CreditCardOutlined />} disabled={!canPay} loading={payment.isPending} onClick={() => setConfirm(order)}>{amount === 0 ? 'Hoàn tất số dư 0' : 'Thanh toán'}</Button></div> : <p className="form-hint">Đơn chưa đến bước thanh toán hoặc đã chuyển sang bước tiếp theo. Bạn có thể xem các giao dịch bên dưới.</p>}
    {purpose && order.currentAppointment?.status !== 'CONFIRMED' ? <Alert className="workflow-notice" type="info" showIcon title="Xác nhận lịch hẹn trước khi thanh toán." /> : null}
    {purpose && order.currentAppointment?.status === 'CONFIRMED' && Date.parse(order.currentAppointment.endAt) <= Date.now() ? <Alert className="workflow-notice" type="warning" showIcon title="Lịch hẹn đã hết thời gian. Liên hệ Manager để điều chỉnh lịch trước khi thanh toán." /> : null}
    {paid ? <Alert className="workflow-notice" type="success" showIcon title="Máy chủ đã xác nhận khoản thanh toán này." /> : null}
    {active && !paid && !checkout ? <Alert className="workflow-notice" type="warning" showIcon title={active.status === 'ADJUSTMENT_REQUIRED' ? 'Khoản thanh toán cần được quản trị viên đối soát.' : 'Đã có giao dịch đang xử lý'} description="Không tạo thêm giao dịch. Nếu trang thanh toán còn mở, hãy tiếp tục tại đó rồi kiểm tra trạng thái. Nếu đã đóng hoặc hết hạn, liên hệ hỗ trợ để kiểm tra phiên thanh toán." /> : null}
    <SurveyMutationError error={payment.error ?? (history.isError ? history.error : null) ?? checkoutError} />
    {payment.error ? <Button onClick={() => { void refresh() }}>Tải lại và kiểm tra trước khi thử lại</Button> : null}
    {checkout ? <div className="workflow-notice"><Alert showIcon type={checkoutPaid ? 'success' : 'info'} title={checkoutPaid ? 'Đã thanh toán' : 'Chờ xác nhận từ máy chủ'} description={checkoutPaid ? 'Trạng thái đã được máy chủ xác nhận.' : 'Sau khi trả tiền, bấm Kiểm tra trạng thái. Việc trở về web không tự xác nhận giao dịch.'} /><p>Số tiền của phiên: <strong>{money(checkoutAmount, checkoutCurrency)}</strong></p>{url ? <Space className="workflow-toolbar" wrap><Button type="primary" href={url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán</Button><span>Hết hạn: {dateTime(checkout.expiresAt)}</span></Space> : null}
      {restored && !verifiedSession && !checkoutPaid ? <p className="form-hint">Đang đối chiếu phiên thanh toán đã lưu với máy chủ. Chỉ mở lại khi giao dịch và lịch hẹn khớp.</p> : null}
      {checkoutPaid || checkoutError || (restored && !verifiedSession && !history.isFetching && !history.isPending) || (checkoutState && ['FAILED', 'REFUNDED'].includes(checkoutState)) ? <Button onClick={() => { forgetCheckout(storageKey); setCheckout(null); void refresh() }}>Đóng kết quả và tải lại</Button> : null}
    </div> : null}
    <h2 className="payment-history-title">Lịch sử thanh toán</h2>
    <Table<PaymentHistoryItem> rowKey="surveyPaymentId" loading={history.isPending} dataSource={history.isError ? [] : history.data?.payments ?? []} pagination={false} scroll={{ x: 650 }} locale={{ emptyText: history.isError ? 'Chưa tải được lịch sử.' : 'Chưa có giao dịch.' }} columns={[
      { title: 'Khoản thanh toán', render: (_, item) => paymentPurposeLabels[item.purpose] ?? item.purpose },
      { title: 'Số tiền', render: (_, item) => money(item.amount, item.currency) },
      { title: 'Trạng thái', render: (_, item) => <Tag color={paymentIsPaid(item.status) ? 'success' : item.status === 'FAILED' ? 'error' : 'default'}>{paymentStatusLabels[item.status] ?? item.status}</Tag> },
      { title: 'Thời điểm', render: (_, item) => dateTime(item.confirmedAt ?? item.createdAt) },
    ]} expandable={{ expandedRowRender: item => <><CopyReference value={item.providerReference ?? item.surveyPaymentId} label="Sao chép mã giao dịch" /><p>Cổng thanh toán: {item.provider}</p>{item.events.map((event, index) => <p key={index}>{event.eventType} · {dateTime(event.occurredAt)}</p>)}</> }} />
    <Modal title={confirm ? paymentPurposeLabels[paymentPurposeForOrder(confirm)!] : 'Thanh toán'} open={confirm !== null} onCancel={() => { if (!payment.isPending) setConfirm(null) }} onOk={start} okText="Tạo phiên thanh toán" cancelText="Hủy" confirmLoading={payment.isPending} closable={!payment.isPending} mask={{ closable: !payment.isPending }} cancelButtonProps={{ disabled: payment.isPending }} okButtonProps={{ disabled: !canPay || staleConfirm }}>
      {staleConfirm ? <Alert showIcon type="warning" title="Đơn đã thay đổi. Đóng và kiểm tra lại số tiền, lịch hẹn trước khi thanh toán." /> : null}
      <p>Số tiền: <strong>{confirm ? money(payableAmount(confirm), confirm.currency) : '—'}</strong></p><p>Thanh toán qua cổng do hệ thống cung cấp. Kết quả được cập nhật sau khi máy chủ xác nhận.</p>
    </Modal>
  </section>
}
