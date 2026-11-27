import { CopyReference, readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Input, Modal, Select, Space, Table, Tag } from 'antd'
import { useId, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getAssignedFarms } from './api'
import { getBaseMapDraft, getCurrentBaseMapDraft, approveBaseMapDraft, validateBaseMapDraft } from './baseMapApi'
import type { BaseMapDraft, MappingCandidate, MappingValidation, ApprovedBaseMap } from './baseMapTypes'
import { canPublishDraft, decisionLabel, decisionLabels, draftFingerprint, editableDraft, stateToken, validGuid } from './baseMapWorkflow'
import { BaseMapReviewDialog, type ReviewSelection } from './BaseMapReviewDialog'
import { SurveyMutationError } from './SurveyMutationError'
import { dateTime, workflowError } from './workflow'

export function ManagerBaseMapsPage() {
  const { session } = useAuth()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const farmId = params.farmId?.toLowerCase() ?? '', draftId = params.draftId?.toLowerCase()
  const surveyOrderId = searchParams.get('surveyOrderId')?.toLowerCase()
  if (session?.role !== 'SYSTEM_MANAGER') return <CommonState type="forbidden" />
  if (!validGuid(farmId) || (draftId !== undefined && !validGuid(draftId)) || (surveyOrderId !== undefined && !validGuid(surveyOrderId))) return <CommonState type="error" description="Liên kết bản đồ nháp không hợp lệ." />
  return <AssignedBaseMap key={`${farmId}:${draftId ?? ''}:${surveyOrderId ?? ''}`} token={session.accessToken} farmId={farmId} draftId={draftId} surveyOrderId={surveyOrderId} />
}

function AssignedBaseMap({ token, farmId, draftId, surveyOrderId }: { token: string; farmId: string; draftId?: string; surveyOrderId?: string }) {
  const assigned = useQuery({ queryKey: ['manager-assigned-farms'], queryFn: ({ signal }) => getAssignedFarms(token, signal), retry: false })
  const farm = assigned.data?.find(item => item.farmId.toLowerCase() === farmId)
  const back = <Link className="back-link" to={`/manager/farms/${farmId}`}><ArrowLeftOutlined /> Chi tiết nông trại</Link>
  if (assigned.isPending) return <CommonState type="loading" />
  if (assigned.isError) return <CommonState type="error" description={workflowError(assigned.error)} retry={() => assigned.refetch()} />
  if (!farm) return <>{back}<CommonState type="forbidden" description="Nông trại không thuộc phân công hiện tại của bạn." /></>
  if (draftId) return <BaseMapDraftDetail token={token} farmId={farmId} draftId={draftId} farmName={farm.name} />
  return <CurrentBaseMapDraft token={token} farmId={farmId} farmName={farm.name} surveyOrderId={surveyOrderId} />
}

