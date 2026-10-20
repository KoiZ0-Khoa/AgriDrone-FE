import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ApproveRouteModal, StartCaptureModal } from './BaselineModals'
import { abortCapture, finalizeCapture, getCaptureSession, syncCapture } from './orderApi'
import type { AssignedOrder, CaptureSample, CaptureSession, OrderScope } from './orderTypes'
import { matchingCapture, matchingOrderSnapshot, parseCaptureSamples } from './orderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'
import { dateTime, workflowError } from './workflow'

type Props = { token: string; order: AssignedOrder; scope: OrderScope; disabled: boolean; refresh: () => Promise<void> }
export function BoundaryCapturePanel({ token, order, scope, disabled, refresh }: Props) {
  const client = useQueryClient()
  const [openedSessionId, setOpenedSessionId] = useState<string | null>(null)
  const sessionId = openedSessionId ?? order.boundaryCaptureSessionId
  const queryKey = ['boundary-capture', scope.surveyOrderId, sessionId]
  const query = useQuery({ queryKey, queryFn: ({ signal }) => getCaptureSession(token, scope.surveyOrderId, sessionId!, signal), enabled: Boolean(sessionId), retry: false })
  const session = query.data
  const [action, setAction] = useState<'start' | 'finalize' | 'abort' | 'route' | null>(null)
  const [draft, setDraft] = useState<CaptureSample[]>([])
  const [input, setInput] = useState('')
  const [localError, setLocalError] = useState<Error | null>(null)
  async function reload() { await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['boundary-capture', scope.surveyOrderId] })]) }
  async function saved(value: CaptureSession) {
    setOpenedSessionId(value.sessionId)
    client.setQueryData(['boundary-capture', scope.surveyOrderId, value.sessionId], value)
    setAction(null)
    await reload()
  }
  const sync = useMutation({ retry: false, mutationFn: () => {
    if (!session || !matchingCapture(scope, session) || !matchingOrderSnapshot(order, scope)) throw new Error('Dữ liệu phiên thu thập đã thay đổi. Tải lại trước khi đồng bộ.')
    return syncCapture(token, scope.surveyOrderId, session.sessionId, { expectedSessionVersion: session.sessionVersion, samples: parseCaptureSamples(JSON.stringify(draft), session.samples) })
  }, onSuccess: async value => { setDraft([]); await saved(value) } })
  const consistent = matchingOrderSnapshot(order, scope) && (!session || matchingCapture(scope, session))
  const busy = disabled || query.isFetching || query.isError || sync.isPending || action !== null
  const editable = session?.status === 'InProgress' && consistent && !busy && !mutationNeedsReload(sync.error)
  const canStart = scope.orderStatus === 'AWAITING_BOUNDARY_CAPTURE' && order.currentAppointmentStatus === 'CONFIRMED' && (!sessionId || session?.status === 'Aborted' || session?.status === 'Superseded')
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Thu thập ranh giới GPS và đường bay</strong><span>{session ? `Phiên ${session.status === 'InProgress' ? 'đang thu thập' : session.status === 'Finalized' ? 'đã hoàn tất' : session.status === 'Aborted' ? 'đã hủy' : session.status}` : 'Thu thập tại hiện trường theo lịch khảo sát đã xác nhận'}</span></div><Button loading={query.isFetching} disabled={sync.isPending || Boolean(action)} onClick={() => { sync.reset(); setLocalError(null); void reload() }}>Tải lại phiên</Button></div>
    {!consistent ? <Alert className="workflow-notice" showIcon type="warning" title="Dữ liệu phiên thu thập và đơn chưa đồng nhất. Tải lại trước khi thao tác." /> : null}
    {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={reload} /> : null}
    {sessionId && query.isPending ? <CommonState type="loading" title="Đang tải phiên thu thập" /> : null}
    {scope.orderStatus === 'AWAITING_BASELINE_DEPOSIT' ? <Alert className="workflow-notice" showIcon type="info" title="Chờ Owner thanh toán cọc bản đồ nền" description="Đơn đang chờ thanh toán cọc. Chưa mở bước thu thập mới trong trạng thái này." /> : null}
    {!sessionId && scope.orderStatus === 'BASELINE_READY' ? <Alert className="workflow-notice" showIcon type="warning" title="Đơn chưa có phiên thu thập ranh giới" description="Đơn đã chuyển sang bước sẵn sàng nhưng chưa mở phiên GPS. Liên hệ quản trị hệ thống kiểm tra trước khi tiếp tục khảo sát." /> : null}
    <Space wrap>{canStart ? <Button type="primary" disabled={busy || !consistent} onClick={() => setAction('start')}>Bắt đầu thu thập GPS</Button> : null}
      {session?.status === 'InProgress' ? <><Button type="primary" loading={sync.isPending} disabled={!editable || draft.length === 0} onClick={() => sync.mutate()}>Đồng bộ {draft.length} điểm mới</Button><Button disabled={!editable || draft.length > 0 || session.samples.length < 3} onClick={() => setAction('finalize')}>Hoàn tất thu thập</Button><Button danger disabled={!editable} onClick={() => setAction('abort')}>Hủy phiên</Button></> : null}
      {session?.status === 'Finalized' && !session.baselineRoutePlanId && scope.orderStatus !== 'AWAITING_BASELINE_DEPOSIT' ? <Button type="primary" disabled={busy || !consistent || !session.farmBoundaryVersionId} onClick={() => setAction('route')}>Duyệt kế hoạch đường bay</Button> : null}
      {session?.baselineRoutePlanId ? <Tag>Đã duyệt kế hoạch đường bay</Tag> : null}
    </Space>
    {session?.status === 'InProgress' ? <div className="workflow-notice"><p>Nạp dữ liệu GNSS gốc từ drone được chọn cho phiên, theo thứ tự các góc quanh nông trại. Các điểm mới chỉ được lưu khi bấm Đồng bộ.</p><details><summary>Nạp điểm GNSS từ drone (JSON)</summary><p className="form-hint">Dán mảng điểm có các trường clientOperationId, sequenceNumber, latitude, longitude, horizontalAccuracyMeters, capturedAt. Giữ nguyên mã điểm, sai số và thời gian đo từ drone; không dùng vị trí điện thoại hoặc máy tính để thay thế.</p><Input.TextArea aria-label="Dữ liệu GPS JSON" rows={5} value={input} disabled={!editable} onChange={event => setInput(event.target.value)} /><Button className="workflow-notice" disabled={!editable || !input.trim()} onClick={() => { try { setDraft(parseCaptureSamples(JSON.stringify([...draft, ...parseCaptureSamples(input)]), session.samples)); setInput(''); setLocalError(null) } catch (error) { setLocalError(error as Error) } }}>Kiểm tra và nạp điểm</Button></details></div> : null}
    {draft.length ? <Alert className="workflow-notice" showIcon type="info" title={`${draft.length} điểm chưa đồng bộ`} description="Dữ liệu mới được giữ trong màn hình hiện tại. Đồng bộ trước khi rời trang hoặc hoàn tất phiên." /> : null}
    <SurveyMutationError error={localError ?? sync.error} />
    {session ? <Table<CaptureSample & { saved: boolean }> rowKey="clientOperationId" dataSource={[...session.samples.map(p => ({ ...p, saved: true })), ...draft.filter(p => !session.samples.some(s => s.clientOperationId === p.clientOperationId)).map(p => ({ ...p, saved: false }))]} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }} locale={{ emptyText: 'Chưa thu thập điểm GPS.' }} columns={[{ title: 'Thứ tự', dataIndex: 'sequenceNumber' }, { title: 'Kinh độ', dataIndex: 'longitude' }, { title: 'Vĩ độ', dataIndex: 'latitude' }, { title: 'Sai số (m)', dataIndex: 'horizontalAccuracyMeters' }, { title: 'Thời điểm đo', render: (_, p) => dateTime(p.capturedAt) }, { title: 'Lưu trữ', render: (_, p) => p.saved ? 'Đã đồng bộ' : 'Chưa đồng bộ' }]} /> : null}
    {action === 'start' ? <StartCaptureModal token={token} scope={scope} close={() => { setAction(null); void reload() }} done={saved} /> : null}
    {(action === 'finalize' || action === 'abort') && session ? <CaptureCloseModal key={action} token={token} scope={scope} session={session} mode={action} close={() => { setAction(null); void reload() }} done={async value => { if (value.status === 'Aborted') { setDraft([]); setInput('') } await saved(value) }} /> : null}
    {action === 'route' && session ? <ApproveRouteModal token={token} scope={scope} session={session} close={() => { setAction(null); void reload() }} done={saved} /> : null}
  </section>
}

