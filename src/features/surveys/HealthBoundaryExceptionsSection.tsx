import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Progress, Radio, Space, Table, Tag, Tooltip } from 'antd'
import { useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { MAX_REVIEW_PAGE_SIZE, MAX_REVIEW_REASON_LENGTH, getAllHealthFindings, getHealthReviewQueue, reviewHealthBoundaryException } from './healthReviewApi'
import type { BoundaryDecision, HealthReviewItem, HealthReviewOutcome } from './healthReviewTypes'
import {
  blockingReasonLabels, boundaryClassificationLabels, boundaryDecisionHints, boundaryDecisionLabels, boundaryOptions, buildBoundaryReview, bulkBoundaryDecision,
  findingDecisionLabels, healthReviewError, isStaleReviewError, linkedFinding, openBoundaryItems, readBoundaryOriginal, readFindingOriginal, type BulkBoundaryDecision,
} from './healthReviewWorkflow'
import { operationFor } from './workflow'

type Page = { batchId: string; resultVersion: number }
type Row = { item: HealthReviewItem; finding: HealthReviewItem | null }

export function HealthBoundaryExceptionsSection({ token, orderId, canReview }: { token: string; orderId: string; canReview: boolean }) {
  const { message } = App.useApp()
  const client = useQueryClient()
  const [open, setOpen] = useState<{ row: Row; page: Page } | null>(null)
  // Ngoại lệ thường ít (≤ số phát hiện) — lấy 1 trang tối đa, báo nếu còn trang sau.
  const exceptions = useQuery({
    queryKey: ['health-boundary-exceptions', orderId],
    queryFn: ({ signal }) => getHealthReviewQueue(token, orderId, 'exceptions', { pageNumber: 1, pageSize: MAX_REVIEW_PAGE_SIZE }, signal),
    retry: false,
  })
  const hasExceptions = (exceptions.data?.totalCount ?? 0) > 0
  const findings = useQuery({
    queryKey: ['health-findings-all', orderId],
    queryFn: ({ signal }) => getAllHealthFindings(token, orderId, signal),
    enabled: hasExceptions, retry: false,
  })
  const data = exceptions.isError ? undefined : exceptions.data
  // Chỉ khớp khi 2 response cùng lô; khác lô thì coi như chưa có dữ liệu phát hiện.
  const findingItems = findings.data && data && findings.data.batchId === data.batchId ? findings.data.items : null
  const rows = useMemo<Row[]>(() => (data?.items ?? []).map(item => ({ item, finding: findingItems ? linkedFinding(item, findingItems) : null })), [data, findingItems])
  const writable = canReview && Boolean(data?.isCurrentBatch) && !exceptions.isFetching && !findings.isFetching && findingItems !== null
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulk, setBulk] = useState<{ decision: BulkBoundaryDecision; rows: Row[]; page: Page } | null>(null)
  const selectedRows = rows.filter(row => selectedIds.includes(row.item.id))
  const openIds = openBoundaryItems(rows).map(row => row.item.id)
  function selectAll(selected: boolean) {
    if (!selected || (openIds.length > 0 && openIds.every(id => selectedIds.includes(id)))) { setSelectedIds([]); return }
    if (openIds.length === 0) { void message.info('Không còn ngoại lệ chưa xử lý. Tick từng dòng nếu muốn đổi quyết định.'); return }
    setSelectedIds(openIds)
  }
  const bulkCheck = (decision: BulkBoundaryDecision) => bulkBoundaryDecision(selectedRows.map(row => row.finding), decision)

  async function reload() {
    await Promise.all(['health-boundary-exceptions', 'health-findings-all', 'health-findings', 'health-review-summary'].map(key => client.invalidateQueries({ queryKey: [key, orderId] })))
  }
  if (exceptions.isPending) return null
  if (!exceptions.isError && !hasExceptions) return null

  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Ngoại lệ ranh giới</strong><span>{data ? `${data.totalCount} phát hiện nằm sát hoặc ngoài ranh giới nông trại` : 'Phát hiện sát hoặc ngoài ranh giới'}</span></div></div>
    {exceptions.isError ? <CommonState type="error" description={healthReviewError(exceptions.error)} retry={() => exceptions.refetch()} /> : <>
      <p className="form-hint">Mỗi ngoại lệ gắn với một phát hiện. Review phát hiện ở bảng trên trước, sau đó quyết định ngoại lệ: phát hiện Bác bỏ / Không phải bệnh → loại bỏ chứng cứ; phát hiện Xác nhận / Sửa là bệnh → chấp nhận vị trí. Có thể chọn nhiều ngoại lệ để xử lý cùng lúc.</p>
      {data && !data.isCurrentBatch ? <Alert className="workflow-notice" type="warning" showIcon title="Đây không phải lô dữ liệu đang hiệu lực" description="Tải lại trang để xem lô hiện tại." /> : null}
      {data && data.totalCount > data.items.length ? <Alert className="workflow-notice" type="info" showIcon title={`Đang hiện ${data.items.length}/${data.totalCount} ngoại lệ đầu tiên.`} /> : null}
      {findings.isError ? <Alert className="workflow-notice" type="error" showIcon title="Không tải được danh sách phát hiện để đối chiếu" description={healthReviewError(findings.error)} action={<Button size="small" onClick={() => findings.refetch()}>Thử lại</Button>} /> : null}
      {canReview && data ? <div className="workflow-toolbar"><Space wrap>
        <span className="form-hint">{selectedRows.length > 0 ? `Đã chọn ${selectedRows.length} ngoại lệ` : 'Chọn nhiều ngoại lệ để xử lý cùng lúc'}</span>
        {(['ExcludeEvidence', 'AcceptCorrectedPosition'] as const).map(value => {
          const check = bulkCheck(value)
          return <Tooltip key={value} title={selectedRows.length > 0 && check.blocked > 0 ? `${check.blocked} ngoại lệ có phát hiện liên quan không hợp lệ cho quyết định này — bỏ chọn chúng hoặc review lại phát hiện.` : undefined}>
            <Button disabled={!writable || !check.ok} onClick={() => setBulk({ decision: value, rows: selectedRows, page: { batchId: data.batchId, resultVersion: data.resultVersion } })}>{boundaryDecisionLabels[value]}</Button>
          </Tooltip>
        })}
        {selectedRows.length > 0 ? <Button type="link" onClick={() => setSelectedIds([])}>Bỏ chọn</Button> : null}
      </Space></div> : null}
      <Table<Row> rowKey={row => row.item.id} size="small" loading={exceptions.isFetching || findings.isFetching} dataSource={rows} pagination={false} scroll={{ x: 950 }}
        rowSelection={canReview ? {
          selectedRowKeys: selectedRows.map(row => row.item.id), getCheckboxProps: () => ({ disabled: !writable }),
          onSelect: (row, selected) => setSelectedIds(previous => selected ? [...previous.filter(id => id !== row.item.id), row.item.id] : previous.filter(id => id !== row.item.id)),
          onSelectAll: selectAll,
        } : undefined}
        columns={[
          { title: 'Phân loại', render: (_, row) => { const value = readBoundaryOriginal(row.item.original).boundaryClassification ?? ''; return <Tag color={value === 'OUT_OF_BOUNDARY' ? 'error' : 'warning'}>{boundaryClassificationLabels[value] ?? (value || '—')}</Tag> } },
          { title: 'Cách ranh giới', render: (_, row) => { const original = readBoundaryOriginal(row.item.original); return original.measuredBoundaryDistanceM === null ? '—' : <>{original.measuredBoundaryDistanceM.toFixed(2)} m<div className="form-hint">ngưỡng {original.boundaryThresholdM ?? '—'} m</div></> } },
          { title: 'Vị trí', render: (_, row) => { const original = readBoundaryOriginal(row.item.original); return original.lat === null || original.lon === null ? '—' : <span className="form-hint">{original.lat.toFixed(6)}, {original.lon.toFixed(6)}</span> } },
          { title: 'Phát hiện liên quan', render: (_, row) => findingItems === null ? '…' : row.finding
            ? <>{readFindingOriginal(row.finding.original).suspectedClassCode ?? '—'}<div><Tag>{findingDecisionLabels[row.finding.review?.decision ?? 'Pending'] ?? row.finding.review?.decision}</Tag></div></>
            : <Tag color="error">Không tìm thấy</Tag> },
          { title: 'Quyết định ngoại lệ', render: (_, row) => row.item.review ? <Tag>{boundaryDecisionLabels[row.item.review.decision] ?? row.item.review.decision}</Tag> : <Tag color="processing">Chưa xử lý</Tag> },
          { title: 'Còn chặn', render: (_, row) => row.item.blockingReasons.length === 0 ? '—' : <Space size={4} wrap>{row.item.blockingReasons.map(reason => <Tag key={reason}>{blockingReasonLabels[reason] ?? reason}</Tag>)}</Space> },
          ...(canReview ? [{ title: 'Thao tác', render: (_: unknown, row: Row) => <Button size="small" disabled={!writable} onClick={() => data && setOpen({ row, page: { batchId: data.batchId, resultVersion: data.resultVersion } })}>Xử lý</Button> }] : []),
        ]} />
    </>}
    {open ? <BoundaryReviewModal token={token} orderId={orderId} row={open.row} page={open.page}
      close={reloadNeeded => { setOpen(null); if (reloadNeeded) void reload() }}
      done={outcome => { void message.success(outcome.isReplay ? 'Yêu cầu này đã được ghi nhận trước đó; không ghi trùng.' : 'Đã lưu quyết định cho ngoại lệ ranh giới.'); setOpen(null); void reload() }} /> : null}
    {bulk ? <BoundaryBulkModal token={token} orderId={orderId} decision={bulk.decision} rows={bulk.rows} page={bulk.page}
      close={saved => { setBulk(null); setSelectedIds([]); if (saved > 0) void message.success(`Đã lưu quyết định cho ${saved} ngoại lệ.`); void reload() }} /> : null}
  </section>
}

