import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Modal, Radio, Select, Space, Table, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { PlantHealthProcessingPanel } from '../missions/PlantHealthProcessingPanel'
import { ComboReviewVisuals, selectionForComboBlocker, type ComboReviewSelection } from './ComboReviewVisuals'
import { ManagerInvoicePanel } from './ManagerInvoicePanel'
import { getAssignedOrder } from './orderApi'
import { ownerGuid } from './ownerOrderWorkflow'
import { orderStatusLabels } from './orderWorkflow'
import {
  blockerItems, blockerResolutionLabels, canExcludeComboGroup, comboBlockerGroups, comboBlockerLabel, comboFindingLabel, comboReviewBody, comboReviewProblems,
  defaultFreezeDecision, excludeComboGroups, findingDecisionLabels, freezeBlocker,
  freezeDecisionLabels, freezeResultBody, initialComboReviewDraft, isCombo, isFrozen, isStaleReviewError, outcomeLabels, zoneDecisionLabels,
  type ComboBlockerGroup, type ComboReviewDraft,
} from './resultReviewWorkflow'
import { freezeResultReview, getCaptureAttempts, getResultReview, recordComboReview } from './v3Api'
import type { ComboBlockerResolutionValue, ComboFindingDecisionValue, ComboPendingFinding, ComboPendingZone, FreezeResult, FreezeResultReviewDecision, ResultReview } from './v3Types'
import { captureAttemptStatusLabels, v3OperationFor, v3ServiceKind, type V3Operation } from './v3Workflow'
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
  const checkingHandoff = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const back = <Link className="back-link" to={`/manager/orders/${encodeURIComponent(orderId)}`}><ArrowLeftOutlined /> Về đơn khảo sát</Link>
  async function reload() {
    await Promise.all([client.invalidateQueries({ queryKey: ['result-review', orderId] }), client.invalidateQueries({ queryKey: ['manager-order-context', orderId] }), client.invalidateQueries({ queryKey: ['capture-attempts', orderId] })])
  }
  async function checkComboHandoff(afterSourceRevision = 0) {
    if (checkingHandoff.current) return
    checkingHandoff.current = true
    try {
      for (const delay of [0, 1000, 2000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        if (!mounted.current) return
        const result = await query.refetch()
        if (result.isError || (result.data?.comboPendingBatch?.sourceRevision ?? 0) > afterSourceRevision) return
      }
    } finally {
      checkingHandoff.current = false
    }
  }
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải dữ liệu duyệt" /></>
  if (query.isError) return <>{back}<CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /></>
  const review = query.data
  if (review === null) return <>{back}<PendingComboAnalysis token={token} orderId={orderId} reload={reload} checkHandoff={checkComboHandoff} /></>
  const combo = isCombo(review)
  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">DUYỆT KẾT QUẢ KHẢO SÁT</span><h1>{combo ? 'COMBO · Bản đồ và sàng lọc bệnh' : 'MAP · Bản đồ và đếm trụ'}</h1><p>{orderStatusLabels[review.orderStatus.toUpperCase()] ?? review.orderStatus}</p></div>
      <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void reload() }}>Tải lại</Button>
    </section>
    <section className="resource-panel">
      <dl className="detail-list">
        <div><dt>Số trụ đã xác minh</dt><dd><strong>{review.verifiedBillablePoleCount.toLocaleString('vi-VN')} trụ</strong> (phiên bản {review.countSnapshotRevision})</dd></div>
        <div><dt>Lần bay</dt><dd>{captureAttemptStatusLabels[review.captureAttemptStatus.toUpperCase() as keyof typeof captureAttemptStatusLabels] ?? review.captureAttemptStatus}</dd></div>
        <div><dt>Loại bản đồ</dt><dd>{review.mappingKind === 'FirstBaseline' ? 'Bản đồ nền lần đầu' : review.mappingKind === 'FollowUp' ? 'Bản đồ khảo sát lại' : review.mappingKind}</dd></div>
        <div><dt>Kết quả nội bộ</dt><dd>{isFrozen(review) ? <Tag color="success">Đã chốt</Tag> : <Tag>Chưa chốt</Tag>}</dd></div>
      </dl>
      {isFrozen(review) || frozen ? <Alert className="workflow-notice" showIcon type="success" title="Đã chốt kết quả nội bộ"
        description={<>{frozen ? `Chốt lúc ${dateTime(frozen.frozenAt)} · ${frozen.verifiedBillablePoleCount.toLocaleString('vi-VN')} trụ · ${frozen.healthAssessmentStatus}. ` : ''}Sau khi chốt hóa đơn, Owner có thể kiểm tra số tiền còn lại.</>} /> : null}
    </section>
    {combo ? <ComboReviewSection key={`${review.comboPendingBatch?.batchId}:${review.currentComboReview?.reviewRevisionId}`} token={token} review={review} reload={reload} checkHandoff={checkComboHandoff} /> : null}
    {isFrozen(review) ? <ManagerInvoicePanel key={review.orderId} token={token} review={review} refreshing={query.isFetching} reload={reload} /> : null}
    {!isFrozen(review) && !frozen ? <FreezeSection key={review.expectedFreezeTokens.expectedComboReviewRevisionId ?? review.verifiedPoleCountSnapshotId} token={token} review={review} reload={reload} done={async result => { setFrozen(result); await reload() }} /> : null}
  </>
}

