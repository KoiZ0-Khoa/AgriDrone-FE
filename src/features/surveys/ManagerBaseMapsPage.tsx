import { CopyReference, readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tag } from 'antd'
import { useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getAssignedFarms } from './api'
import { getBaseMapDraft, publishBaseMapDraft, validateBaseMapDraft } from './baseMapApi'
import type { MappingCandidate, MappingValidation, PublishedBaseMap } from './baseMapTypes'
import { canPublishDraft, decisionLabel, decisionLabels, draftFingerprint, editableDraft, stateToken, validGuid } from './baseMapWorkflow'
import { BaseMapReviewDialog, type ReviewSelection } from './BaseMapReviewDialog'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime, workflowError } from './workflow'

export function ManagerBaseMapsPage() {
  const { session } = useAuth()
  const params = useParams()
  const farmId = params.farmId?.toLowerCase() ?? '', draftId = params.draftId?.toLowerCase()
  if (session?.role !== 'SYSTEM_MANAGER') return <CommonState type="forbidden" />
  if (!validGuid(farmId) || (draftId !== undefined && !validGuid(draftId))) return <CommonState type="error" description="Liên kết bản đồ nháp không hợp lệ." />
  return <AssignedBaseMap key={`${farmId}:${draftId ?? ''}`} token={session.accessToken} farmId={farmId} draftId={draftId} />
}

function AssignedBaseMap({ token, farmId, draftId }: { token: string; farmId: string; draftId?: string }) {
  const navigate = useNavigate()
  const assigned = useQuery({ queryKey: ['manager-assigned-farms'], queryFn: ({ signal }) => getAssignedFarms(token, signal), retry: false })
  const farm = assigned.data?.find(item => item.farmId.toLowerCase() === farmId)
  const back = <Link className="back-link" to={`/manager/farms/${farmId}`}><ArrowLeftOutlined /> Chi tiết nông trại</Link>
  if (assigned.isPending) return <CommonState type="loading" />
  if (assigned.isError) return <CommonState type="error" description={workflowError(assigned.error)} retry={() => assigned.refetch()} />
  if (!farm) return <>{back}<CommonState type="forbidden" description="Nông trại không thuộc phân công hiện tại của bạn." /></>
  if (draftId) return <BaseMapDraftDetail token={token} farmId={farmId} draftId={draftId} farmName={farm.name} />
  return <>{back}<section className="resource-page-heading"><div><span className="page-kicker">{farm.name}</span><h1>Duyệt bản đồ nền</h1><p>Mở kết quả nhận diện để kiểm tra cây/trụ trước khi phát hành.</p></div></section>
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Mở bản đồ nháp</strong><span>Sử dụng mã bản đồ được cung cấp sau khi xử lý kết quả khảo sát.</span></div></div>
      <Form layout="vertical" onFinish={({ draftId: value }: { draftId: string }) => navigate(`/manager/farms/${farmId}/base-map-drafts/${value.trim().toLowerCase()}`)}><Form.Item name="draftId" label="Mã bản đồ nháp" rules={[{ required: true, message: 'Nhập mã bản đồ nháp.' }, { validator: (_, value) => validGuid((value ?? '').trim()) ? Promise.resolve() : Promise.reject(new Error('Mã bản đồ phải là GUID hợp lệ.')) }]}><Input placeholder="Nhập mã bản đồ nháp" /></Form.Item><Button type="primary" htmlType="submit">Mở bản đồ</Button></Form>
    </section></>
}

