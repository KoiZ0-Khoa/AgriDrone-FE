import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Radio, Select, Space, Table, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { orderStatusLabels } from './orderWorkflow'
import {
  blockerItems, blockerResolutionLabels, comboReviewBody, comboReviewProblems, defaultFreezeDecision, findingDecisionLabels, freezeBlocker,
  freezeDecisionLabels, freezeResultBody, initialComboReviewDraft, isCombo, isFrozen, isStaleReviewError, outcomeLabels, zoneDecisionLabels,
  type ComboReviewDraft,
} from './resultReviewWorkflow'
import { freezeResultReview, getResultReview, recordComboReview } from './v3Api'
import type { ComboBlockerResolutionValue, ComboFindingDecisionValue, ComboPendingFinding, ComboPendingZone, FreezeResult, FreezeResultReviewDecision, ResultReview } from './v3Types'
import { captureAttemptStatusLabels, v3OperationFor, type V3Operation } from './v3Workflow'
import { dateTime, workflowError } from './workflow'

function MutationError({ error, reload }: { error: Error | null; reload: () => void }) {
  if (!error) return null
  return <Alert className="workflow-notice" showIcon type="error" title={workflowError(error)}
    description={<>{error instanceof ApiError ? <p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p> : null}
      {isStaleReviewError(error) ? <Button onClick={reload}>Tải lại dữ liệu duyệt</Button> : null}</>} />
}

// G7 — trang duyệt kết quả V3 cho Manager. MAP: xem số trụ đã xác minh rồi chốt. COMBO: duyệt toàn bộ phát hiện, vùng bệnh
// và mục chặn, rồi chốt. Chốt nội bộ chưa phát hành cho Owner (phát hành là bước riêng, G11).
export function ManagerResultReviewPage() {
  const token = useAuth().session!.accessToken
  const { orderId = '' } = useParams()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['result-review', orderId], queryFn: ({ signal }) => getResultReview(token, orderId, signal), retry: false, refetchOnWindowFocus: false })
  const [frozen, setFrozen] = useState<FreezeResult | null>(null)
  const back = <Link className="back-link" to={`/manager/orders/${encodeURIComponent(orderId)}`}><ArrowLeftOutlined /> Về đơn khảo sát</Link>
  async function reload() {
    await Promise.all([client.invalidateQueries({ queryKey: ['result-review', orderId] }), client.invalidateQueries({ queryKey: ['manager-order-context', orderId] }), client.invalidateQueries({ queryKey: ['capture-attempts', orderId] })])
  }
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải dữ liệu duyệt" /></>
  if (query.isError) return <>{back}<CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /></>
  const review = query.data
  const combo = isCombo(review)
  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">DUYỆT KẾT QUẢ KHẢO SÁT</span><h1>{combo ? 'COMBO · Bản đồ và sàng lọc bệnh' : 'MAP · Bản đồ và đếm trụ'}</h1><p>{orderStatusLabels[review.orderStatus] ?? review.orderStatus}</p></div>
      <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void reload() }}>Tải lại</Button>
    </section>
    <section className="resource-panel">
      <dl className="detail-list">
        <div><dt>Số trụ đã xác minh</dt><dd><strong>{review.verifiedBillablePoleCount.toLocaleString('vi-VN')} trụ</strong> (phiên bản {review.countSnapshotRevision})</dd></div>
        <div><dt>Lần bay</dt><dd>{captureAttemptStatusLabels[review.captureAttemptStatus.toUpperCase() as keyof typeof captureAttemptStatusLabels] ?? review.captureAttemptStatus}</dd></div>
        <div><dt>Loại bản đồ</dt><dd>{review.mappingKind}</dd></div>
        <div><dt>Kết quả nội bộ</dt><dd>{isFrozen(review) ? <Tag color="success">Đã chốt</Tag> : <Tag>Chưa chốt</Tag>}</dd></div>
      </dl>
      {isFrozen(review) || frozen ? <Alert className="workflow-notice" showIcon type="success" title="Đã chốt kết quả nội bộ"
        description={<>{frozen ? `Chốt lúc ${dateTime(frozen.frozenAt)} · ${frozen.verifiedBillablePoleCount.toLocaleString('vi-VN')} trụ · ${frozen.healthAssessmentStatus}. ` : ''}Kết quả chưa hiện cho Owner. Bước tiếp theo: chốt hóa đơn.</>} /> : null}
    </section>
    {combo ? <ComboReviewSection key={`${review.comboPendingBatch?.batchId}:${review.currentComboReview?.reviewRevisionId}`} token={token} review={review} reload={reload} /> : null}
    {!isFrozen(review) && !frozen ? <FreezeSection key={review.expectedFreezeTokens.expectedComboReviewRevisionId ?? review.verifiedPoleCountSnapshotId} token={token} review={review} reload={reload} done={async result => { setFrozen(result); await reload() }} /> : null}
  </>
}

