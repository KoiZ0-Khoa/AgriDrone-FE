import { FormSubmit } from '../../components/FormSubmit'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Select } from 'antd'
import { useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { getAvailableDrones } from '../missions/missionApi'
import { scheduleWindowForDate } from '../missions/missionWorkflow'
import { verifyOrderBoundary } from './orderApi'
import type { Appointment, AssignedOrder, OrderScope } from './orderTypes'
import { captureAppointmentBody, captureNoShowBody, operationsDate, polygonFromPoints, qualityReflightBody, type NoShowValues, type QualityReflightValues } from './orderWorkflow'
import { createQualityReflight, getV3CaptureDrones, proposeCaptureAppointment, recordCaptureNoShow } from './v3Api'
import type { CaptureNoShowResult, QualityReflightResult, V3CaptureAttempt } from './v3Types'
import { captureAttemptStatusLabels, droneSupportsService, reflightParentAttempt, v3OperationFor, v3ServiceKind, type V3Operation } from './v3Workflow'
import { workflowError } from './workflow'
import { intakeCoordinate } from './intakeNumbers'

function MutationError({ error }: { error: Error | null }) {
  return error ? <Alert showIcon type="error" title={workflowError(error)} description={error instanceof ApiError ? <><p>{error.message}</p><p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p>{error.traceId ? <p>Mã tra cứu: <code>{error.traceId}</code></p> : null}</> : undefined} /> : null
}
const cannotRetry = (error: Error | null) => error instanceof ApiError && [403, 404, 409].includes(error.status)

export function AppointmentModal({ token, order, scope, close, done }: { token: string; order: AssignedOrder; scope: OrderScope; close: () => void; done: (result: Appointment) => Promise<void> }) {
  const [snapshot] = useState(() => ({ order, scope }))
  const [form] = Form.useForm<{ date: string }>()
  const mutation = useMutation({ retry: false, mutationFn: (values: { date: string }) => proposeCaptureAppointment(token, snapshot.scope.surveyOrderId, captureAppointmentBody(snapshot.order, snapshot.scope, values.date)), onSuccess: done })
  const locked = cannotRetry(mutation.error)
  const rescheduling = snapshot.order.currentAppointmentStatus === 'RESCHEDULE_REQUESTED'
  return <Modal open title={rescheduling ? 'Đề xuất lịch bay mới' : 'Đề xuất lịch bay'} okText="Gửi đề xuất lịch" cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p><strong>{snapshot.order.farmName}</strong> · {snapshot.order.surveyServiceName}</p><p>Lịch chỉ chính thức khi Owner xác nhận. Sau khi xác nhận, Owner trả cọc (nếu chưa đủ) rồi đơn chuyển sang bước sẵn sàng bay.</p><p>Chọn ngày theo giờ Việt Nam. Nếu chọn hôm nay, thời gian bắt đầu do hệ thống điều chỉnh theo thời gian còn lại trong ngày.</p>
    <Form form={form} layout="vertical" disabled={mutation.isPending || locked} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <FormSubmit disabled={mutation.isPending || locked} />
      <Form.Item name="date" label="Ngày bay (giờ Việt Nam)" rules={[{ required: true }]}><Input type="date" min={operationsDate()} /></Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}

// Giờ địa phương của trình duyệt cho <input type="datetime-local"> (không có múi giờ).
const localDateTimeValue = (time: number) => { const date = new Date(time); date.setSeconds(0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
export function NoShowModal({ token, order, scope, close, done }: { token: string; order: AssignedOrder; scope: OrderScope; close: () => void; done: (result: CaptureNoShowResult) => Promise<void> }) {
  const [snapshot] = useState(() => ({ order, scope }))
  const [form] = Form.useForm<NoShowValues>()
  const operation = useRef<V3Operation | null>(null)
  const mutation = useMutation({ retry: false, mutationFn: async (values: NoShowValues) => {
    const body = captureNoShowBody(snapshot.order, snapshot.scope, values)
    operation.current = await v3OperationFor(operation.current, body)
    return recordCaptureNoShow(token, snapshot.scope.surveyOrderId, { ...body, operationId: operation.current.operationId, payloadFingerprint: operation.current.payloadFingerprint })
  }, onSuccess: done })
  const locked = cannotRetry(mutation.error)
  return <Modal open title="Báo khách vắng mặt" okText="Ghi nhận vắng mặt" okButtonProps={{ danger: true, disabled: locked }} cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p><strong>{snapshot.order.farmName}</strong> · {snapshot.order.surveyServiceName}</p>
    <p>Ghi nhận Owner không có mặt theo lịch bay đã xác nhận. Lịch hiện tại chuyển sang "đổi lịch" và đơn quay về bước chốt lịch bay. Nếu còn trong số lần vắng mặt được miễn phí, Manager đề xuất lịch mới ngay; nếu vượt, đơn cần System Admin xem xét.</p>
    <Form form={form} layout="vertical" disabled={mutation.isPending || locked} initialValues={{ occurredAt: localDateTimeValue(Date.now()) }} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <FormSubmit disabled={mutation.isPending || locked} />
      <Form.Item name="occurredAt" label="Thời điểm ghi nhận vắng mặt" extra="Phải sau giờ bắt đầu lịch hẹn và không ở tương lai." rules={[{ required: true, message: 'Chọn thời điểm.' }]}><Input type="datetime-local" max={localDateTimeValue(Date.now())} /></Form.Item>
      <Form.Item name="reason" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Nhập lý do.' }, { max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
      <Form.Item name="evidenceReference" label="Tham chiếu bằng chứng" extra="Ví dụ: mã cuộc gọi, ảnh chụp hiện trường, tin nhắn." rules={[{ required: true, whitespace: true, message: 'Nhập tham chiếu bằng chứng.' }, { max: 500 }]}><Input maxLength={500} /></Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}

type BoundaryValues = { points: { longitude: string | number; latitude: string | number }[]; reason: string; evidenceReference?: string }
export function BoundaryVerificationModal({ token, scope, close, done }: { token: string; scope: OrderScope; close: () => void; done: () => Promise<void> }) {
  const [snapshot] = useState(scope)
  const [form] = Form.useForm<BoundaryValues>()
  const ring = snapshot.currentApprovedBoundary?.geometry.coordinates[0] ?? []
  const openRing = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
  const mutation = useMutation({ retry: false, mutationFn: (values: BoundaryValues) => {
    if (snapshot.requiresBaselineMapping || snapshot.orderStatus !== 'PENDING_BOUNDARY_VERIFICATION') throw new Error('Đơn này không cho phép xác minh ranh giới trực tiếp.')
    if (!Number.isSafeInteger(snapshot.orderVersion) || snapshot.orderVersion < 1) throw new Error('Thiếu version đơn khảo sát. Tải lại để tiếp tục.')
    if (snapshot.currentApprovedBoundary && (!Number.isSafeInteger(snapshot.currentApprovedBoundary.versionNumber) || snapshot.currentApprovedBoundary.versionNumber < 1)) throw new Error('Thiếu phiên bản ranh giới hiện tại. Tải lại để tiếp tục.')
    const parsed = values.points.map(p => ({ longitude: intakeCoordinate(p.longitude, 'longitude'), latitude: intakeCoordinate(p.latitude, 'latitude') }))
    return verifyOrderBoundary(token, snapshot.surveyOrderId, { boundary: polygonFromPoints(parsed, snapshot.currentApprovedBoundary?.geometry.coordinates.slice(1)), reason: values.reason.trim(), evidenceReference: values.evidenceReference?.trim() || null, expectedOrderVersion: snapshot.orderVersion, expectedCurrentBoundaryVersionNumber: snapshot.currentApprovedBoundary?.versionNumber ?? null })
  }, onSuccess: done })
  const locked = cannotRetry(mutation.error)
  return <Modal open width={680} title="Xác minh ranh giới nông trại" okText="Xác nhận ranh giới" cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Nhập các đỉnh theo thứ tự quanh ranh giới. Điểm cuối sẽ tự nối với điểm đầu; các vùng trống bên trong ranh giới cũ được giữ nguyên.</p>
    <Form className="workflow-coordinate-fields" form={form} layout="vertical" disabled={mutation.isPending || locked} initialValues={{ points: openRing.length ? openRing.map(point => ({ longitude: String(point[0]), latitude: String(point[1]) })) : [{}, {}, {}] }} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <FormSubmit disabled={mutation.isPending || locked} />
      <Form.List name="points">{(fields, { add, remove }) => <>{fields.map((field, index) => <fieldset className="workflow-checklist" key={field.key}><legend>Điểm {index + 1}</legend><div className="form-two-columns"><Form.Item name={[field.name, 'longitude']} label="Kinh độ" rules={[{ required: true, whitespace: true, message: 'Nhập kinh độ.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeCoordinate(value, 'longitude') } }]}><Input inputMode="decimal" placeholder="VD: 108,1234567" /></Form.Item><Form.Item name={[field.name, 'latitude']} label="Vĩ độ" rules={[{ required: true, whitespace: true, message: 'Nhập vĩ độ.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeCoordinate(value, 'latitude') } }]}><Input inputMode="decimal" placeholder="VD: 11,0123456" /></Form.Item></div><Button icon={<MinusCircleOutlined />} disabled={mutation.isPending || locked || fields.length <= 3} onClick={() => remove(field.name)}>Bỏ điểm {index + 1}</Button></fieldset>)}<Button icon={<PlusOutlined />} disabled={mutation.isPending || locked} onClick={() => add({})}>Thêm điểm ranh giới</Button></>}</Form.List>
      <Form.Item className="workflow-notice" name="reason" label="Lý do xác minh" rules={[{ required: true, whitespace: true }, { max: 2000 }]}><Input.TextArea rows={2} maxLength={2000} /></Form.Item><Form.Item name="evidenceReference" label="Tham chiếu bằng chứng (không bắt buộc)" rules={[{ max: 1000 }]}><Input maxLength={1000} /></Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}

// G6 — bay lại khi đơn chờ quyết định bay lại. BE tạo lần bay mới, nhiệm vụ mới và lịch Capture cả ngày ở trạng thái chờ Owner
// xác nhận; không thu thêm cọc. Danh sách drone tạm lấy từ API drone theo farm cho đúng ngày đã chọn (chờ BE-8 xác nhận nguồn),
// lọc theo khả năng của dịch vụ đã chốt; coordinator vẫn kiểm lại drone lúc tạo.
export function QualityReflightModal({ token, order, scope, attempts, close, done }: {
  token: string; order: AssignedOrder; scope: OrderScope; attempts: readonly V3CaptureAttempt[]; close: () => void; done: (result: QualityReflightResult, disease: boolean) => Promise<void>
}) {
  const [snapshot] = useState(() => ({ order, scope, attempts }))
  const [form] = Form.useForm<QualityReflightValues>()
  const scheduledDate = Form.useWatch('scheduledDate', form)
  const operation = useRef<V3Operation | null>(null)
  const parent = reflightParentAttempt(snapshot.attempts)
  const disease = !!parent?.mappingSourceAttemptId
  const kind = v3ServiceKind(snapshot.order.surveyServiceCode)
  const validDate = typeof scheduledDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)
  const drones = useQuery({
    queryKey: ['reflight-drones', snapshot.scope.surveyOrderId, scheduledDate, kind, disease],
    enabled: validDate,
    queryFn: async ({ signal }) => {
      const window = scheduleWindowForDate(scheduledDate!)
      if (disease) {
        const startAt = new Date(Math.max(Date.parse(window.startAt), Date.now() + 5 * 60_000)).toISOString()
        if (Date.parse(startAt) >= Date.parse(window.endAt)) return []
        const result = await getV3CaptureDrones(token, snapshot.scope.surveyOrderId, { startAt, endAt: window.endAt }, signal)
        if (result.farmId !== snapshot.order.farmId || result.surveyOrderId !== snapshot.scope.surveyOrderId) throw new Error('Danh sách drone không khớp đơn khảo sát.')
        return result.drones
      }
      const items = await getAvailableDrones(token, snapshot.order.farmId, window.startAt, window.endAt, 'BaselineMapping', signal)
      return items.filter(drone => droneSupportsService(drone.specifications?.capabilities, kind))
    },
  })
  const mutation = useMutation({ retry: false, mutationFn: async (values: QualityReflightValues) => {
    const { parentAttemptId, body } = qualityReflightBody(snapshot.order, snapshot.scope, snapshot.attempts, values)
    if (disease && (!drones.isSuccess || !drones.data.some(drone => drone.id === body.droneId))) throw new Error('Chọn drone phù hợp cho lần bay bệnh.')
    operation.current = await v3OperationFor(operation.current, { parentAttemptId, ...body })
    return createQualityReflight(token, snapshot.scope.surveyOrderId, parentAttemptId, { ...body, operationId: operation.current.operationId, payloadFingerprint: operation.current.payloadFingerprint })
  }, onSuccess: result => done(result, disease) })
  const locked = cannotRetry(mutation.error)
  return <Modal open width={620} title="Tạo lần bay lại" okText="Tạo lần bay lại" okButtonProps={{ disabled: locked || !parent }} cancelText={locked ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p><strong>{snapshot.order.farmName}</strong> · {snapshot.order.surveyServiceName}</p>
    {parent ? <p>Bay lại từ <strong>lần bay {parent.attemptIndex}</strong> ({captureAttemptStatusLabels[parent.status]}). Hệ thống tạo lần bay và nhiệm vụ mới; dữ liệu của lần trước được giữ nguyên trong lịch sử. Không thu thêm cọc.</p>
      : <Alert type="warning" showIcon title="Không còn lần bay nào chờ bay lại. Đóng và tải lại để kiểm tra." />}
    <p className="form-hint">{disease ? 'Manager xác nhận lịch bay bệnh mới. Hoàn tất checklist trên nhiệm vụ mới trước khi bay.' : 'Lịch bay mới ở trạng thái chờ Owner xác nhận. Sau khi Owner xác nhận, hoàn tất checklist trước bay trên nhiệm vụ mới rồi bắt đầu bay.'}</p>
    <Form form={form} layout="vertical" disabled={mutation.isPending || locked || !parent} onFinish={values => { if (!mutation.isPending && !locked) mutation.mutate(values) }}>
      <FormSubmit disabled={mutation.isPending || locked || !parent} />
      <Form.Item name="scheduledDate" label="Ngày bay lại (giờ Việt Nam)" rules={[{ required: true, message: 'Chọn ngày bay lại.' }]}><Input type="date" min={operationsDate()} onChange={() => form.setFieldValue('droneId', undefined)} /></Form.Item>
      <Form.Item name="droneId" label="Drone" extra={disease ? 'Chỉ hiện drone có khả năng bay bệnh.' : kind === 'COMBO' ? 'Chỉ hiện drone vừa bay bản đồ vừa sàng lọc bệnh được.' : 'Chỉ hiện drone bay bản đồ được.'} rules={[{ required: true, message: 'Chọn drone.' }]}>
        <Select placeholder={validDate ? 'Chọn drone còn trống trong ngày' : 'Chọn ngày trước'} disabled={!validDate} loading={drones.isFetching}
          notFoundContent={drones.isError ? workflowError(drones.error) : 'Không có drone phù hợp còn trống trong ngày này.'}
          options={(drones.data ?? []).map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}` }))} />
      </Form.Item>
      <Form.Item name="reason" label="Lý do bay lại" rules={[{ required: true, whitespace: true, message: 'Nhập lý do.' }, { max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
      <Form.Item name="technicalQualityEvidence" label="Bằng chứng kỹ thuật" extra="Ví dụ: mã sự cố, log bay, ảnh lỗi, kết quả kiểm tra drone." rules={[{ required: true, whitespace: true, message: 'Nhập bằng chứng kỹ thuật.' }, { max: 500 }]}><Input maxLength={500} /></Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}
