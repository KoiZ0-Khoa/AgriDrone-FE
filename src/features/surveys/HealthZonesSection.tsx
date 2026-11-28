import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Checkbox, Empty, Form, Input, Modal, Radio, Select, Space, Table, Tag } from 'antd'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import {
  MAX_REVIEW_PAGE_SIZE, MAX_REVIEW_REASON_LENGTH, getAllHealthFindings, getHealthReviewQueue, getZoneGuidanceOptions, reviewHealthZone, reviewZoneGuidance,
} from './healthReviewApi'
import type { GuidanceDecision, HealthReviewItem, HealthReviewOutcome, ZoneDecision } from './healthReviewTypes'
import {
  approveReadiness, blockingReasonLabels, buildGuidanceReview, buildZoneReview, guidanceDecisionLabels, guidanceIsCurrent, healthReviewError, isAccepted, isStaleReviewError,
  readZoneOriginal, resolveOriginalMembers, zoneClass, zoneDecisionLabels, zoneMemberCandidates, zoneMemberCount, zoneReviewGeometry, zoneReviewedMemberIds,
} from './healthReviewWorkflow'
import { getPlantHealth, type PlantHealthLabel } from './plantHealthApi'
import { getFarmPlantHealthMap } from './plantHealthMapApi'
import { operationFor } from './workflow'
import { zoneCoversPoint } from './zoneGeometry'

const ZoneShapeEditor = lazy(() => import('./ZoneShapeEditor'))

type Page = { batchId: string; resultVersion: number }
type Dialog = { kind: 'zone' | 'guidance'; zone: HealthReviewItem; page: Page }

const guidanceCode = (zone: HealthReviewItem) => {
  const snapshot = zone.guidanceReview?.snapshot as { Guidance?: { Code?: unknown } } | null | undefined
  return typeof snapshot?.Guidance?.Code === 'string' ? snapshot.Guidance.Code : null
}
function ErrorAlert({ error }: { error: unknown }) {
  return <Alert type="error" showIcon title={healthReviewError(error)}
    description={error instanceof ApiError ? <>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code>{error.traceId ? <> · Mã tra cứu: <code>{error.traceId}</code></> : null}</> : undefined} />
}
function ReasonField({ reason, setReason }: { reason: string; setReason: (value: string) => void }) {
  return <Form.Item label="Lý do" required extra={`${reason.length}/${MAX_REVIEW_REASON_LENGTH} ký tự.`}>
    <Input.TextArea rows={3} maxLength={MAX_REVIEW_REASON_LENGTH} value={reason} onChange={event => setReason(event.target.value)} />
  </Form.Item>
}

