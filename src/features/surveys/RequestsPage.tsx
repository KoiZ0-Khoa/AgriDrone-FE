import { FormSubmit } from '../../components/FormSubmit'
import { CopyReference, readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Modal, Pagination, Select, Space, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import * as api from './api'
import type { Approval, RequestDetail, ReviewChecklist, SurveyRequest } from './types'
import { checklistVersion, dateTime, isEligibleManager, operationFor, requestKindLabels, requestStatusLabels, reviewChecklist, reviewLabels, workflowError } from './workflow'

export function RequestsPage() {
  const token = useAuth().session!.accessToken
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', kind: '' })
  const query = useQuery({ queryKey: ['survey-requests', page, filters], queryFn: ({ signal }) => api.getRequests(token, page, filters, signal) })
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">TIẾP NHẬN KHẢO SÁT</span><h1>Yêu cầu khảo sát</h1><p>Kiểm tra thông tin, phân công Manager và duyệt yêu cầu trước khi tạo đơn khảo sát.</p></div><Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel">
      <div className="workflow-toolbar">
        <Select aria-label="Trạng thái yêu cầu" value={filters.status} onChange={status => { setPage(1); setFilters(previous => ({ ...previous, status })) }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.entries(requestStatusLabels).map(([value, label]) => ({ value, label }))]} />
        <Select aria-label="Loại yêu cầu" value={filters.kind} onChange={kind => { setPage(1); setFilters(previous => ({ ...previous, kind })) }} options={[{ value: '', label: 'Tất cả loại yêu cầu' }, ...Object.entries(requestKindLabels).map(([value, label]) => ({ value, label }))]} />
      </div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<SurveyRequest> rowKey="id" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 850 }} locale={{ emptyText: 'Chưa có yêu cầu phù hợp với bộ lọc.' }} columns={[
          { title: 'Yêu cầu', render: (_, item) => <><strong>{item.farmName}</strong>{readableCode(item.requestNumber) ? <div className="form-hint">{readableCode(item.requestNumber)}</div> : null}<div className="form-hint">{requestKindLabels[item.kind]}</div></> },
          { title: 'Đơn vị', render: (_, item) => <>{item.tenantName ?? 'Khách hàng mới'}{readableCode(item.tenantCode) ? <div className="form-hint">{readableCode(item.tenantCode)}</div> : null}</> },
          { title: 'Dịch vụ', dataIndex: 'surveyServiceCode' },
          { title: 'Trạng thái', render: (_, item) => <Tag color={item.status === 'APPROVED' ? 'success' : 'default'}>{requestStatusLabels[item.status]}</Tag> },
          { title: 'Ngày gửi', render: (_, item) => dateTime(item.createdAt) },
          { title: 'Thao tác', render: (_, item) => <Link className="workflow-detail-link" to={`/system/survey-requests/${item.id}`}>Xem yêu cầu →</Link> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
  </>
}

export function RequestDetailPage() {
  const token = useAuth().session!.accessToken
  const { requestId = '' } = useParams()
  const client = useQueryClient()
  const [decision, setDecision] = useState<{ type: 'approve' | 'reject'; request: RequestDetail } | null>(null)
  const [approval, setApproval] = useState<Approval | null>(null)
  const query = useQuery({ queryKey: ['survey-request', requestId], queryFn: ({ signal }) => api.getRequest(token, requestId, signal) })
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['survey-request', requestId] }), client.invalidateQueries({ queryKey: ['survey-requests'] })]) }
  const start = useMutation({ mutationFn: (request: RequestDetail) => api.startReview(token, request.id, request.version), onSuccess: refresh })
  if (query.isPending) return <CommonState type="loading" />
  if (query.isError) return <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} />
  const request = query.data
  return <>
    <Link className="back-link" to="/system/survey-requests"><ArrowLeftOutlined /> Danh sách yêu cầu</Link>
    <section className="resource-page-heading"><div><span className="page-kicker">{requestKindLabels[request.kind]}</span><h1>Yêu cầu khảo sát · {request.farmName}</h1><p>{request.surveyServiceName}</p><CopyReference value={request.requestNumber} label="Sao chép mã yêu cầu" /></div><Tag>{requestStatusLabels[request.status]}</Tag></section>
    {approval ? <Alert className="workflow-notice" showIcon type="success" title="Đã tạo đơn khảo sát" description={<>{approval.requiresBaselineMapping ? 'Đơn cần khảo sát bản đồ nền trước. Manager đã được phân công; Owner mới sẽ nhận lời mời qua email.' : 'Đơn khảo sát đã được tạo cho nông trại. Manager tiếp tục xác minh phạm vi và điều kiện vận hành.'}<p><Link className="workflow-detail-link" to={`/system/survey-orders/${encodeURIComponent(approval.surveyOrderId)}/authorizations`}>Quản lý giấy tờ của đơn →</Link></p></>} /> : null}
    <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>Thông tin tiếp nhận</strong><span>Gửi lúc {dateTime(request.createdAt)}</span></div><Button icon={<ReloadOutlined />} onClick={() => { start.reset(); void query.refetch() }}>Tải lại</Button></div>
      <dl className="detail-list">
        <div><dt>Đơn vị</dt><dd>{request.tenantName ?? 'Chưa có'}{readableCode(request.tenantCode) ? ` · ${readableCode(request.tenantCode)}` : ''}</dd></div>
        <div><dt>Người liên hệ</dt><dd>{request.applicantName}</dd></div><div><dt>Email</dt><dd>{request.applicantEmail}</dd></div><div><dt>Điện thoại</dt><dd>{request.applicantPhone}</dd></div>
        <div><dt>Nông trại</dt><dd>{request.farmName}</dd></div><div><dt>Địa chỉ</dt><dd>{request.farmAddress}</dd></div><div><dt>Diện tích ước tính</dt><dd>{request.approximateAreaHa.toLocaleString('vi-VN')} ha</dd></div>
        <div><dt>Số trụ ước tính</dt><dd>{request.estimatedPoleCount?.toLocaleString('vi-VN') ?? 'Chưa có'}</dd></div>
        <div><dt>Vị trí khách cung cấp</dt><dd>{request.candidateLocation.latitude}, {request.candidateLocation.longitude}</dd></div>
        <div><dt>Thời gian mong muốn</dt><dd>{dateTime(request.preferredStartAt)} – {dateTime(request.preferredEndAt)}</dd></div><div><dt>Ghi chú</dt><dd className="workflow-prewrap">{request.notes ?? 'Không có'}</dd></div>
      </dl>
      <p className="form-hint">Vị trí và số trụ do khách cung cấp là thông tin ước tính. Manager sẽ xác minh ranh giới và số trụ chính thức.</p>
      <Space wrap>
        {request.status === 'SUBMITTED' ? <Button type="primary" loading={start.isPending} disabled={start.isError} onClick={() => { if (!start.isPending) start.mutate(request) }}>Bắt đầu xét duyệt</Button> : null}
        {request.status === 'UNDER_REVIEW' ? <><Button type="primary" onClick={() => setDecision({ type: 'approve', request })}>Phê duyệt yêu cầu</Button><Button danger onClick={() => setDecision({ type: 'reject', request })}>Từ chối</Button></> : null}
      </Space>
      {start.isError ? <Alert className="workflow-notice" showIcon type="error" title={workflowError(start.error)} /> : null}
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Lịch sử xét duyệt</strong><span>Các quyết định đã được ghi nhận</span></div></div>
      {request.reviews.length ? request.reviews.map(review => <article className="workflow-review" key={review.id}><strong>{review.decision === 'APPROVED' ? 'Phê duyệt' : review.decision === 'REJECTED' ? 'Từ chối' : review.decision}</strong><small>{dateTime(review.reviewedAt)}</small><p className="workflow-prewrap">{review.reason}</p></article>) : <p className="form-hint">Chưa có quyết định xét duyệt.</p>}
    </section>
    {decision ? <ReviewModal key={`${decision.type}:${decision.request.version}`} token={token} type={decision.type} request={decision.request} close={() => { setDecision(null); void refresh() }} done={async result => { if (result) setApproval(result); setDecision(null); await refresh() }} /> : null}
  </>
}

