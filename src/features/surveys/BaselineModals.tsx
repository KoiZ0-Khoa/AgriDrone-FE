import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useRef, useState } from 'react'
import { BoundaryPointFields, type BoundaryPoint } from './BoundaryPointFields'
import { approveBaselineRoute, getCaptureDrones, markOrthophotoCorners, startCapture } from './orderApi'
import type { CaptureSession, OrderScope } from './orderTypes'
import { matchingCapture, orthophotoBody } from './orderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'

export function OrthophotoCornersModal({ token, scope, close, done }: { token: string; scope: OrderScope; close: () => void; done: () => Promise<void> }) {
  const [snapshot] = useState(scope)
  const [form] = Form.useForm<{ points: BoundaryPoint[]; reason?: string; evidenceReference: string }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { points: BoundaryPoint[]; reason?: string; evidenceReference: string }) => markOrthophotoCorners(token, snapshot.surveyOrderId, orthophotoBody(snapshot, values.points, values.reason, values.evidenceReference)), onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open width={680} title="Đánh dấu 4 góc ranh giới trên ảnh trực giao" okText="Lưu ranh giới 4 góc" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Đối chiếu ảnh trực giao đã xử lý, rồi nhập tọa độ WGS84 của bốn góc theo thứ tự quanh nông trại. Tọa độ này không phải vị trí pixel trong ảnh.</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={locked || mutation.isPending} initialValues={{ points: [{}, {}, {}, {}] }} onFinish={values => { if (!locked && !mutation.isPending) mutation.mutate(values) }}>
      <BoundaryPointFields fixed disabled={locked || mutation.isPending} />
      <Form.Item name="evidenceReference" label="Tham chiếu ảnh trực giao" rules={[{ required: true, whitespace: true }, { max: 1000 }]}><Input maxLength={1000} /></Form.Item>
      <Form.Item name="reason" label="Ghi chú xác minh" rules={[{ max: 2000 }]}><Input.TextArea maxLength={2000} rows={2} /></Form.Item>
    </Form><SurveyMutationError error={mutation.error} />
  </Modal>
}

