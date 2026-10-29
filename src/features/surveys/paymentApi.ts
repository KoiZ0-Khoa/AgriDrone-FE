import { apiRequest } from '../../api/client'
import type { PaymentHistory } from './paymentWorkflow'

export async function getPaymentHistory(token: string, orderId: string, signal?: AbortSignal) {
  const history = await apiRequest<PaymentHistory>(`/api/tenant-owner/survey-orders/${encodeURIComponent(orderId)}/payments`, { token, signal })
  if (history.surveyOrderId !== orderId) throw new Error('Lịch sử thanh toán không khớp đơn.')
  return history
}
