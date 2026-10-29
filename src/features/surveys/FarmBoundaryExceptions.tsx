import { CopyReference, readableCode } from '../../components/RecordReference'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Select, Space, Table } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { getBoundaryExceptions, type BoundaryException, type ClassifiedPoint, type FarmContext } from './farmOperationsApi'
import { ClassifyPointModal, ExceptionReviewModal } from './FarmBoundaryModals'
import { dateTime, workflowError } from './workflow'

export const exceptionStateLabel: Record<string, string> = { OutOfBoundary: 'Ngoài ranh giới', NeedsReview: 'Cần xét duyệt', Resolved: 'Đã xử lý', OUT_OF_BOUNDARY: 'Ngoài ranh giới', NEEDS_REVIEW: 'Cần xét duyệt', RESOLVED: 'Đã xử lý' }
export function FarmBoundaryExceptions({ token, farm, disabled = false }: { token: string; farm: FarmContext; disabled?: boolean }) {
  const client = useQueryClient()
  const [state, setState] = useState('')
  const [action, setAction] = useState<BoundaryException | 'classify' | null>(null)
  const [result, setResult] = useState<ClassifiedPoint | null>(null)
  const query = useQuery({ queryKey: ['farm-boundary-exceptions', farm.farmId, state], queryFn: ({ signal }) => getBoundaryExceptions(token, farm.farmId, state, signal), retry: false })
  const blocked = disabled || query.isFetching
  async function refresh() { await client.invalidateQueries({ queryKey: ['farm-boundary-exceptions', farm.farmId] }) }
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Kiểm tra ranh giới và ngoại lệ</strong><span>Xét duyệt các điểm gần hoặc nằm ngoài ranh giới đã duyệt.</span></div><Button disabled={blocked || !farm.approvedBoundary} onClick={() => setAction('classify')}>Kiểm tra điểm</Button></div>
    <div className="workflow-toolbar"><Select aria-label="Trạng thái ngoại lệ ranh giới" value={state} onChange={setState} options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'NeedsReview', label: 'Cần xét duyệt' }, { value: 'OutOfBoundary', label: 'Ngoài ranh giới' }, { value: 'Resolved', label: 'Đã xử lý' }]} /><Button loading={query.isFetching} onClick={() => { void refresh() }}>Tải lại</Button></div>
    {result ? <Alert className="workflow-notice" showIcon type="info" title={`Kết quả: ${result.classification === 'WithinBoundary' ? 'Trong ranh giới' : result.classification === 'NearBoundary' ? 'Gần ranh giới' : result.classification === 'OutOfBoundary' ? 'Ngoài ranh giới' : result.classification}`} description={`Khoảng cách đến ranh giới: ${result.distanceMeters.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m.${result.boundaryExceptionId ? ' Đã ghi nhận ngoại lệ để xét duyệt.' : ''}`} /> : null}
    {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={refresh} /> : <Table<BoundaryException> rowKey="id" loading={query.isPending} dataSource={query.data ?? []} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 800 }} locale={{ emptyText: 'Chưa có ngoại lệ phù hợp.' }} columns={[
      { title: 'Bằng chứng', render: (_, item) => readableCode(item.sourceReferenceId) ?? <CopyReference value={item.sourceReferenceId} label="Sao chép tham chiếu" /> }, { title: 'Vị trí gốc (kinh độ, vĩ độ)', render: (_, item) => item.originalPosition.coordinates.join(', ') },
      { title: 'Trạng thái', render: (_, item) => exceptionStateLabel[item.state] ?? item.state }, { title: 'Ngày ghi nhận', render: (_, item) => dateTime(item.createdAt) },
      { title: 'Thao tác', render: (_, item) => <Space>{item.state === 'Resolved' || item.state === 'RESOLVED' ? <span>{item.reviewReason ?? 'Đã xét duyệt'}</span> : <Button disabled={blocked || item.farmId !== farm.farmId || !Number.isSafeInteger(item.version) || item.version < 1} onClick={() => setAction(item)}>Xét duyệt điểm</Button>}</Space> },
    ]} />}
    {action === 'classify' ? <ClassifyPointModal token={token} farm={farm} close={() => { setAction(null); void refresh() }} done={async value => { setResult(value); setAction(null); await refresh() }} /> : action ? <ExceptionReviewModal token={token} farmId={farm.farmId} item={action} close={() => { setAction(null); void refresh() }} done={async () => { setAction(null); await refresh() }} /> : null}
  </section>
}