export function StartCaptureModal({ token, scope, close, done }: { token: string; scope: OrderScope; close: () => void; done: (session: CaptureSession) => Promise<void> }) {
  const [snapshot] = useState(scope)
  const operationIds = useRef(new Map<string, string>())
  const [form] = Form.useForm<{ start: string; end: string; droneId: string }>()
  const [searchedWindow, setSearchedWindow] = useState('')
  const start = Form.useWatch('start', form), end = Form.useWatch('end', form)
  const search = useMutation({ retry: false, mutationFn: async () => {
    await form.validateFields(['start', 'end'])
    const values = form.getFieldsValue()
    const from = Date.parse(values.start), to = Date.parse(values.end)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('Chọn thời gian kết thúc sau bắt đầu.')
    form.setFieldValue('droneId', undefined)
    const drones = await getCaptureDrones(token, snapshot.farmId, new Date(from).toISOString(), new Date(to).toISOString())
    setSearchedWindow(`${values.start}/${values.end}`)
    return drones
  } })
  const mutation = useMutation({ retry: false, mutationFn: (values: { droneId: string }) => {
    if (snapshot.orderStatus !== 'AWAITING_BOUNDARY_CAPTURE' || !snapshot.requiresBaselineMapping || !Number.isSafeInteger(snapshot.orderVersion) || snapshot.orderVersion < 1) throw new Error('Đơn chưa mở bước thu thập ranh giới. Kiểm tra lịch xác nhận và thanh toán cọc.')
    if (!search.data?.some(drone => drone.id === values.droneId) || searchedWindow !== `${start}/${end}`) throw new Error('Tìm lại drone khả dụng cho khoảng thời gian đã chọn.')
    let operationId = operationIds.current.get(values.droneId)
    if (!operationId) { operationId = crypto.randomUUID(); operationIds.current.set(values.droneId, operationId) }
    return startCapture(token, snapshot.surveyOrderId, { droneId: values.droneId, operationId, expectedOrderVersion: snapshot.orderVersion })
  }, onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open title="Bắt đầu thu thập ranh giới GPS" okText="Mở phiên thu thập" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked || search.isPending }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Chọn khoảng thời gian của lịch đã được Owner xác nhận để tìm drone. Phiên chỉ mở trong buổi khảo sát hợp lệ, khi đủ chấp thuận sử dụng dữ liệu và giấy phép bay.</p>
    <Form form={form} layout="vertical" disabled={locked || mutation.isPending} onFinish={values => { if (!locked && !mutation.isPending && !search.isPending) mutation.mutate(values) }}>
      <div className="form-two-columns"><Form.Item name="start" label="Bắt đầu buổi khảo sát" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item><Form.Item name="end" label="Kết thúc buổi khảo sát" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item></div>
      <Button loading={search.isPending} onClick={() => search.mutate()}>Tìm drone khả dụng</Button>
      <Form.Item className="workflow-notice" name="droneId" label="Drone thực hiện" rules={[{ required: true }]}><Select disabled={locked || mutation.isPending || search.isPending || searchedWindow !== `${start}/${end}`} options={(search.data ?? []).map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}` }))} notFoundContent="Không có drone khả dụng trong khoảng thời gian này." /></Form.Item>
    </Form><SurveyMutationError error={search.error} /><SurveyMutationError error={mutation.error} />
  </Modal>
}

export function ApproveRouteModal({ token, scope, session, close, done }: { token: string; scope: OrderScope; session: CaptureSession; close: () => void; done: (session: CaptureSession) => Promise<void> }) {
  const [snapshot] = useState({ scope, session })
  const [form] = Form.useForm<{ routePlanId: string; routePlanVersion: number; safetyInsetMeters: number; checked: boolean }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { routePlanId: string; routePlanVersion: number; safetyInsetMeters: number; checked: boolean }) => {
    if (!matchingCapture(snapshot.scope, snapshot.session) || !snapshot.session.farmBoundaryVersionId || snapshot.session.status !== 'Finalized') throw new Error('Phiên thu thập chưa hoàn tất hoặc dữ liệu đơn đã thay đổi.')
    if (!values.checked) throw new Error('Kiểm tra đường bay nằm trong khoảng lùi an toàn trước khi duyệt.')
    return approveBaselineRoute(token, snapshot.scope.surveyOrderId, values.routePlanId.trim(), { sessionId: snapshot.session.sessionId, farmBoundaryVersionId: snapshot.session.farmBoundaryVersionId, routePlanVersion: values.routePlanVersion, safetyInsetMeters: values.safetyInsetMeters, isWithinSafetyInset: true, expectedOrderVersion: snapshot.scope.orderVersion })
  }, onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open title="Duyệt kế hoạch đường bay Baseline" okText="Xác nhận duyệt đường bay" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <Alert className="workflow-notice" type="info" showIcon title="Đối chiếu kế hoạch từ công cụ lập đường bay" description="Điền đúng mã và phiên bản của kế hoạch đã được tạo cho phiên GPS này. Không dùng thông tin của chuyến bay khác." />
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={locked || mutation.isPending} onFinish={values => { if (!locked && !mutation.isPending) mutation.mutate(values) }}>
      <Form.Item name="routePlanId" label="Mã kế hoạch đường bay" rules={[{ required: true }, { pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, message: 'Nhập mã kế hoạch hợp lệ.' }]}><Input /></Form.Item>
      <div className="form-two-columns"><Form.Item name="routePlanVersion" label="Phiên bản kế hoạch" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item><Form.Item name="safetyInsetMeters" label="Khoảng lùi an toàn (m)" rules={[{ required: true }]}><InputNumber min={0} max={500} /></Form.Item></div>
      <Form.Item name="checked" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận kiểm tra đường bay.')) }]}><Checkbox>Đã đối chiếu đường bay nằm trong khoảng lùi an toàn</Checkbox></Form.Item>
    </Form><SurveyMutationError error={mutation.error} />
  </Modal>
}
