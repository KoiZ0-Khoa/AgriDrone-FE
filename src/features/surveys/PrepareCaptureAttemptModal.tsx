import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Modal, Select } from 'antd'
import { useRef, useState } from 'react'
import { getAvailableDrones } from '../missions/missionApi'
import { ownerGuid } from './ownerOrderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'
import { prepareCaptureAttempt } from './v3Api'
import { droneSupportsService, v3OperationFor, v3ServiceKind, type V3Operation } from './v3Workflow'
import type { AssignedOrder } from './orderTypes'
import type { PrepareCaptureAttemptResult } from './v3Types'
import { appointmentScheduleLabel, workflowError } from './workflow'

type CaptureWindow = { startAt: string; endAt: string }
type Props = {
  token: string; order: AssignedOrder; captureWindow: CaptureWindow | null
  close: () => void; done: (result: PrepareCaptureAttemptResult) => Promise<void>
}

export function PrepareCaptureAttemptModal({ token, order, captureWindow, close, done }: Props) {
  const [snapshot] = useState(() => ({ orderVersion: order.orderVersion, appointmentId: order.currentAppointmentId, window: captureWindow }))
  const [droneId, setDroneId] = useState<string>()
  const submitting = useRef(false)
  const operation = useRef<V3Operation | null>(null)
  const kind = v3ServiceKind(order.surveyServiceCode)
  const window = snapshot.window
  const stale = !captureWindow || snapshot.orderVersion !== order.orderVersion || snapshot.appointmentId !== order.currentAppointmentId ||
    window?.startAt !== captureWindow.startAt || window?.endAt !== captureWindow.endAt
  const drones = useQuery({
    queryKey: ['capture-preparation-drones', order.surveyOrderId, order.farmId, snapshot.appointmentId, window?.startAt, window?.endAt, kind],
    enabled: !stale && window !== null,
    refetchOnMount: 'always',
    queryFn: async ({ signal }) => {
      const items = await getAvailableDrones(token, order.farmId, window!.startAt, window!.endAt, 'BaselineMapping', signal)
      return items.filter(drone => droneSupportsService(drone.specifications?.capabilities, kind))
    },
  })

  const canSubmit = !stale && drones.isSuccess && !drones.isFetching && typeof droneId === 'string' &&
    ownerGuid(droneId) && drones.data.some(drone => drone.id === droneId)
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!canSubmit || !droneId) throw new Error('Chọn drone khả dụng trong khung giờ đã xác nhận.')
      const body = { droneId, expectedOrderVersion: snapshot.orderVersion }
      operation.current = await v3OperationFor(operation.current, body)
      const result = await prepareCaptureAttempt(token, order.surveyOrderId, {
        ...body, operationId: operation.current.operationId, payloadFingerprint: operation.current.payloadFingerprint,
      })
      if (!result.success || !ownerGuid(result.missionId)) throw new Error('Chưa xác minh được nhiệm vụ mới. Kiểm tra lịch sử chuyến bay.')
      return result
    },
    onSuccess: done,
    onSettled: () => { submitting.current = false },
  })
  const locked = stale || mutationNeedsReload(mutation.error)
  return <Modal open title="Chuẩn bị lần bay" okText="Chuẩn bị lần bay" cancelText={locked ? 'Đóng và tải lại' : 'Hủy'}
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked || !canSubmit }}
    cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}
    onCancel={() => { if (!mutation.isPending) close() }}
    onOk={() => {
      if (locked || !canSubmit || submitting.current) return
      submitting.current = true
      mutation.mutate()
    }}>
    {window ? <p>Lịch đã xác nhận · {appointmentScheduleLabel(null, null, null, window.startAt, window.endAt)}</p> : null}
    {stale ? <Alert type="warning" showIcon title="Đơn hoặc lịch bay đã thay đổi. Đóng và tải lại để kiểm tra." /> : null}
    <Select aria-label="Drone cho lần bay" placeholder="Chọn drone khả dụng" value={droneId} onChange={setDroneId}
      style={{ width: '100%' }} loading={drones.isFetching} disabled={locked || mutation.isPending || !drones.isSuccess}
      options={(drones.data ?? []).map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}` }))}
      notFoundContent="Không có drone phù hợp còn trống trong khung giờ này." />
    {drones.isError ? <Alert className="workflow-notice" type="error" showIcon title={workflowError(drones.error)} /> : null}
    <SurveyMutationError error={mutation.error} />
  </Modal>
}