export function HealthZonesSection({ token, orderId, farmId, tenantId, canReview }: { token: string; orderId: string; farmId: string; tenantId: string; canReview: boolean }) {
  const { message } = App.useApp()
  const client = useQueryClient()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const zones = useQuery({
    queryKey: ['health-disease-zones', orderId],
    queryFn: ({ signal }) => getHealthReviewQueue(token, orderId, 'zones', { pageNumber: 1, pageSize: MAX_REVIEW_PAGE_SIZE }, signal),
    retry: false,
  })
  const hasZones = (zones.data?.totalCount ?? 0) > 0
  const findings = useQuery({ queryKey: ['health-findings-all', orderId], queryFn: ({ signal }) => getAllHealthFindings(token, orderId, signal), enabled: hasZones, retry: false })
  const catalogue = useQuery({ queryKey: ['plant-health-master-data'], queryFn: ({ signal }) => getPlantHealth(token, signal), enabled: hasZones, retry: false, staleTime: 5 * 60_000 })
  // Chỉ để hiện mã trụ của thành viên; lỗi không chặn thao tác.
  const map = useQuery({ queryKey: ['farm-plant-health-map', farmId, tenantId], queryFn: ({ signal }) => getFarmPlantHealthMap(token, farmId, tenantId, signal), enabled: hasZones, retry: false })
  const plantCodes = useMemo(() => new Map((map.data?.plants ?? []).map(plant => [plant.id.toLowerCase(), plant.plantCode])), [map.data])
  const data = zones.isError ? undefined : zones.data
  const findingItems = findings.data && data && findings.data.batchId === data.batchId ? findings.data.items : null
  const labels = catalogue.data ? catalogue.data.labels.filter(label => label.labelKind === 'SUSPECTED_DISEASE') : null
  const writable = canReview && Boolean(data?.isCurrentBatch) && !zones.isFetching && !findings.isFetching && findingItems !== null

  async function reload() {
    await Promise.all(['health-disease-zones', 'health-findings-all', 'health-review-summary'].map(key => client.invalidateQueries({ queryKey: [key, orderId] })))
  }
  function finish(outcome: HealthReviewOutcome, text: string) {
    void message.success(outcome.isReplay ? 'Yêu cầu này đã được ghi nhận trước đó; không ghi trùng.' : text)
    setDialog(null); void reload()
  }
  if (zones.isPending) return null
  if (!zones.isError && !hasZones) return null

  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Vùng bệnh</strong><span>{data ? `${data.totalCount} vùng AI đề xuất` : 'Ổ dịch AI đề xuất'}</span></div></div>
    {zones.isError ? <CommonState type="error" description={healthReviewError(zones.error)} retry={() => zones.refetch()} /> : <>
      <p className="form-hint">Mỗi vùng cần 2 bước: (1) xác nhận, sửa hoặc bác bỏ vùng; (2) với vùng được xác nhận/sửa, chọn hướng dẫn xử lý. Thành viên vùng là các phát hiện đã được xác nhận ở bảng trên — xác nhận phát hiện trước.</p>
      {data && !data.isCurrentBatch ? <Alert className="workflow-notice" type="warning" showIcon title="Đây không phải lô dữ liệu đang hiệu lực" description="Tải lại trang để xem lô hiện tại." /> : null}
      {findings.isError ? <Alert className="workflow-notice" type="error" showIcon title="Không tải được danh sách phát hiện để đối chiếu thành viên" description={healthReviewError(findings.error)} action={<Button size="small" onClick={() => findings.refetch()}>Thử lại</Button>} /> : null}
      <Table<HealthReviewItem> rowKey="id" size="small" loading={zones.isFetching || findings.isFetching} dataSource={data?.items ?? []} pagination={false} scroll={{ x: 900 }}
        columns={[
          { title: 'Loại bệnh', render: (_, zone) => { const original = readZoneOriginal(zone.original).suspectedClassCode; const current = zoneClass(zone); return <><strong>{current ?? '—'}</strong>{original && current && original !== current ? <div className="form-hint">AI: {original}</div> : null}</> } },
          { title: 'Số cây', render: (_, zone) => zoneMemberCount(zone) },
          { title: 'Quyết định vùng', render: (_, zone) => <Tag color={zone.review ? (isAccepted(zone.review.decision) ? 'error' : 'default') : 'processing'}>{zoneDecisionLabels[zone.review?.decision ?? 'Pending'] ?? zone.review?.decision}</Tag> },
          { title: 'Hướng dẫn xử lý', render: (_, zone) => zone.review?.decision === 'Reject' ? <span className="form-hint">Không cần (vùng bị bác bỏ)</span> : !zone.guidanceReview ? '—' : !guidanceIsCurrent(zone) ? <Tag>Cần chọn lại (vùng đã review lại)</Tag> : <>{guidanceDecisionLabels[zone.guidanceReview.decision] ?? zone.guidanceReview.decision}{guidanceCode(zone) ? <div className="form-hint">{guidanceCode(zone)}</div> : null}</> },
          { title: 'Còn chặn', render: (_, zone) => zone.blockingReasons.length === 0 ? '—' : <Space size={4} wrap>{zone.blockingReasons.map(reason => <Tag key={reason}>{blockingReasonLabels[reason] ?? reason}</Tag>)}</Space> },
          ...(canReview ? [{ title: 'Thao tác', render: (_: unknown, zone: HealthReviewItem) => <Space wrap>
            <Button size="small" disabled={!writable} onClick={() => data && setDialog({ kind: 'zone', zone, page: { batchId: data.batchId, resultVersion: data.resultVersion } })}>Review vùng</Button>
            <Button size="small" disabled={!writable || !isAccepted(zone.review?.decision)} onClick={() => data && setDialog({ kind: 'guidance', zone, page: { batchId: data.batchId, resultVersion: data.resultVersion } })}>Chọn hướng dẫn</Button>
          </Space> }] : []),
        ]} />
    </>}
    {dialog?.kind === 'zone' && findingItems ? <ZoneReviewModal token={token} orderId={orderId} zone={dialog.zone} page={dialog.page} findings={findingItems} labels={labels} plantCodes={plantCodes}
      close={reloadNeeded => { setDialog(null); if (reloadNeeded) void reload() }} done={outcome => finish(outcome, 'Đã lưu quyết định cho vùng bệnh.')} /> : null}
    {dialog?.kind === 'guidance' ? <GuidanceReviewModal token={token} orderId={orderId} zone={dialog.zone} page={dialog.page}
      close={reloadNeeded => { setDialog(null); if (reloadNeeded) void reload() }} done={outcome => finish(outcome, 'Đã lưu quyết định hướng dẫn xử lý.')} /> : null}
  </section>
}

