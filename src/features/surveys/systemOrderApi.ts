import { apiRequest } from '../../api/client'
import type { Page } from './types'
import type { SystemOrder, SystemOrderFilters } from './systemOrderTypes'

const orders = '/api/system-admin/survey-orders'

export function getSystemOrders(token: string, page: number, filters: SystemOrderFilters, signal?: AbortSignal) {
  const params = new URLSearchParams({ pageNumber: String(page), pageSize: '20' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return apiRequest<Page<SystemOrder>>(`${orders}?${params}`, { token, signal })
}
