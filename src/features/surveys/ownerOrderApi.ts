import { ApiError, apiRequest } from '../../api/client'
import type { OwnerSurveyInvoice, OwnerSurveyOrder } from './ownerOrderTypes'
import { ownerOrderStatusQuery } from './ownerOrderWorkflow'
import type { Page } from './types'

const base = '/api/v3/tenant-owner/survey-orders'
export function getOwnerOrders(token: string, pageNumber = 1, status = '', signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: '20' })
  if (status) {
    if (!ownerOrderStatusQuery[status]) throw new Error('Trạng thái lọc đơn không hợp lệ.')
    params.set('status', ownerOrderStatusQuery[status])
  }
  return apiRequest<Page<OwnerSurveyOrder>>(`${base}?${params}`, { token, signal, cache: 'no-store' })
}
export async function getOwnerOrder(token: string, orderId: string, signal?: AbortSignal) {
  const order = await apiRequest<OwnerSurveyOrder>(`${base}/${encodeURIComponent(orderId)}`, { token, signal, cache: 'no-store' })
  if (order.surveyOrderId.toLowerCase() !== orderId.toLowerCase()) throw new Error('Thông tin đơn không khớp yêu cầu. Tải lại để kiểm tra.')
  return order
}

export async function getOwnerOrderInvoice(token: string, orderId: string, signal?: AbortSignal) {
  try {
    const invoice = await apiRequest<OwnerSurveyInvoice>(`${base}/${encodeURIComponent(orderId)}/invoice`, { token, signal, cache: 'no-store' })
    if (invoice.orderId.toLowerCase() !== orderId.toLowerCase()) throw new Error('Hóa đơn không khớp với đơn khảo sát.')
    return invoice
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === 'Invoice.NotFound') return null
    throw error
  }
}
