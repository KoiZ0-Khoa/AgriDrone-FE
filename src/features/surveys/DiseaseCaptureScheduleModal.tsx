import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Select } from 'antd'
import { useRef } from 'react'
import { FormSubmit } from '../../components/FormSubmit'
import { findMissionById } from '../missions/missionApi'
import type { AssignedOrder } from './orderTypes'
import { diseaseCaptureWindow } from './orderWorkflow'
import { ownerGuid } from './ownerOrderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'
import { getV3CaptureDrones, rescheduleDiseaseCapture, scheduleDiseaseCapture } from './v3Api'
import type { PrepareCaptureAttemptResult, V3CaptureAttempt } from './v3Types'
import { operationFor } from './workflow'

type Values = { start: string; end: string; droneId: string }

function localTime(value: string | null | undefined) {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? new Date(time + 7 * 3600_000).toISOString().slice(0, 16) : undefined
}

export function DiseaseCaptureScheduleModal({ token, order, attempt, close, done }: {
  token: string; order: AssignedOrder; attempt?: V3CaptureAttempt
  close: () => void; done: (result: PrepareCaptureAttemptResult) => Promise<void>
}) {
  const [form] = Form.useForm<Values>()
  const operation = useRef<ReturnType<typeof operationFor> | null>(null)
  const submitting = useRef(false)
  const start = Form.useWatch('start', form), end = Form.useWatch('end', form)
  const window = diseaseCaptureWindow(start, end)
  const mission = useQuery({
    queryKey: ['mission-detail', order.farmId, attempt?.missionId],
    queryFn: ({ signal }) => findMissionById(token, order.farmId, attempt!.missionId!, signal),
    enabled: !!attempt?.missionId, retry: false,
  })
  const currentDroneId = mission.data?.droneId
  const drones = useQuery({
    queryKey: ['v3-capture-drones', order.surveyOrderId, order.orderVersion, window],
    queryFn: async ({ signal }) => {
      const data = await getV3CaptureDrones(token, order.surveyOrderId, window!, signal)
      if (data.farmId !== order.farmId || data.surveyOrderId !== order.surveyOrderId ||
          Date.parse(data.startAt) !== Date.parse(window!.startAt) || Date.parse(data.endAt) !== Date.parse(window!.endAt)) {
        throw new Error('Danh sách drone không khớp đơn hoặc khung giờ đã chọn.')
      }
      return data.drones
    },
    enabled: !!window, retry: false, refetchOnWindowFocus: false,
  })
  const options = (drones.data ?? []).map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}` }))
  // The current mission can occupy an overlapping window in the availability endpoint.
  if (currentDroneId && !options.some(option => option.value === currentDroneId)) options.unshift({ value: currentDroneId, label: 'Drone hiện tại' })

  const mutation = useMutation({
    retry: false,
    mutationFn: async (values: Values) => {
      const proposed = diseaseCaptureWindow(values.start, values.end)
      if (!proposed || !window || proposed.startAt !== window.startAt || proposed.endAt !== window.endAt) throw new Error('Chọn khung giờ bay hợp lệ trong tương lai.')
      if (!options.some(item => item.value === values.droneId)) throw new Error('Chọn drone cho khung giờ đã kiểm tra.')
      const body = { droneId: values.droneId, expectedOrderVersion: order.orderVersion, ...proposed }
      if (!attempt) operation.current = operationFor(operation.current, body)
      const result = attempt
        ? await rescheduleDiseaseCapture(token, order.surveyOrderId, attempt.captureAttemptId, body)
        : await scheduleDiseaseCapture(token, order.surveyOrderId, { ...body, operationId: operation.current!.key })
      if (!result.success || !ownerGuid(result.attemptId) || !ownerGuid(result.missionId) ||
          (attempt && (result.attemptId !== attempt.captureAttemptId || result.missionId !== attempt.missionId))) {
        throw new Error('Phản hồi lịch bay bệnh không đủ thông tin. Tải lại đơn để kiểm tra.')
      }
      return result
    },
    onSuccess: done,
    onSettled: () => { submitting.current = false },
  })
  const stale = mutationNeedsReload(mutation.error)
  const blocked = !window || !drones.isSuccess || drones.isFetching || stale || mutation.isPending
  return <Modal open title={attempt ? 'Đổi lịch bay bệnh' : 'Tạo chuyến bay bệnh'} okText={attempt ? 'Lưu lịch mới' : 'Tạo chuyến bay bệnh'}
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: blocked }} cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}
    onOk={() => { if (!blocked) form.submit() }} onCancel={() => { if (!mutation.isPending) close() }}>
    <p>Manager xác nhận lịch bay bệnh cho đơn {order.orderNumber}. Chuyến bay dùng bản đồ đã duyệt và khoản cọc của đơn COMBO.</p>
    {attempt ? <p className="form-hint">Hoàn tất checklist trước bay theo lịch mới sau khi lưu.</p> : null}
    <Form<Values> form={form} layout="vertical" disabled={mutation.isPending || stale}
      initialValues={attempt ? { start: localTime(order.currentAppointmentStartAt), end: localTime(order.currentAppointmentEndAt) } : undefined}
      onValuesChange={changes => { if ('start' in changes || 'end' in changes) form.setFieldValue('droneId', undefined) }}
      onFinish={values => {
        if (blocked || submitting.current) return
        submitting.current = true
        mutation.mutate(values)
      }}>
      <FormSubmit disabled={blocked} />
      <Form.Item name="start" label="Bắt đầu (giờ Việt Nam)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
      <Form.Item name="end" label="Kết thúc (giờ Việt Nam)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
      {start && end && !window ? <Alert type="warning" showIcon title="Chọn giờ bắt đầu trong tương lai và giờ kết thúc sau giờ bắt đầu." /> : null}
      <Form.Item name="droneId" label="Drone" rules={[{ required: true, message: 'Chọn drone.' }]}>
        <Select options={options} disabled={blocked} loading={drones.isFetching} placeholder={window ? 'Chọn drone' : 'Chọn khung giờ trước'}
          notFoundContent="Không có drone phù hợp còn trống trong khung giờ này." />
      </Form.Item>
    </Form>
    {window && drones.isError ? <><SurveyMutationError error={drones.error} /><Button onClick={() => { void drones.refetch() }}>Tải lại danh sách drone</Button></> : null}
    <SurveyMutationError error={mutation.error} />
  </Modal>
}

