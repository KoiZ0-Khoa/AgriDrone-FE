import { useMutation } from '@tanstack/react-query'
import { Form, Input, InputNumber, Modal, Select } from 'antd'
import { useState } from 'react'
import { BoundaryPointFields, boundaryPoints, type BoundaryPoint } from './BoundaryPointFields'
import { classifyFarmPoint, reviewBoundaryException, verifyFarmBoundary, type BoundaryException, type ClassifiedPoint, type FarmContext } from './farmOperationsApi'
import { polygonFromPoints } from './orderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'

type Props = { token: string; farm: FarmContext; close: () => void; done: () => Promise<void> }
export function FarmBoundaryModal({ token, farm, close, done }: Props) {
  const [snapshot] = useState(farm)
  const [form] = Form.useForm<{ points: BoundaryPoint[]; reason: string; evidenceReference?: string }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { points: BoundaryPoint[]; reason: string; evidenceReference?: string }) => {
    if (!snapshot.approvedBoundary || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1 || !Number.isSafeInteger(snapshot.approvedBoundary.versionNumber) || snapshot.approvedBoundary.versionNumber < 1) throw new Error('Thiếu phiên bản nông trại hoặc ranh giới đã duyệt. Tải lại dữ liệu.')
    return verifyFarmBoundary(token, snapshot.farmId, { boundary: polygonFromPoints(values.points, snapshot.approvedBoundary.geometry?.coordinates.slice(1)), reason: values.reason.trim(), evidenceReference: values.evidenceReference?.trim() || null, expectedFarmVersion: snapshot.version, expectedCurrentBoundaryVersionNumber: snapshot.approvedBoundary.versionNumber })
  }, onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open width={680} title="Cập nhật ranh giới nông trại" okText="Lưu phiên bản ranh giới" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>{snapshot.name}. Nhập các điểm theo thứ tự quanh ranh giới. Các vùng trống bên trong được giữ nguyên. Ranh giới mới phải bao phủ các khu vực đang hoạt động.</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={mutation.isPending || locked} initialValues={{ points: boundaryPoints(snapshot.approvedBoundary?.geometry?.coordinates[0]) }} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <BoundaryPointFields disabled={mutation.isPending || locked} />
      <Form.Item className="workflow-notice" name="reason" label="Lý do cập nhật" rules={[{ required: true, whitespace: true }, { max: 2000 }]}><Input.TextArea maxLength={2000} rows={2} /></Form.Item>
      <Form.Item name="evidenceReference" label="Tham chiếu bằng chứng" rules={[{ max: 1000 }]}><Input maxLength={1000} /></Form.Item>
    </Form><SurveyMutationError error={mutation.error} />
  </Modal>
}

type ClassifyValues = BoundaryPoint & { sourceReferenceId: string; threshold: number }
export function ClassifyPointModal({ token, farm, close, done }: Omit<Props, 'done'> & { done: (result: ClassifiedPoint) => Promise<void> }) {
  const [form] = Form.useForm<ClassifyValues>()
  const mutation = useMutation({ retry: false, mutationFn: (values: ClassifyValues) => classifyFarmPoint(token, farm.farmId, { point: { type: 'Point', coordinates: [values.longitude, values.latitude] }, source: 4, sourceReferenceId: values.sourceReferenceId.trim(), nearBoundaryThresholdMeters: values.threshold }), onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open title="Kiểm tra điểm so với ranh giới" okText="Kiểm tra và ghi nhận" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Điểm gần hoặc ngoài ranh giới sẽ được ghi nhận để xét duyệt.</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" initialValues={{ threshold: 5 }} disabled={locked || mutation.isPending} onFinish={values => { if (!locked && !mutation.isPending) mutation.mutate(values) }}>
      <div className="form-two-columns"><Form.Item name="longitude" label="Kinh độ" rules={[{ required: true }]}><InputNumber min={-180} max={180} /></Form.Item><Form.Item name="latitude" label="Vĩ độ" rules={[{ required: true }]}><InputNumber min={-90} max={90} /></Form.Item></div>
      <Form.Item name="sourceReferenceId" label="Mã biên bản / bằng chứng hiện trường" rules={[{ required: true, whitespace: true }, { max: 200 }]}><Input maxLength={200} /></Form.Item>
      <Form.Item name="threshold" label="Khoảng cách coi là gần ranh giới (m)" rules={[{ required: true }]}><InputNumber min={0.1} max={50} /></Form.Item>
    </Form><SurveyMutationError error={mutation.error} />
  </Modal>
}

type ReviewValues = BoundaryPoint & { decision: 1 | 2 | 3; reason: string; evidence?: string }
export function ExceptionReviewModal({ token, farmId, item, close, done }: { token: string; farmId: string; item: BoundaryException; close: () => void; done: () => Promise<void> }) {
  const [snapshot] = useState(item)
  const [form] = Form.useForm<ReviewValues>()
  const decision = Form.useWatch('decision', form)
  const mutation = useMutation({ retry: false, mutationFn: (values: ReviewValues) => {
    if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1 || snapshot.farmId !== farmId) throw new Error('Thiếu phiên bản ngoại lệ hoặc không khớp nông trại. Tải lại dữ liệu.')
    return reviewBoundaryException(token, farmId, snapshot.id, { decision: values.decision, correctedPosition: values.decision === 3 ? { type: 'Point', coordinates: [values.longitude, values.latitude] } : null, reason: values.reason.trim(), evidence: values.evidence?.trim() ? { reference: values.evidence.trim() } : null, expectedVersion: snapshot.version })
  }, onSuccess: done })
  const locked = mutationNeedsReload(mutation.error)
  return <Modal open title="Xét duyệt điểm ranh giới" okText="Lưu quyết định" cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>{snapshot.sourceReferenceId} · {snapshot.originalPosition.coordinates.join(', ')}</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={locked || mutation.isPending} onFinish={values => { if (!locked && !mutation.isPending) mutation.mutate(values) }}>
      <Form.Item name="decision" label="Quyết định" rules={[{ required: true }]}><Select options={[{ value: 1, label: 'Chấp nhận trong ranh giới' }, { value: 2, label: 'Loại vì ngoài ranh giới' }, { value: 3, label: 'Sửa vị trí' }]} /></Form.Item>
      {decision === 3 ? <div className="form-two-columns"><Form.Item name="longitude" label="Kinh độ mới" rules={[{ required: true }]}><InputNumber min={-180} max={180} /></Form.Item><Form.Item name="latitude" label="Vĩ độ mới" rules={[{ required: true }]}><InputNumber min={-90} max={90} /></Form.Item></div> : null}
      <Form.Item name="reason" label="Lý do quyết định" rules={[{ required: true, whitespace: true }, { max: 2000 }]}><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
      <Form.Item name="evidence" label="Tham chiếu bằng chứng"><Input /></Form.Item>
    </Form><SurveyMutationError error={mutation.error} />
  </Modal>
}
