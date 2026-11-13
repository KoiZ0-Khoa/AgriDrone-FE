import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Pagination, Select, Space, Table, Tag, Tooltip } from 'antd'
import { useMemo, useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { CorrectFindingModal } from './CorrectFindingModal'
import { FindingReviewModal } from './FindingReviewModal'
import { getHealthReviewQueue } from './healthReviewApi'
import type { FindingDecision, HealthReviewItem, HealthReviewOutcome, ResolutionState } from './healthReviewTypes'
import { bulkDecisionCopy, findingDecisionLabels, findingRow, healthReviewError, resolutionStateLabels, unapprovableRows, type BulkFindingDecision, type FindingRow } from './healthReviewWorkflow'
import { getPlantHealth } from './plantHealthApi'
import { getFarmPlantHealthMap } from './plantHealthMapApi'
import { dateTime } from './workflow'

const stateColors: Record<string, string> = { RESOLVED: 'success', NEEDS_REVIEW: 'warning', PENDING_REVIEW: 'default' }
const decisionColors: Record<string, string> = { Approve: 'error', Correct: 'error', Reject: 'default', NonDisease: 'success', Ambiguous: 'warning', Pending: 'processing' }

// canReview: đơn đang PENDING_REVIEW (trang cha quyết định); bảng tự khóa thêm khi xem lô cũ hoặc đang tải.
type Props = { token: string; orderId: string; farmId: string; tenantId: string; canReview: boolean }

export function HealthFindingsTable({ token, orderId, farmId, tenantId, canReview }: Props) {
  const { message } = App.useApp()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [resolutionState, setResolutionState] = useState<ResolutionState | ''>('')
  const [decision, setDecision] = useState<FindingDecision | 'Pending' | ''>('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [correcting, setCorrecting] = useState<{ item: HealthReviewItem; row: FindingRow; page: { batchId: string; resultVersion: number } } | null>(null)
  const [review, setReview] = useState<{ decision: BulkFindingDecision; items: HealthReviewItem[]; rows: FindingRow[]; page: { batchId: string; resultVersion: number } } | null>(null)

  const findings = useQuery({
    queryKey: ['health-findings', orderId, page, pageSize, resolutionState, decision],
    queryFn: ({ signal }) => getHealthReviewQueue(token, orderId, 'findings', { pageNumber: page, pageSize, resolutionState: resolutionState || undefined, decision: decision || undefined }, signal),
    retry: false,
  })
  // Chỉ để hiển thị mã trụ và tên bệnh; lỗi ở 2 query này không chặn bảng.
  const map = useQuery({ queryKey: ['farm-plant-health-map', farmId, tenantId], queryFn: ({ signal }) => getFarmPlantHealthMap(token, farmId, tenantId, signal), retry: false })
  const catalogue = useQuery({ queryKey: ['plant-health-master-data'], queryFn: ({ signal }) => getPlantHealth(token, signal), retry: false, staleTime: 5 * 60_000 })
  const plantCodes = useMemo(() => new Map((map.data?.plants ?? []).map(plant => [plant.id.toLowerCase(), plant.plantCode])), [map.data])
  const classNames = useMemo(() => new Map((catalogue.data?.labels ?? []).map(label => [label.code.toUpperCase(), label.name])), [catalogue.data])
  // React Query giữ data cũ khi lần tải sau lỗi — không hiển thị số đếm/cảnh báo của lần trước cạnh thông báo lỗi.
  const pageData = findings.isError ? undefined : findings.data
  const rows = useMemo(() => (findings.data?.items ?? []).map(item => findingRow(item, plantCodes, classNames)), [findings.data, plantCodes, classNames])

  const writable = canReview && Boolean(pageData?.isCurrentBatch) && !findings.isFetching
  // Chỉ giữ lựa chọn còn nằm trong trang đang hiển thị.
  const selectedRows = rows.filter(row => selectedIds.includes(row.id))
  const cannotApprove = unapprovableRows(selectedRows)
  function resetSelection() { setSelectedIds([]) }
  function open(nextDecision: BulkFindingDecision) {
    if (!pageData || selectedRows.length === 0) return
    const ids = new Set(selectedRows.map(row => row.id))
    setReview({ decision: nextDecision, rows: selectedRows, items: pageData.items.filter(item => ids.has(item.id)), page: { batchId: pageData.batchId, resultVersion: pageData.resultVersion } })
  }
  function openCorrect() {
    const row = selectedRows[0]
    const item = pageData?.items.find(candidate => candidate.id === row?.id)
    if (!pageData || selectedRows.length !== 1 || !item) return
    setCorrecting({ item, row, page: { batchId: pageData.batchId, resultVersion: pageData.resultVersion } })
  }
  // Chỉ nhãn "nghi bệnh" mới hợp lệ cho Approve/Correct (BE: PlantHealthLabelKind.SuspectedDisease).
  const diseaseLabels = catalogue.data ? catalogue.data.labels.filter(label => label.labelKind === 'SUSPECTED_DISEASE') : null
  function finish(outcome: HealthReviewOutcome) {
    void message.success(outcome.isReplay ? 'Yêu cầu này đã được ghi nhận trước đó; không ghi trùng.' : `Đã lưu quyết định cho ${outcome.reviews.length} phát hiện.`)
    if (outcome.invalidatedZoneIds.length > 0) void message.warning(`${outcome.invalidatedZoneIds.length} vùng bệnh cần review lại vì thành viên đã thay đổi.`)
    setReview(null); setCorrecting(null); resetSelection(); void reload()
  }
  function closeDialog(reloadNeeded: boolean) {
    setReview(null); setCorrecting(null)
    if (reloadNeeded) { resetSelection(); void reload() }
  }
  async function reload() {
    await Promise.all([client.invalidateQueries({ queryKey: ['health-findings', orderId] }), client.invalidateQueries({ queryKey: ['health-review-summary', orderId] })])
  }

  const filters = <div className="workflow-toolbar"><Space wrap>
    <Select aria-label="Lọc theo trạng thái xử lý" style={{ minWidth: 180 }} value={resolutionState} onChange={value => { setPage(1); resetSelection(); setResolutionState(value) }}
      options={[{ value: '', label: 'Mọi trạng thái' }, ...(['NEEDS_REVIEW', 'PENDING_REVIEW', 'RESOLVED'] as const).map(value => ({ value, label: resolutionStateLabels[value] }))]} />
    <Select aria-label="Lọc theo quyết định" style={{ minWidth: 180 }} value={decision} onChange={value => { setPage(1); resetSelection(); setDecision(value) }}
      options={[{ value: '', label: 'Mọi quyết định' }, ...(['Pending', 'Approve', 'Correct', 'Reject', 'NonDisease', 'Ambiguous'] as const).map(value => ({ value, label: findingDecisionLabels[value] }))]} />
  </Space></div>

  const actions = canReview && pageData ? <div className="workflow-toolbar"><Space wrap>
    <span className="form-hint">{selectedRows.length > 0 ? `Đã chọn ${selectedRows.length} phát hiện` : 'Chọn phát hiện trong trang để review'}</span>
    {(['Reject', 'NonDisease'] as const).map(value => <Button key={value} disabled={!writable || selectedRows.length === 0} onClick={() => open(value)}>{bulkDecisionCopy[value].button}</Button>)}
    <Tooltip title={cannotApprove.length > 0 ? `${cannotApprove.length} phát hiện chưa được AI gắn trụ — bỏ chọn, hoặc dùng "Sửa" để chọn trụ.` : undefined}>
      <Button danger disabled={!writable || selectedRows.length === 0 || cannotApprove.length > 0} onClick={() => open('Approve')}>{bulkDecisionCopy.Approve.button}</Button>
    </Tooltip>
    <Tooltip title={selectedRows.length > 1 ? 'Sửa từng phát hiện một — chỉ chọn 1 dòng.' : undefined}>
      <Button danger disabled={!writable || selectedRows.length !== 1} onClick={openCorrect}>Sửa</Button>
    </Tooltip>
    {selectedRows.length > 0 ? <Button type="link" onClick={resetSelection}>Bỏ chọn</Button> : null}
  </Space></div> : null

  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Phát hiện cần duyệt</strong><span>{pageData ? `${pageData.totalCount} phát hiện${resolutionState || decision ? ' khớp bộ lọc' : ''}` : 'Kết quả AI nhận diện theo từng ảnh'}</span></div></div>
    {filters}
    {pageData && !pageData.isCurrentBatch ? <Alert className="workflow-notice" type="warning" showIcon title="Đây không phải lô dữ liệu đang hiệu lực" description="Kết quả nhận diện đã được thay bằng lô mới. Tải lại trang để xem lô hiện tại; không review trên lô cũ." /> : null}
    {actions}
    {findings.isError ? <CommonState type="error" description={healthReviewError(findings.error)} retry={() => findings.refetch()} /> : <>
      <Table<FindingRow> rowKey="id" size="small" loading={findings.isFetching} dataSource={rows} pagination={false} scroll={{ x: 1100 }}
        rowSelection={canReview ? { selectedRowKeys: selectedRows.map(row => row.id), onChange: keys => setSelectedIds(keys.map(String)), getCheckboxProps: () => ({ disabled: !writable }) } : undefined}
        locale={{ emptyText: resolutionState || decision ? 'Không có phát hiện khớp bộ lọc.' : 'Không có phát hiện nào trong kết quả này.' }}
        columns={[
          { title: 'Loại nghi ngờ', render: (_, row) => <>
            <strong>{row.className}</strong>
            {row.reviewedClass && row.originalClass && row.reviewedClass.toUpperCase() !== row.originalClass.toUpperCase() ? <div className="form-hint">AI: {row.originalClass}</div> : null}
          </> },
          { title: 'Độ tin cậy', width: 100, render: (_, row) => row.confidence === null ? '—' : `${Math.round(row.confidence * 100)}%` },
          { title: 'Trụ cây', render: (_, row) => row.plantId ? row.plantLabel : <Tag color="warning">{row.plantLabel}</Tag> },
          { title: 'Vị trí', render: (_, row) => row.lat === null || row.lon === null ? '—' : <span className="form-hint">{row.lat.toFixed(6)}, {row.lon.toFixed(6)}</span> },
          { title: 'Thời điểm chụp', render: (_, row) => dateTime(row.observedAt) },
          { title: 'Trạng thái', render: (_, row) => <Tag color={stateColors[row.resolutionState]}>{resolutionStateLabels[row.resolutionState] ?? row.resolutionState}</Tag> },
          { title: 'Quyết định', render: (_, row) => row.reviewReason
            ? <Tooltip title={<>{row.reviewReason}{row.reviewedAt ? <div>{dateTime(row.reviewedAt)}</div> : null}</>}><Tag color={decisionColors[row.decision]}>{row.decisionLabel}</Tag></Tooltip>
            : <Tag color={decisionColors[row.decision]}>{row.decisionLabel}</Tag> },
          { title: 'Còn chặn', render: (_, row) => row.blockingReasons.length === 0 ? '—' : <Space size={4} wrap>{row.blockingReasons.map(reason => <Tag key={reason}>{reason}</Tag>)}</Space> },
        ]} />
      <Pagination style={{ marginTop: 12 }} current={page} pageSize={pageSize} total={findings.data?.totalCount ?? 0} showSizeChanger pageSizeOptions={[20, 50, 100]}
        onChange={(nextPage, nextSize) => { resetSelection(); setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize) }} />
    </>}
    {review ? <FindingReviewModal token={token} orderId={orderId} decision={review.decision} page={review.page} items={review.items} rows={review.rows} close={closeDialog} done={finish} /> : null}
    {correcting ? <CorrectFindingModal token={token} orderId={orderId} page={correcting.page} item={correcting.item} row={correcting.row}
      labels={diseaseLabels} plants={map.data?.plants ?? []} close={closeDialog} done={finish} /> : null}
  </section>
}