type ModalProps = { token: string; orderId: string; zone: HealthReviewItem; page: Page; close: (reload: boolean) => void; done: (outcome: HealthReviewOutcome) => void }

function useReviewMutation(run: (operationKey: string) => Promise<HealthReviewOutcome>, signature: unknown, done: (outcome: HealthReviewOutcome) => void) {
  const submitting = useRef(false)
  const operation = useRef<{ payload: string; key: string } | null>(null)
  const mutation = useMutation({
    mutationFn: () => { operation.current = operationFor(operation.current, signature); return run(operation.current.key) },
    onSuccess: done, onSettled: () => { submitting.current = false },
  })
  const stale = isStaleReviewError(mutation.error)
  return {
    mutation, stale,
    submit(enabled: boolean) { if (!enabled || stale || mutation.isPending || submitting.current) return; submitting.current = true; mutation.mutate() },
  }
}
const modalLock = (pending: boolean) => ({ closable: !pending, mask: { closable: !pending }, keyboard: !pending, cancelButtonProps: { disabled: pending } })

function ZoneReviewModal({ token, orderId, zone, page, findings, labels, plantCodes, close, done }: ModalProps & { findings: HealthReviewItem[]; labels: PlantHealthLabel[] | null; plantCodes: ReadonlyMap<string, string> }) {
  const original = readZoneOriginal(zone.original)
  const [geometry, setGeometry] = useState(() => zoneReviewGeometry(zone))
  const [editingShape, setEditingShape] = useState(false)
  const readiness = approveReadiness(zone, findings)
  const [decision, setDecision] = useState<ZoneDecision>(zone.review?.decision === 'Correct' || !readiness.ready ? 'Correct' : 'Approve')
  const [classCode, setClassCode] = useState(zoneClass(zone) ?? '')
  const candidates = useMemo(() => classCode ? zoneMemberCandidates(findings, classCode, null).map(member => ({ ...member,
    insideZone: geometry && member.lat !== null && member.lon !== null ? zoneCoversPoint(geometry, member.lon, member.lat) : null,
  })) : [], [findings, classCode, geometry])
  // Mặc định chọn các phát hiện tự khớp với thành viên đề xuất (nếu cùng loại) và nằm trong vùng.
  const [selected, setSelected] = useState<string[]>(() => {
    const code = zoneClass(zone)
    if (!code) return []
    const auto = zoneReviewedMemberIds(zone) ?? resolveOriginalMembers(zone, findings, code).flatMap(entry => entry.matches.length === 1 ? [entry.matches[0].findingId] : [])
    return auto.filter(id => candidates.some(candidate => candidate.findingId === id && candidate.insideZone === true))
  })
  const [reason, setReason] = useState('')
  const members = candidates.filter(candidate => selected.includes(candidate.findingId))
  const duplicatePlant = new Set(members.map(member => member.plantId.toLowerCase())).size !== members.length
  const classChanged = classCode.trim().toUpperCase() !== (original.suspectedClassCode ?? '').toUpperCase()
  const correctError = decision !== 'Correct' ? null : !classCode ? 'Chọn loại bệnh.' : members.length === 0 ? 'Chọn ít nhất một phát hiện làm thành viên vùng.'
    : members.some(member => member.insideZone !== true) ? 'Bỏ chọn thành viên nằm ngoài viền vùng hoặc thiếu tọa độ.'
      : duplicatePlant ? 'Bỏ chọn phát hiện trùng trụ.' : null
  const classOptions = useMemo(() => {
    const options = (labels ?? []).map(label => ({ value: label.code, label: `${label.name} (${label.code})` }))
    const current = zoneClass(zone)
    if (current && !options.some(option => option.value.toUpperCase() === current.toUpperCase())) options.unshift({ value: current, label: `${current} (hiện tại)` })
    return options
  }, [labels, zone])

  const body = (key: string) => buildZoneReview(page, zone, decision, reason.trim(), key, { classCode: classChanged ? classCode : undefined, geometry, members })
  const { mutation, stale, submit } = useReviewMutation(key => reviewHealthZone(token, orderId, zone.id, body(key)), body(''), done)
  const canSubmit = reason.trim().length > 0 && (decision !== 'Approve' || readiness.ready) && correctError === null
  return <><Modal open width={680} title="Review vùng bệnh" okText="Lưu quyết định" cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ danger: decision !== 'Reject', disabled: !canSubmit || stale || mutation.isPending }} confirmLoading={mutation.isPending} {...modalLock(mutation.isPending)}
    onOk={() => submit(canSubmit)} onCancel={() => { if (!mutation.isPending) close(stale) }}>
    <dl className="detail-list">
      <div><dt>AI đề xuất</dt><dd>{original.suspectedClassCode ?? '—'} · {original.memberships.length} cây</dd></div>
      <div><dt>Hiện tại</dt><dd>{zoneDecisionLabels[zone.review?.decision ?? 'Pending']}</dd></div>
    </dl>
    <Form layout="vertical" disabled={mutation.isPending || stale} onFinish={() => submit(canSubmit)}>
      <Form.Item label="Quyết định" required>
        <Radio.Group value={decision} onChange={event => setDecision(event.target.value)}>
          <Space orientation="vertical">
            <Radio value="Approve" disabled={!readiness.ready}>Xác nhận vùng như AI đề xuất</Radio>
            <Radio value="Correct">Sửa loại bệnh, viền hoặc thành viên</Radio>
            <Radio value="Reject">Bác bỏ vùng (không phải ổ dịch)</Radio>
          </Space>
        </Radio.Group>
        {!readiness.ready ? <p className="form-hint" style={{ marginTop: 8 }}>Chưa xác nhận được như đề xuất: {readiness.reason}</p> : null}
      </Form.Item>
      {decision === 'Correct' ? <>
        <Form.Item label="Loại bệnh" required>
          <Select aria-label="Loại bệnh của vùng" showSearch optionFilterProp="label" value={classCode || undefined} options={classOptions} onChange={value => { setClassCode(value); setSelected([]) }} />
        </Form.Item>
        <Form.Item label="Viền vùng bệnh"><Button disabled={!geometry} onClick={() => setEditingShape(true)}>Chỉnh viền trên bản đồ</Button></Form.Item>
        <Form.Item label={`Thành viên vùng (${members.length} đã chọn)`} required extra="Chọn các phát hiện đã duyệt cùng loại bệnh và nằm trong viền vùng.">
          {candidates.length === 0 ? <Empty description="Chưa có phát hiện nào được xác nhận với loại bệnh này." />
            : <Checkbox.Group value={selected} onChange={values => setSelected(values.map(String))} style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}
              options={candidates.map(candidate => ({ value: candidate.findingId, disabled: candidate.insideZone !== true && !selected.includes(candidate.findingId),
                label: <>{plantCodes.get(candidate.plantId.toLowerCase()) ?? 'Trụ ngoài bản đồ hiện tại'} · {candidate.lat?.toFixed(6) ?? '—'}, {candidate.lon?.toFixed(6) ?? '—'}{candidate.insideZone === false ? <Tag color="error" style={{ marginLeft: 6 }}>ngoài vùng</Tag> : null}</> }))} />}
        </Form.Item>
      </> : null}
      <ReasonField reason={reason} setReason={setReason} />
    </Form>
    {correctError ? <Alert type="info" showIcon title={correctError} /> : null}
    {decision !== 'Reject' ? <p className="form-hint">Sau khi lưu, vùng vẫn còn chặn phê duyệt cho tới khi chọn hướng dẫn xử lý.</p> : null}
    {mutation.error ? <ErrorAlert error={mutation.error} /> : null}
  </Modal>{editingShape ? <Suspense fallback={<p role="status">Đang tải trình chỉnh viền…</p>}>
    <ZoneShapeEditor title="Chỉnh viền vùng bệnh" geometry={geometry} boundaryGeoJson={null} bounds={null} imageUrl={null}
      memberPoints={members.flatMap(member => member.lat === null || member.lon === null ? [] : [{ id: member.findingId, lat: member.lat, lon: member.lon,
        label: plantCodes.get(member.plantId.toLowerCase()) ?? classCode }])}
      onClose={() => setEditingShape(false)} onSave={updated => { setGeometry(updated); setEditingShape(false) }} />
  </Suspense> : null}</>
}

