// Hợp đồng GET /api/v3/system-admin/reports/revenue (BE: MonthlyFinancialReport / FinancialReportLine, camelCase).
export type RevenueServiceFilter = 'MAP' | 'COMBO'
export type RevenueLineService = 'MAP' | 'COMBO' | 'UNKNOWN'

export type RevenueFilters = { year: number; month: number; service: RevenueServiceFilter | null }

export interface FinancialReportLine {
  orderId: string
  orderNumber: string
  service: RevenueLineService
  publishedServiceValue: number
  serviceRefunds: number
  cashReceipts: number
  cashRefunds: number
  depositsHeld: number
  refundableExcess: number
  refundPayable: number
  cancellationRetention: number
  outstandingBalance: number // số ít ở từng dòng
  pendingPayments: number
  publishedInPeriod: boolean
  unpriced: boolean
  needsReconciliation: boolean
}

export interface MonthlyFinancialReport {
  year: number
  month: number
  service: RevenueServiceFilter | null
  formulaVersion: string
  startUtc: string
  endUtc: string // cận cuối không bao gồm
  generatedAt: string
  historyAvailableFrom: string
  historicalBalancesComplete: boolean
  lines: FinancialReportLine[]
  reportFingerprint: string
  pendingPayments: number
  publishedServiceValue: number
  serviceRefunds: number
  netServiceRevenue: number
  cashReceipts: number
  cashRefunds: number
  netCash: number
  depositsHeld: number
  refundableExcess: number
  refundPayable: number
  cancellationRetention: number
  outstandingBalances: number // số nhiều ở cấp tổng
  publishedOrders: number
  unpricedOrders: number
  reconciliationOrders: number
}
