import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Space } from 'antd'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAssignedOrder } from '../surveys/orderApi'
import { ownerGuid, validOwnerVersion } from '../surveys/ownerOrderWorkflow'
import { SurveyMutationError } from '../surveys/SurveyMutationError'
import { completeCaptureFlight, failCaptureFlight, getCaptureAttempts, startCaptureFlight } from '../surveys/v3Api'
import { v3OperationFor, v3ServiceKind, type V3Operation } from '../surveys/v3Workflow'
import { workflowError } from '../surveys/workflow'
import { ApiError } from '../../api/client'
import { dateTime } from './missionWorkflow'

type FlightAction = 'start' | 'complete' | 'fail'
const titles: Record<FlightAction, string> = { start: 'Bắt đầu bay', complete: 'Kết thúc chuyến bay', fail: 'Báo lỗi chuyến bay' }

export function V3CaptureFlightActions({ token, orderId, farmId, missionId, scheduled, preflightSuitable, refreshMission }: {
  token: string; orderId: string; farmId: string; missionId: string; scheduled: boolean
  preflightSuitable: boolean | null | undefined; refreshMission: () => Promise<void>
}) {
  const { message } = App.useApp()
  const client = useQueryClient()
  const [confirmation, setConfirmation] = useState<{ action: FlightAction; orderVersion: number; attemptVersion: number } | null>(null)
  const [receipt, setReceipt] = useState('')
  const [evidence, setEvidence] = useState('')
  const operation = useRef<V3Operation | null>(null)
  const submittedAt = useRef<string | null>(null)
  const submitting = useRef(false)
  const enabled = ownerGuid(orderId)
  const order = useQuery({ queryKey: ['manager-order-context', orderId], queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal), enabled, retry: false })
  const attempts = useQuery({ queryKey: ['capture-attempts', orderId], queryFn: ({ signal }) => getCaptureAttempts(token, orderId, signal), enabled, retry: false })
  const attempt = attempts.data?.find(item => item.missionId === missionId)
  const orderVersion = order.data?.orderVersion ?? 0
  const attemptVersion = attempt?.version ?? 0
  const linked = order.data?.surveyOrderId === orderId && order.data.farmId === farmId && !!v3ServiceKind(order.data.surveyServiceCode) && !!attempt && ownerGuid(attempt.captureAttemptId)
  const canStart = scheduled && preflightSuitable === true && order.data?.status === 'READY_FOR_CAPTURE' && (attempt?.status === 'PLANNED' || attempt?.status === 'PREFLIGHT_READY')
  const canEnd = !scheduled && order.data?.status === 'CAPTURING' && attempt?.status === 'IN_FLIGHT'
  const busy = order.isFetching || attempts.isFetching
  const stale = !!confirmation && (orderVersion !== confirmation.orderVersion || attemptVersion !== confirmation.attemptVersion)
  const ready = linked && !busy && !order.isError && !attempts.isError && validOwnerVersion(orderVersion) && validOwnerVersion(attemptVersion)
  async function refresh() {
    await Promise.all([order.refetch(), attempts.refetch(), refreshMission(), client.invalidateQueries({ queryKey: ['manager-order-scope', orderId] }), client.invalidateQueries({ queryKey: ['manager-orders'] })])
  }
  const mutation = useMutation({
    retry: false,
    mutationFn: async (action: FlightAction) => {
      if (!ready || stale || !attempt || (action === 'start' ? !canStart : !canEnd)) throw new Error('Đơn hoặc lần bay đã thay đổi. Tải lại trước khi tiếp tục.')
      const expected = { expectedOrderVersion: orderVersion, expectedAttemptVersion: attemptVersion }
      async function identify(body: object) {
        const next = await v3OperationFor(operation.current, body)
        operation.current = next
        return { operationId: next.operationId, payloadFingerprint: next.payloadFingerprint }
      }
      if (action === 'start') {
        const body = { ...expected, missionId }
        return startCaptureFlight(token, orderId, attempt.captureAttemptId, { ...body, ...await identify(body) })
      }
      submittedAt.current ??= new Date().toISOString()
      if (action === 'complete') {
        const body = { ...expected, endedAt: submittedAt.current, flightCompletedReceipt: receipt.trim() }
        return completeCaptureFlight(token, orderId, attempt.captureAttemptId, { ...body, ...await identify(body) })
      }
      const body = { ...expected, failedAt: submittedAt.current, failureReason: receipt.trim(), failureIncidentEvidence: evidence.trim() }
      return failCaptureFlight(token, orderId, attempt.captureAttemptId, { ...body, ...await identify(body) })
    },
    onSuccess: async (_result, action) => {
      setConfirmation(null)
      await refresh()
      void message.success(`Đã ghi nhận ${titles[action].toLowerCase()} cho lần bay.`)
    },
    onError: async error => { if (error instanceof ApiError && error.status === 409) await refresh() },
    onSettled: () => { submitting.current = false },
  })
  function open(action: FlightAction) {
    mutation.reset()
    operation.current = null
    submittedAt.current = null
    setReceipt('')
    setEvidence('')
    setConfirmation({ action, orderVersion, attemptVersion })
  }
  if (!enabled) return <Alert type="info" showIcon title="Mở nhiệm vụ từ đơn khảo sát để thực hiện chuyến bay." action={<Link to="/manager/orders">Đơn khảo sát được giao</Link>} />
  if (order.isError || attempts.isError) return <Alert type="error" showIcon title="Không tải được đơn hoặc lần bay" description={workflowError(order.error ?? attempts.error)} action={<Button onClick={() => { void refresh() }}>Tải lại</Button>} />
  if (order.isPending || attempts.isPending) return <p className="form-hint">Đang tải lần bay…</p>
  if (!linked) return <Alert type="warning" showIcon title="Nhiệm vụ không thuộc lần bay của đơn này." />
  const selected = confirmation?.action
  const validText = selected === 'start' || (receipt.trim() && (selected !== 'fail' || evidence.trim()))
  return <>
    {scheduled && preflightSuitable !== true ? <p className="form-hint">Cần checklist có kết quả phù hợp để bắt đầu bay.</p> : null}
    <Space wrap>
      {scheduled ? <Button type="primary" disabled={!ready || !canStart} onClick={() => open('start')}>{titles.start}</Button> : <>
        <Button type="primary" disabled={!ready || !canEnd} onClick={() => open('complete')}>{titles.complete}</Button>
        <Button danger disabled={!ready || !canEnd} onClick={() => open('fail')}>{titles.fail}</Button>
      </>}
    </Space>
    <Modal open={!!confirmation} title={selected ? titles[selected] : undefined} okText="Xác nhận" cancelText="Hủy"
      confirmLoading={mutation.isPending} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}
      cancelButtonProps={{ disabled: mutation.isPending }} okButtonProps={{ danger: selected === 'fail', disabled: !ready || stale || !validText || (selected === 'start' ? !canStart : !canEnd) }}
      onCancel={() => { if (!mutation.isPending) setConfirmation(null) }}
      onOk={() => {
        if (!selected || !ready || stale || !validText || submitting.current) return
        submitting.current = true
        mutation.mutate(selected)
      }}>
      {selected === 'start' ? <p>Máy chủ sẽ kiểm tra lịch hẹn, khoản cọc, drone và checklist trước khi ghi nhận bắt đầu bay.</p> : <Form layout="vertical">
        <Form.Item label={selected === 'complete' ? 'Biên nhận hoàn tất bay' : 'Lý do sự cố'} required>
          <Input.TextArea maxLength={500} value={receipt} disabled={mutation.isPending || !!submittedAt.current} onChange={event => setReceipt(event.target.value)} />
        </Form.Item>
        {selected === 'fail' ? <Form.Item label="Bằng chứng sự cố" required>
          <Input.TextArea maxLength={500} value={evidence} disabled={mutation.isPending || !!submittedAt.current} onChange={event => setEvidence(event.target.value)} />
        </Form.Item> : null}
        {submittedAt.current ? <p className="form-hint">Thời điểm ghi nhận {dateTime(submittedAt.current)}</p> : null}
      </Form>}
      {stale ? <Alert type="warning" showIcon title="Đơn hoặc lần bay đã đổi phiên bản. Mở lại thao tác để kiểm tra." /> : null}
      <SurveyMutationError error={mutation.error} />
    </Modal>
  </>
}