function GuidanceReviewModal({ token, orderId, zone, page, close, done }: ModalProps) {
  const options = useQuery({ queryKey: ['zone-guidance-options', orderId, zone.id, zone.review?.reviewId], queryFn: ({ signal }) => getZoneGuidanceOptions(token, orderId, zone.id, signal), retry: false })
  const [choice, setChoice] = useState<string>('') // guidance id, hoặc 'RejectAll' / 'NeedsEvidence'
  const [reason, setReason] = useState('')
  const decision: GuidanceDecision | null = !choice ? null : choice === 'RejectAll' || choice === 'NeedsEvidence' ? choice : 'Select'
  const { mutation, stale, submit } = useReviewMutation(
    key => reviewZoneGuidance(token, orderId, zone.id, buildGuidanceReview(page, zone, decision!, reason.trim(), key, decision === 'Select' ? choice : undefined)),
    { choice, reason: reason.trim(), ...page, zone: zone.id }, done)
  const canSubmit = decision !== null && reason.trim().length > 0
  return <Modal open width={680} title={`Hướng dẫn xử lý · ${zoneClass(zone) ?? ''}`} okText="Lưu quyết định" cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ disabled: !canSubmit || stale || mutation.isPending }} confirmLoading={mutation.isPending} {...modalLock(mutation.isPending)}
    onOk={() => submit(canSubmit)} onCancel={() => { if (!mutation.isPending) close(stale) }}>
    {options.isPending ? <CommonState type="loading" title="Đang tải hướng dẫn áp dụng được" />
      : options.isError ? <CommonState type="error" description={healthReviewError(options.error)} retry={() => options.refetch()} />
      : <Form layout="vertical" disabled={mutation.isPending || stale} onFinish={() => submit(canSubmit)}>
        <Form.Item label="Quyết định" required extra={options.data.length === 0 ? 'Không có hướng dẫn đang hiệu lực cho đúng loại bệnh này. System Admin quản lý hướng dẫn ở mục "Nhãn & hướng dẫn".' : undefined}>
          <Radio.Group value={choice} onChange={event => setChoice(event.target.value)}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              {options.data.map(option => <Radio key={option.id} value={option.id}>
                <strong>{option.code}</strong> · phiên bản {option.versionNumber}
                <div className="form-hint">{option.sourceTitle} — {option.sourceReference}</div>
                <div className="form-hint" style={{ whiteSpace: 'pre-wrap', maxHeight: 96, overflowY: 'auto' }}>{option.guidanceText}</div>
              </Radio>)}
              <Radio value="RejectAll">{guidanceDecisionLabels.RejectAll}</Radio>
              <Radio value="NeedsEvidence">{guidanceDecisionLabels.NeedsEvidence} <span className="form-hint">(vùng vẫn chặn phê duyệt)</span></Radio>
            </Space>
          </Radio.Group>
        </Form.Item>
        <ReasonField reason={reason} setReason={setReason} />
      </Form>}
    {mutation.error ? <ErrorAlert error={mutation.error} /> : null}
  </Modal>
}
