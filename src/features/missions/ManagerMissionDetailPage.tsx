import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Checkbox, Form, Input, Space, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { operationFor } from '../surveys/workflow'
import * as api from './missionApi'
import type { MissionDetail } from './missionTypes'
import { dateTime, missionError, missionPurposeLabel, missionStatusLabel } from './missionWorkflow'
import { RescheduleMissionModal } from './RescheduleMissionModal'

const incidentTypeOptions = [
  { value: 'SIGNAL_LOSS', label: 'Mất tín hiệu điều khiển' },
  { value: 'LOW_BATTERY', label: 'Pin yếu' },
  { value: 'INTERRUPTION', label: 'Gián đoạn khác' },
  { value: 'FLIGHT_FAILURE', label: 'Lỗi chuyến bay' },
]
const recoveryDecisionOptions = [
  { value: 'ABORT', label: 'Hủy, không bay lại' },
  { value: 'RESCHEDULE_REQUIRED', label: 'Cần lên lịch lại' },
]

export function ManagerMissionDetailPage() {
  const { message } = App.useApp()
  const token = useAuth().session!.accessToken
  const { farmId = '', missionId = '' } = useParams()
  const client = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [suitableForFlight, setSuitableForFlight] = useState(true)
  const [notes, setNotes] = useState('')
  const [operation, setOperation] = useState<{ payload: string; key: string } | null>(null)
  // Tracks the freshest Mission snapshot across preflight/start/complete-flight/cancel/fail/reschedule responses, overriding the list-based fetch below.
  const [latest, setLatest] = useState<MissionDetail | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [rescheduling, setRescheduling] = useState(false)

  const missionQuery = useQuery({ queryKey: ['mission-detail', farmId, missionId], queryFn: ({ signal }) => api.findMissionById(token, farmId, missionId, signal) })
  const mission = missionQuery.data
  const status = latest?.status ?? mission?.status
  const version = latest?.version ?? mission?.version
  const draft = status === 'DRAFT'
  const scheduled = status === 'SCHEDULED'
  const inFlight = status === 'IN_FLIGHT'
  const flightFailed = status === 'FLIGHT_FAILED'
  const preflightDone = Boolean(latest?.preflightConfirmedAt)
  const droneQuery = useQuery({ queryKey: ['mission-drone', farmId, mission?.droneId], queryFn: ({ signal }) => api.getFarmDroneDetails(token, farmId, mission!.droneId, signal), enabled: Boolean(mission) })
  const checklistQuery = useQuery({ queryKey: ['mission-checklist', farmId, missionId], queryFn: ({ signal }) => api.getActivePreflightChecklist(token, farmId, missionId, signal), enabled: scheduled && !preflightDone })
  const currentAnswers = checklistQuery.data ? { ...Object.fromEntries(checklistQuery.data.items.map(item => [item.key, true])), ...answers } : answers

  async function refreshAfter(mission: MissionDetail) {
    setLatest(mission)
    await client.invalidateQueries({ queryKey: ['mission-detail', farmId, missionId] })
  }

  const preflightMutation = useMutation({
    mutationFn: async () => {
      if (!mission || !checklistQuery.data || version === undefined) throw new Error('Chưa tải đủ dữ liệu nhiệm vụ hoặc checklist.')
      if (suitableForFlight && Object.values(currentAnswers).some(value => value === false)) throw new Error('Không thể đánh dấu phù hợp để bay khi còn câu trả lời "Không".')
      const body = { expectedMissionVersion: version, checklistDefinitionId: checklistQuery.data.definitionId, checklistVersion: checklistQuery.data.versionNumber, answers: currentAnswers, suitableForFlight, notes: notes.trim() || null, deviceCompletedAt: new Date().toISOString() }
      const next = operationFor(operation, body)
      setOperation(next)
      return api.completeMissionPreflight(token, farmId, missionId, body, next.key)
    },
    onSuccess: async data => { await refreshAfter(data.mission); void message.success(data.reusedOperation ? 'Checklist đã được ghi nhận từ trước.' : 'Đã hoàn tất checklist preflight.') },
  })
  const startMutation = useMutation({
    mutationFn: () => { if (version === undefined) throw new Error('Chưa tải được phiên bản nhiệm vụ.'); return api.startMission(token, farmId, missionId, version) },
    onSuccess: async data => { await refreshAfter(data); void message.success('Đã bắt đầu chuyến bay.') },
  })
  const completeFlightMutation = useMutation({
    mutationFn: () => { if (version === undefined) throw new Error('Chưa tải được phiên bản nhiệm vụ.'); return api.completeFlightMission(token, farmId, missionId, version) },
    onSuccess: async data => { await refreshAfter(data); void message.success('Đã ghi nhận kết thúc chuyến bay.') },
  })

  function cancelAction(): Action {
    return {
      title: 'Hủy nhiệm vụ bay', danger: true,
      description: 'Chỉ hủy được khi nhiệm vụ còn ở trạng thái Bản nháp hoặc Đã lên lịch.',
      fields: [{ key: 'reason', label: 'Lý do', kind: 'multiline', max: 1000 }],
      run: async values => { const result = await api.cancelMission(token, farmId, missionId, version!, text(values, 'reason')); await refreshAfter(result) },
      success: 'Đã hủy nhiệm vụ bay.',
    }
  }
  function failFlightAction(): Action {
    const key = crypto.randomUUID()
    return {
      title: 'Báo lỗi chuyến bay', danger: true,
      description: 'Ghi nhận sự cố khi nhiệm vụ đang bay. Drone sẽ chuyển sang bảo trì.',
      fields: [
        { key: 'reason', label: 'Lý do', kind: 'multiline', max: 1000 },
        { key: 'incidentType', label: 'Loại sự cố', kind: 'select', options: incidentTypeOptions },
        { key: 'incidentOutcome', label: 'Kết quả xử lý', kind: 'multiline', max: 1000 },
        { key: 'recoveryDecision', label: 'Quyết định khắc phục', kind: 'select', options: recoveryDecisionOptions },
        { key: 'evidenceReference', label: 'Tham chiếu bằng chứng', max: 500 },
      ],
      run: async values => {
        const result = await api.failFlightMission(token, farmId, missionId, {
          expectedMissionVersion: version!, reason: text(values, 'reason'), incidentType: values.incidentType,
          incidentOutcome: text(values, 'incidentOutcome'), recoveryDecision: values.recoveryDecision, evidenceReference: text(values, 'evidenceReference'),
        }, key)
        await refreshAfter(result)
      },
      success: 'Đã ghi nhận chuyến bay lỗi.',
    }
  }

  const back = <Link className="back-link" to="/manager/orders"><ArrowLeftOutlined /> Đơn khảo sát được giao</Link>
  if (missionQuery.isPending) return <>{back}<CommonState type="loading" /></>
  if (missionQuery.isError) return <>{back}<CommonState type="error" description={missionError(missionQuery.error)} retry={() => missionQuery.refetch()} /></>
  if (!mission) return <>{back}<CommonState type="forbidden" description="Nhiệm vụ bay không còn trong phạm vi được phân công." /></>

  return <>
    {back}
    <section className="resource-page-heading">
      <div><span className="page-kicker">NHIỆM VỤ BAY</span><h1>{mission.missionCode}</h1>{latest?.purpose ? <p>{missionPurposeLabel(latest.purpose)}</p> : null}</div>
      <Space wrap><Tag color="blue">{missionStatusLabel(status ?? mission.status)}</Tag><Button icon={<ReloadOutlined />} onClick={() => { void missionQuery.refetch(); void checklistQuery.refetch() }}>Tải lại</Button></Space>
    </section>
    <section className="resource-panel">
      <dl className="detail-list">
        <div><dt>Drone</dt><dd>{droneQuery.data ? `${droneQuery.data.name} · ${droneQuery.data.code}` : mission.droneId}</dd></div>
        <div><dt>Lịch bay</dt><dd>{mission.scheduledAt ? `${dateTime(mission.scheduledAt)} – ${dateTime(mission.scheduledEndAt)}` : 'Chưa lên lịch'}</dd></div>
        <div><dt>Phiên bản</dt><dd>v{version}</dd></div>
      </dl>
    </section>
    {!draft && !scheduled && !inFlight && !flightFailed ? <Alert className="workflow-notice" type="info" showIcon message={`Nhiệm vụ đang ở trạng thái "${missionStatusLabel(status ?? mission.status)}", không ở bước có thao tác trong phạm vi đã triển khai.`} /> : null}
    {flightFailed ? <Alert className="workflow-notice" type="warning" showIcon message="Chuyến bay trước đã lỗi." description="Chỉ lên lịch lại được nếu quyết định khắc phục khi báo lỗi là &quot;Cần lên lịch lại&quot;." /> : null}
    {draft || scheduled || inFlight || flightFailed ? <section className="resource-panel">
      <h2>Thao tác khác</h2>
      <Space wrap>
        {draft || scheduled ? <Button danger onClick={() => setAction(cancelAction())}>Hủy nhiệm vụ</Button> : null}
        {scheduled || flightFailed ? <Button onClick={() => setRescheduling(true)}>Lên lịch lại</Button> : null}
        {inFlight ? <Button danger onClick={() => setAction(failFlightAction())}>Báo lỗi chuyến bay</Button> : null}
      </Space>
    </section> : null}
    {scheduled ? <section className="resource-panel">
      {preflightDone ? <Alert type="success" showIcon message="Đã hoàn tất checklist preflight." description={`Phù hợp để bay: ${latest?.preflightSuitableForFlight ? 'Có' : 'Không'}.`} />
        : checklistQuery.isPending ? <CommonState type="loading" />
        : checklistQuery.isError ? <CommonState type="error" description={missionError(checklistQuery.error)} retry={() => checklistQuery.refetch()} />
        : checklistQuery.data ? <>
          <h2>Checklist trước khi bay · v{checklistQuery.data.versionNumber}</h2>
          <Form layout="vertical">
            <fieldset className="workflow-checklist">
              <legend>Các điều kiện cần đạt</legend>
              {checklistQuery.data.items.map(item => <Form.Item key={item.key}>
                <Checkbox checked={currentAnswers[item.key] === true} disabled={preflightMutation.isPending} onChange={event => setAnswers(previous => ({ ...previous, [item.key]: event.target.checked }))}>
                  {item.prompt}{item.required ? ' *' : ''}
                </Checkbox>
              </Form.Item>)}
            </fieldset>
            <Form.Item label="Ghi chú (không bắt buộc)"><Input.TextArea rows={3} disabled={preflightMutation.isPending} value={notes} onChange={event => setNotes(event.target.value)} /></Form.Item>
            <Form.Item><Checkbox checked={suitableForFlight} disabled={preflightMutation.isPending} onChange={event => setSuitableForFlight(event.target.checked)}>Phù hợp để bay</Checkbox></Form.Item>
          </Form>
          <p className="form-hint">* là điều kiện bắt buộc.</p>
          {preflightMutation.error ? <Alert type="error" showIcon message={missionError(preflightMutation.error)} /> : null}
          <Button type="primary" loading={preflightMutation.isPending} onClick={() => preflightMutation.mutate()}>Hoàn tất checklist</Button>
        </> : null}
    </section> : null}
    {scheduled ? <section className="resource-panel">
      <h2>Bắt đầu bay</h2>
      <p className="form-hint">Chỉ bắt đầu được trong khung giờ đã lên lịch và lịch hẹn Owner đã xác nhận, sau khi checklist preflight đã hoàn tất với kết quả phù hợp để bay.</p>
      {startMutation.error ? <Alert type="error" showIcon message={missionError(startMutation.error)} /> : null}
      <Button type="primary" loading={startMutation.isPending} onClick={() => startMutation.mutate()}>Bắt đầu bay</Button>
    </section> : null}
    {inFlight ? <section className="resource-panel">
      <h2>Kết thúc chuyến bay</h2>
      <p className="form-hint">Xác nhận chuyến bay đã kết thúc an toàn. Upload ảnh và dữ liệu bay được thực hiện ở bước riêng sau khi kết thúc.</p>
      {completeFlightMutation.error ? <Alert type="error" showIcon message={missionError(completeFlightMutation.error)} /> : null}
      <Button type="primary" loading={completeFlightMutation.isPending} onClick={() => completeFlightMutation.mutate()}>Kết thúc chuyến bay</Button>
    </section> : null}
    {rescheduling && version !== undefined ? <RescheduleMissionModal token={token} farmId={farmId} missionId={missionId} currentVersion={version} currentDroneId={mission.droneId}
      close={() => setRescheduling(false)} onRescheduled={async result => { await refreshAfter(result); void message.success('Đã lên lịch lại nhiệm vụ bay.') }} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