function CaptureCloseModal({ token, scope, session, mode, close, done }: { token: string; scope: OrderScope; session: CaptureSession; mode: 'finalize' | 'abort'; close: () => void; done: (value: CaptureSession) => Promise<void> }) {
  const [snapshot] = useState({ scope, session })
  const [form] = Form.useForm<{ text: string }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { text: string }) => {
    if (!matchingCapture(snapshot.scope, snapshot.session) || snapshot.session.status !== 'InProgress') throw new Error('Dữ liệu phiên đã thay đổi. Tải lại trước khi tiếp tục.')
    return mode === 'abort' ? abortCapture(token, snapshot.scope.surveyOrderId, snapshot.session.sessionId, { reason: values.text.trim(), expectedSessionVersion: snapshot.session.sessionVersion }) : finalizeCapture(token, snapshot.scope.surveyOrderId, snapshot.session.sessionId, { evidenceReference: values.text.trim(), expectedOrderVersion: snapshot.scope.orderVersion, expectedSessionVersion: snapshot.session.sessionVersion, expectedCurrentBoundaryVersionNumber: snapshot.scope.currentApprovedBoundary?.versionNumber ?? null })
  }, onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open title={mode === 'finalize' ? 'Hoàn tất thu thập ranh giới' : 'Hủy phiên thu thập'} okText={mode === 'finalize' ? 'Xác nhận hoàn tất' : 'Xác nhận hủy phiên'} cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ danger: mode === 'abort', disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>{mode === 'finalize' ? 'Kiểm tra các điểm đã đồng bộ trước khi hoàn tất. Phiên hoàn tất không thể sửa các điểm GPS.' : 'Các điểm đã đồng bộ được giữ trong lịch sử. Điểm chưa đồng bộ sẽ bị bỏ. Phiên này không thể tiếp tục sau khi hủy.'}</p>
    <Form form={form} layout="vertical" disabled={locked || mutation.isPending} onFinish={values => { if (!locked && !mutation.isPending) mutation.mutate(values) }}><Form.Item name="text" label={mode === 'finalize' ? 'Tham chiếu bằng chứng khảo sát' : 'Lý do hủy phiên'} rules={[{ required: true, whitespace: true }, { max: mode === 'finalize' ? 1000 : 2000 }]}><Input.TextArea rows={2} maxLength={mode === 'finalize' ? 1000 : 2000} /></Form.Item></Form><SurveyMutationError error={mutation.error} />
  </Modal>
}
