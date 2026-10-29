import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Space, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { getAssignedOrder } from '../surveys/orderApi'
import { workflowError } from '../surveys/workflow'
import { getActiveChecklist } from './checklistApi'
import * as api from './missionApi'
import type { IncidentType, MissionResponse, PrepareMissionSetResponse, PreparedMission, RecoveryDecision } from './types'
import { incidentTypeOptions, missionPurposeLabels, missionStatusLabels, operationFor, recoveryDecisionOptions } from './workflow'

function isPreparedMission(value: unknown): value is PreparedMission {
  return Boolean(value) && typeof value === 'object' && typeof (value as PreparedMission).missionId === 'string' && typeof (value as PreparedMission).version === 'number'
}
const toSnapshot = (mission: MissionResponse): PreparedMission => ({
  missionId: mission.id, purpose: mission.purpose ?? '', status: mission.status,
  scheduledAt: mission.scheduledAt, scheduledEndAt: mission.scheduledEndAt, version: mission.version,
})
function patchMissionSetCache(client: QueryClient, orderId: string, snapshot: PreparedMission) {
  client.setQueryData<PrepareMissionSetResponse | null>(['mission-set', orderId], previous =>
    previous ? { ...previous, missions: previous.missions.map(mission => mission.missionId === snapshot.missionId ? snapshot : mission) } : previous)
}

function startAction(token: string, farmId: string, missionId: string, version: number, update: (m: MissionResponse) => void): Action {
  return {
    title: 'Bắt đầu bay',
    description: 'Hệ thống sẽ kiểm tra lại Order, lịch hẹn, phạm vi, phân công, Drone và checklist trước khi cho phép bắt đầu.',
    fields: [],
    run: () => api.startMission(token, farmId, missionId, version).then(update),
  }
}
function completeFlightAction(token: string, farmId: string, missionId: string, version: number, update: (m: MissionResponse) => void): Action {
  return {
    title: 'Hoàn tất chuyến bay',
    description: 'Chuyển Mission sang Đã hoàn tất chuyến bay. Upload media/telemetry và finalize sẽ làm ở lượt sau.',
    fields: [],
    run: () => api.completeFlight(token, farmId, missionId, version).then(update),
  }
}
function cancelAction(token: string, farmId: string, missionId: string, version: number, update: (m: MissionResponse) => void): Action {
  return {
    title: 'Hủy Mission', danger: true,
    fields: [{ key: 'reason', label: 'Lý do hủy', kind: 'multiline', max: 2000 }],
    run: v => api.cancelMission(token, farmId, missionId, { expectedMissionVersion: version, reason: text(v, 'reason') }).then(update),
  }
}
function failFlightAction(token: string, farmId: string, missionId: string, version: number, update: (m: MissionResponse) => void): Action {
  // One incident id per modal session: keeps the same key across retries of this one failure report.
  const incidentIdempotencyKey = crypto.randomUUID()
  return {
    title: 'Báo lỗi chuyến bay', danger: true,
    description: 'Ghi nhận sự cố và chuyển drone sang bảo trì. Chọn "Cần đổi lịch bay lại" nếu Mission sẽ được lên lịch lại.',
    fields: [
      { key: 'reason', label: 'Lý do dừng bay', kind: 'multiline', max: 2000 },
      { key: 'incidentType', label: 'Loại sự cố', kind: 'select', options: incidentTypeOptions },
      { key: 'incidentOutcome', label: 'Kết quả xử lý tại hiện trường', kind: 'multiline', max: 2000 },
      { key: 'recoveryDecision', label: 'Quyết định khắc phục', kind: 'select', options: recoveryDecisionOptions },
      { key: 'evidenceReference', label: 'Tham chiếu bằng chứng (ảnh/video hiện trường)', optional: true, max: 500 },
    ],
    run: v => api.failFlight(token, farmId, missionId, {
      expectedMissionVersion: version, reason: text(v, 'reason'), incidentIdempotencyKey,
      incidentType: v.incidentType as IncidentType, incidentOutcome: text(v, 'incidentOutcome'),
      recoveryDecision: v.recoveryDecision as RecoveryDecision, evidenceReference: text(v, 'evidenceReference') || null,
    }).then(update),
  }
}
function rescheduleAction(token: string, farmId: string, missionId: string, version: number, update: (m: MissionResponse) => void): Action {
  return {
    title: 'Đổi lịch bay',
    description: 'Checklist preflight cũ sẽ hết hiệu lực; cần lấy checklist và hoàn tất lại trước khi bắt đầu bay.',
    fields: [
      { key: 'scheduledDate', label: 'Ngày bay mới', kind: 'date' },
      { key: 'replacementDroneId', label: 'Drone thay thế (dán ID Drone, để trống nếu giữ Drone hiện tại)', optional: true, max: 100 },
    ],
    run: v => api.rescheduleMission(token, farmId, missionId, {
      expectedVersion: version, scheduledDate: text(v, 'scheduledDate'), replacementDroneId: text(v, 'replacementDroneId') || undefined,
    }).then(update),
  }
}

