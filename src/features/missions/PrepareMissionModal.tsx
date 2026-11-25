import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Select, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import type { AssignedOrder } from '../surveys/orderTypes'
import { operationFor } from '../surveys/workflow'
import * as api from './missionApi'
import type { PrepareMissionSetResult } from './missionTypes'
import { dateTime, missionError, missionPurposeFor, missionPurposeLabel, missionStatusLabel } from './missionWorkflow'

const flightTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })

export function PrepareMissionModal({ token, order, orderStatus, close }: { token: string; order: AssignedOrder; orderStatus: string; close: () => void }) {
  const purpose = missionPurposeFor(order, orderStatus)
  const [droneId, setDroneId] = useState<string>()
  const [result, setResult] = useState<PrepareMissionSetResult | null>(null)
  const operation = useRef<ReturnType<typeof operationFor> | null>(null)
  const preparing = useRef(false)
  const availability = useQuery({
    queryKey: ['available-drones-for-order', order.surveyOrderId, order.orderVersion],
    queryFn: ({ signal }) => api.getAvailableDronesForOrder(token, order.surveyOrderId, signal),
    enabled: Boolean(purpose) && !result,
    retry: false,
    refetchOnMount: 'always',
  })
  const schedule = availability.data
  const drones = availability.isSuccess ? schedule?.drones ?? [] : []
  const canPrepare = Boolean(purpose) && !availability.isFetching && drones.some(drone => drone.id === droneId)
  const mutation = useMutation({
    mutationFn: () => {
      if (!canPrepare || !droneId) throw new Error('Chọn drone khả dụng trong lịch đã chốt.')
      const body = { droneId }
      operation.current = operationFor(operation.current, body)
      return api.prepareMissionSet(token, order.surveyOrderId, body, operation.current.key)
    },
    onSuccess: data => setResult(data),
    onError: async error => {
      if (error instanceof ApiError && error.code === 'MissionPlanning.DroneNotAvailable') {
        setDroneId(undefined)
        await availability.refetch()
      }
    },
    onSettled: () => { preparing.current = false },
  })
  return <Modal open title="Chuẩn bị nhiệm vụ bay" okText={result ? 'Đóng' : 'Chuẩn bị nhiệm vụ'} cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending || (!result && !canPrepare) }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={() => {
      if (result) { close(); return }
      if (!canPrepare || preparing.current) return
      preparing.current = true
      mutation.mutate()
    }}
    onCancel={() => { if (!mutation.isPending) close() }}>
    {!purpose ? <Alert type="warning" showIcon title="Đơn chưa ở bước có thể chuẩn bị nhiệm vụ bay." /> : result ? <>
      <Alert type="success" showIcon title={result.reusedExistingSet ? 'Đơn đã có nhiệm vụ bay được chuẩn bị từ trước.' : 'Đã chuẩn bị nhiệm vụ bay.'} />
      <Table size="small" rowKey="missionId" dataSource={result.missions} pagination={false} columns={[
        { title: 'Mục đích', render: (_, mission) => missionPurposeLabel(mission.purpose) },
        { title: 'Trạng thái', render: (_, mission) => <Tag>{missionStatusLabel(mission.status)}</Tag> },
        { title: 'Lịch bay', render: (_, mission) => mission.scheduledAt ? `${dateTime(mission.scheduledAt)} – ${dateTime(mission.scheduledEndAt)}` : 'Chưa lên lịch' },
        { title: 'Thao tác', render: (_, mission) => <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/missions/${encodeURIComponent(mission.missionId)}`}>Xem chi tiết →</Link> },
      ]} />
    </> : <Form layout="vertical">
      <Form.Item label="Mục đích"><Input readOnly value={missionPurposeLabel(schedule?.purpose ?? purpose)} /></Form.Item>
      <Form.Item label="Lịch bay đã chốt (giờ Việt Nam)">
        <Input readOnly value={schedule ? `${flightTime.format(new Date(schedule.startAt))} – ${flightTime.format(new Date(schedule.endAt))}` : ''} placeholder={availability.isPending ? 'Đang tải lịch bay…' : 'Chưa tải được lịch bay'} />
      </Form.Item>
      <Form.Item label="Drone khả dụng">
        <Select value={drones.some(drone => drone.id === droneId) ? droneId : undefined} loading={availability.isFetching}
          disabled={mutation.isPending || availability.isFetching || availability.isError} placeholder="Chọn drone" onChange={value => { setDroneId(value); mutation.reset() }}
          options={drones.map(drone => ({ value: drone.id, label: `${drone.name} · ${drone.code}` }))}
          notFoundContent="Không có drone khả dụng trong lịch đã chốt" />
      </Form.Item>
      {availability.isError || (availability.isSuccess && drones.length === 0) ? <Alert
        type={availability.isError ? 'error' : 'info'} showIcon
        title={availability.isError ? missionError(availability.error) : 'Không có drone khả dụng trong lịch đã chốt'}
        action={<Button size="small" loading={availability.isFetching} onClick={() => { void availability.refetch() }}>Tải lại danh sách</Button>} /> : null}
    </Form>}
    {mutation.error ? <Alert type="error" showIcon title={missionError(mutation.error)} /> : null}
  </Modal>
}
