import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Modal, Space } from 'antd'
import { useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { createOwnerBalanceCheckout, getOwnerOrderInvoice } from './ownerOrderApi'
import type { OwnerSurveyInvoice, OwnerSurveyOrder } from './ownerOrderTypes'
import { money, paymentCheckoutUrl } from './paymentWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime } from './workflow'

type InvoiceSnapshot = Pick<OwnerSurveyInvoice, 'invoiceRevisionNumber' | 'dueAmount' | 'currency'>

export function OwnerBalanceCheckout({ token, tenantId, order, invoice, disabled, refresh }: {
  token: string; tenantId: string; order: OwnerSurveyOrder; invoice: OwnerSurveyInvoice
  disabled: boolean; refresh: () => Promise<unknown>
}) {
  const [confirmed, setConfirmed] = useState<InvoiceSnapshot | null>(null)
  const operation = useRef<{ fingerprint: string; key: string } | null>(null)
  const submitting = useRef(false)
  const mutation = useMutation({
    mutationKey: ['owner-order-write', tenantId, order.surveyOrderId],
    retry: false,
    mutationFn: async (snapshot: InvoiceSnapshot) => {
      const fresh = await getOwnerOrderInvoice(token, order.surveyOrderId)
      if (!fresh?.checkoutToken || fresh.dueAmount <= 0 || fresh.invoiceRevisionNumber !== snapshot.invoiceRevisionNumber ||
          fresh.dueAmount !== snapshot.dueAmount || fresh.currency !== snapshot.currency) {
        throw new Error('Hóa đơn hoặc số tiền còn lại đã thay đổi. Kiểm tra lại trước khi thanh toán.')
      }
      const fingerprint = JSON.stringify([order.orderVersion, fresh.invoiceRevisionNumber, fresh.dueAmount, fresh.currency])
      if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, key: crypto.randomUUID() }
      const result = await createOwnerBalanceCheckout(token, order.surveyOrderId, fresh.checkoutToken, operation.current.key)
      if (result.orderId.toLowerCase() !== order.surveyOrderId.toLowerCase() || result.invoiceRevisionNumber !== fresh.invoiceRevisionNumber ||
          result.amount !== fresh.dueAmount || result.currency !== fresh.currency) {
        throw new Error('Phiên thanh toán không khớp hóa đơn. Hãy kiểm tra lại trạng thái giao dịch.')
      }
      return result
    },
    onError: error => {
      if (error instanceof ApiError && error.code === 'Payment.ProviderUnavailable') operation.current = null
    },
    onSettled: async () => {
      setConfirmed(null)
      submitting.current = false
      await refresh()
    },
  })
  if (order.status !== 'AWAITING_SETTLEMENT') return null
  const checkout = mutation.data
  let url: string | null = null
  let linkError: Error | null = null
  if (checkout && checkout.invoiceRevisionNumber === invoice.invoiceRevisionNumber && checkout.amount === invoice.dueAmount && checkout.currency === invoice.currency) {
    try {
      url = paymentCheckoutUrl({
        surveyOrderId: checkout.orderId, amount: checkout.amount, paymentStatus: checkout.paymentStatus,
        expiresAt: checkout.expiresAt ?? '', redirectUrl: checkout.redirectUrl,
      }, order.surveyOrderId)
    } catch (error) { linkError = error instanceof Error ? error : new Error('Liên kết thanh toán không hợp lệ.') }
  }
  if (invoice.dueAmount === 0) return <Alert className="workflow-notice" type="info" showIcon title="Đã đủ tiền. Đang chờ hệ thống phát hành kết quả." />
  const changed = confirmed && (confirmed.invoiceRevisionNumber !== invoice.invoiceRevisionNumber ||
    confirmed.dueAmount !== invoice.dueAmount || confirmed.currency !== invoice.currency)
  return <div className="workflow-notice">
    <SurveyMutationError error={mutation.error ?? linkError} />
    {url && checkout ? <Space wrap>
      <Button type="primary" href={url} target="_blank" rel="noopener noreferrer">Mở trang thanh toán phần còn lại</Button>
      <span>Hết hạn {dateTime(checkout.expiresAt)}</span>
    </Space> : <Button type="primary" disabled={disabled || mutation.isPending || !invoice.checkoutToken}
      loading={mutation.isPending} onClick={() => setConfirmed(invoice)}>Thanh toán phần còn lại</Button>}
    <Modal title="Xác nhận số tiền thanh toán" open={confirmed !== null} okText="Tạo phiên thanh toán" cancelText="Quay lại"
      confirmLoading={mutation.isPending} okButtonProps={{ disabled: disabled || !!changed || mutation.isPending }}
      cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending}
      onCancel={() => { if (!mutation.isPending) setConfirmed(null) }}
      onOk={() => {
        if (!confirmed || changed || disabled || submitting.current) return
        submitting.current = true
        mutation.mutate(confirmed)
      }}>
      {changed ? <Alert type="warning" showIcon title="Hóa đơn đã thay đổi. Mở lại thông tin thanh toán để xác nhận số mới." /> : null}
      <p>Số tiền còn lại <strong>{confirmed ? money(confirmed.dueAmount, confirmed.currency) : null}</strong></p>
    </Modal>
  </div>
}