function ComboReviewSection({ token, review, reload }: { token: string; review: ResultReview; reload: () => Promise<void> }) {
  const batch = review.comboPendingBatch
  const [draft, setDraft] = useState<ComboReviewDraft | null>(() => batch ? initialComboReviewDraft(review) : null)
  const operation = useRef<V3Operation | null>(null)
  useEffect(() => { operation.current = null }, [review.orderVersion])
  const mutation = useMutation({ retry: false, mutationFn: async () => {
    const body = comboReviewBody(review, draft!)
    operation.current = await v3OperationFor(operation.current, body)
    return recordComboReview(token, review.orderId, { ...body, operationId: operation.current.operationId })
  }, onSuccess: async () => { await reload() } })
  if (!batch) return <section className="resource-panel workflow-section"><Alert showIcon type="info" title="Chưa có kết quả phân tích COMBO" description="Cần chạy nhận diện bệnh và chuyển kết quả phân tích cho nhiệm vụ của lần bay này trước." /></section>
  if (!draft) return null
  const editable = !isFrozen(review) && review.orderStatus.toUpperCase() === 'PROCESSING'
  const problems = comboReviewProblems(review, draft)
  const accepted = batch.findings.filter(finding => draft.findings[finding.findingId]?.decision === 'Accept').length
  const setFinding = (id: string, change: Partial<ComboReviewDraft['findings'][string]>) => setDraft(value => value && ({ ...value, findings: { ...value.findings, [id]: { ...value.findings[id], ...change } } }))
  const setZone = (id: string, change: Partial<ComboReviewDraft['zones'][string]>) => setDraft(value => value && ({ ...value, zones: { ...value.zones, [id]: { ...value.zones[id], ...change } } }))
  const setBlocker = (key: string, change: Partial<ComboReviewDraft['blockers'][string]>) => setDraft(value => value && ({ ...value, blockers: { ...value.blockers, [key]: { ...value.blockers[key], ...change } } }))
  const current = review.currentComboReview
  const disabled = !editable || mutation.isPending
  return <section className="resource-panel workflow-section" aria-label="Duyệt COMBO">
    <div className="resource-panel-heading"><div><strong>Duyệt phát hiện, vùng bệnh và mục chặn</strong><span>Lần phân tích {batch.sourceRevision} · {batch.resultNature}</span></div></div>
    {batch.limitationNotice ? <Alert className="workflow-notice" showIcon type="info" title="Giới hạn của kết quả" description={batch.limitationNotice} /> : null}
    {current ? <Alert className="workflow-notice" showIcon type={current.outcome === 'Approved' && current.unresolvedBlockersCount === 0 ? 'success' : 'warning'}
      title={`Lần duyệt ${current.revisionNumber}: ${outcomeLabels[current.outcome as keyof typeof outcomeLabels] ?? current.outcome}`}
      description={`${dateTime(current.reviewedAt)} · Chấp nhận ${current.acceptedFindingsCount}/${current.findingsCount} phát hiện · Duyệt ${current.approvedZonesCount}/${current.zonesCount} vùng · Còn ${current.unresolvedBlockersCount} mục chặn chưa xử lý.`} /> : null}

    <h3>Phát hiện ({batch.findings.length})</h3>
    <Table<ComboPendingFinding> rowKey="findingId" size="small" dataSource={batch.findings} pagination={batch.findings.length > 20 ? { pageSize: 20 } : false} scroll={{ x: 760 }} locale={{ emptyText: 'Không có phát hiện nghi bệnh.' }} columns={[
      { title: 'Nghi bệnh', render: (_, item) => <><strong>{item.suspectedClassCode}</strong><div className="form-hint">{item.classificationNature} · {item.uncertainty}</div></> },
      { title: 'Độ tin cậy', render: (_, item) => `${Math.round(item.confidence * 100)}%` },
      { title: 'Vị trí', render: (_, item) => `${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}` },
      { title: 'Quyết định', render: (_, item) => <Select aria-label={`Quyết định phát hiện ${item.findingId}`} disabled={disabled} value={draft.findings[item.findingId]?.decision} onChange={(decision: ComboFindingDecisionValue) => setFinding(item.findingId, { decision })} options={Object.entries(findingDecisionLabels).map(([value, label]) => ({ value, label }))} style={{ minWidth: 120 }} /> },
      { title: 'Lý do (bắt buộc khi loại)', render: (_, item) => <Input disabled={disabled} maxLength={500} value={draft.findings[item.findingId]?.reason} onChange={event => setFinding(item.findingId, { reason: event.target.value })} /> },
    ]} />

    <h3>Vùng bệnh ({batch.diseaseZones.length})</h3>
    <Table<ComboPendingZone> rowKey="sourceProposalId" size="small" dataSource={batch.diseaseZones} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: 'Không có vùng bệnh đề xuất.' }} columns={[
      { title: 'Vùng', render: (_, zone) => <><strong>{zone.suspectedClassCode}</strong><div className="form-hint">{zone.memberships.length} phát hiện trong vùng</div></> },
      { title: 'Quyết định', render: (_, zone) => <Select aria-label={`Quyết định vùng ${zone.sourceProposalId}`} disabled={disabled} value={draft.zones[zone.sourceProposalId]?.decision} onChange={(decision: 'Approve' | 'Reject') => setZone(zone.sourceProposalId, { decision })} options={Object.entries(zoneDecisionLabels).map(([value, label]) => ({ value, label }))} style={{ minWidth: 130 }} /> },
      { title: 'Hướng dẫn xử lý', render: (_, zone) => zone.guidanceCandidates.length === 0 ? <span className="form-hint">Không có</span>
        : <Select aria-label={`Hướng dẫn vùng ${zone.sourceProposalId}`} disabled={disabled || draft.zones[zone.sourceProposalId]?.decision !== 'Approve'} value={draft.zones[zone.sourceProposalId]?.guidanceId ?? undefined} placeholder="Chọn hướng dẫn" onChange={(guidanceId: string) => setZone(zone.sourceProposalId, { guidanceId })} options={zone.guidanceCandidates.map(candidate => ({ value: candidate.guidanceId, label: `${candidate.code} · v${candidate.versionNumber}` }))} style={{ minWidth: 160 }} /> },
      { title: 'Lý do (bắt buộc khi từ chối)', render: (_, zone) => <Input disabled={disabled} maxLength={500} value={draft.zones[zone.sourceProposalId]?.reason} onChange={event => setZone(zone.sourceProposalId, { reason: event.target.value })} /> },
    ]} />
    <p className="form-hint">Chỉnh hình dạng vùng (Adjust) chưa hỗ trợ trên web; nếu vùng không đúng, hãy từ chối kèm lý do.</p>

    <h3>Mục chặn ({blockerItems(batch).length})</h3>
    <Table rowKey="key" size="small" dataSource={blockerItems(batch)} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: 'Không có mục chặn.' }} columns={[
      { title: 'Mục', render: (_, item) => <><strong>{item.reasonCode}</strong><div className="form-hint">{item.sourceType} · {item.sourceId}</div></> },
      { title: 'Xử lý', render: (_, item) => <Select aria-label={`Xử lý mục chặn ${item.key}`} disabled={disabled} value={draft.blockers[item.key]?.resolution} onChange={(resolution: ComboBlockerResolutionValue) => setBlocker(item.key, { resolution })} options={Object.entries(blockerResolutionLabels).map(([value, label]) => ({ value, label }))} style={{ minWidth: 180 }} /> },
      { title: 'Giải trình (bắt buộc khi đã xử lý)', render: (_, item) => <Input disabled={disabled} maxLength={500} value={draft.blockers[item.key]?.reason} onChange={event => setBlocker(item.key, { reason: event.target.value })} /> },
    ]} />

    {editable ? <Form layout="vertical" className="workflow-section">
      <Form.Item label="Kết luận lần duyệt"><Radio.Group disabled={disabled} value={draft.outcome} onChange={event => setDraft(value => value && ({ ...value, outcome: event.target.value }))} options={Object.entries(outcomeLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
      {draft.outcome === 'Approved' && accepted === 0 ? <>
        <Form.Item><Checkbox disabled={disabled} checked={draft.confirmNoDiseaseObserved} onChange={event => setDraft(value => value && ({ ...value, confirmNoDiseaseObserved: event.target.checked }))}>Không ghi nhận nghi bệnh trong phạm vi khảo sát</Checkbox></Form.Item>
        {batch.findings.length > 0 ? <Form.Item label="Bằng chứng kết luận không ghi nhận nghi bệnh"><Input disabled={disabled} maxLength={500} value={draft.negativeEvidence} onChange={event => setDraft(value => value && ({ ...value, negativeEvidence: event.target.value }))} /></Form.Item> : null}
      </> : null}
      <Form.Item label="Lý do duyệt" required><Input.TextArea disabled={disabled} rows={2} maxLength={500} showCount value={draft.reviewReason} onChange={event => setDraft(value => value && ({ ...value, reviewReason: event.target.value }))} /></Form.Item>
      {problems.length ? <Alert className="workflow-notice" showIcon type="warning" title="Cần hoàn tất trước khi gửi" description={<ul>{problems.slice(0, 6).map(problem => <li key={problem}>{problem}</li>)}</ul>} /> : null}
      <Space wrap><Button type="primary" disabled={problems.length > 0 || isStaleReviewError(mutation.error)} loading={mutation.isPending} onClick={() => { if (!mutation.isPending) mutation.mutate() }}>Gửi kết quả duyệt</Button>
        {mutation.isSuccess ? <Tag color="success">Đã lưu lần duyệt {mutation.data.reviewRevisionNumber}</Tag> : null}</Space>
      <MutationError error={mutation.error} reload={() => { operation.current = null; mutation.reset(); void reload() }} />
    </Form> : null}
  </section>
}

function FreezeSection({ token, review, reload, done }: { token: string; review: ResultReview; reload: () => Promise<void>; done: (result: FreezeResult) => Promise<void> }) {
  const [decision, setDecision] = useState<FreezeResultReviewDecision>(() => defaultFreezeDecision(review))
  const [reason, setReason] = useState('')
  const operation = useRef<V3Operation | null>(null)
  const blocked = freezeBlocker(review)
  const mutation = useMutation({ retry: false, mutationFn: async () => {
    const body = freezeResultBody(review, { reviewDecision: decision, freezeReason: reason })
    operation.current = await v3OperationFor(operation.current, body)
    return freezeResultReview(token, review.orderId, { ...body, operationId: operation.current.operationId })
  }, onSuccess: done })
  return <section className="resource-panel workflow-section" aria-label="Chốt kết quả nội bộ">
    <div className="resource-panel-heading"><div><strong>Chốt kết quả nội bộ</strong><span>Khóa số trụ{isCombo(review) ? ' và kết quả duyệt COMBO' : ''} để chốt hóa đơn. Chưa hiện cho Owner.</span></div></div>
    {blocked ? <Alert showIcon type="info" title={blocked} /> : <Form layout="vertical">
      <Form.Item label="Kết luận"><Select value={decision} disabled={mutation.isPending} onChange={setDecision} options={Object.entries(freezeDecisionLabels).map(([value, label]) => ({ value, label }))} style={{ maxWidth: 320 }} /></Form.Item>
      <Form.Item label="Lý do chốt" required><Input.TextArea rows={2} maxLength={500} showCount disabled={mutation.isPending} value={reason} onChange={event => setReason(event.target.value)} /></Form.Item>
      <Button type="primary" disabled={!reason.trim() || isStaleReviewError(mutation.error)} loading={mutation.isPending} onClick={() => { if (!mutation.isPending) mutation.mutate() }}>Chốt kết quả nội bộ</Button>
      <MutationError error={mutation.error} reload={() => { operation.current = null; mutation.reset(); void reload() }} />
    </Form>}
  </section>
}