// BE không có API hàng loạt cho ngoại lệ ranh giới → gửi lần lượt từng ngoại lệ; mỗi lần dùng resultVersion BE vừa trả về.
// Gặp lỗi thì dừng ngay (các ngoại lệ đã lưu vẫn giữ), chỉ cho đóng và tải lại rồi chọn tiếp phần còn lại.
function BoundaryBulkModal({ token, orderId, decision, rows, page, close }: {
  token: string; orderId: string; decision: BulkBoundaryDecision; rows: Row[]; page: Page; close: (saved: number) => void
}) {
  const [reason, setReason] = useState('')
  const [saved, setSaved] = useState(0)
  const submitting = useRef(false)
  const mutation = useMutation({
    mutationFn: async () => {
      let resultVersion = page.resultVersion
      for (const [index, row] of rows.entries()) {
        try {
          const outcome = await reviewHealthBoundaryException(token, orderId, row.item.id,
            buildBoundaryReview({ batchId: page.batchId, resultVersion }, row.item, row.finding, decision, reason, crypto.randomUUID()))
          resultVersion = outcome.resultVersion
          setSaved(index + 1)
        } catch (error) {
          throw Object.assign(error instanceof Error ? error : new Error(String(error)), { failedIndex: index })
        }
      }
    },
    onSuccess: () => close(rows.length),
    onSettled: () => { submitting.current = false },
  })
  const failedIndex = (mutation.error as { failedIndex?: number } | null)?.failedIndex
  const canSubmit = !mutation.isPending && !mutation.error && reason.trim().length > 0
  function submit() {
    if (!canSubmit || submitting.current) return
    submitting.current = true
    mutation.mutate()
  }
  return <Modal open title={`${boundaryDecisionLabels[decision]} · ${rows.length} ngoại lệ`} okText={boundaryDecisionLabels[decision]}
    cancelText={mutation.error ? 'Đóng và tải lại' : 'Hủy'} okButtonProps={{ disabled: !canSubmit }} confirmLoading={mutation.isPending}
    cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={submit} onCancel={() => { if (!mutation.isPending) close(saved) }}>
    <p>{boundaryDecisionHints[decision]}</p>
    <ul className="form-hint" style={{ maxHeight: 140, overflowY: 'auto', paddingLeft: 18 }}>
      {rows.map(row => { const original = readBoundaryOriginal(row.item.original); return <li key={row.item.id}>
        {boundaryClassificationLabels[original.boundaryClassification ?? ''] ?? '—'} · {original.measuredBoundaryDistanceM?.toFixed(2) ?? '—'} m · {row.finding ? readFindingOriginal(row.finding.original).suspectedClassCode ?? '—' : '—'}
        {row.item.review ? ` · hiện tại: ${boundaryDecisionLabels[row.item.review.decision] ?? row.item.review.decision}` : ''}</li> })}
    </ul>
    <Form layout="vertical" disabled={mutation.isPending || Boolean(mutation.error)} onFinish={submit}>
      <Form.Item label="Lý do" required extra={`Áp dụng chung cho cả ${rows.length} ngoại lệ. ${reason.length}/${MAX_REVIEW_REASON_LENGTH} ký tự.`}>
        <Input.TextArea rows={3} maxLength={MAX_REVIEW_REASON_LENGTH} value={reason} onChange={event => setReason(event.target.value)} autoFocus />
      </Form.Item>
    </Form>
    {mutation.isPending || saved > 0 ? <Progress percent={Math.round(saved / rows.length * 100)} format={() => `${saved}/${rows.length}`} /> : null}
    {mutation.error ? <Alert type="error" showIcon title={`Dừng ở ngoại lệ thứ ${(failedIndex ?? 0) + 1}/${rows.length}: ${healthReviewError(mutation.error)}`}
      description={<>Đã lưu {saved} ngoại lệ trước đó. Đóng, tải lại rồi chọn tiếp các ngoại lệ còn lại.{mutation.error instanceof ApiError ? <> Mã lỗi: <code>{mutation.error.code ?? `HTTP ${mutation.error.status}`}</code>{mutation.error.traceId ? <> · Mã tra cứu: <code>{mutation.error.traceId}</code></> : null}</> : null}</>} /> : null}
  </Modal>
}

