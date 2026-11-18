import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Space, Tag } from 'antd'
import { useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { approveHealthResult, getHealthPublication, MAX_REVIEW_REASON_LENGTH, publishHealthResult } from './healthReviewApi'
import type { HealthApproval, HealthPublishResult, HealthReviewSummary } from './healthReviewTypes'
import { conclusionLabels, expectedConclusion, healthReviewError, isStaleReleaseError, nextStepAfterPublish, releaseStage } from './healthReviewWorkflow'
import { orderStatusLabels } from './orderWorkflow'
import { dateTime, operationFor } from './workflow'

// Giai đoạn 3 — phê duyệt rồi phát hành kết quả Plant Health của đơn (contract: docs/plant-health-review-phase3-2026-11-17.md).
type Props = {
  token: string; orderId: string; orderStatus: string; summary: HealthReviewSummary
  approval: HealthApproval | null; refresh: () => Promise<void>
}

function ErrorAlert({ error }: { error: Error }) {
  return <Alert type="error" showIcon title={healthReviewError(error)}
    description={error instanceof ApiError ? <>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code>{error.traceId ? <> · Mã tra cứu: <code>{error.traceId}</code></> : null}</> : undefined} />
}

export function HealthReleasePanel({ token, orderId, orderStatus, summary, approval, refresh }: Props) {
  const [dialog, setDialog] = useState<'approve' | 'publish' | null>(null)
  // Kết quả phát hành chỉ có trong phiên; sau khi tải lại thì dựa vào trạng thái đơn + GET publication (chỉ đơn COMPLETED).
  const [published, setPublished] = useState<HealthPublishResult | null>(null)
  const stage = releaseStage(orderStatus, summary, approval)
  const publication = useQuery({
    queryKey: ['health-publication', orderId], queryFn: ({ signal }) => getHealthPublication(token, orderId, signal),
    enabled: stage === 'published' && orderStatus === 'COMPLETED', retry: false,
  })

  async function closeDialog(reload: boolean) { setDialog(null); if (reload) await refresh() }

  let body: ReactNode
  if (stage === 'blocked') body = <Alert className="workflow-notice" type="info" showIcon title="Chưa thể phê duyệt"
    description={orderStatus !== 'PENDING_REVIEW' ? `Đơn đang ở trạng thái ${orderStatusLabels[orderStatus] ?? orderStatus}, không còn chờ duyệt kết quả.` : 'Xử lý hết các mục còn chặn ở phần Tiến độ kiểm duyệt rồi mới phê duyệt được.'} />
  else if (stage === 'ready') body = <>
    <p className="form-hint">Phê duyệt chốt toàn bộ quyết định review hiện tại. Sau khi phê duyệt sẽ <strong>không sửa review được nữa</strong>; kết quả chưa hiện cho chủ nông trại cho tới khi phát hành.</p>
    <dl className="detail-list">
      <div><dt>Phát hiện nghi bệnh đã xác nhận</dt><dd>{summary.acceptedFindings}</dd></div>
      <div><dt>Kết luận dự kiến</dt><dd>{conclusionLabels[expectedConclusion(summary.acceptedFindings)]}</dd></div>
    </dl>
    <Button type="primary" onClick={() => setDialog('approve')}>Phê duyệt kết quả</Button>
  </>
  else {
    const info = approval ? <dl className="detail-list">
      <div><dt>Kết luận</dt><dd>{conclusionLabels[approval.conclusion] ?? approval.conclusion}</dd></div>
      <div><dt>Phát hiện đã xác nhận</dt><dd>{approval.acceptedFindingCount}</dd></div>
      <div><dt>Phê duyệt lúc</dt><dd>{dateTime(approval.reviewedAt)}</dd></div>
      <div><dt>Mã xác thực</dt><dd><code>{approval.approvalFingerprint.slice(0, 12)}…</code></dd></div>
    </dl> : null
    if (stage === 'approved') body = <>
      {info}
      <p className="form-hint">Phát hành ghi kết quả chính thức cho đơn. Đơn thường sẽ hoàn tất và chủ nông trại được thông báo; đơn thanh toán sau bay chuyển sang bước chốt giá, chủ nông trại chỉ xem được sau khi trả phần còn lại.</p>
      <Button type="primary" disabled={orderStatus !== 'PENDING_REVIEW'} onClick={() => setDialog('publish')}>Phát hành kết quả</Button>
    </>
    else {
      const status = published?.orderStatus ?? orderStatus
      const next = nextStepAfterPublish(status)
      const pub = publication.data?.publication
      body = <>
        {info}
        {published ? <dl className="detail-list">
          <div><dt>Phiên bản phát hành</dt><dd>{published.publicationVersion}</dd></div>
          <div><dt>Phát hiện / vùng bệnh đã phát hành</dt><dd>{published.publishedFindingCount} / {published.publishedZoneCount}</dd></div>
          <div><dt>Phát hành lúc</dt><dd>{dateTime(published.publishedAt)}</dd></div>
        </dl> : pub ? <dl className="detail-list">
          <div><dt>Phiên bản phát hành</dt><dd>{pub.publicationVersion}</dd></div>
          <div><dt>Phát hiện / vùng bệnh đã phát hành</dt><dd>{pub.findings.length} / {pub.diseaseZones.length}</dd></div>
          <div><dt>Phát hành lúc</dt><dd>{dateTime(pub.publishedAt)}</dd></div>
        </dl> : publication.isFetching ? <CommonState type="loading" title="Đang tải bản phát hành" />
          : publication.isError ? <ErrorAlert error={publication.error} /> : null}
        {next ? <Alert className="workflow-notice" type="success" showIcon title="Đã phát hành kết quả" description={next} /> : null}
      </>
    }
  }

  const tag = stage === 'published' ? <Tag color="success">Đã phát hành</Tag> : stage === 'approved' ? <Tag color="processing">Đã phê duyệt</Tag>
    : stage === 'ready' ? <Tag color="success">Sẵn sàng phê duyệt</Tag> : <Tag>Chưa phê duyệt</Tag>
  return <section className="resource-panel">
    <div className="resource-panel-heading"><div><strong>Phê duyệt &amp; phát hành</strong><span>Giai đoạn 3 · phiên bản kết quả {approval?.resultVersion ?? summary.resultVersion}</span></div>{tag}</div>
    {body}
    {dialog === 'approve' ? <ApproveModal token={token} orderId={orderId} summary={summary} close={closeDialog} /> : null}
    {dialog === 'publish' && approval ? <PublishModal token={token} orderId={orderId} approval={approval} close={closeDialog}
      done={async result => { setPublished(result); setDialog(null); await refresh() }} /> : null}
  </section>
}

function useOnce() {
  const busy = useRef(false)
  return { start: () => { if (busy.current) return false; busy.current = true; return true }, end: () => { busy.current = false } }
}

function ApproveModal({ token, orderId, summary, close }: { token: string; orderId: string; summary: HealthReviewSummary; close: (reload: boolean) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const once = useOnce()
  const operation = useRef<{ payload: string; key: string } | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const body = { batchId: summary.batchId, expectedResultVersion: summary.resultVersion, expectedReviewRevision: summary.reviewRevision, reason: reason.trim() }
      operation.current = operationFor(operation.current, body)
      return approveHealthResult(token, orderId, { ...body, operationId: operation.current.key })
    },
    onSuccess: () => close(true),
    onSettled: once.end,
  })
  const stale = isStaleReleaseError(mutation.error)
  const blocked = mutation.isPending || stale
  const invalid = reason.trim().length === 0
  function submit() { if (!blocked && !invalid && once.start()) mutation.mutate() }
  return <Modal open title="Phê duyệt kết quả sức khỏe cây" okText="Phê duyệt" cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ disabled: blocked || invalid }} confirmLoading={mutation.isPending} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={submit} onCancel={() => { if (!mutation.isPending) void close(stale) }}>
    <Alert className="workflow-notice" type="warning" showIcon title="Không thể hoàn tác" description="Sau khi phê duyệt, mọi quyết định review bị khóa. Muốn sửa phải làm lại từ lô nhận diện mới." />
    <Space orientation="vertical" size={4}>
      <span>Phát hiện nghi bệnh đã xác nhận: <strong>{summary.acceptedFindings}</strong></span>
      <span>Bác bỏ / không phải bệnh: <strong>{summary.rejectedFindings} / {summary.nonDiseaseFindings}</strong></span>
      <span>Kết luận: <strong>{conclusionLabels[expectedConclusion(summary.acceptedFindings)]}</strong></span>
    </Space>
    <Form layout="vertical" disabled={blocked} onFinish={submit} style={{ marginTop: 12 }}>
      <Form.Item label="Lý do phê duyệt" required extra={`${reason.length}/${MAX_REVIEW_REASON_LENGTH} ký tự.`}>
        <Input.TextArea rows={3} maxLength={MAX_REVIEW_REASON_LENGTH} value={reason} onChange={event => setReason(event.target.value)} autoFocus />
      </Form.Item>
    </Form>
    {mutation.error ? <ErrorAlert error={mutation.error} /> : null}
  </Modal>
}

