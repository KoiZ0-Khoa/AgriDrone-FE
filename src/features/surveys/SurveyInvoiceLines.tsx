import type { OwnerSurveyOrder } from './ownerOrderTypes'
import { money } from './paymentWorkflow'
import { priceLabel } from './workflow'

type Invoice = Pick<OwnerSurveyOrder, 'currency' | 'confirmedMappingPoleCount' | 'confirmedPlantHealthPoleCount' | 'mappingPricePerPole' | 'plantHealthPricePerPole' | 'mappingSubtotal' | 'plantHealthSubtotal' | 'comboDiscountPercentage' | 'comboDiscountAmount'>

// Display the saved server invoice; counts may differ between the full map and Health scope.
export function SurveyInvoiceLines({ invoice }: { invoice: Invoice }) {
  if (invoice.confirmedMappingPoleCount == null && invoice.confirmedPlantHealthPoleCount == null) return null
  return <>
    <div><dt>Trụ bản đồ nền</dt><dd>{invoice.confirmedMappingPoleCount?.toLocaleString('vi-VN') ?? 'Chưa xác định'} trụ</dd></div>
    <div><dt>Đơn giá bản đồ nền</dt><dd>{invoice.mappingPricePerPole == null ? 'Chưa xác định' : priceLabel(invoice.mappingPricePerPole, invoice.currency)}</dd></div>
    <div><dt>Thành tiền bản đồ nền</dt><dd>{money(invoice.mappingSubtotal, invoice.currency)}</dd></div>
    <div><dt>Trụ khảo sát sức khỏe</dt><dd>{invoice.confirmedPlantHealthPoleCount?.toLocaleString('vi-VN') ?? 'Chưa xác định'} trụ</dd></div>
    <div><dt>Đơn giá khảo sát sức khỏe</dt><dd>{invoice.plantHealthPricePerPole == null ? 'Chưa xác định' : priceLabel(invoice.plantHealthPricePerPole, invoice.currency)}</dd></div>
    <div><dt>Thành tiền khảo sát sức khỏe</dt><dd>{money(invoice.plantHealthSubtotal, invoice.currency)}</dd></div>
    <div><dt>Giảm giá Combo{invoice.comboDiscountPercentage == null ? '' : ` (${invoice.comboDiscountPercentage.toLocaleString('vi-VN')}%)`}</dt><dd>{money(invoice.comboDiscountAmount, invoice.currency)}</dd></div>
  </>
}
