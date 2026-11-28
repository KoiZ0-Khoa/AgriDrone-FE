import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Checkbox, Input, Select, Table, Tag, Typography } from 'antd'
import type { TableColumnsType as ColumnsType } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import * as api from './revenueApi'
import type { FinancialReportLine, MonthlyFinancialReport, RevenueFilters, RevenueServiceFilter } from './revenueTypes'
import {
  REVENUE_MIN_YEAR, currentVnPeriod, incompleteReasons, isFuturePeriod, isUnauthorized, lineMatchesSearch, parseRevenueFilters,
  periodBeforeHistory, periodLabel, revenueCount, revenueError, revenueMoney, revenueSearchParams, revenueServiceLabels, vnDateTime,
} from './revenueWorkflow'
import './revenue.css'

const INCOMPLETE_BANNER = 'Số liệu tạm tính hoặc thiếu lịch sử để chốt kỳ. Vui lòng kiểm tra các đơn cần đối soát.'
const sameFilters = (a: RevenueFilters, b: RevenueFilters) => a.year === b.year && a.month === b.month && a.service === b.service
const serviceFilterLabel = (service: RevenueServiceFilter | null) => service ? revenueServiceLabels[service] : 'Tất cả dịch vụ'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function RevenueDashboardPage() {
  const { session, logout } = useAuth()
  const token = session!.accessToken
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const applied = useMemo(() => parseRevenueFilters(params), [params])
  const [draft, setDraft] = useState(applied)
  // Đồng bộ lại bộ lọc đang sửa khi URL đổi (back/forward).
  useEffect(() => { setDraft(applied) }, [applied])

  const report = useQuery({
    queryKey: ['revenue-report', session!.email, applied.year, applied.month, applied.service ?? 'ALL'],
    queryFn: ({ signal }) => api.getRevenueReport(token, applied, signal),
    retry: (count, error) => !(error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) && count < 2,
  })

  // Khóa đồng bộ: hai cú bấm liên tiếp xảy ra trước khi React kịp render nút ở trạng thái disabled.
  const exportLock = useRef(false)
  const exporting = useMutation({
    onSettled: () => { exportLock.current = false },
    mutationFn: async (filters: RevenueFilters & { snapshotId?: string | null }) => {
      const file = await api.exportRevenueReport(token, filters)
      if (file.blob.type && !/spreadsheetml|octet-stream/i.test(file.blob.type)) throw new Error('Máy chủ không trả về tệp Excel hợp lệ.')
      return file
    },
    onSuccess: file => { downloadBlob(file.blob, file.fileName); void message.success(`Đã tải ${file.fileName}`) },
    onError: error => { void message.error(revenueError(error, 'export')) },
  })

  const current = currentVnPeriod()
  const years = Array.from({ length: current.year - REVENUE_MIN_YEAR + 1 }, (_, index) => current.year - index)
  const dirty = !sameFilters(draft, applied)

  function changeYear(year: number) {
    setDraft(prev => ({ ...prev, year, month: isFuturePeriod({ year, month: prev.month }) ? current.month : prev.month }))
  }
  function apply() {
    if (dirty) setParams(revenueSearchParams(draft))
    else void report.refetch()
  }

  return <div className="revenue-page">
    <section className="resource-page-heading">
      <div><span className="page-kicker">Báo cáo tài chính</span><h1>Doanh thu</h1><p>Báo cáo doanh thu, dòng tiền và số dư theo tháng (giờ Việt Nam, UTC+7).</p></div>
      <Button icon={<ReloadOutlined />} loading={report.isFetching} onClick={() => { void report.refetch() }}>Tải lại</Button>
    </section>

    <section className="resource-panel revenue-filters" aria-label="Bộ lọc báo cáo">
      <div className="workflow-toolbar">
        <Select aria-label="Tháng" value={draft.month} onChange={month => setDraft(prev => ({ ...prev, month }))}
          options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `Tháng ${index + 1}`, disabled: isFuturePeriod({ year: draft.year, month: index + 1 }) }))} />
        <Select aria-label="Năm" value={draft.year} onChange={changeYear} showSearch options={years.map(year => ({ value: year, label: String(year) }))} />
        <Select aria-label="Dịch vụ" value={draft.service ?? ''} onChange={(value: string) => setDraft(prev => ({ ...prev, service: (value || null) as RevenueServiceFilter | null }))}
          options={[{ value: '', label: 'Tất cả dịch vụ' }, { value: 'MAP', label: revenueServiceLabels.MAP }, { value: 'COMBO', label: revenueServiceLabels.COMBO }]} />
        <Button type="primary" icon={<SearchOutlined />} onClick={apply} loading={report.isFetching && !dirty}>Xem báo cáo</Button>
        <Button icon={<DownloadOutlined />} loading={exporting.isPending} disabled={exporting.isPending || report.isFetching || !report.data}
          onClick={() => {
            if (exportLock.current || !report.data || report.isFetching) return
            exportLock.current = true
            exporting.mutate({ ...applied, snapshotId: report.data.snapshotId })
          }}>
          {exporting.isPending ? 'Đang xuất…' : 'Xuất Excel'}
        </Button>
      </div>
      <p className="revenue-applied">
        Đang xem: <strong>{periodLabel(applied)} · {serviceFilterLabel(applied.service)}</strong>
        {dirty ? <span className="revenue-dirty"> — Bộ lọc mới chưa được áp dụng. Nhấn “Xem báo cáo”; Xuất Excel dùng bộ lọc đang xem.</span> : null}
      </p>
    </section>

    {report.isPending ? <section className="resource-panel"><CommonState type="loading" title="Đang lập báo cáo doanh thu" /></section>
      : report.data ? <>
        {/* Tải lại thất bại nhưng vẫn còn báo cáo cùng bộ lọc trong cache: báo rõ đây là số liệu lần lập trước. */}
        {report.isError ? <Alert className="revenue-alert" type="error" showIcon
          title={`Không tải lại được báo cáo. Đang hiển thị số liệu lập lúc ${vnDateTime(report.data.generatedAt)}.`}
          description={revenueError(report.error)}
          action={isUnauthorized(report.error) ? <Button size="small" onClick={logout}>Đăng nhập lại</Button> : <Button size="small" onClick={() => { void report.refetch() }}>Thử lại</Button>} /> : null}
        <ReportBody report={report.data} />
      </>
        : <section className="resource-panel"><ReportError error={report.error} retry={() => { void report.refetch() }} relogin={logout} /></section>}
  </div>
}

