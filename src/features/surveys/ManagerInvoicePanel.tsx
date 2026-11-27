import { useQuery } from '@tanstack/react-query'
import { Alert, Button } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action, type Field } from '../../management/actions'
import { money } from './paymentWorkflow'
import { SurveyMutationError } from './SurveyMutationError'
import { finalizeManagerInvoice, getManagerInvoice } from './v3Api'
import type { ResultReview } from './v3Types'
import { v3OperationFor, type V3Operation } from './v3Workflow'

function finalizeAction(token: string, review: ResultReview, reload: () => Promise<void>): Action {
  const fields: Field[] = [{ key: 'reason', label: 'Lý do chốt hóa đơn', kind: 'multiline', max: 500 }]
  const zeroPoles = review.verifiedBillablePoleCount === 0
  if (zeroPoles) fields.push(
    { key: 'zeroCode', label: 'Mã lý do 0 trụ', max: 64 },
    { key: 'evidence', label: 'Tham chiếu bằng chứng 0 trụ', max: 500 },
  )
  let operation: V3Operation | null = null
  return {
    title: 'Chốt hóa đơn khảo sát',
    description: `Hóa đơn dùng kết quả nội bộ đã chốt với ${review.verifiedBillablePoleCount.toLocaleString('vi-VN')} trụ xác minh.`,
    fields,
    run: async values => {
      if (!review.currentApprovedResultRevisionId || !review.currentApprovedResultFingerprint) throw new Error('Tải lại kết quả nội bộ để lấy phiên bản đã chốt.')
      const body = {
        expectedOrderVersion: review.orderVersion,
        expectedApprovedResultRevisionId: review.currentApprovedResultRevisionId,
        expectedApprovedResultFingerprint: review.currentApprovedResultFingerprint,
        expectedCountSnapshotId: review.verifiedPoleCountSnapshotId,
        expectedCountFingerprint: review.countSnapshotFingerprint,
        finalizationReason: text(values, 'reason'),
        zeroPoleReasonCode: zeroPoles ? text(values, 'zeroCode') : null,
        zeroPoleEvidenceReference: zeroPoles ? text(values, 'evidence') : null,
      }
      operation = await v3OperationFor(operation, body)
      await finalizeManagerInvoice(token, review.orderId, { ...body, operationId: operation.operationId })
    },
    success: 'Đã chốt hóa đơn khảo sát',
    after: reload,
  }
}

export function ManagerInvoicePanel({ token, review, refreshing, reload }: {
  token: string; review: ResultReview; refreshing: boolean; reload: () => Promise<void>
}) {
  const [action, setAction] = useState<Action | null>(null)
  const query = useQuery({
    queryKey: ['manager-survey-invoice', review.orderId],
    queryFn: ({ signal }) => getManagerInvoice(token, review.orderId, signal),
    retry: false,
  })
  const needsFinalization = query.error instanceof ApiError && query.error.status === 409 && query.error.code === 'Invoice.NotFinalized'
  const invoice = query.data?.orderId === review.orderId ? query.data : null
  const canFinalize = needsFinalization && review.orderStatus.toUpperCase() === 'PROCESSING'
    && !!review.currentApprovedResultRevisionId && !!review.currentApprovedResultFingerprint
  return <section className="resource-panel workflow-section" aria-label="Hóa đơn khảo sát">
    <div className="resource-panel-heading"><div><strong>Hóa đơn khảo sát</strong><span>Số tiền được tính theo kết quả nội bộ và giá đã chốt của đơn.</span></div>
      <Button loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại hóa đơn</Button>
    </div>
    {query.isPending ? <p>Đang tải hóa đơn…</p> : null}
    {query.isError && !needsFinalization ? <SurveyMutationError error={query.error} /> : null}
    {needsFinalization ? <>
      <p>Chưa chốt hóa đơn. Số trụ đã xác minh {review.verifiedBillablePoleCount.toLocaleString('vi-VN')}.</p>
      {canFinalize ? <Button type="primary" disabled={refreshing || query.isFetching} onClick={() => setAction(finalizeAction(token, review, reload))}>Chốt hóa đơn</Button> : null}
    </> : null}
    {invoice && !query.isError ? <>
      <dl className="detail-list">
        <div><dt>Phiên bản hóa đơn</dt><dd>{invoice.invoiceRevisionNumber}</dd></div>
        <div><dt>Số trụ tính phí</dt><dd>{invoice.verifiedBillablePoleCount.toLocaleString('vi-VN')}</dd></div>
        <div><dt>Đơn giá mỗi trụ</dt><dd>{money(invoice.pricePerPole, invoice.currency)}</dd></div>
        <div><dt>Tổng tiền</dt><dd>{money(invoice.totalAmount, invoice.currency)}</dd></div>
        <div><dt>Cọc đã phân bổ</dt><dd>{money(invoice.validAllocatedDepositNet, invoice.currency)}</dd></div>
        <div><dt>Đã nhận</dt><dd>{money(invoice.confirmedNetReceipts, invoice.currency)}</dd></div>
        <div><dt>Còn phải trả</dt><dd>{money(invoice.dueAmount, invoice.currency)}</dd></div>
        {invoice.overpaymentAmount > 0 ? <div><dt>Trả thừa</dt><dd>{money(invoice.overpaymentAmount, invoice.currency)}</dd></div> : null}
      </dl>
      {invoice.hasOpenReconciliation ? <Alert type="warning" showIcon title="Quản trị viên cần đối soát thanh toán"
        description={invoice.reconciliationReasons?.map(reason => <div key={reason}>{reason}</div>)} /> : null}
    </> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </section>
}
