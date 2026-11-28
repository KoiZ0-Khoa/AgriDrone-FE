import { ReloadOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Modal, Space } from 'antd'
import { useRef, useState } from 'react'
import { ownerGuid, validOwnerVersion } from '../surveys/ownerOrderWorkflow'
import { mutationNeedsReload, SurveyMutationError } from '../surveys/SurveyMutationError'
import { approveCaptureInput, reopenCaptureInput } from '../surveys/v3Api'
import type { V3CaptureAttempt } from '../surveys/v3Types'
import { v3OperationFor, type V3Operation } from '../surveys/v3Workflow'

type ReviewAction = 'reopen' | 'approve'

export function CaptureInputReview({ token, orderId, orderVersion, attempt, refreshing, refresh, onReopened, replaceApprovedInput = false }: {
  token: string
  orderId: string
  orderVersion: number
  attempt: V3CaptureAttempt
  refreshing: boolean
  refresh: () => Promise<void>
  onReopened: () => void
  replaceApprovedInput?: boolean
}) {
  const { message } = App.useApp()
  const [dialog, setDialog] = useState<{ action: ReviewAction; snapshot: string } | null>(null)
  const [comment, setComment] = useState('')
  const operation = useRef<V3Operation | null>(null)
  const submitting = useRef(false)
  const { captureAttemptId, version, manifestId, manifestFingerprint, processingJobId } = attempt
  const snapshot = JSON.stringify([orderId, orderVersion, captureAttemptId, version, manifestId, manifestFingerprint, processingJobId])
  const snapshotChanged = !!dialog && dialog.snapshot !== snapshot
  const hasProcessingJob = !!manifestFingerprint?.trim() && !!processingJobId && ownerGuid(processingJobId)
  const canReopen = !!manifestId && ownerGuid(manifestId) && validOwnerVersion(orderVersion) &&
    attempt.orderVersion === orderVersion && validOwnerVersion(version) &&
    (replaceApprovedInput ? attempt.status === 'PROCESSING' && hasProcessingJob : attempt.status === 'UPLOADED')
  const canApprove = !replaceApprovedInput && canReopen && hasProcessingJob

  const review = useMutation({
    retry: false,
    mutationFn: async (action: ReviewAction) => {
      if (refreshing || snapshotChanged || !canReopen || !manifestId) throw new Error('Bộ dữ liệu vừa thay đổi. Tải lại trước khi tiếp tục.')
      const base = { manifestId, expectedOrderVersion: orderVersion, expectedAttemptVersion: version }
      const note = comment.trim()
      if (action === 'reopen') {
        if (!note || note.length > 500) throw new Error('Nhập lý do mở lại từ 1 đến 500 ký tự.')
        const body = { ...base, reason: note, ...(replaceApprovedInput ? { replaceApprovedInput: true } : {}) }
        const next = await v3OperationFor(operation.current, body)
        operation.current = next
        const result = await reopenCaptureInput(token, orderId, captureAttemptId, {
          ...body, operationId: next.operationId, payloadFingerprint: next.payloadFingerprint,
        })
        if (!result.success || result.attemptId !== captureAttemptId || result.missionId !== attempt.missionId ||
            result.supersededManifestId !== manifestId ||
            (replaceApprovedInput && (!validOwnerVersion(result.version) || result.version <= version ||
              !validOwnerVersion(result.orderVersion) || result.orderVersion <= orderVersion))) {
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
      void message.success(action === 'approve' ? 'Đã duyệt bộ dữ liệu đầu vào.'
        : replaceApprovedInput ? 'Đã mở lại bước Upload & Telemetry.' : 'Đã mở lại bộ dữ liệu.')
    },
    onSettled: () => { submitting.current = false },
  })

  function open(action: ReviewAction) {
    setComment('')
    review.reset()
    setDialog({ action, snapshot })
  }

  const reopening = dialog?.action === 'reopen'
  const reopenLabel = replaceApprovedInput ? 'Quay lại Upload' : 'Mở lại bộ dữ liệu'
  const label = reopening ? reopenLabel : 'Duyệt bộ dữ liệu'
  const busy = refreshing || review.isPending
  const reloadNeeded = snapshotChanged || mutationNeedsReload(review.error)

  return <>
    {!replaceApprovedInput && !canReopen && !refreshing ? <Alert showIcon type="warning" title="Chưa xác nhận được bộ dữ liệu hiện hành. Kiểm tra lại để tiếp tục." /> : null}
    {!replaceApprovedInput && canReopen && !canApprove ? <Alert showIcon type="warning" title="Bộ dữ liệu chưa có đủ thông tin để duyệt."
      description="Hãy mở lại bộ dữ liệu, kiểm tra telemetry Blackbox và chốt lại." /> : null}
    {replaceApprovedInput ? <Button size="small" danger loading={review.isPending} disabled={busy || !canReopen}
      onClick={() => open('reopen')}>{reopenLabel}</Button> : <Space wrap>
      <Button icon={<ReloadOutlined />} loading={refreshing} disabled={review.isPending} onClick={() => { void refresh() }}>Kiểm tra lại</Button>
      <Button disabled={busy || !canReopen} onClick={() => open('reopen')}>{reopenLabel}</Button>
      <Button type="primary" disabled={busy || !canApprove} onClick={() => open('approve')}>Duyệt bộ dữ liệu</Button>
    </Space>}
    <Modal open={!!dialog} title={label} okText={label} cancelText="Quay lại"
      styles={{ footer: { paddingBlockStart: 12 } }}
      confirmLoading={review.isPending} closable={!review.isPending} mask={{ closable: !review.isPending }}
      cancelButtonProps={{ disabled: review.isPending }}
      okButtonProps={{ danger: replaceApprovedInput, disabled: busy || reloadNeeded || (reopening ? !canReopen || !comment.trim() : !canApprove) }}
      onCancel={() => { if (!submitting.current) setDialog(null) }}
      onOk={() => {
        if (!dialog || submitting.current || busy || reloadNeeded || (reopening ? !canReopen || !comment.trim() : !canApprove)) return
        submitting.current = true
        review.mutate(dialog.action)
      }}>
      <p>{replaceApprovedInput
        ? 'Ảnh và telemetry đã duyệt sẽ được lưu trong lịch sử. Bạn cần tải bộ ảnh thay thế, nhập lại telemetry Blackbox và duyệt bộ dữ liệu mới trước khi chạy nhận diện.'
        : reopening ? 'Sau khi mở lại, bạn có thể bổ sung ảnh hoặc nhập telemetry Blackbox rồi chốt lại.' : 'Kiểm tra ảnh và telemetry của bộ dữ liệu này trước khi duyệt.'}</p>
      <Form.Item layout="vertical" htmlFor="capture-review-comment"
        label={reopening ? 'Lý do mở lại (bắt buộc)' : 'Ghi chú (không bắt buộc)'}>
        <Input.TextArea id="capture-review-comment" rows={3} value={comment} onChange={event => setComment(event.target.value)}
          maxLength={500} showCount disabled={review.isPending} />
      </Form.Item>
      {snapshotChanged ? <Alert showIcon type="warning" title="Dữ liệu vừa thay đổi. Đóng hộp thoại và kiểm tra lại." /> : null}
      <SurveyMutationError error={review.error} />
    </Modal>
  </>
}
