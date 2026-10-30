import type { PaymentSession } from './orderTypes'

export type PaymentHistoryItem = {
  surveyPaymentId: string; purpose: string; amount: number; currency: string; provider: string
  providerReference: string | null; status: string; createdAt: string; updatedAt: string
  confirmedAt: string | null; paymentVersion: number
  events: { eventType: string; occurredAt: string; receivedAt: string }[]
}
export type PaymentHistory = { surveyOrderId: string; payments: PaymentHistoryItem[] }

export const paymentPurposeLabels: Record<string, string> = { BASELINE_DEPOSIT: 'Cọc bản đồ nền', FINAL_BALANCE: 'Thanh toán còn lại' }
export const paymentStatusLabels: Record<string, string> = {
  PENDING: 'Chờ thanh toán', PROCESSING: 'Đang xử lý', PAID: 'Đã thanh toán', CONFIRMED: 'Đã thanh toán',
  FAILED: 'Không thành công', REFUNDED: 'Đã hoàn tiền', ADJUSTMENT_REQUIRED: 'Cần đối soát',
}
export function money(amount: number | null, currency = 'VND') {
  return amount === null ? 'Chưa xác định' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount)
}
export const paymentIsPaid = (status: string) => ['PAID', 'CONFIRMED'].includes(status)

// Checkout navigation never confirms a payment; confirmation is read from BE.
export function paymentCheckoutUrl(payment: PaymentSession, orderId: string, now = Date.now()) {
  if (payment.surveyOrderId !== orderId || !Number.isFinite(payment.amount) || payment.amount < 0) throw new Error('Thông tin thanh toán không khớp đơn. Tải lại để kiểm tra.')
  if (paymentIsPaid(payment.paymentStatus)) return null
  if (!['PENDING', 'PROCESSING'].includes(payment.paymentStatus)) return null
  if (!Number.isFinite(Date.parse(payment.expiresAt)) || Date.parse(payment.expiresAt) <= now) throw new Error('Phiên thanh toán đã hết hạn. Kiểm tra trạng thái trước khi tạo lại.')
  if (!payment.redirectUrl) throw new Error('Máy chủ chưa cung cấp liên kết thanh toán.')
  const url = new URL(payment.redirectUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Liên kết thanh toán không hợp lệ.')
  return url.href
}
