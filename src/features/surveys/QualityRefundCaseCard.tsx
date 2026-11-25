import { useQuery } from '@tanstack/react-query'
import { Button, Image, Modal, Space, Table, Tag } from 'antd'
import { useState, type ReactNode } from 'react'
import { CommonState } from '../../components/CommonState'
import { getRefundEvidence, refundIssueLabels, type RefundCase, type RefundCaseDetails } from './qualityRefundApi'
import { money } from './paymentWorkflow'
import { dateTime, workflowError } from './workflow'

export function refundStatusLabel(item: RefundCase) {
  if (item.status === 'SUBMITTED') return item.managerVerifiedAt ? 'Chờ Admin quyết định' : 'Chờ Manager xác minh'
  return { APPROVED: 'Đã duyệt · Chờ chuyển khoản', REJECTED: 'Đã từ chối', REFUNDED: 'Đã hoàn tiền' }[item.status]
}

export function QualityRefundCaseCard({ item, details, actions }: { item: RefundCase; details?: ReactNode; actions?: ReactNode }) {
  const findings = new Map(item.managerFindings?.map(finding => [finding.poleCode.trim().toUpperCase(), finding]))
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading">
      <div><strong>Báo sai kết quả cây</strong><span>Gửi lúc {dateTime(item.createdAt)}</span></div>
      <Tag color={item.status === 'REFUNDED' ? 'green' : item.status === 'REJECTED' ? 'red' : 'blue'}>{refundStatusLabel(item)}</Tag>
    </div>
    <p>{item.description}</p>
    <Table rowKey="poleCode" dataSource={item.issues} size="small" pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} scroll={{ x: 570 }} columns={[
      { title: 'Mã trụ', dataIndex: 'poleCode', width: 175 },
      { title: 'Owner báo', render: (_, issue) => <><strong>{refundIssueLabels[issue.issueType] ?? issue.issueType}</strong><div>{issue.details}</div></> },
      { title: 'Manager xác minh', render: (_, issue) => {
        const finding = findings.get(issue.poleCode.trim().toUpperCase())
        return finding ? <><Tag color={finding.confirmedError ? 'orange' : 'green'}>{finding.confirmedError ? 'Có sai sót' : 'Kết quả phù hợp'}</Tag><div>{finding.reason}</div></> : 'Chưa xác minh'
      } },
    ]} />
    {item.managerVerificationReason ? <p><strong>Nhận xét của Manager</strong> · {item.managerVerificationReason}</p> : null}
    {details}
    {actions ? <div className="workflow-section"><Space wrap>{actions}</Space></div> : null}
  </section>
}

export function RefundCaseDetailsView({ item, currency }: { item: RefundCaseDetails; currency: string }) {
  return <dl className="detail-list">
    {item.decisionReason ? <div><dt>Lý do quyết định</dt><dd>{item.decisionReason}</dd></div> : null}
    {item.approvedAmount != null ? <div><dt>Số tiền được duyệt</dt><dd>{money(item.approvedAmount, currency)}</dd></div> : null}
    {item.bankTransferReference ? <div><dt>Mã giao dịch ngân hàng</dt><dd>{item.bankTransferReference}</dd></div> : null}
    {item.transferredAt ? <div><dt>Ghi nhận chuyển khoản lúc</dt><dd>{dateTime(item.transferredAt)}</dd></div> : null}
  </dl>
}

export function RefundEvidenceButton({ token, role, item }: { token: string; role: 'owner' | 'admin'; item: RefundCaseDetails }) {
  const [open, setOpen] = useState(false)
  if (item.status !== 'REFUNDED' || !item.transferEvidenceReference) return null
  return <>
    <Button onClick={() => setOpen(true)}>Xem biên lai</Button>
    {open ? <RefundEvidenceDialog token={token} role={role} item={item} close={() => setOpen(false)} /> : null}
  </>
}

function RefundEvidenceDialog({ token, role, item, close }: { token: string; role: 'owner' | 'admin'; item: RefundCaseDetails; close: () => void }) {
  const query = useQuery({
    queryKey: ['quality-refund-evidence', role, item.surveyOrderId, item.id],
    queryFn: ({ signal }) => getRefundEvidence(token, role, item.surveyOrderId, item.id, signal),
    retry: false, gcTime: 0, refetchOnMount: 'always',
  })
  return <Modal open title="Biên lai hoàn tiền" footer={null} onCancel={close} width={720}>
    {query.isFetching ? <CommonState type="loading" /> : query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} />
      : <Image key={query.data} src={query.data} alt="Biên lai chuyển khoản hoàn tiền" referrerPolicy="no-referrer" fallback="" />}
    {!query.isFetching && !query.isError ? <p><Button onClick={() => void query.refetch()}>Tải lại ảnh</Button></p> : null}
  </Modal>
}
