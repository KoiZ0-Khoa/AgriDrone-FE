import { useMutation } from '@tanstack/react-query'
import { Form, Input, Modal } from 'antd'
import { useState } from 'react'
import { BoundaryPointFields, type BoundaryPoint } from './BoundaryPointFields'
import { markOrthophotoCorners } from './orderApi'
import type { OrderScope } from './orderTypes'
import { orthophotoBody } from './orderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'

export function OrthophotoCornersModal({ token, scope, close, done }: { token: string; scope: OrderScope; close: () => void; done: () => Promise<void> }) {
  const [snapshot] = useState(scope)
  const [form] = Form.useForm<{ points: BoundaryPoint[]; reason?: string; evidenceReference: string }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { points: BoundaryPoint[]; reason?: string; evidenceReference: string }) => markOrthophotoCorners(token, snapshot.surveyOrderId, orthophotoBody(snapshot, values.points, values.reason, values.evidenceReference)), onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open width={680} title="Đánh dấu 4 góc ranh giới trên ảnh trực giao" okText="Lưu ranh giới 4 góc" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Đối chiếu ảnh trực giao đã xử lý, rồi nhập tọa độ WGS84 của bốn góc theo thứ tự quanh nông trại. Tọa độ này không phải vị trí pixel trong ảnh. Diện tích ranh giới được máy chủ kiểm tra trong khoảng 0,01–5.000 ha.</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={locked || mutation.isPending} initialValues={{ points: [{}, {}, {}, {}] }} onFinish={values => { if (!locked && !mutation.isPending) mutation.mutate(values) }}>
      <BoundaryPointFields fixed disabled={locked || mutation.isPending} />
      <Form.Item name="evidenceReference" label="Tham chiếu ảnh trực giao" rules={[{ required: true, whitespace: true }, { max: 1000 }]}><Input maxLength={1000} /></Form.Item>
      <Form.Item name="reason" label="Ghi chú xác minh" rules={[{ max: 2000 }]}><Input.TextArea maxLength={2000} rows={2} /></Form.Item>
    </Form><SurveyMutationError error={mutation.error} />
  </Modal>
}
