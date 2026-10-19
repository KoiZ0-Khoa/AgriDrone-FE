import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input, InputNumber, Modal } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { proposeAppointment, verifyOrderBoundary } from './orderApi'
import type { Appointment, AssignedOrder, OrderScope } from './orderTypes'
import { appointmentBody, polygonFromPoints } from './orderWorkflow'
import { workflowError } from './workflow'

function MutationError({ error }: { error: Error | null }) {
  return error ? <Alert showIcon type="error" title={workflowError(error)} description={error instanceof ApiError ? <><p>{error.message}</p><p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p>{error.traceId ? <p>Mã tra cứu: <code>{error.traceId}</code></p> : null}</> : undefined} /> : null
}
const cannotRetry = (error: Error | null) => error instanceof ApiError && [403, 404, 409].includes(error.status)

export function AppointmentModal({ token, order, scope, close, done }: { token: string; order: AssignedOrder; scope: OrderScope; close: () => void; done: (result: Appointment) => Promise<void> }) {
  const [snapshot] = useState(() => ({ order, scope }))
  const [form] = Form.useForm<{ start: string; end: string }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { start: string; end: string }) => proposeAppointment(token, snapshot.scope.surveyOrderId, appointmentBody(snapshot.order, snapshot.scope, values.start, values.end)), onSuccess: done })
  const locked = cannotRetry(mutation.error)
  return <Modal open title="Đề xuất lịch khảo sát" okText="Gửi đề xuất lịch" cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>{snapshot.order.orderNumber} · {snapshot.order.farmName}</p><p>Đề xuất lịch {snapshot.scope.orderStatus === 'AWAITING_BASELINE_APPOINTMENT' ? 'bay bản đồ nền' : 'dịch vụ'}. Lịch chỉ chính thức khi Owner xác nhận.</p>
    <Form form={form} layout="vertical" disabled={mutation.isPending || locked} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <Form.Item name="start" label="Bắt đầu (giờ địa phương)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item><Form.Item name="end" label="Kết thúc (giờ địa phương)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}

type BoundaryValues = { points: { longitude: number; latitude: number }[]; reason: string; evidenceReference?: string }
export function BoundaryVerificationModal({ token, scope, close, done }: { token: string; scope: OrderScope; close: () => void; done: () => Promise<void> }) {
  const [snapshot] = useState(scope)
  const [form] = Form.useForm<BoundaryValues>()
  const ring = snapshot.currentApprovedBoundary?.geometry.coordinates[0] ?? []
  const openRing = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
  const mutation = useMutation({ retry: false, mutationFn: (values: BoundaryValues) => {
    if (snapshot.requiresBaselineMapping || snapshot.orderStatus !== 'PENDING_BOUNDARY_VERIFICATION') throw new Error('Đơn này không cho phép xác minh ranh giới trực tiếp.')
    if (!Number.isSafeInteger(snapshot.orderVersion) || snapshot.orderVersion < 1) throw new Error('Thiếu version đơn khảo sát. Tải lại để tiếp tục.')
    if (snapshot.currentApprovedBoundary && (!Number.isSafeInteger(snapshot.currentApprovedBoundary.versionNumber) || snapshot.currentApprovedBoundary.versionNumber < 1)) throw new Error('Thiếu phiên bản ranh giới hiện tại. Tải lại để tiếp tục.')
    return verifyOrderBoundary(token, snapshot.surveyOrderId, { boundary: polygonFromPoints(values.points, snapshot.currentApprovedBoundary?.geometry.coordinates.slice(1)), reason: values.reason.trim(), evidenceReference: values.evidenceReference?.trim() || null, expectedOrderVersion: snapshot.orderVersion, expectedCurrentBoundaryVersionNumber: snapshot.currentApprovedBoundary?.versionNumber ?? null })
  }, onSuccess: done })
  const locked = cannotRetry(mutation.error)
  return <Modal open width={680} title="Xác minh ranh giới nông trại" okText="Xác nhận ranh giới" cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>{snapshot.orderNumber}. Nhập các đỉnh theo thứ tự quanh ranh giới. Điểm cuối sẽ tự nối với điểm đầu; các vùng trống bên trong ranh giới cũ được giữ nguyên.</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={mutation.isPending || locked} initialValues={{ points: openRing.length ? openRing.map(point => ({ longitude: point[0], latitude: point[1] })) : [{}, {}, {}] }} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <Form.List name="points">{(fields, { add, remove }) => <>{fields.map((field, index) => <fieldset className="workflow-checklist" key={field.key}><legend>Điểm {index + 1}</legend><div className="form-two-columns"><Form.Item name={[field.name, 'longitude']} label="Kinh độ" rules={[{ required: true }]}><InputNumber min={-180} max={180} /></Form.Item><Form.Item name={[field.name, 'latitude']} label="Vĩ độ" rules={[{ required: true }]}><InputNumber min={-90} max={90} /></Form.Item></div><Button icon={<MinusCircleOutlined />} disabled={mutation.isPending || locked || fields.length <= 3} onClick={() => remove(field.name)}>Bỏ điểm {index + 1}</Button></fieldset>)}<Button icon={<PlusOutlined />} disabled={mutation.isPending || locked} onClick={() => add({})}>Thêm điểm ranh giới</Button></>}</Form.List>
      <Form.Item className="workflow-notice" name="reason" label="Lý do xác minh" rules={[{ required: true, whitespace: true }, { max: 2000 }]}><Input.TextArea rows={2} maxLength={2000} /></Form.Item><Form.Item name="evidenceReference" label="Tham chiếu bằng chứng (không bắt buộc)" rules={[{ max: 1000 }]}><Input maxLength={1000} /></Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}
