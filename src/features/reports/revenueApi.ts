import { apiRequest, apiRequestFile } from '../../api/client'
import type { MonthlyFinancialReport, RevenueFilters } from './revenueTypes'

const revenue = '/api/v3/system-admin/reports/revenue'

// "Tất cả dịch vụ" = bỏ hẳn tham số service, không gửi service=ALL.
export function revenueQuery(filters: RevenueFilters) {
  const params = new URLSearchParams({ year: String(filters.year), month: String(filters.month) })
  if (filters.service) params.set('service', filters.service)
  return params.toString()
}

export function getRevenueReport(token: string, filters: RevenueFilters, signal?: AbortSignal) {
  return apiRequest<MonthlyFinancialReport>(`${revenue}?${revenueQuery(filters)}`, { token, signal })
}

export const revenueFileName = (filters: Pick<RevenueFilters, 'year' | 'month'>) =>
  `revenue-${String(filters.year).padStart(4, '0')}-${String(filters.month).padStart(2, '0')}.xlsx`

export function exportRevenueReport(token: string, filters: RevenueFilters & { snapshotId?: string | null }, signal?: AbortSignal) {
  const params = new URLSearchParams(revenueQuery(filters))
  if (filters.snapshotId) params.set('snapshotId', filters.snapshotId)
  return apiRequestFile(`${revenue}/export?${params}`, { token, signal, fallbackFileName: revenueFileName(filters) })
}