function PreflightChecklistPanel({ token, farmId, missionId, version, onDone }: {
  token: string; farmId: string; missionId: string; version: number; onDone: (mission: MissionResponse) => void
}) {
  const [form] = Form.useForm<Record<string, boolean | string>>()
  const opRef = useRef<{ payload: string; key: string } | null>(null)
  const checklist = useQuery({ queryKey: ['active-checklist', farmId, missionId], queryFn: ({ signal }) => getActiveChecklist(token, farmId, missionId, signal) })
  const mutation = useMutation({
    retry: false,
    mutationFn: (values: Record<string, boolean | string>) => {
      if (!checklist.data) throw new Error('Chưa tải được checklist. Tải lại trước khi gửi.')
      const answers = Object.fromEntries(checklist.data.items.map(item => [item.key, Boolean(values[item.key])]))
      const body = {
        expectedMissionVersion: version, checklistDefinitionId: checklist.data.definitionId, checklistVersion: checklist.data.versionNumber,
        answers, suitableForFlight: Boolean(values.suitableForFlight), notes: (values.notes as string | undefined)?.trim() || null,
        deviceCompletedAt: new Date().toISOString(),
      }
      opRef.current = operationFor(opRef.current, body)
      return api.completePreflight(token, farmId, missionId, { ...body, idempotencyKey: opRef.current.key })
    },
    onSuccess: result => onDone(result.mission),
  })
  if (checklist.isPending) return <CommonState type="loading" />
  if (checklist.isError) return <CommonState type="error" description={workflowError(checklist.error)} retry={() => checklist.refetch()} />
  return <Form form={form} layout="vertical" disabled={mutation.isPending} onFinish={values => mutation.mutate(values)}>
    {checklist.data.items.map(item => <Form.Item key={item.key} name={item.key} valuePropName="checked" initialValue={false}>
      <Checkbox>{item.prompt}{item.required ? ' *' : ''}</Checkbox>
    </Form.Item>)}
    <Form.Item name="suitableForFlight" valuePropName="checked" initialValue={false}>
      <Checkbox>Đủ điều kiện bay (chỉ chọn khi mọi điều kiện bắt buộc đã đạt)</Checkbox>
    </Form.Item>
    <Form.Item name="notes" label="Ghi chú (không bắt buộc)"><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
    <Button type="primary" htmlType="submit" loading={mutation.isPending}>Hoàn tất checklist</Button>
    {mutation.isError ? <Alert className="workflow-notice" type="error" showIcon title={workflowError(mutation.error)} /> : null}
  </Form>
}

