import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { validOwnerVersion } from './ownerOrderWorkflow'
import { getManagerRefunds, refundIssueLabels, verifyRefund, type RefundCase } from './qualityRefundApi'
import { QualityRefundCaseCard } from './QualityRefundCaseCard'
import { workflowError } from './workflow'

export function ManagerQualityRefundPanel({ token, actor, orderId }: { token: string; actor: string; orderId: string }) {
  const [action, setAction] = useState<Action | null>(null)
  const query = useQuery({
    queryKey: ['quality-refunds', 'manager', actor, orderId],
    queryFn: ({ signal }) => getManagerRefunds(token, orderId, signal),
    retry: false,
  })
  function openVerification(item: RefundCase) {
    setAction({
      title: 'Xác minh từng trụ',
      fields: [
        ...item.issues.flatMap((issue, index) => [
          { key: `verdict-${index}`, label: `${issue.poleCode} · ${refundIssueLabels[issue.issueType] ?? issue.issueType}`, kind: 'select' as const,
            options: [{ value: 'error', label: 'Xác nhận có sai sót' }, { value: 'correct', label: 'Kết quả phù hợp' }] },
          { key: `reason-${index}`, label: `Lý do cho trụ ${issue.poleCode}`, kind: 'multiline' as const, max: 1000 },
        ]),
        { key: 'summary', label: 'Nhận xét chung', kind: 'multiline', max: 2000 },
      ],
      success: 'Đã xác minh. Hồ sơ đang chờ Admin quyết định.',
      run: values => verifyRefund(token, orderId, item.id, {
        findings: item.issues.map((issue, index) => ({
          poleCode: issue.poleCode, confirmedError: values[`verdict-${index}`] === 'error', reason: text(values, `reason-${index}`),
        })),
        reason: text(values, 'summary'),
        expectedVersion: item.version,
      }),
    })
  }
  return <>
    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading">
        <div><strong>Báo sai kết quả của Owner</strong></div>
        <Button loading={query.isFetching} onClick={() => void query.refetch()}>Tải lại</Button>
      </div>
      {query.isPending ? <CommonState type="loading" /> : query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} />
        : query.data.length === 0 ? <p className="form-hint">Đơn chưa có báo cáo sai kết quả.</p> : null}
    </section>
    {query.data?.map(item => <QualityRefundCaseCard key={item.id} item={item}
      actions={item.status === 'SUBMITTED' && !item.managerVerifiedAt && item.issues.length > 0 ? <Button type="primary" disabled={query.isFetching || query.isError || !validOwnerVersion(item.version)} onClick={() => openVerification(item)}>Xác minh</Button> : undefined} />)}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