type ReviewValues = ReviewChecklist & { reason: string; managerId?: string }
function ReviewModal({ token, type, request, close, done }: { token: string; type: 'approve' | 'reject'; request: RequestDetail; close: () => void; done: (result?: Approval) => Promise<void> }) {
  const [form] = Form.useForm<ReviewValues>()
  const [managerPage, setManagerPage] = useState(1)
  const operation = useRef<ReturnType<typeof operationFor> | null>(null)
  const needsManager = type === 'approve' && request.kind !== 'EXISTING_FARM_SURVEY'
  const managers = useQuery({ queryKey: ['eligible-system-managers', managerPage], queryFn: ({ signal }) => api.getManagers(token, managerPage, { status: 'ACTIVE', availability: 'AVAILABLE', qualificationStatus: 'QUALIFIED' }, signal), enabled: needsManager })
  const mutation = useMutation({ mutationFn: async (values: ReviewValues) => {
    const checklist = reviewChecklist(request.checklistVersion, values, type === 'approve')
    const body = { expectedVersion: request.version, reason: values.reason.trim(), checklist }
    if (type === 'reject') { await api.rejectRequest(token, request.id, body); return undefined }
    if (needsManager && !values.managerId) throw new Error('Hãy chọn Manager phụ trách.')
    const approvalBody = { ...body, selectedSystemManagerProfileId: needsManager ? values.managerId! : null }
    operation.current = operationFor(operation.current, approvalBody)
    return api.approveRequest(token, request.id, approvalBody, operation.current.key)
  }, onSuccess: done })
  const conflict = mutation.error && 'status' in mutation.error && mutation.error.status === 409
  const eligible = managers.data?.items.filter(manager => isEligibleManager(manager)) ?? []
  const unsupportedChecklist = request.checklistVersion !== checklistVersion
  return <Modal open width={620} title={type === 'approve' ? 'Phê duyệt yêu cầu khảo sát' : 'Từ chối yêu cầu khảo sát'} okText={type === 'approve' ? 'Xác nhận phê duyệt' : 'Xác nhận từ chối'} cancelText={conflict ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} okButtonProps={{ danger: type === 'reject', disabled: Boolean(conflict) || unsupportedChecklist || (needsManager && !managers.isSuccess) }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p><strong>{request.farmName}</strong> · {request.surveyServiceName}</p>
    <Form form={form} layout="vertical" disabled={mutation.isPending} onFinish={values => { if (!mutation.isPending && !conflict) mutation.mutate(values) }}>
      <FormSubmit disabled={mutation.isPending || Boolean(conflict) || unsupportedChecklist || (needsManager && !managers.isSuccess)} />
      <fieldset className="workflow-checklist"><legend>Kiểm tra trước khi quyết định</legend>
        {Object.entries(reviewLabels).map(([code, label]) => <Form.Item key={code} name={code} valuePropName="checked"><Checkbox>{label}</Checkbox></Form.Item>)}
      </fieldset>
      <p className="form-hint">Đánh giá khả thi chưa phải xác nhận đã có văn bản đồng ý sử dụng dữ liệu hoặc giấy phép bay.</p>
      {unsupportedChecklist ? <Alert showIcon type="error" title="Phiên bản checklist không được hỗ trợ. Đóng và tải lại yêu cầu trước khi xét duyệt." /> : null}
      {needsManager ? <><Form.Item name="managerId" label="Manager phụ trách" rules={[{ required: true, message: 'Chọn Manager phụ trách' }]}><Select showSearch optionFilterProp="label" loading={managers.isPending} options={eligible.map(manager => ({ value: manager.id, label: `${manager.fullName} · ${manager.email}` }))} placeholder="Chọn Manager đủ điều kiện" /></Form.Item>
        <Pagination size="small" current={managerPage} pageSize={20} total={managers.data?.totalCount ?? 0} showSizeChanger={false} onChange={page => { form.setFieldValue('managerId', undefined); setManagerPage(page) }} />
        {managers.isError ? <Alert type="error" title={workflowError(managers.error)} action={<Button onClick={() => { void managers.refetch() }}>Thử lại</Button>} /> : managers.isSuccess && !eligible.length ? <Alert type="info" title="Trang này chưa có Manager đủ điều kiện. Kiểm tra hồ sơ/chứng chỉ hoặc chuyển trang." /> : null}
      </> : type === 'approve' ? <p className="form-hint">Giữ Manager hiện đang phụ trách nông trại này.</p> : null}
      <Form.Item label={type === 'approve' ? 'Lý do phê duyệt' : 'Lý do từ chối'} name="reason" rules={[{ required: true, whitespace: true, message: 'Nhập lý do quyết định' }, { max: 4000 }]}><Input.TextArea rows={3} maxLength={4000} /></Form.Item>
      <Form.Item label="Ghi chú kiểm tra" name="notes"><Input.TextArea rows={2} maxLength={4000} /></Form.Item>
    </Form>
    {mutation.isError ? <Alert showIcon type="error" title={workflowError(mutation.error)} description={mutation.error instanceof ApiError ? <div className="workflow-prewrap">
      {workflowError(mutation.error) !== mutation.error.message ? <p>Lý do từ máy chủ: {mutation.error.message}</p> : null}
      <p>Mã lỗi: <code>{mutation.error.code ?? `HTTP ${mutation.error.status}`}</code></p>
      {mutation.error.traceId ? <p>Mã tra cứu: <code>{mutation.error.traceId}</code></p> : null}
    </div> : undefined} /> : null}
  </Modal>
}
