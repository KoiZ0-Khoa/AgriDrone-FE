import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Input, Modal } from 'antd'
import { useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { MAX_REVIEW_REASON_LENGTH, reviewHealthFindings } from './healthReviewApi'
import type { HealthReviewItem, HealthReviewOutcome } from './healthReviewTypes'
import { buildFindingBatch, bulkDecisionCopy, healthReviewError, isStaleReviewError, type BulkFindingDecision, type FindingRow } from './healthReviewWorkflow'
import { operationFor } from './workflow'

type Props = {
  token: string; orderId: string; decision: BulkFindingDecision
  page: { batchId: string; resultVersion: number }; items: HealthReviewItem[]; rows: FindingRow[]
  close: (reload: boolean) => void; done: (outcome: HealthReviewOutcome) => void
}

export function FindingReviewModal({ token, orderId, decision, page, items, rows, close, done }: Props) {
  const copy = bulkDecisionCopy[decision]
  const [reason, setReason] = useState('')
  const submitting = useRef(false)
  // Giữ nguyên operationId khi gửi lại đúng nội dung cũ (BE trả replay, không ghi trùng); đổi nội dung thì sinh mã mới.
  const operation = useRef<{ payload: string; key: string } | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const signature = { decision, reason: reason.trim(), ids: items.map(item => item.id), batchId: page.batchId, resultVersion: page.resultVersion }
      operation.current = operationFor(operation.current, signature)
      return reviewHealthFindings(token, orderId, buildFindingBatch(page, items, decision, reason, operation.current.key))
    },
    onSuccess: done,
    onSettled: () => { submitting.current = false },
  })
  // Lỗi lệch phiên bản/khóa kết quả: gửi lại không có ích — chỉ cho đóng và tải lại.
  const stale = isStaleReviewError(mutation.error)
  const invalidReason = reason.trim().length === 0
  const blocked = mutation.isPending || stale
  function submit() {
    if (blocked || invalidReason || submitting.current) return
    submitting.current = true
    mutation.mutate()
  }
  return <Modal open title={`${copy.title} · ${items.length} phát hiện`} okText={copy.button} cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ danger: decision === 'Approve', disabled: blocked || invalidReason }} confirmLoading={mutation.isPending}
    cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={submit} onCancel={() => { if (!mutation.isPending) close(stale) }}>
    <p>{copy.hint}</p>
    <ul className="form-hint" style={{ maxHeight: 140, overflowY: 'auto', paddingLeft: 18 }}>
      {rows.map(row => <li key={row.id}>{row.className} · {row.plantLabel}{row.decision !== 'Pending' ? ` · hiện tại: ${row.decisionLabel}` : ''}</li>)}
    </ul>
    <Form layout="vertical" disabled={blocked} onFinish={submit}>
      <Form.Item label="Lý do" required extra={`Áp dụng chung cho cả ${items.length} phát hiện. ${reason.length}/${MAX_REVIEW_REASON_LENGTH} ký tự.`}>
        <Input.TextArea rows={3} maxLength={MAX_REVIEW_REASON_LENGTH} value={reason} onChange={event => setReason(event.target.value)} autoFocus />
      </Form.Item>
    </Form>
    {mutation.error ? <Alert type="error" showIcon title={healthReviewError(mutation.error)}
      description={mutation.error instanceof ApiError ? <>Mã lỗi: <code>{mutation.error.code ?? `HTTP ${mutation.error.status}`}</code>{mutation.error.traceId ? <> · Mã tra cứu: <code>{mutation.error.traceId}</code></> : null}</> : undefined} /> : null}
  </Modal>
}
