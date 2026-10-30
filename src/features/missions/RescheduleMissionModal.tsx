import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Form, Input, Modal, Select } from 'antd'
import * as api from './missionApi'
import type { MissionDetail } from './missionTypes'
import { missionError, scheduleWindowForDate } from './missionWorkflow'

function tomorrow() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function RescheduleMissionModal({ token, farmId, missionId, currentVersion, currentDroneId, close, onRescheduled }: {
  token: string; farmId: string; missionId: string; currentVersion: number; currentDroneId: string
  close: () => void; onRescheduled: (mission: MissionDetail) => void
}) {
  const [date, setDate] = useState(tomorrow())
  const [droneId, setDroneId] = useState<string>()
  const window = scheduleWindowForDate(date)
  const drones = useQuery({ queryKey: ['available-drones-reschedule', farmId, date], queryFn: ({ signal }) => api.getAvailableDrones(token, farmId, window.startAt, window.endAt, undefined, signal) })
  const mutation = useMutation({
    mutationFn: () => api.rescheduleMission(token, farmId, missionId, { expectedVersion: currentVersion, scheduledDate: date, replacementDroneId: droneId || undefined }),
    onSuccess: data => { onRescheduled(data); close() },
  })
  return <Modal open title="Lên lịch lại nhiệm vụ bay" okText="Lên lịch lại" cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => { if (!mutation.isPending) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) close() }}>
    <Form layout="vertical">
      <Form.Item label="Ngày bay mới (giờ Việt Nam)"><Input type="date" value={date} disabled={mutation.isPending} onChange={event => { setDate(event.target.value); setDroneId(undefined) }} /></Form.Item>
      <Form.Item label="Drone (để trống để giữ drone hiện tại)">
        <Select value={droneId} allowClear loading={drones.isPending} disabled={mutation.isPending} placeholder="Giữ nguyên drone hiện tại" onChange={setDroneId}
          options={(drones.data ?? []).map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}${drone.id === currentDroneId ? ' (hiện tại)' : ''}` }))} />
      </Form.Item>
      <p className="form-hint">Ngày bay mới phải nằm trong khoảng lịch hẹn Owner đã xác nhận. Checklist preflight đã hoàn tất sẽ hết hiệu lực và cần làm lại.</p>
    </Form>
    {mutation.error ? <Alert type="error" showIcon message={missionError(mutation.error)} /> : null}
  </Modal>
}
