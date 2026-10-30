import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Form, Input, Modal, Select, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import type { AssignedOrder } from '../surveys/orderTypes'
import * as api from './missionApi'
import type { PrepareMissionSetResult } from './missionTypes'
import { dateTime, missionError, missionPurposeFor, missionPurposeLabel, missionPurposeLabels, missionStatusLabel, scheduleWindowForDate } from './missionWorkflow'

function tomorrow() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function PrepareMissionModal({ token, order, orderStatus, close }: { token: string; order: AssignedOrder; orderStatus: string; close: () => void }) {
  const purpose = missionPurposeFor(order, orderStatus)
  const [date, setDate] = useState(tomorrow())
  const [droneId, setDroneId] = useState<string>()
  const [result, setResult] = useState<PrepareMissionSetResult | null>(null)
  const window = scheduleWindowForDate(date)
  const drones = useQuery({ queryKey: ['available-drones', order.farmId, date, purpose], queryFn: ({ signal }) => api.getAvailableDrones(token, order.farmId, window.startAt, window.endAt, purpose ?? undefined, signal), enabled: Boolean(purpose) })
  const mutation = useMutation({
    mutationFn: () => {
      if (!purpose) throw new Error('Đơn chưa ở bước có thể chuẩn bị nhiệm vụ bay.')
      if (!droneId) throw new Error('Chọn một drone khả dụng.')
      const body = purpose === 'BaselineMapping' ? { droneId, baselineDate: date } : { droneId, serviceDate: date }
      return api.prepareMissionSet(token, order.surveyOrderId, body, crypto.randomUUID())
    },
    onSuccess: data => setResult(data),
  })
  return <Modal open title="Chuẩn bị nhiệm vụ bay" okText={result ? 'Đóng' : 'Chuẩn bị nhiệm vụ'} cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending || (!result && (!purpose || !droneId)) }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => { if (result || !purpose) { close(); return } if (!mutation.isPending) mutation.mutate() }}
    onCancel={() => { if (!mutation.isPending) close() }}>
    {!purpose ? <Alert type="warning" showIcon message="Đơn chưa ở bước có thể chuẩn bị nhiệm vụ bay." /> : result ? <>
      <Alert type="success" showIcon message={result.reusedExistingSet ? 'Đơn đã có nhiệm vụ bay được chuẩn bị từ trước.' : 'Đã chuẩn bị nhiệm vụ bay.'} />
      <Table size="small" rowKey="missionId" dataSource={result.missions} pagination={false} columns={[
        { title: 'Mục đích', render: (_, mission) => missionPurposeLabel(mission.purpose) },
        { title: 'Trạng thái', render: (_, mission) => <Tag>{missionStatusLabel(mission.status)}</Tag> },
        { title: 'Lịch bay', render: (_, mission) => mission.scheduledAt ? `${dateTime(mission.scheduledAt)} – ${dateTime(mission.scheduledEndAt)}` : 'Chưa lên lịch' },
        { title: 'Thao tác', render: (_, mission) => <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/missions/${encodeURIComponent(mission.missionId)}`}>Xem chi tiết →</Link> },
      ]} />
    </> : <Form layout="vertical">
      <Form.Item label="Mục đích"><Input disabled value={missionPurposeLabels[purpose]} /></Form.Item>
      <Form.Item label="Ngày bay (giờ Việt Nam)"><Input type="date" value={date} disabled={mutation.isPending} onChange={event => { setDate(event.target.value); setDroneId(undefined) }} /></Form.Item>
      <Form.Item label="Drone khả dụng">
        <Select value={droneId} loading={drones.isPending} disabled={mutation.isPending} placeholder="Chọn drone" onChange={setDroneId}
          options={(drones.data ?? []).map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}` }))}
          notFoundContent={drones.isError ? missionError(drones.error) : 'Không có drone khả dụng cho ngày này'} />
      </Form.Item>
      <p className="form-hint">Ngày bay phải nằm trong khoảng lịch hẹn đã được Owner xác nhận cho bước này.</p>
    </Form>}
    {mutation.error ? <Alert type="error" showIcon message={missionError(mutation.error)} /> : null}
  </Modal>
}