function CurrentBaseMapDraft({ token, farmId, farmName, surveyOrderId }: { token: string; farmId: string; farmName: string; surveyOrderId?: string }) {
  const query = useQuery({ queryKey: ['manager-current-base-map-draft', farmId, surveyOrderId ?? ''], queryFn: ({ signal }) => getCurrentBaseMapDraft(token, farmId, surveyOrderId, signal), retry: false })
  if (query.data && !query.isError) return <BaseMapDraftDetail key={query.data.draftId} token={token} farmId={farmId} draftId={query.data.draftId} farmName={farmName} initialDraft={query.data} />
  const back = <Link className="back-link" to={`/manager/farms/${farmId}`}><ArrowLeftOutlined /> Chi tiết nông trại</Link>
  const empty = query.error instanceof ApiError && query.error.status === 404 && query.error.code === 'FarmBaseMapDraft.NotFound'
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tìm bản đồ nháp mới nhất" /></>
  return <>{back}<section className="resource-page-heading"><div><span className="page-kicker">{farmName}</span><h1>Duyệt bản đồ nền</h1></div></section>
    {empty ? <section className="resource-panel"><Alert showIcon type="info" title="Chưa có bản đồ nháp chờ duyệt" description="Bản đồ sẽ xuất hiện sau khi kết quả khảo sát được xử lý và chuyển sang bước xét duyệt." />{surveyOrderId ? <Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(surveyOrderId)}`}>Xem đơn khảo sát →</Link> : null}</section> : <SurveyMutationError error={query.error} />}
    <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></>
}

export function BaseMapDraftDetail({ token, farmId, draftId, farmName, initialDraft }: { token: string; farmId: string; draftId: string; farmName: string; initialDraft?: BaseMapDraft }) {
  const client = useQueryClient()
  const { message } = App.useApp()
  const queryKey = ['manager-base-map-draft', farmId, draftId]
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getBaseMapDraft(token, farmId, draftId, signal), initialData: initialDraft, retry: false })
  const [decision, setDecision] = useState(''), [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [editor, setEditor] = useState<ReviewSelection | null>(null)
  const [validation, setValidation] = useState<{ fingerprint: string; data: MappingValidation } | null>(null)
  const [approveOpen, setApproveOpen] = useState(false), [approved, setApproved] = useState<ApprovedBaseMap | null>(null)
  const confirmButtonId = useId()
  const submitting = useRef(false)
  const validate = useMutation({ retry: false, mutationFn: async () => {
    if (!query.data || query.isFetching || query.isError || !editableDraft(query.data)) throw new Error('Tải lại bản đồ nháp trước khi kiểm tra.')
    const fingerprint = draftFingerprint(query.data)
    return { fingerprint, data: await validateBaseMapDraft(token, farmId, draftId) }
  }, onSuccess: setValidation })
  const approve = useMutation({ retry: false, mutationFn: async () => {
    if (query.isError || query.isFetching || !query.data || !canPublishDraft(query.data, validation?.data ?? null, validation?.fingerprint ?? null)) throw new Error('Kiểm tra lại bản đồ trước khi duyệt nội bộ.')
    const result = await approveBaseMapDraft(token, farmId, draftId)
    if (result.farmBaseMapVersionId.toLowerCase() !== draftId.toLowerCase() || result.farmId.toLowerCase() !== farmId || result.surveyOrderId !== query.data.sourceSurveyOrderId) throw new Error('Kết quả duyệt không khớp bản đồ. Tải lại để kiểm tra.')
    return result
  }, onSuccess: async result => {
    setApproved(result); setApproveOpen(false); setValidation(null); setSelected([])
    await Promise.all([client.invalidateQueries({ queryKey }), client.invalidateQueries({ queryKey: ['manager-farm-context', farmId] }), client.invalidateQueries({ queryKey: ['manager-orders'] }), client.invalidateQueries({ queryKey: ['manager-order-context'] }), client.invalidateQueries({ queryKey: ['manager-order-scope'] })])
  }, onError: () => { setApproveOpen(false); setValidation(null) }, onSettled: () => { submitting.current = false } })
  async function refresh() {
    setEditor(null); setSelected([]); setValidation(null); setApproveOpen(false); validate.reset(); approve.reset()
    await query.refetch()
  }
  async function reviewed(notice: string) { setEditor(null); setSelected([]); setValidation(null); validate.reset(); approve.reset(); await query.refetch(); void message.success(notice) }
  const back = <Link className="back-link" to={`/manager/farms/${farmId}`}><ArrowLeftOutlined /> {farmName}</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải bản đồ nháp" /></>
  if (query.isError) return <>{back}<SurveyMutationError error={query.error} /><Button onClick={() => { void refresh() }}>Tải lại bản đồ</Button></>
  const draft = query.data
  const rows = draft.candidates
  const filtered = rows.filter(item => (!decision || stateToken(item.reviewDecision) === stateToken(decision)) && (!search.trim() || `${item.treeId ?? ''} ${item.candidateId}`.toLowerCase().includes(search.trim().toLowerCase())))
  const pendingIds = rows.filter(item => stateToken(item.reviewDecision) === 'PENDING').map(item => item.candidateId)
  const busy = query.isFetching || validate.isPending || approve.isPending
  const editable = editableDraft(draft) && !approved && !approve.error && !validate.error
  const checked = validation?.fingerprint === draftFingerprint(draft) ? validation.data : null
  const canApprove = !busy && !approved && !approve.error && canPublishDraft(draft, checked, validation?.fingerprint ?? null)
  function changeFilter(run: () => void) { setSelected([]); run() }
  function openReview(ids: string[], batch: boolean) { if (!editable || busy || !ids.length) return; setValidation(null); setEditor({ snapshot: draft, candidateIds: ids, batch }) }
  return <>{back}
    <section className="resource-page-heading"><div><span className="page-kicker">{farmName} · Phiên bản {draft.versionNumber}</span><h1>Duyệt bản đồ nền</h1><p>Kiểm tra từng điểm trước khi ghi nhận cây và số trụ chính thức.</p></div><Space wrap><Button icon={<ReloadOutlined />} disabled={validate.isPending || approve.isPending || !!editor} loading={query.isFetching} onClick={() => { void refresh() }}>Tải lại</Button><Button icon={<CheckCircleOutlined />} loading={validate.isPending} disabled={!editable || busy || !!editor} onClick={() => { setValidation(null); validate.mutate() }}>Kiểm tra bản đồ</Button><Button type="primary" disabled={!canApprove || !!editor} onClick={() => setApproveOpen(true)}>Duyệt nội bộ bản đồ</Button></Space></section>
    {editable && draft.pendingCount === 0 && !checked ? <Alert className="workflow-notice" showIcon type="info"
      title="Tất cả điểm đã được xử lý"
      description="Chọn Kiểm tra bản đồ. Nếu kết quả hợp lệ, nút Duyệt nội bộ bản đồ sẽ mở." /> : null}
    {approved ? <Alert className="workflow-notice" showIcon type="success" title={`Đã duyệt nội bộ bản đồ phiên bản ${approved.versionNumber}`} description={<>{`Số trụ đã xác minh ${approved.verifiedBillablePoleCount.toLocaleString('vi-VN')} · ${dateTime(approved.approvedAt)}`}<p><Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(approved.surveyOrderId)}`}>Tiếp tục trên đơn khảo sát →</Link></p></>} /> : null}
    {!editableDraft(draft) ? <Alert className="workflow-notice" showIcon type="info" title="Bản đồ hiện chỉ được xem" description={`Trạng thái: ${stateToken(draft.status) === 'PUBLISHED' ? 'Đã phát hành' : stateToken(draft.status) === 'INTERNALLYAPPROVED' ? 'Đã duyệt nội bộ' : stateToken(draft.status) === 'SUPERSEDED' ? 'Đã được thay thế' : draft.status}.`} /> : null}
    <div className="mapping-summary" aria-label="Tiến độ duyệt"><div><span>Tổng số điểm</span><strong>{draft.totalCandidates}</strong></div><div><span>Chưa duyệt</span><strong>{draft.pendingCount}</strong></div><div><span>Đã xử lý</span><strong>{draft.acceptedCount + draft.relocatedCount + draft.replacedCount}</strong></div><div><span>Đã loại bỏ</span><strong>{draft.rejectedCount}</strong></div></div>
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Cây / trụ nhận diện</strong><span>Dữ liệu nhận lúc {dateTime(draft.producedAt)}</span></div><Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(draft.sourceSurveyOrderId)}`}>Xem đơn khảo sát →</Link></div>
      <div className="workflow-toolbar mapping-filters"><Input.Search aria-label="Tìm mã cây hoặc điểm" placeholder="Tìm mã cây / điểm" value={search} onChange={event => changeFilter(() => setSearch(event.target.value))} /><Select aria-label="Lọc quyết định duyệt" value={decision} onChange={value => changeFilter(() => setDecision(value))} options={[{ value: '', label: 'Tất cả quyết định' }, ...Object.entries(decisionLabels).map(([value, label]) => ({ value, label }))]} /></div>
      <Space className="workflow-toolbar" wrap><Button type="primary" disabled={!editable || busy || !pendingIds.length || !!editor} onClick={() => { const ids = pendingIds.slice(0, 500); setSelected(ids); openReview(ids, true) }}>Duyệt toàn bộ{pendingIds.length ? ` (${pendingIds.length} điểm chưa duyệt)` : ''}</Button><Button disabled={!editable || busy || !selected.length || selected.length > 500 || !!editor} onClick={() => openReview(selected, true)}>Duyệt {selected.length ? `${selected.length} điểm` : 'các điểm đã chọn'}</Button>{selected.length > 0 ? <Button onClick={() => setSelected([])}>Bỏ chọn</Button> : null}<span className="form-hint">Duyệt hàng loạt tối đa 500 điểm mỗi lượt. Điểm đã duyệt không thể chọn lại hàng loạt.</span></Space>
      <Table<MappingCandidate> rowKey="candidateId" dataSource={filtered} loading={query.isFetching} scroll={{ x: 1050 }} pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: 'Không có điểm phù hợp.' }} rowSelection={editable ? { selectedRowKeys: selected, onChange: keys => setSelected(keys.map(String)), preserveSelectedRowKeys: true, getCheckboxProps: item => ({ disabled: busy || !!editor || stateToken(item.reviewDecision) !== 'PENDING' }) } : undefined} columns={[
        { title: 'Cây / điểm', render: (_, item) => <strong>{readableCode(item.treeId) ?? 'Điểm nhận diện'}</strong> },
        { title: 'Hàng / cột', render: (_, item) => `${item.correctedRowIndex ?? item.proposedRowIndex ?? '—'} / ${item.correctedColumnIndex ?? item.proposedColumnIndex ?? '—'}` },
        { title: 'Kinh độ / vĩ độ', render: (_, item) => <>{item.correctedLongitude ?? item.longitude}<br />{item.correctedLatitude ?? item.latitude}</> },
        { title: 'Ranh giới', render: (_, item) => <Tag color={item.boundaryClassification === 'IN_BOUNDARY' ? 'success' : 'warning'}>{({ IN_BOUNDARY: 'Trong ranh giới', OUT_OF_BOUNDARY: 'Ngoài ranh giới', NEEDS_REVIEW: 'Cần kiểm tra' } as Record<string, string>)[item.boundaryClassification] ?? item.boundaryClassification}</Tag> },
        { title: 'Độ tin cậy', render: (_, item) => `${(item.positionConfidence * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` },
        { title: 'Quyết định', render: (_, item) => <Tag>{decisionLabel(item.reviewDecision)}</Tag> },
        { title: 'Thao tác', render: (_, item) => <Button disabled={!editable || busy || !!editor} onClick={() => openReview([item.candidateId], false)}>Xem và duyệt</Button> },
      ]} expandable={{ expandedRowRender: item => <dl className="detail-list"><div><dt>Cây được ghép</dt><dd>{(item.correctedMatchedPlantId ?? item.proposedMatchedPlantId) ? <CopyReference value={item.correctedMatchedPlantId ?? item.proposedMatchedPlantId} label="Sao chép mã cây được ghép" /> : 'Chưa có'}</dd></div><div><dt>Vị trí gốc</dt><dd>{item.longitude}, {item.latitude}</dd></div><div><dt>Ghi chú duyệt</dt><dd>{item.reviewReason ?? 'Không có'}</dd></div><div><dt>Duyệt lúc</dt><dd>{dateTime(item.reviewedAt)}</dd></div></dl> }} />
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Kết quả kiểm tra</strong><span>Kiểm tra lại sau mỗi lần chỉnh sửa hoặc tải lại bản đồ.</span></div></div><SurveyMutationError error={validate.error ?? approve.error} />
      {checked ? <><Alert showIcon type={checked.isValid ? 'success' : 'warning'} title={checked.isValid ? `Hợp lệ · ${checked.confirmedPublishablePoleCount} trụ có thể duyệt` : 'Còn lỗi cần xử lý trước khi duyệt'} /><Table rowKey={(_, index) => String(index)} dataSource={checked.issues} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'Không có lỗi kiểm tra.' }} columns={[{ title: 'Mức độ', render: (_, issue) => stateToken(issue.severity) === 'ERROR' ? 'Lỗi' : 'Lưu ý' }, { title: 'Điểm', render: (_, issue) => readableCode(rows.find(row => row.candidateId === issue.candidateId)?.treeId) ?? (issue.candidateId ? 'Điểm cần kiểm tra' : 'Toàn bản đồ') }, { title: 'Chi tiết', dataIndex: 'message' }, { title: 'Thao tác', render: (_, issue) => issue.candidateId && rows.some(row => row.candidateId === issue.candidateId) ? <Button disabled={!editable || busy || !!editor} onClick={() => openReview([issue.candidateId!], false)}>Xử lý</Button> : null }]} /></> : <p className="form-hint">Bấm Kiểm tra bản đồ để xem kết quả từ máy chủ. Chỉ duyệt khi không còn điểm chưa duyệt và không có lỗi chặn.</p>}
    </section>
    {editor ? <BaseMapReviewDialog token={token} selection={editor} current={draft} disabled={busy || !editable} close={() => { setEditor(null); void refresh() }} done={reviewed} /> : null}
    <Modal open={approveOpen} title="Duyệt nội bộ bản đồ nền" okText="Xác nhận duyệt" cancelText="Hủy" confirmLoading={approve.isPending} afterOpenChange={open => { if (open) document.getElementById(confirmButtonId)?.focus() }} okButtonProps={{ disabled: !canApprove, autoFocus: true, id: confirmButtonId }} cancelButtonProps={{ disabled: approve.isPending }} closable={!approve.isPending} mask={{ closable: !approve.isPending }} onCancel={() => { if (!approve.isPending) setApproveOpen(false) }} onOk={() => { if (!canApprove || submitting.current) return; submitting.current = true; approve.mutate() }}><p>Duyệt nội bộ bản đồ phiên bản <strong>{draft.versionNumber}</strong> cho <strong>{farmName}</strong> với <strong>{checked?.confirmedPublishablePoleCount ?? 0} trụ</strong>.</p><p>Kết quả duyệt dùng để xác minh số trụ và tiếp tục xử lý đơn khảo sát.</p></Modal>
  </>
}