function PublishModal({ token, orderId, approval, close, done }: {
  token: string; orderId: string; approval: HealthApproval; close: (reload: boolean) => Promise<void>; done: (result: HealthPublishResult) => Promise<void>
}) {
  const once = useOnce()
  const operation = useRef<{ payload: string; key: string } | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const body = { batchId: approval.batchId, expectedResultVersion: approval.resultVersion, expectedReviewRevision: approval.approvedReviewRevision, approvalFingerprint: approval.approvalFingerprint }
      operation.current = operationFor(operation.current, body)
      return publishHealthResult(token, orderId, { ...body, operationId: operation.current.key })
    },
    onSuccess: done,
    onSettled: once.end,
  })
  const stale = isStaleReleaseError(mutation.error)
  const blocked = mutation.isPending || stale
  return <Modal open title="Phát hành kết quả sức khỏe cây" okText="Phát hành" cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ disabled: blocked }} confirmLoading={mutation.isPending} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={() => { if (!blocked && once.start()) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) void close(stale) }}>
    <p>Phát hành bản đã phê duyệt lúc {dateTime(approval.reviewedAt)} · {approval.acceptedFindingCount} phát hiện đã xác nhận.</p>
    <ul className="form-hint" style={{ paddingLeft: 18 }}>
      <li>Đơn thường: đơn chuyển sang Hoàn tất, chủ nông trại được thông báo và xem được kết quả.</li>
      <li>Đơn thanh toán sau bay: đơn chuyển sang bước chốt giá; chủ nông trại chỉ xem được kết quả sau khi thanh toán phần còn lại.</li>
    </ul>
    {mutation.error ? <ErrorAlert error={mutation.error} /> : null}
  </Modal>
}
