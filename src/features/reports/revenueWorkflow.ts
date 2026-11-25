import { ApiError } from '../../api/client'
import { workflowError } from '../surveys/workflow'
import type { FinancialReportLine, MonthlyFinancialReport, RevenueFilters, RevenueLineService, RevenueServiceFilter } from './revenueTypes'

const VN_OFFSET_MS = 7 * 3600_000 // Asia/Ho_Chi_Minh cố định UTC+7, không DST — trùng FinancialReportPeriod của BE.
export const REVENUE_MIN_YEAR = 2000

export const revenueServiceLabels: Record<RevenueLineService, string> = { MAP: 'Bản đồ (MAP)', COMBO: 'Combo (COMBO)', UNKNOWN: 'Chưa phân loại' }

// Tháng/năm hiện tại theo giờ Việt Nam, không theo múi giờ trình duyệt.
export function currentVnPeriod(now = Date.now()) {
  const vn = new Date(now + VN_OFFSET_MS)
  return { year: vn.getUTCFullYear(), month: vn.getUTCMonth() + 1 }
}

export function isFuturePeriod(period: { year: number; month: number }, now = Date.now()) {
  const current = currentVnPeriod(now)
  return period.year > current.year || (period.year === current.year && period.month > current.month)
}

const normalizeService = (value: string | null): RevenueServiceFilter | null => {
  const service = value?.trim().toUpperCase()
  return service === 'MAP' || service === 'COMBO' ? service : null
}

// Bộ lọc đã áp dụng nằm trên URL; giá trị sai/kỳ tương lai rơi về tháng hiện tại để không diễn giải số dư hiện tại thành tương lai.
export function parseRevenueFilters(params: URLSearchParams, now = Date.now()): RevenueFilters {
  const current = currentVnPeriod(now)
  const year = Number(params.get('year'))
  const month = Number(params.get('month'))
  const valid = Number.isInteger(year) && Number.isInteger(month) && year >= REVENUE_MIN_YEAR && month >= 1 && month <= 12 && !isFuturePeriod({ year, month }, now)
  return { ...(valid ? { year, month } : current), service: normalizeService(params.get('service')) }
}

export function revenueSearchParams(filters: RevenueFilters) {
  const params = new URLSearchParams({ year: String(filters.year), month: String(filters.month) })
  if (filters.service) params.set('service', filters.service)
  return params
}

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
// Không ép số âm về 0: doanh thu thuần / dòng tiền thuần có thể âm.
export const revenueMoney = (value: number) => vndFormatter.format(value)
export const revenueCount = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

export function vnDateTime(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time)
    ? new Date(time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Chưa có'
}

export const periodLabel = (period: { year: number; month: number }) => `Tháng ${period.month}/${period.year}`

// BE chỉ có dữ liệu từ lúc áp migration lịch sử: kỳ kết thúc trước mốc này không có dòng nào để lập báo cáo.
export function periodBeforeHistory(report: Pick<MonthlyFinancialReport, 'endUtc' | 'historyAvailableFrom'>) {
  return Date.parse(report.endUtc) <= Date.parse(report.historyAvailableFrom)
}
export function periodStartsBeforeHistory(report: Pick<MonthlyFinancialReport, 'startUtc' | 'historyAvailableFrom'>) {
  return Date.parse(report.startUtc) < Date.parse(report.historyAvailableFrom)
}
export function periodInProgress(report: Pick<MonthlyFinancialReport, 'endUtc'>, now = Date.now()) {
  return Date.parse(report.endUtc) > now
}

// Lý do cụ thể khiến historicalBalancesComplete = false (false không có nghĩa là API lỗi).
export function incompleteReasons(report: MonthlyFinancialReport, now = Date.now()) {
  const reasons: string[] = []
  if (periodBeforeHistory(report)) reasons.push(`Kỳ này kết thúc trước thời điểm hệ thống bắt đầu lưu lịch sử báo cáo (${vnDateTime(report.historyAvailableFrom)}), nên không có số liệu để lập báo cáo.`)
  else if (periodStartsBeforeHistory(report)) reasons.push(`Hệ thống bắt đầu lưu lịch sử báo cáo từ ${vnDateTime(report.historyAvailableFrom)}, sau ngày đầu kỳ.`)
  if (periodInProgress(report, now)) reasons.push('Tháng chưa kết thúc, số liệu được tính đến thời điểm lập báo cáo.')
  if (report.reconciliationOrders > 0) reasons.push(`Có ${revenueCount(report.reconciliationOrders)} đơn cần đối soát.`)
  return reasons
}

export const lineMatchesSearch = (line: FinancialReportLine, search: string) =>
  !search.trim() || line.orderNumber.toLowerCase().includes(search.trim().toLowerCase())

export function revenueError(error: unknown, action: 'view' | 'export' = 'view') {
  if (error instanceof ApiError) {
    if (error.status === 400) return 'Bộ lọc báo cáo không hợp lệ. Chọn lại tháng, năm và dịch vụ rồi thử lại.'
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
    if (error.status === 403) return action === 'export'
      ? 'Không thể xuất báo cáo: tài khoản không có quyền System Admin hoặc phiên làm việc thiếu thông tin xác thực. Hãy đăng nhập lại rồi thử lại.'
      : 'Bạn không có quyền xem báo cáo doanh thu.'
    if (error.status === 404) return 'Máy chủ chưa có API báo cáo doanh thu. Kiểm tra phiên bản backend đã triển khai.'
    if (error.status === 409 && action === 'export') return 'Bản báo cáo đang xem đã hết hiệu lực. Nhấn Tải lại trước khi xuất Excel.'
    if (error.status === 500 && !error.code) return 'Máy chủ chưa lập được báo cáo. Vui lòng thử lại sau.'
  }
  return workflowError(error)
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401