function PendingComboAnalysis({ token, orderId, reload, checkHandoff }: { token: string; orderId: string; reload: () => Promise<void>; checkHandoff: () => Promise<void> }) {
  const order = useQuery({
    queryKey: ['manager-order-context', orderId],
    queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const attempts = useQuery({
    queryKey: ['capture-attempts', orderId],
    queryFn: ({ signal }) => getCaptureAttempts(token, orderId, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  if (order.isError || attempts.isError) {
    return <CommonState type="error" description={workflowError(order.error ?? attempts.error)} retry={reload} />
  }
  if (order.isPending || attempts.isPending) return <CommonState type="loading" title="Đang tải lần bay COMBO" />

  const processingAttempts = attempts.data.filter(attempt => attempt.status === 'PROCESSING')
  const attempt = processingAttempts.length === 1 ? processingAttempts[0] : undefined
  const missionId = attempt?.missionId
  const assigned = order.data
  const isAssignedCombo = assigned?.surveyOrderId === orderId && v3ServiceKind(assigned.surveyServiceCode) === 'COMBO'
  const hasDiseaseCapture = attempts.data.some(item => !!item.mappingSourceAttemptId)
  if (isAssignedCombo && assigned.requiresBaselineMapping && !attempt?.mappingSourceAttemptId) {
    return <Alert className="workflow-notice" showIcon type="info" title={hasDiseaseCapture ? 'Chờ duyệt dữ liệu chuyến bay bệnh' : 'Cần tạo chuyến bay bệnh'}
      description={hasDiseaseCapture ? 'Hoàn tất chuyến bay bệnh và duyệt bộ dữ liệu đầu vào trên nhiệm vụ của chuyến đó.' : 'Dùng bản đồ đã duyệt để tạo chuyến bay bệnh từ trang đơn khảo sát.'}
      action={<Link to={`/manager/orders/${encodeURIComponent(orderId)}`}>Mở đơn khảo sát</Link>} />
  }
  if (!assigned || !isAssignedCombo || assigned.status !== 'PROCESSING' || !ownerGuid(assigned.farmId) || !missionId || !ownerGuid(missionId)) {
    return <Alert className="workflow-notice" showIcon type="warning" title="Chưa xác định được nhiệm vụ để nhận diện bệnh"
      description="Kiểm tra lại đơn COMBO và lần bay đang xử lý trong trang đơn khảo sát." />
  }
  return <PlantHealthProcessingPanel key={missionId} token={token} farmId={assigned.farmId} missionId={missionId}
    surveyOrderId={orderId} disabled={false} onComboHandoff={checkHandoff} />
}

function ComboReviewSection({ token, review, reload, checkHandoff }: { token: string; review: ResultReview; reload: () => Promise<void>; checkHandoff: (afterSourceRevision?: number) => Promise<void> }) {
  const batch = review.comboPendingBatch
  const [draft, setDraft] = useState<ComboReviewDraft | null>(() => batch ? initialComboReviewDraft(review) : null)
  const [selection, setSelection] = useState<ComboReviewSelection>({ kind: 'finding', id: null })
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [bulkReason, setBulkReason] = useState<string | null>(null)
  const mapAnchor = useRef<HTMLDivElement>(null)
  const operation = useRef<V3Operation | null>(null)
  useEffect(() => { operation.current = null }, [review.orderVersion])
  const mutation = useMutation({ retry: false, mutationFn: async () => {
    const body = comboReviewBody(review, draft!)
    operation.current = await v3OperationFor(operation.current, body)
    return recordComboReview(token, review.orderId, { ...body, operationId: operation.current.operationId })
  }, onSuccess: async () => { await reload() } })
  if (!batch) {
    if (!isFrozen(review) && review.orderStatus.toUpperCase() === 'PROCESSING' && review.captureAttemptStatus.toUpperCase() === 'PROCESSING') {
      if (review.mappingKind === 'FirstBaseline') return <PendingComboAnalysis token={token} orderId={review.orderId} reload={reload} checkHandoff={checkHandoff} />
      return <PlantHealthProcessingPanel key={review.missionId} token={token} farmId={review.farmId} missionId={review.missionId}
        surveyOrderId={review.orderId} disabled={false} onComboHandoff={checkHandoff} />
    }
    return <Alert className="workflow-notice" showIcon type="info" title="Chưa có kết quả phân tích COMBO"
      description="Nhận diện bệnh sẽ mở khi đơn và lần bay ở bước xử lý kết quả." />
  }
  if (!draft) return null
  const editable = !isFrozen(review) && review.orderStatus.toUpperCase() === 'PROCESSING'
  const problems = comboReviewProblems(review, draft)
  const accepted = batch.findings.filter(finding => draft.findings[finding.findingId]?.decision === 'Accept').length
  const setFinding = (id: string, change: Partial<ComboReviewDraft['findings'][string]>) => setDraft(value => value && ({ ...value, findings: { ...value.findings, [id]: { ...value.findings[id], ...change } } }))
  const setZone = (id: string, change: Partial<ComboReviewDraft['zones'][string]>) => setDraft(value => value && ({ ...value, zones: { ...value.zones, [id]: { ...value.zones[id], ...change } } }))
  const setBlockers = (keys: string[], change: Partial<ComboReviewDraft['blockers'][string]>) => setDraft(value => {
    if (!value) return value
    const blockers = { ...value.blockers }
    for (const key of keys) blockers[key] = { ...blockers[key], ...change }
    return { ...value, blockers }
  })
  const current = review.currentComboReview
  const disabled = !editable || mutation.isPending
  const blockers = blockerItems(batch)
  const groups = comboBlockerGroups(batch, blockers)
  const pendingGroups = groups.filter(group => group.items.some(item => draft.blockers[item.key]?.resolution === 'Unresolved')).length
  const eligible = groups.filter(group => canExcludeComboGroup(draft, group))
  const selected = eligible.filter(group => selectedGroups.includes(group.key))
  const locate = (next: ComboReviewSelection) => {
    setSelection(next)
    mapAnchor.current?.scrollIntoView({ block: 'start' })
  }
  return <section className="resource-panel workflow-section" aria-label="Duyệt COMBO">
    <div className="resource-panel-heading"><div><strong>Duyệt phát hiện, vùng bệnh và mục chặn</strong><span>Lần phân tích {batch.sourceRevision} · Kết quả sàng lọc sơ bộ</span></div></div>
    {batch.limitationNotice ? <Alert className="workflow-notice" showIcon type="info" title="Giới hạn của kết quả" description={batch.limitationNotice} /> : null}
    {current ? <Alert className="workflow-notice" showIcon type={current.outcome === 'Approved' && current.unresolvedBlockersCount === 0 ? 'success' : 'warning'}
      title={`Lần duyệt ${current.revisionNumber}: ${outcomeLabels[current.outcome as keyof typeof outcomeLabels] ?? current.outcome}`}
      description={`${dateTime(current.reviewedAt)} · Chấp nhận ${current.acceptedFindingsCount}/${current.findingsCount} phát hiện · Duyệt ${current.approvedZonesCount}/${current.zonesCount} vùng · Còn ${current.unresolvedBlockersCount} mục chặn chưa xử lý.`} /> : null}

    {editable && review.captureAttemptStatus.toUpperCase() === 'PROCESSING' ? <details className="combo-review-list">
      <summary>Phân tích lại ảnh chuyến bay bệnh</summary>
      <p className="form-hint">Dùng lại bộ ảnh đã duyệt. Sau khi gửi và máy chủ nhập lần phân tích mới, hãy duyệt kết quả mới.</p>
      <PlantHealthProcessingPanel key={review.missionId} token={token} farmId={review.farmId} missionId={review.missionId}
        surveyOrderId={review.orderId} disabled={mutation.isPending} importedSourceRevision={batch.sourceRevision} onComboHandoff={() => checkHandoff(batch.sourceRevision)} />
    </details> : null}

    <div ref={mapAnchor} className="combo-review-map-anchor">
      <ComboReviewVisuals token={token} review={review} batch={batch} draft={draft} blockers={blockers} disabled={disabled}
        selection={selection} onSelect={setSelection} onFindingChange={setFinding} onZoneChange={setZone} onBlockerChange={(key, change) => setBlockers([key], change)} />
    </div>

    <details className="combo-review-list">
    <summary>Danh sách phát hiện ({batch.findings.length})</summary>
    <Table<ComboPendingFinding> rowKey="findingId" size="small" dataSource={batch.findings} pagination={batch.findings.length > 20 ? { pageSize: 20 } : false} scroll={{ x: 900 }} locale={{ emptyText: 'Không có phát hiện nghi bệnh.' }} columns={[
      { title: 'Nhãn AI', render: (_, item) => <><strong>{comboFindingLabel(item.suspectedClassCode)}</strong>{item.uncertainty === 'REQUIRES_REVIEW' ? <div className="form-hint">Cần xem lại</div> : null}</> },
      { title: 'Độ tin cậy', render: (_, item) => `${Math.round(item.confidence * 100)}%` },
      { title: 'Vị trí', render: (_, item) => `${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)}` },
      { title: 'Bản đồ', render: (_, item) => <Button size="small" onClick={() => locate({ kind: 'finding', id: item.findingId })}>Mở trên bản đồ</Button> },
      { title: 'Quyết định', render: (_, item) => <Select aria-label={`Quyết định phát hiện ${item.findingId}`} disabled={disabled} value={draft.findings[item.findingId]?.decision} onChange={(decision: ComboFindingDecisionValue) => setFinding(item.findingId, { decision })} options={Object.entries(findingDecisionLabels).map(([value, label]) => ({ value, label }))} style={{ minWidth: 120 }} /> },
      { title: 'Lý do (bắt buộc khi loại)', render: (_, item) => <Input disabled={disabled} maxLength={500} value={draft.findings[item.findingId]?.reason} onChange={event => setFinding(item.findingId, { reason: event.target.value })} /> },
    ]} />
    </details>

    <details className="combo-review-list">
    <summary>Danh sách vùng nghi bệnh ({batch.diseaseZones.length})</summary>
    <Table<ComboPendingZone> rowKey="sourceProposalId" size="small" dataSource={batch.diseaseZones} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Không có vùng bệnh đề xuất.' }} columns={[
      { title: 'Vùng', render: (_, zone) => <><strong>{comboFindingLabel(zone.suspectedClassCode)}</strong><div className="form-hint">{zone.memberships.length} phát hiện trong vùng</div></> },
      { title: 'Bản đồ', render: (_, zone) => <Button size="small" onClick={() => locate({ kind: 'zone', id: zone.sourceProposalId })}>Mở trên bản đồ</Button> },
      { title: 'Quyết định', render: (_, zone) => <Select aria-label={`Quyết định vùng ${zone.sourceProposalId}`} disabled={disabled} value={draft.zones[zone.sourceProposalId]?.decision} onChange={(decision: 'Approve' | 'Reject') => setZone(zone.sourceProposalId, { decision })} options={Object.entries(zoneDecisionLabels).map(([value, label]) => ({ value, label }))} style={{ minWidth: 130 }} /> },
      { title: 'Hướng dẫn xử lý', render: (_, zone) => zone.guidanceCandidates.length === 0 ? <span className="form-hint">Không có</span>
        : <Select aria-label={`Hướng dẫn vùng ${zone.sourceProposalId}`} disabled={disabled || draft.zones[zone.sourceProposalId]?.decision !== 'Approve'} value={draft.zones[zone.sourceProposalId]?.guidanceId ?? undefined} placeholder="Chọn hướng dẫn" onChange={(guidanceId: string) => setZone(zone.sourceProposalId, { guidanceId })} options={zone.guidanceCandidates.map(candidate => ({ value: candidate.guidanceId, label: `${candidate.code} · v${candidate.versionNumber}` }))} style={{ minWidth: 160 }} /> },
      { title: 'Lý do (bắt buộc khi từ chối)', render: (_, zone) => <Input disabled={disabled} maxLength={500} value={draft.zones[zone.sourceProposalId]?.reason} onChange={event => setZone(zone.sourceProposalId, { reason: event.target.value })} /> },
    ]} />
    </details>

    <details className="combo-review-list">
    <summary>Mục cần xử lý ({pendingGroups}/{groups.length} nhóm)</summary>
    {editable && eligible.length ? <Space wrap className="workflow-toolbar">
      <Button danger disabled={disabled || !selected.length} onClick={() => setBulkReason('')}>Loại phát hiện đã chọn{selected.length ? ` (${selected.length})` : ''}</Button>
    </Space> : null}
    <Table<ComboBlockerGroup> rowKey="key" size="small" dataSource={groups} pagination={groups.length > 10 ? { pageSize: 10 } : false} scroll={{ x: 760 }} locale={{ emptyText: 'Không có mục chặn.' }}
      rowSelection={editable && eligible.length ? { selectedRowKeys: selected.map(group => group.key), onChange: keys => setSelectedGroups(keys.map(String)),
        hideSelectAll: true, preserveSelectedRowKeys: true, getCheckboxProps: group => ({ disabled: disabled || !canExcludeComboGroup(draft, group) }) } : undefined} columns={[
      { title: 'Mục', render: (_, group) => <Space orientation="vertical" size={4}>
        {group.finding ? <strong>{comboFindingLabel(group.finding.suspectedClassCode)}</strong> : null}
        <span>{group.items.map(item => comboBlockerLabel(item.reasonCode)).join(' · ')}</span>
      </Space> },
      { title: 'Bản đồ', render: (_, group) => {
        const target = selectionForComboBlocker(batch, group.items[0])
        return target ? <Button size="small" onClick={() => locate(target)}>Mở trên bản đồ</Button> : null
      } },
      { title: 'Xử lý và giải trình', render: (_, group) => {
        const first = draft.blockers[group.items[0].key]
        const shared = group.items.every(item => draft.blockers[item.key]?.resolution === first?.resolution && draft.blockers[item.key]?.reason === first?.reason)
        const selections = shared ? [group.items] : group.items.map(item => [item])
        return <Space orientation="vertical" size={8} style={{ width: '100%' }}>{selections.map(items => {
          const item = items[0]
          const keys = items.map(entry => entry.key)
          const value = draft.blockers[item.key]
          return <div key={item.key} className="combo-review-fields">
            {shared ? null : <small>{comboBlockerLabel(item.reasonCode)}</small>}
            <Select aria-label={`Xử lý mục chặn ${item.key}`} disabled={disabled} value={value?.resolution}
              onChange={(resolution: ComboBlockerResolutionValue) => setBlockers(keys, { resolution })} options={Object.entries(blockerResolutionLabels).map(([value, label]) => ({ value, label }))} />
            {value?.resolution !== 'Unresolved' ? <Input aria-label={`Giải trình ${item.key}`} placeholder="Nhập giải trình" disabled={disabled} maxLength={500}
              value={value?.reason} onChange={event => setBlockers(keys, { reason: event.target.value })} /> : null}
          </div>
        })}</Space>
      } },
    ]} />
    </details>
    {bulkReason !== null ? <Modal open title={`Loại ${selected.length} phát hiện khỏi kết quả`} okText="Áp dụng" cancelText="Hủy"
      okButtonProps={{ danger: true, disabled: disabled || !selected.length || !bulkReason.trim() }} onCancel={() => setBulkReason(null)}
      onOk={() => {
        if (disabled) return
        setDraft(value => value && excludeComboGroups(value, selected, bulkReason))
        setSelectedGroups([])
        setBulkReason(null)
      }}>
      <p>Chỉ áp dụng cho các phát hiện đã xác minh cần loại. Lý do này được ghi cho từng phát hiện và các mục liên quan trong lần duyệt.</p>
      <Input.TextArea aria-label="Lý do loại các phát hiện đã chọn" placeholder="Nhập lý do chung" rows={2} maxLength={500} showCount value={bulkReason} onChange={event => setBulkReason(event.target.value)} />
    </Modal> : null}

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
