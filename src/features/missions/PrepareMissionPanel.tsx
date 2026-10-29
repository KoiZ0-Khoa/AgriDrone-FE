import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Select, Table } from 'antd'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import type { OrderScope } from '../surveys/orderTypes'
import { workflowError } from '../surveys/workflow'
import { getAvailableDrones } from './droneApi'
import { prepareMissionSet } from './missionApi'
import type { PrepareMissionSetResponse } from './types'
import { missionPurposeLabels, missionStatusLabels, operationFor } from './workflow'

function missionSetKey(orderId: string) {
  return ['mission-set', orderId] as const
}

function MutationError({ error }: { error: Error | null }) {
  if (!error) return null
  return <Alert showIcon type="error" title={workflowError(error)} description={error instanceof ApiError ? <>
    <p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p>
    {error.traceId ? <p>Mã tra cứu: <code>{error.traceId}</code></p> : null}
  </> : undefined} />
}
const cannotRetry = (error: Error | null) => error instanceof ApiError && [403, 404, 409].includes(error.status)

function PrepareMissionModal({
  token, orderId, farmId, baseline, close, done,
}: { token: string; orderId: string; farmId: string; baseline: boolean; close: () => void; done: (result: PrepareMissionSetResponse) => void }) {
  const [date, setDate] = useState('')
  const [droneId, setDroneId] = useState<string>()
  const opRef = useRef<{ payload: string; key: string } | null>(null)
  const drones = useQuery({
    queryKey: ['available-drones', farmId, date],
    queryFn: ({ signal }) => getAvailableDrones(token, farmId, `${date}T00:00:00+07:00`, `${date}T23:59:59+07:00`, undefined, signal),
    enabled: Boolean(date),
  })
  const mutation = useMutation({
    retry: false,
    mutationFn: () => {
      if (!date) throw new Error('Chọn ngày bay.')
      if (!droneId) throw new Error('Chọn Drone.')
      const body = baseline ? { droneId, baselineDate: date } : { droneId, serviceDate: date }
      opRef.current = operationFor(opRef.current, body)
      return prepareMissionSet(token, orderId, body, opRef.current.key)
    },
    onSuccess: done,
  })
  const locked = cannotRetry(mutation.error)
  return <Modal open title={`Chuẩn bị Mission bay ${baseline ? 'bản đồ nền' : 'dịch vụ'}`} okText="Chuẩn bị Mission" cancelText={locked ? 'Đóng' : 'Hủy'}
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: locked || !date || !droneId }} onOk={() => mutation.mutate()}
    onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Ngày bay tính theo giờ Việt Nam, phải khớp với lịch hẹn đã được Owner xác nhận.</p>
    <Form layout="vertical" disabled={mutation.isPending || locked}>
      <Form.Item label="Ngày bay" required>
        <Input type="date" value={date} onChange={e => { setDate(e.target.value); setDroneId(undefined) }} />
      </Form.Item>
      <Form.Item label="Drone khả dụng" required help={!date ? 'Chọn ngày trước để xem Drone khả dụng.' : undefined}>
        <Select
          value={droneId}
          disabled={!date}
          loading={drones.isPending && Boolean(date)}
          onChange={setDroneId}
          placeholder="Chọn Drone"
          options={(drones.data ?? []).map(drone => ({ value: drone.id, label: `${drone.code} · ${drone.name}${drone.model ? ` · ${drone.model}` : ''}` }))}
          notFoundContent={drones.isError ? workflowError(drones.error) : 'Không có Drone khả dụng trong ngày này.'}
        />
      </Form.Item>
    </Form>
    <MutationError error={mutation.error} />
  </Modal>
}

export function PrepareMissionPanel({
  token, orderId, farmId, scope, consistent,
}: { token: string; orderId: string; farmId: string; scope: OrderScope; consistent: boolean }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const cache = useQuery<PrepareMissionSetResponse | null>({
    queryKey: missionSetKey(orderId),
    queryFn: () => Promise.resolve(null),
    enabled: false,
    initialData: null,
  })
  const canPrepare = consistent && (scope.orderStatus === 'BASELINE_READY' || scope.orderStatus === 'READY_FOR_PAID_SERVICE')
  if (!canPrepare && !cache.data) return null
  const missions = cache.data?.missions ?? []
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading">
      <div><strong>Chuẩn bị & vận hành Mission</strong><span>Chuẩn bị Mission bay cho đơn khảo sát này.</span></div>
      {canPrepare ? <Button type="primary" onClick={() => setOpen(true)}>Chuẩn bị Mission bay</Button> : null}
    </div>
    <Alert className="workflow-notice" type="info" showIcon title="Danh sách dưới đây chỉ được nạp trong phiên làm việc này"
      description="BE chưa có API liệt kê Mission theo đơn khảo sát. Nếu danh sách trống sau khi tải lại trang, bấm lại 'Chuẩn bị Mission bay' với cùng Drone/ngày đã dùng — nếu Mission đã tồn tại đầy đủ, hệ thống sẽ trả lại đúng Mission hiện có." />
    {missions.length === 0 ? <CommonState type="empty" title="Chưa nạp Mission nào trong phiên này" /> : (
      <Table rowKey="missionId" dataSource={missions} pagination={false} columns={[
        { title: 'Mục đích', render: (_, mission) => missionPurposeLabels[mission.purpose] ?? mission.purpose },
        { title: 'Trạng thái', render: (_, mission) => missionStatusLabels[mission.status] ?? mission.status },
        { title: 'Phiên bản', dataIndex: 'version' },
        { title: 'Lịch bay', render: (_, mission) => mission.scheduledAt ? new Date(mission.scheduledAt).toLocaleString('vi-VN') : 'Chưa có' },
        { title: 'Thao tác', render: (_, mission) => <Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(orderId)}/missions/${encodeURIComponent(mission.missionId)}`} state={mission}>Vận hành Mission →</Link> },
      ]} />
    )}
    {open ? <PrepareMissionModal token={token} orderId={orderId} farmId={farmId} baseline={scope.orderStatus === 'BASELINE_READY'}
      close={() => setOpen(false)}
      done={result => { client.setQueryData(missionSetKey(orderId), result); setOpen(false) }} /> : null}
  </section>
}