function BoundaryReviewModal({ token, orderId, row, page, close, done }: { token: string; orderId: string; row: Row; page: Page; close: (reload: boolean) => void; done: (outcome: HealthReviewOutcome) => void }) {
  const options = boundaryOptions(row.finding)
  const [decision, setDecision] = useState<BoundaryDecision>(options.allowed[0])
  const [reason, setReason] = useState('')
  const submitting = useRef(false)
  const operation = useRef<{ payload: string; key: string } | null>(null)
  const original = readBoundaryOriginal(row.item.original)
  const mutation = useMutation({
    mutationFn: () => {
      operation.current = operationFor(operation.current, { decision, reason: reason.trim(), id: row.item.id, findingReview: row.finding?.review?.reviewId ?? null, ...page })
      return reviewHealthBoundaryException(token, orderId, row.item.id, buildBoundaryReview(page, row.item, row.finding, decision, reason, operation.current.key))
    },
    onSuccess: done,
    onSettled: () => { submitting.current = false },
  })
  const stale = isStaleReviewError(mutation.error)
  const canSubmit = !mutation.isPending && !stale && reason.trim().length > 0
  function submit() {
    if (!canSubmit || submitting.current) return
    submitting.current = true
    mutation.mutate()
  }
  return <Modal open title="Xử lý ngoại lệ ranh giới" okText="Lưu quyết định" cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ disabled: !canSubmit }} confirmLoading={mutation.isPending} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={submit} onCancel={() => { if (!mutation.isPending) close(stale) }}>
    <dl className="detail-list">
      <div><dt>Ngoại lệ</dt><dd>{boundaryClassificationLabels[original.boundaryClassification ?? ''] ?? original.boundaryClassification ?? '—'} · cách ranh giới {original.measuredBoundaryDistanceM?.toFixed(2) ?? '—'} m</dd></div>
      <div><dt>Phát hiện liên quan</dt><dd>{row.finding ? `${readFindingOriginal(row.finding.original).suspectedClassCode ?? '—'} · ${findingDecisionLabels[row.finding.review?.decision ?? 'Pending'] ?? row.finding.review?.decision}` : 'Không tìm thấy'}</dd></div>
    </dl>
    {options.hint ? <Alert className="workflow-notice" type="info" showIcon title={options.hint} /> : null}
    <Form layout="vertical" disabled={mutation.isPending || stale} onFinish={submit}>
      <Form.Item label="Quyết định" required>
        <Radio.Group value={decision} onChange={event => setDecision(event.target.value)}>
          <Space orientation="vertical">{options.allowed.map(value => <Radio key={value} value={value}>{boundaryDecisionLabels[value]}</Radio>)}</Space>
        </Radio.Group>
        <p className="form-hint" style={{ marginTop: 8 }}>{boundaryDecisionHints[decision]}</p>
      </Form.Item>
      <Form.Item label="Lý do" required extra={`${reason.length}/${MAX_REVIEW_REASON_LENGTH} ký tự.`}>
        <Input.TextArea rows={3} maxLength={MAX_REVIEW_REASON_LENGTH} value={reason} onChange={event => setReason(event.target.value)} />
      </Form.Item>
    </Form>
    {mutation.error ? <Alert type="error" showIcon title={healthReviewError(mutation.error)}
      description={mutation.error instanceof ApiError ? <>Mã lỗi: <code>{mutation.error.code ?? `HTTP ${mutation.error.status}`}</code>{mutation.error.traceId ? <> · Mã tra cứu: <code>{mutation.error.traceId}</code></> : null}</> : undefined} /> : null}
  </Modal>
}