export function MissionWorkspacePage() {
  const token = useAuth().session!.accessToken
  const { orderId = '', missionId = '' } = useParams()
  const location = useLocation()
  const client = useQueryClient()
  const initial = isPreparedMission(location.state) && location.state.missionId === missionId ? location.state : null
  const [snapshot, setSnapshot] = useState<PreparedMission | null>(initial)
  const [action, setAction] = useState<Action | null>(null)
  const orderQuery = useQuery({ queryKey: ['manager-order-context', orderId], queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal), enabled: Boolean(orderId) })
  const versionMutation = useMutation({ mutationFn: (farmId: string) => api.getMissionVersion(token, farmId, missionId) })

  const back = <Link className="back-link" to={`/manager/orders/${encodeURIComponent(orderId)}`}><ArrowLeftOutlined /> Quay lại đơn khảo sát</Link>
  if (orderQuery.isPending) return <>{back}<CommonState type="loading" /></>
  if (orderQuery.isError) return <>{back}<CommonState type="error" description={workflowError(orderQuery.error)} retry={() => orderQuery.refetch()} /></>
  if (!orderQuery.data) return <>{back}<CommonState type="forbidden" description="Đơn không còn thuộc các nông trại bạn đang được phân công." /></>
  if (!snapshot) return <>{back}<CommonState type="empty" title="Chưa có dữ liệu Mission trong phiên này"
    description="BE chưa có API đọc lại thông tin Mission theo ID. Hãy quay lại trang đơn khảo sát và bấm lại 'Chuẩn bị Mission bay' (dùng đúng Drone và ngày đã dùng trước đó) để nạp lại Mission này." /></>

  const farmId = orderQuery.data.farmId
  function update(mission: MissionResponse) {
    const next = toSnapshot(mission)
    setSnapshot(next)
    patchMissionSetCache(client, orderId, next)
  }
  const status = snapshot.status
  const canPreflight = status === 'Draft' || status === 'Scheduled'
  const canStart = status === 'Scheduled'
  const canCompleteFlight = status === 'InFlight'
  const canFailFlight = status === 'InFlight'
  const canCancel = status === 'Draft' || status === 'Scheduled'
  const canReschedule = status === 'Scheduled' || status === 'FlightFailed'

  return <>
    {back}
    <section className="resource-page-heading">
      <div><span className="page-kicker">{missionPurposeLabels[snapshot.purpose] ?? snapshot.purpose}</span><h1>Vận hành Mission</h1><p>{orderQuery.data.orderNumber} · {orderQuery.data.farmName}</p></div>
      <Button icon={<ReloadOutlined />} loading={versionMutation.isPending} onClick={() => { versionMutation.mutate(farmId, { onSuccess: result => setSnapshot(previous => previous ? { ...previous, version: result.version } : previous) }) }}>Làm mới phiên bản</Button>
    </section>
    <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>Tổng quan</strong><span>Trạng thái hiện tại theo dữ liệu đã nhận gần nhất.</span></div><Tag>{missionStatusLabels[status] ?? status}</Tag></div>
      <dl className="detail-list">
        <div><dt>Mission ID</dt><dd><code>{snapshot.missionId}</code></dd></div>
        <div><dt>Phiên bản</dt><dd>{snapshot.version}</dd></div>
        <div><dt>Lịch bay</dt><dd>{snapshot.scheduledAt ? `${new Date(snapshot.scheduledAt).toLocaleString('vi-VN')} – ${snapshot.scheduledEndAt ? new Date(snapshot.scheduledEndAt).toLocaleString('vi-VN') : ''}` : 'Chưa có'}</dd></div>
      </dl>
      {versionMutation.isError ? <Alert className="workflow-notice" type="error" showIcon title={workflowError(versionMutation.error)} /> : null}
    </section>

    {canPreflight ? <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Checklist trước bay</strong><span>Điều kiện bắt buộc được đánh dấu *.</span></div></div>
      <PreflightChecklistPanel token={token} farmId={farmId} missionId={missionId} version={snapshot.version} onDone={update} />
    </section> : null}

    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Vòng đời chuyến bay</strong><span>Mỗi thao tác kiểm tra lại điều kiện phía server trước khi đổi trạng thái.</span></div></div>
      <Space wrap>
        {canStart ? <Button type="primary" onClick={() => setAction(startAction(token, farmId, missionId, snapshot.version, update))}>Bắt đầu bay</Button> : null}
        {canCompleteFlight ? <Button type="primary" onClick={() => setAction(completeFlightAction(token, farmId, missionId, snapshot.version, update))}>Hoàn tất chuyến bay</Button> : null}
        {canFailFlight ? <Button danger onClick={() => setAction(failFlightAction(token, farmId, missionId, snapshot.version, update))}>Báo lỗi chuyến bay</Button> : null}
        {canReschedule ? <Button onClick={() => setAction(rescheduleAction(token, farmId, missionId, snapshot.version, update))}>Đổi lịch bay</Button> : null}
        {canCancel ? <Button danger onClick={() => setAction(cancelAction(token, farmId, missionId, snapshot.version, update))}>Hủy Mission</Button> : null}
      </Space>
      {!canStart && !canCompleteFlight && !canFailFlight && !canCancel && !canReschedule
        ? <Alert className="workflow-notice" type="info" showIcon title="Không có thao tác vòng đời chuyến bay phù hợp với trạng thái hiện tại." /> : null}
    </section>

    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
