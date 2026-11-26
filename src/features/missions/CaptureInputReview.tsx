import { ReloadOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, App, Button, Input, Modal, Space } from 'antd'
import { useRef, useState } from 'react'
import { ownerGuid, validOwnerVersion } from '../surveys/ownerOrderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from '../surveys/SurveyMutationError'
import { approveCaptureInput, reopenCaptureInput } from '../surveys/v3Api'
import type { V3CaptureAttempt } from '../surveys/v3Types'
import { v3OperationFor, type V3Operation } from '../surveys/v3Workflow'

type ReviewAction = 'reopen' | 'approve'

export function CaptureInputReview({ token, orderId, orderVersion, attempt, refreshing, refresh, onReopened }: {
  token: string
  orderId: string
  orderVersion: number
  attempt: V3CaptureAttempt
  refreshing: boolean
  refresh: () => Promise<void>
  onReopened: () => void
}) {
  const { message } = App.useApp()
  const [dialog, setDialog] = useState<{ action: ReviewAction; snapshot: string } | null>(null)
  const [comment, setComment] = useState('')
  const operation = useRef<V3Operation | null>(null)
  const submitting = useRef(false)
  const { captureAttemptId, version, manifestId, manifestFingerprint, processingJobId } = attempt
  const snapshot = JSON.stringify([orderId, orderVersion, captureAttemptId, version, manifestId, manifestFingerprint, processingJobId])
  const snapshotChanged = !!dialog && dialog.snapshot !== snapshot
  const canReopen = !!manifestId && ownerGuid(manifestId) && validOwnerVersion(orderVersion) &&
    attempt.orderVersion === orderVersion && validOwnerVersion(version)
  const canApprove = canReopen && !!manifestFingerprint?.trim() && !!processingJobId && ownerGuid(processingJobId)

  const review = useMutation({
    retry: false,
    mutationFn: async (action: ReviewAction) => {
      if (refreshing || snapshotChanged || !canReopen || !manifestId) throw new Error('Bộ dữ liệu vừa thay đổi. Tải lại trước khi tiếp tục.')
      const base = { manifestId, expectedOrderVersion: orderVersion, expectedAttemptVersion: version }
      const note = comment.trim()
      if (action === 'reopen') {
        if (!note || note.length > 500) throw new Error('Nhập lý do mở lại từ 1 đến 500 ký tự.')
        const body = { ...base, reason: note }
        const next = await v3OperationFor(operation.current, body)
        operation.current = next
        const result = await reopenCaptureInput(token, orderId, captureAttemptId, {
          ...body, operationId: next.operationId, payloadFingerprint: next.payloadFingerprint,
        })
        if (!result.success || result.attemptId !== captureAttemptId || result.missionId !== attempt.missionId ||
            result.supersededManifestId !== manifestId) {
          throw new Error('Máy chủ chưa xác nhận mở lại bộ dữ liệu này.')
        }
      } else {
        if (!canApprove || !manifestFingerprint || !processingJobId) throw new Error('Thiếu thông tin cần thiết để duyệt bộ dữ liệu.')
        const body = { ...base, manifestFingerprint, processingJobId, ...(note ? { notes: note } : {}) }
        const next = await v3OperationFor(operation.current, body)
        operation.current = next
        const result = await approveCaptureInput(token, orderId, captureAttemptId, {
          ...body, operationId: next.operationId, payloadFingerprint: next.payloadFingerprint,
        })
        if (!result.success || result.attemptId !== captureAttemptId || !ownerGuid(result.approvalId)) {
          throw new Error('Máy chủ chưa xác nhận duyệt bộ dữ liệu này.')
        }
      }
      return action
    },
    onSuccess: async action => {
      if (action === 'reopen') onReopened()
      setDialog(null)
      await refresh()
      void message.success(action === 'reopen' ? 'Đã mở lại bộ dữ liệu.' : 'Đã duyệt bộ dữ liệu đầu vào.')
    },
    onSettled: () => { submitting.current = false },
  })

  function open(action: ReviewAction) {
    setComment('')
    review.reset()
    setDialog({ action, snapshot })
  }

  const reopening = dialog?.action === 'reopen'
  const label = reopening ? 'Mở lại bộ dữ liệu' : 'Duyệt bộ dữ liệu'
  const busy = refreshing || review.isPending
  const reloadNeeded = snapshotChanged || mutationNeedsReload(review.error)

  return <>
    {!canReopen && !refreshing ? <Alert showIcon type="warning" title="Chưa xác nhận được bộ dữ liệu hiện hành. Kiểm tra lại để tiếp tục." /> : null}
    {canReopen && !canApprove ? <Alert showIcon type="warning" title="Bộ dữ liệu chưa có đủ thông tin để duyệt."
      description="Hãy mở lại bộ dữ liệu, kiểm tra telemetry Blackbox và chốt lại." /> : null}
    <Space wrap>
      <Button icon={<ReloadOutlined />} loading={refreshing} disabled={review.isPending} onClick={() => { void refresh() }}>Kiểm tra lại</Button>
      <Button disabled={busy || !canReopen} onClick={() => open('reopen')}>Mở lại bộ dữ liệu</Button>
      <Button type="primary" disabled={busy || !canApprove} onClick={() => open('approve')}>Duyệt bộ dữ liệu</Button>
    </Space>
    <Modal open={!!dialog} title={label} okText={label} cancelText="Quay lại"
      confirmLoading={review.isPending} closable={!review.isPending} mask={{ closable: !review.isPending }}
      cancelButtonProps={{ disabled: review.isPending }}
      okButtonProps={{ disabled: busy || reloadNeeded || (reopening ? !canReopen || !comment.trim() : !canApprove) }}
      onCancel={() => { if (!submitting.current) setDialog(null) }}
      onOk={() => {
        if (!dialog || submitting.current || busy || reloadNeeded || (reopening ? !canReopen || !comment.trim() : !canApprove)) return
        submitting.current = true
        review.mutate(dialog.action)
      }}>
      <p>{reopening ? 'Sau khi mở lại, bạn có thể bổ sung ảnh hoặc nhập telemetry Blackbox rồi chốt lại.' : 'Kiểm tra ảnh và telemetry của bộ dữ liệu này trước khi duyệt.'}</p>
      <label htmlFor="capture-review-comment">{reopening ? 'Lý do mở lại (bắt buộc)' : 'Ghi chú (không bắt buộc)'}</label>
      <Input.TextArea id="capture-review-comment" value={comment} onChange={event => setComment(event.target.value)}
        maxLength={500} showCount disabled={review.isPending} />
      {snapshotChanged ? <Alert showIcon type="warning" title="Dữ liệu vừa thay đổi. Đóng hộp thoại và kiểm tra lại." /> : null}
      <SurveyMutationError error={review.error} />
    </Modal>
  </>
}
