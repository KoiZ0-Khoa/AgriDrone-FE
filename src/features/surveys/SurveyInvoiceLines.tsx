import type { OwnerSurveyInvoice } from './ownerOrderTypes'
import { money } from './paymentWorkflow'
import { priceLabel } from './workflow'

export function SurveyInvoiceLines({ invoice }: { invoice: OwnerSurveyInvoice }) {
  return <dl className="detail-list">
    <div><dt>Phiên bản hóa đơn</dt><dd>{invoice.invoiceRevisionNumber}</dd></div>
    <div><dt>Số trụ tính phí</dt><dd>{invoice.verifiedBillablePoleCount.toLocaleString('vi-VN')} trụ</dd></div>
    <div><dt>Đơn giá</dt><dd>{priceLabel(invoice.pricePerPole, invoice.currency)}</dd></div>
    <div><dt>Tổng tiền dịch vụ</dt><dd>{money(invoice.totalAmount, invoice.currency)}</dd></div>
    <div><dt>Số tiền còn lại</dt><dd>{money(invoice.dueAmount, invoice.currency)}</dd></div>
  </dl>
}