function ReportError({ error, retry, relogin }: { error: unknown; retry: () => void; relogin: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <CommonState type="forbidden" description={revenueError(error)} />
  if (isUnauthorized(error)) return <CommonState type="empty" title="Phiên đăng nhập đã hết hạn" description="Đăng nhập lại để tiếp tục xem báo cáo." action={relogin} actionLabel="Đăng nhập lại" />
  return <CommonState type="error" title="Không thể tải báo cáo doanh thu" description={revenueError(error)} retry={error instanceof ApiError && error.status === 400 ? undefined : retry} />
}

type Metric = { label: string; value: number; hint: string; money?: boolean }

function MetricCard({ metric, kind }: { metric: Metric; kind: 'flow' | 'balance' | 'count' }) {
  const money = metric.money ?? true
  return <div className={`revenue-metric is-${kind}`}>
    <span className="revenue-metric-label">{metric.label}</span>
    <strong className={metric.value < 0 ? 'is-negative' : undefined}>{money ? revenueMoney(metric.value) : revenueCount(metric.value)}</strong>
    <small>{metric.hint}</small>
  </div>
}

function ReportBody({ report }: { report: MonthlyFinancialReport }) {
  const reasons = incompleteReasons(report)
  const empty = report.lines.length === 0
  const flows: Metric[] = [
    { label: 'Doanh thu thuần', value: report.netRevenue ?? report.netServiceRevenue, hint: report.netRevenue == null ? 'Giá trị công bố trừ hoàn giá trị dịch vụ' : 'Giá trị công bố trừ các khoản hoàn đã hoàn tất' },
    { label: 'Dòng tiền thuần', value: report.netCash, hint: 'Tiền thực thu trừ tiền đã hoàn' },
    { label: 'Giá trị dịch vụ công bố', value: report.publishedServiceValue, hint: 'Sale gốc ghi nhận một lần mỗi đơn' },
    { label: 'Hoàn giá trị dịch vụ', value: report.serviceRefunds, hint: 'Khoản hoàn thuộc doanh thu dịch vụ' },
    { label: 'Tiền thực thu', value: report.cashReceipts, hint: 'Khoản nhận thực tế trong kỳ' },
    { label: 'Tiền đã hoàn', value: report.cashRefunds, hint: 'Hoàn tất hoặc đảo tiền trong kỳ' },
    { label: 'Cọc giữ lại do hủy', value: report.cancellationRetention, hint: 'Phân loại riêng, không phải doanh thu dịch vụ' },
  ]
  const balances: Metric[] = [
    { label: 'Dư nợ', value: report.outstandingBalances, hint: 'Còn phải thu tại mốc báo cáo' },
    { label: 'Cọc đang giữ', value: report.depositsHeld, hint: 'Đơn đang hoạt động, chưa công bố' },
    { label: 'Tiền thừa cần hoàn', value: report.refundableExcess, hint: 'Phần vượt giá trị hóa đơn' },
    { label: 'Nghĩa vụ hoàn tiền', value: report.refundPayable, hint: 'Đang chờ hoàn, chưa tính vào tiền đã hoàn' },
    { label: 'Thanh toán đang chờ', value: report.pendingPayments, hint: 'Chưa tính vào tiền thực thu' },
  ]
  const counts: Metric[] = [
    { label: 'Đơn công bố trong kỳ', value: report.publishedOrders, hint: 'Có sale trong kỳ đang chọn', money: false },
    { label: 'Đơn chưa chốt giá', value: report.unpricedOrders, hint: 'Không ước tính thành dư nợ', money: false },
    { label: 'Đơn cần đối soát', value: report.reconciliationOrders, hint: 'Lịch sử hoặc phân loại chưa đầy đủ', money: false },
  ]
  const refunds: Metric[] = [
    { label: 'Tổng hoàn đã hoàn tất', value: report.completedRefunds ?? 0, hint: 'Tổng các khoản đã hoàn theo nhóm bên dưới' },
    { label: 'Hoàn tiền thừa', value: report.overpaymentRefunds ?? 0, hint: 'Hoàn phần khách đã trả vượt số tiền phải thu' },
    { label: 'Hoàn do hủy đơn', value: report.cancellationRefunds ?? 0, hint: 'Hoàn phát sinh khi hủy đơn' },
    { label: 'Hoàn do không thể bàn giao', value: report.serviceFailureRefunds ?? 0, hint: 'Hoàn do dịch vụ không hoàn thành' },
    { label: 'Hoàn do khiếu nại', value: report.complaintRefunds ?? 0, hint: 'Hoàn theo hồ sơ khiếu nại đã xử lý' },
    { label: 'Hoàn chưa phân loại', value: report.unclassifiedRefunds ?? 0, hint: 'Khoản hoàn chưa xác định được nhóm' },
    { label: 'Đảo giao dịch', value: report.fundingReversals ?? 0, hint: 'Khoản tiền bị đảo trong kỳ' },
  ]

  return <>
    {!report.historicalBalancesComplete ? <Alert className="revenue-alert" type="warning" showIcon title={INCOMPLETE_BANNER}
      description={reasons.length ? <ul className="revenue-reasons">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : undefined} /> : null}
    {report.service ? <Alert className="revenue-alert" type="info" showIcon title={`Đang lọc ${revenueServiceLabels[report.service]}. Đơn chưa phân loại không thuộc bộ lọc này, nên tổng MAP + COMBO có thể nhỏ hơn “Tất cả dịch vụ”.`} /> : null}

    <section className="resource-panel revenue-info" aria-label="Thông tin báo cáo">
      <dl>
        <div><dt>Kỳ báo cáo</dt><dd>{vnDateTime(report.startUtc)} – {vnDateTime(report.endUtc)} (không gồm mốc cuối)</dd></div>
        <div><dt>Lập lúc</dt><dd>{vnDateTime(report.generatedAt)}</dd></div>
        {report.asOfUtc ? <div><dt>Số liệu tính đến</dt><dd>{vnDateTime(report.asOfUtc)}</dd></div> : null}
        <div><dt>Phiên bản công thức</dt><dd>{report.formulaVersion}</dd></div>
        <div><dt>Lưu lịch sử từ</dt><dd>{vnDateTime(report.historyAvailableFrom)}</dd></div>
        <div className="revenue-fingerprint"><dt>Fingerprint</dt><dd><Typography.Text copyable={{ text: report.reportFingerprint }} code ellipsis>{report.reportFingerprint}</Typography.Text></dd></div>
      </dl>
    </section>

    {empty ? <section className="resource-panel"><CommonState type="empty" title={`Không có số liệu ${periodLabel(report).toLowerCase()}`}
      description={periodBeforeHistory(report)
        ? `Hệ thống chỉ có lịch sử báo cáo từ ${vnDateTime(report.historyAvailableFrom)}. Chọn kỳ từ thời điểm này trở đi.`
        : 'Không có đơn nào phát sinh biến động hoặc còn số dư trong kỳ và bộ lọc đã chọn.'} /></section> : <>
      <section className="revenue-section" aria-label="Biến động trong kỳ">
        <h2>Biến động trong kỳ</h2>
        <div className="revenue-metrics">{flows.map(metric => <MetricCard key={metric.label} metric={metric} kind="flow" />)}</div>
      </section>
      {report.completedRefunds != null ? <section className="revenue-section" aria-label="Chi tiết hoàn tiền">
        <h2>Chi tiết hoàn tiền</h2>
        <div className="revenue-metrics">{refunds.map(metric => <MetricCard key={metric.label} metric={metric} kind="flow" />)}</div>
      </section> : null}
      <section className="revenue-section" aria-label="Số dư tại mốc báo cáo">
        <h2>Số dư tại mốc báo cáo</h2>
        <div className="revenue-metrics">{balances.map(metric => <MetricCard key={metric.label} metric={metric} kind="balance" />)}</div>
      </section>
      <section className="revenue-section" aria-label="Số lượng đơn">
        <h2>Số lượng đơn</h2>
        <div className="revenue-metrics">{counts.map(metric => <MetricCard key={metric.label} metric={metric} kind="count" />)}</div>
      </section>
      <p className="revenue-note">Các thẻ có quan hệ hoặc giao nhau, không cộng dồn thành một tổng tiền. Số liệu lấy trực tiếp từ máy chủ.</p>
      <ReportLines lines={report.lines} />
    </>}
  </>
}

const moneyColumn = (title: string, key: keyof FinancialReportLine): ColumnsType<FinancialReportLine>[number] => ({
  title, key, align: 'right', width: 150,
  sorter: (a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0),
  render: (_, line) => {
    const value = line[key]
    return typeof value === 'number' ? <span className={value < 0 ? 'is-negative' : value === 0 ? 'is-zero' : undefined}>{revenueMoney(value)}</span> : '—'
  },
})

function ReportLines({ lines }: { lines: FinancialReportLine[] }) {
  const [search, setSearch] = useState('')
  const [onlyReconcile, setOnlyReconcile] = useState(false)
  const visible = lines.filter(line => lineMatchesSearch(line, search) && (!onlyReconcile || line.needsReconciliation))
  const hasRefundBreakdown = lines.some(line => line.completedRefunds != null)
  const columns: ColumnsType<FinancialReportLine> = [
    { title: 'Đơn hàng', key: 'order', fixed: 'left', width: 200, sorter: (a, b) => a.orderNumber.localeCompare(b.orderNumber),
      render: (_, line) => <div className="revenue-order"><strong>{line.orderNumber}</strong>{line.needsReconciliation ? <Tag color="orange">Cần đối soát</Tag> : null}</div> },
    { title: 'Dịch vụ', key: 'service', width: 150, filters: (['MAP', 'COMBO', 'UNKNOWN'] as const).map(value => ({ value, text: revenueServiceLabels[value] })),
      onFilter: (value, line) => line.service === value,
      render: (_, line) => <Tag color={line.service === 'UNKNOWN' ? 'default' : 'green'}>{revenueServiceLabels[line.service] ?? line.service}</Tag> },
    moneyColumn('Giá trị DV công bố', 'publishedServiceValue'),
    moneyColumn('Hoàn giá trị DV', 'serviceRefunds'),
    moneyColumn('Tiền thực thu', 'cashReceipts'),
    moneyColumn('Tiền đã hoàn', 'cashRefunds'),
    ...(hasRefundBreakdown ? [
      moneyColumn('Hoàn đã hoàn tất', 'completedRefunds'),
      moneyColumn('Đảo giao dịch', 'fundingReversals'),
      moneyColumn('Doanh thu thuần', 'netRevenue'),
    ] : []),
    moneyColumn('Cọc giữ lại do hủy', 'cancellationRetention'),
    moneyColumn('Dư nợ', 'outstandingBalance'),
    moneyColumn('Cọc đang giữ', 'depositsHeld'),
    moneyColumn('Tiền thừa cần hoàn', 'refundableExcess'),
    moneyColumn('Nghĩa vụ hoàn', 'refundPayable'),
    moneyColumn('TT đang chờ', 'pendingPayments'),
    { title: 'Ghi chú', key: 'flags', width: 190, render: (_, line) => <div className="revenue-flags">
      {line.publishedInPeriod ? <Tag color="blue">Công bố trong kỳ</Tag> : null}
      {line.unpriced ? <Tag color="gold">Chưa chốt giá</Tag> : null}
    </div> },
  ]
  return <section className="resource-panel revenue-lines" aria-label="Chi tiết theo đơn">
    <div className="resource-panel-heading"><div><strong>Chi tiết theo đơn</strong><span>Có thể gồm đơn cũ không phát sinh trong tháng nhưng còn số dư hoặc cần đối soát.</span></div></div>
    <div className="workflow-toolbar">
      <Input allowClear prefix={<SearchOutlined />} placeholder="Tìm mã đơn" aria-label="Tìm mã đơn" value={search} onChange={event => setSearch(event.target.value)} className="revenue-search" />
      <Checkbox checked={onlyReconcile} onChange={event => setOnlyReconcile(event.target.checked)}>Chỉ đơn cần đối soát</Checkbox>
      <span className="revenue-count">{revenueCount(visible.length)}/{revenueCount(lines.length)} dòng</span>
    </div>
    <Table<FinancialReportLine> rowKey="orderId" dataSource={visible} columns={columns} size="middle" scroll={{ x: hasRefundBreakdown ? 2500 : 2050 }}
      rowClassName={line => line.needsReconciliation ? 'revenue-row-reconcile' : ''}
      pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
      locale={{ emptyText: 'Không có dòng phù hợp với điều kiện tìm kiếm.' }} />
  </section>
}