type CandidateRow = MappingCandidate & { zoneId: string }
export function BaseMapDraftDetail({ token, farmId, draftId, farmName }: { token: string; farmId: string; draftId: string; farmName: string }) {
  const client = useQueryClient()
  const { message } = App.useApp()
  const queryKey = ['manager-base-map-draft', farmId, draftId]
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getBaseMapDraft(token, farmId, draftId, signal), retry: false })
  const [zoneId, setZoneId] = useState(''), [decision, setDecision] = useState(''), [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [editor, setEditor] = useState<ReviewSelection | null>(null)
  const [validation, setValidation] = useState<{ fingerprint: string; data: MappingValidation } | null>(null)
  const [publishOpen, setPublishOpen] = useState(false), [published, setPublished] = useState<PublishedBaseMap | null>(null)
  const confirmButtonId = useId()
  const submitting = useRef(false)
  const validate = useMutation({ retry: false, mutationFn: async () => {
    if (!query.data || query.isFetching || query.isError || !editableDraft(query.data)) throw new Error('Tải lại bản đồ nháp trước khi kiểm tra.')
    const fingerprint = draftFingerprint(query.data)
    return { fingerprint, data: await validateBaseMapDraft(token, farmId, draftId) }
  }, onSuccess: setValidation })
  const publish = useMutation({ retry: false, mutationFn: async () => {
    if (query.isError || query.isFetching || !query.data || !canPublishDraft(query.data, validation?.data ?? null, validation?.fingerprint ?? null)) throw new Error('Kiểm tra lại bản đồ trước khi phát hành.')
    const result = await publishBaseMapDraft(token, farmId, draftId)
    if (result.farmBaseMapVersionId.toLowerCase() !== draftId.toLowerCase()) throw new Error('Kết quả phát hành không khớp bản đồ. Tải lại để kiểm tra.')
    return result
  }, onSuccess: async result => {
    setPublished(result); setPublishOpen(false); setValidation(null); setSelected([])
    await Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ['manager-farm-context', farmId] }), client.invalidateQueries({ queryKey: ['manager-orders'] }), client.invalidateQueries({ queryKey: ['manager-order-context'] }), client.invalidateQueries({ queryKey: ['manager-order-scope'] })])
  }, onError: () => { setPublishOpen(false); setValidation(null) }, onSettled: () => { submitting.current = false } })
  async function refresh() {
    setEditor(null); setSelected([]); setValidation(null); setPublishOpen(false); validate.reset(); publish.reset()
    await query.refetch()
  }
  async function reviewed(notice: string) { setEditor(null); setSelected([]); setValidation(null); validate.reset(); publish.reset(); await query.refetch(); void message.success(notice) }
  const back = <Link className="back-link" to={`/manager/farms/${farmId}`}><ArrowLeftOutlined /> {farmName}</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải bản đồ nháp" /></>
  if (query.isError) return <>{back}<SurveyMutationError error={query.error} /><Button onClick={() => { void refresh() }}>Tải lại bản đồ</Button></>
  const draft = query.data
  const rows: CandidateRow[] = draft.zones.flatMap(zone => zone.candidates.map(candidate => ({ ...candidate, zoneId: zone.zoneId })))
  const filtered = rows.filter(item => (!zoneId || item.zoneId === zoneId) && (!decision || stateToken(item.reviewDecision) === stateToken(decision)) && (!search.trim() || `${item.treeId ?? ''} ${item.candidateId}`.toLowerCase().includes(search.trim().toLowerCase())))
  const busy = query.isFetching || validate.isPending || publish.isPending
  const editable = editableDraft(draft) && !published && !publish.error && !validate.error
  const checked = validation?.fingerprint === draftFingerprint(draft) ? validation.data : null
  const canPublish = !busy && !published && !publish.error && canPublishDraft(draft, checked, validation?.fingerprint ?? null)
  function changeFilter(run: () => void) { setSelected([]); run() }
  function openReview(ids: string[], batch: boolean) { if (!editable || busy || !ids.length) return; setValidation(null); setEditor({ snapshot: draft, candidateIds: ids, batch }) }
  return <>{back}
    <section className="resource-page-heading"><div><span className="page-kicker">{farmName} · Phiên bản {draft.versionNumber}</span><h1>Duyệt bản đồ nền</h1><p>Kiểm tra từng điểm trước khi ghi nhận cây và số trụ chính thức.</p></div><Space wrap><Button icon={<ReloadOutlined />} disabled={validate.isPending || publish.isPending || !!editor} loading={query.isFetching} onClick={() => { void refresh() }}>Tải lại</Button><Button icon={<CheckCircleOutlined />} loading={validate.isPending} disabled={!editable || busy || !!editor} onClick={() => { setValidation(null); validate.mutate() }}>Kiểm tra bản đồ</Button><Button type="primary" disabled={!canPublish || !!editor} onClick={() => setPublishOpen(true)}>Phát hành bản đồ</Button></Space></section>
    {published ? <Alert className="workflow-notice" showIcon type="success" title={`Đã phát hành bản đồ phiên bản ${published.versionNumber}`} description={`Số trụ chính thức: ${published.confirmedSurveyPoleCount.toLocaleString('vi-VN')} · ${dateTime(published.publishedAt)}`} /> : null}
    {!editableDraft(draft) ? <Alert className="workflow-notice" showIcon type="info" title="Bản đồ hiện chỉ được xem" description={`Trạng thái: ${stateToken(draft.status) === 'PUBLISHED' ? 'Đã phát hành' : stateToken(draft.status) === 'SUPERSEDED' ? 'Đã được thay thế' : draft.status}.`} /> : null}
    <div className="mapping-summary" aria-label="Tiến độ duyệt"><div><span>Tổng số điểm</span><strong>{draft.totalCandidates}</strong></div><div><span>Chưa duyệt</span><strong>{draft.pendingCount}</strong></div><div><span>Đã xử lý</span><strong>{draft.acceptedCount + draft.relocatedCount + draft.replacedCount}</strong></div><div><span>Đã loại bỏ</span><strong>{draft.rejectedCount}</strong></div></div>
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Cây / trụ nhận diện</strong><span>Dữ liệu nhận lúc {dateTime(draft.producedAt)}</span></div><Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(draft.sourceSurveyOrderId)}`}>Xem đơn khảo sát →</Link></div>
      <div className="workflow-toolbar mapping-filters"><Input.Search aria-label="Tìm mã cây hoặc điểm" placeholder="Tìm mã cây / điểm" value={search} onChange={event => changeFilter(() => setSearch(event.target.value))} /><Select aria-label="Lọc khu vực bản đồ" value={zoneId} onChange={value => changeFilter(() => setZoneId(value))} options={[{ value: '', label: 'Tất cả khu vực' }, ...draft.zones.map((zone, index) => ({ value: zone.zoneId, label: `Khu vực ${index + 1}` }))]} /><Select aria-label="Lọc quyết định duyệt" value={decision} onChange={value => changeFilter(() => setDecision(value))} options={[{ value: '', label: 'Tất cả quyết định' }, ...Object.entries(decisionLabels).map(([value, label]) => ({ value, label }))]} /></div>
      <Space className="workflow-toolbar" wrap><Button disabled={!editable || busy || !selected.length || selected.length > 500 || !!editor} onClick={() => openReview(selected, true)}>Duyệt {selected.length ? `${selected.length} điểm` : 'các điểm đã chọn'}</Button>{selected.length > 0 ? <Button onClick={() => setSelected([])}>Bỏ chọn</Button> : null}<span className="form-hint">Duyệt hàng loạt tối đa 500 điểm mỗi lượt.</span></Space>
      <Table<CandidateRow> rowKey="candidateId" dataSource={filtered} loading={query.isFetching} scroll={{ x: 1050 }} pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: 'Không có điểm phù hợp.' }} rowSelection={editable ? { selectedRowKeys: selected, onChange: keys => setSelected(keys.map(String)), preserveSelectedRowKeys: true, getCheckboxProps: () => ({ disabled: busy || !!editor }) } : undefined} columns={[
        { title: 'Cây / điểm', render: (_, item) => <><strong>{readableCode(item.treeId) ?? 'Điểm nhận diện'}</strong></> },
        { title: 'Hàng / cột', render: (_, item) => `${item.correctedRowIndex ?? item.proposedRowIndex ?? '—'} / ${item.correctedColumnIndex ?? item.proposedColumnIndex ?? '—'}` },
        { title: 'Kinh độ / vĩ độ', render: (_, item) => <>{item.correctedLongitude ?? item.longitude}<br />{item.correctedLatitude ?? item.latitude}</> },
        { title: 'Ranh giới', render: (_, item) => <Tag color={item.boundaryClassification === 'IN_BOUNDARY' ? 'success' : 'warning'}>{({ IN_BOUNDARY: 'Trong ranh giới', OUT_OF_BOUNDARY: 'Ngoài ranh giới', NEEDS_REVIEW: 'Cần kiểm tra' } as Record<string, string>)[item.boundaryClassification] ?? item.boundaryClassification}</Tag> },
        { title: 'Độ tin cậy', render: (_, item) => `${(item.positionConfidence * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` },
        { title: 'Quyết định', render: (_, item) => <Tag>{decisionLabel(item.reviewDecision)}</Tag> },
        { title: 'Thao tác', render: (_, item) => <Button disabled={!editable || busy || !!editor} onClick={() => openReview([item.candidateId], false)}>Xem và duyệt</Button> },
      ]} expandable={{ expandedRowRender: item => <dl className="detail-list"><div><dt>Khu vực</dt><dd>Khu vực {draft.zones.findIndex(zone => zone.zoneId === item.zoneId) + 1}</dd></div><div><dt>Cây được ghép</dt><dd>{(item.correctedMatchedPlantId ?? item.proposedMatchedPlantId) ? <CopyReference value={item.correctedMatchedPlantId ?? item.proposedMatchedPlantId} label="Sao chép mã cây được ghép" /> : 'Chưa có'}</dd></div><div><dt>Vị trí gốc</dt><dd>{item.longitude}, {item.latitude}</dd></div><div><dt>Ghi chú duyệt</dt><dd>{item.reviewReason ?? 'Không có'}</dd></div><div><dt>Duyệt lúc</dt><dd>{dateTime(item.reviewedAt)}</dd></div></dl> }} />
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Kết quả kiểm tra</strong><span>Kiểm tra lại sau mỗi lần chỉnh sửa hoặc tải lại bản đồ.</span></div></div><SurveyMutationError error={validate.error ?? publish.error} />
      {checked ? <><Alert showIcon type={checked.isValid ? 'success' : 'warning'} title={checked.isValid ? `Hợp lệ · ${checked.confirmedPublishablePoleCount} trụ có thể phát hành` : 'Còn lỗi cần xử lý trước khi phát hành'} /><Table rowKey={(_, index) => String(index)} dataSource={checked.issues} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'Không có lỗi kiểm tra.' }} columns={[{ title: 'Mức độ', render: (_, issue) => stateToken(issue.severity) === 'ERROR' ? 'Lỗi' : 'Lưu ý' }, { title: 'Điểm', render: (_, issue) => readableCode(rows.find(row => row.candidateId === issue.candidateId)?.treeId) ?? (issue.candidateId ? 'Điểm cần kiểm tra' : 'Toàn bản đồ') }, { title: 'Chi tiết', dataIndex: 'message' }, { title: 'Thao tác', render: (_, issue) => issue.candidateId && rows.some(row => row.candidateId === issue.candidateId) ? <Button disabled={!editable || busy || !!editor} onClick={() => openReview([issue.candidateId!], false)}>Xử lý</Button> : null }]} /></> : <p className="form-hint">Bấm Kiểm tra bản đồ để xem kết quả từ máy chủ. Chỉ phát hành khi không còn điểm chưa duyệt và không có lỗi chặn.</p>}
    </section>
    {editor ? <BaseMapReviewDialog token={token} selection={editor} current={draft} disabled={busy || !editable} close={() => { setEditor(null); void refresh() }} done={reviewed} /> : null}
    <Modal open={publishOpen} title="Phát hành bản đồ nền" okText="Xác nhận phát hành" cancelText="Hủy" confirmLoading={publish.isPending} afterOpenChange={open => { if (open) document.getElementById(confirmButtonId)?.focus() }} okButtonProps={{ disabled: !canPublish, autoFocus: true, id: confirmButtonId }} cancelButtonProps={{ disabled: publish.isPending }} closable={!publish.isPending} mask={{ closable: !publish.isPending }} onCancel={() => { if (!publish.isPending) setPublishOpen(false) }} onOk={() => { if (!canPublish || submitting.current) return; submitting.current = true; publish.mutate() }}><p>Phát hành bản đồ phiên bản <strong>{draft.versionNumber}</strong> cho <strong>{farmName}</strong> với <strong>{checked?.confirmedPublishablePoleCount ?? 0} trụ</strong>.</p><p>Các quyết định sẽ được áp dụng vào cây chính thức. Bản đồ hiện hành sẽ được thay thế và đơn khảo sát chuyển sang bước xác nhận giá.</p></Modal>
  </>
}
