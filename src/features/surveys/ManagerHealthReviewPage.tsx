import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Space, Tag } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { HealthFindingsTable } from './HealthFindingsTable'
import { getHealthReviewSummary } from './healthReviewApi'
import type { HealthReviewSummary } from './healthReviewTypes'
import { healthReviewError } from './healthReviewWorkflow'
import { getAssignedOrder } from './orderApi'
import { orderStatusLabels } from './orderWorkflow'
import { dateTime, workflowError } from './workflow'

// Các việc còn chặn nút Phê duyệt (Giai đoạn 3), theo đúng bộ đếm của review-summary.
export function reviewBlockers(summary: HealthReviewSummary) {
  return [
    { key: 'unreviewedFindings', label: 'Phát hiện chưa review', count: summary.unreviewedFindings },
    { key: 'ambiguousFindings', label: 'Phát hiện đánh dấu chưa chắc chắn', count: summary.ambiguousFindings },
    { key: 'unresolvedBoundaryExceptions', label: 'Ngoại lệ ranh giới chưa xử lý', count: summary.unresolvedBoundaryExceptions },
    { key: 'undecidedZones', label: 'Vùng bệnh chưa review', count: summary.undecidedZones },
    { key: 'invalidGuidance', label: 'Vùng bệnh thiếu/sai hướng dẫn xử lý', count: summary.invalidGuidance },
    { key: 'staleDependencies', label: 'Review cần làm lại do dữ liệu liên quan đã đổi', count: summary.staleDependencies },
  ].filter(item => item.count > 0)
}

export function ManagerHealthReviewPage() {
  const token = useAuth().session!.accessToken
  const { orderId = '' } = useParams()
  const client = useQueryClient()
  const context = useQuery({ queryKey: ['manager-order-context', orderId], queryFn: ({ signal }) => getAssignedOrder(token, orderId, signal), retry: false })
  const summary = useQuery({
    queryKey: ['health-review-summary', orderId], queryFn: ({ signal }) => getHealthReviewSummary(token, orderId, signal),
    enabled: context.data?.surveyServiceCode === 'PLANT_HEALTH', retry: false,
  })
  const back = <Link className="back-link" to={`/manager/orders/${encodeURIComponent(orderId)}`}><ArrowLeftOutlined /> Đơn khảo sát</Link>
  async function refresh() {
    await Promise.all([client.invalidateQueries({ queryKey: ['manager-order-context', orderId] }), client.invalidateQueries({ queryKey: ['health-review-summary', orderId] }), client.invalidateQueries({ queryKey: ['health-findings', orderId] })])
  }

  if (context.isPending) return <>{back}<CommonState type="loading" /></>
  if (context.isError) return <>{back}<CommonState type="error" description={workflowError(context.error)} retry={refresh} /></>
  if (!context.data) return <>{back}<CommonState type="forbidden" description="Đơn không còn thuộc các nông trại bạn đang được phân công." /></>
  const order = context.data
  if (order.surveyServiceCode !== 'PLANT_HEALTH') return <>{back}<CommonState type="empty" title="Đơn này không phải dịch vụ khảo sát sức khỏe cây" description="Chỉ đơn Plant Health mới có bước kiểm duyệt kết quả bệnh." /></>

  const notFound = summary.error instanceof ApiError && summary.error.status === 404
  const data = summary.data
  const blockers = data ? reviewBlockers(data) : []

  return <>
    {back}
    <section className="resource-page-heading"><div><span className="page-kicker">KIỂM DUYỆT KẾT QUẢ SỨC KHỎE CÂY</span><h1>{order.farmName}</h1><p>{order.surveyServiceName} · {dateTime(order.createdAt)}</p></div>
      <Space wrap>
        <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(order.farmId)}/plant-health`}>Bản đồ sức khỏe cây →</Link>
        <Button icon={<ReloadOutlined />} loading={summary.isFetching || context.isFetching} onClick={() => { void refresh() }}>Tải lại</Button>
      </Space>
    </section>

    {order.status !== 'PENDING_REVIEW' ? <Alert className="workflow-notice" type="info" showIcon title={`Đơn đang ở trạng thái: ${orderStatusLabels[order.status] ?? order.status}`} description="Chỉ review được khi đơn ở trạng thái Chờ duyệt kết quả. Các thao tác review sẽ bị khóa." /> : null}

    {summary.isPending ? <CommonState type="loading" title="Đang tải tiến độ kiểm duyệt" />
      : notFound ? <CommonState type="empty" title="Chưa có kết quả sơ bộ để kiểm duyệt" description="Cần chạy nhận diện bệnh và gửi kết quả sơ bộ từ Mission dịch vụ của đơn này trước." />
      : summary.isError ? <CommonState type="error" description={healthReviewError(summary.error)} retry={() => summary.refetch()} />
      : data ? <section className="resource-panel">
        <div className="resource-panel-heading"><div><strong>Tiến độ kiểm duyệt</strong><span>Phiên bản kết quả {data.resultVersion} · lượt review {data.reviewRevision}</span></div>
          {data.readyForApproval ? <Tag color="success">Sẵn sàng phê duyệt</Tag> : <Tag color="warning">Chưa sẵn sàng phê duyệt</Tag>}</div>
        <dl className="detail-list">
          <div><dt>Phát hiện đã xác nhận</dt><dd>{data.acceptedFindings}</dd></div>
          <div><dt>Phát hiện bị bác bỏ</dt><dd>{data.rejectedFindings}</dd></div>
          <div><dt>Không phải bệnh</dt><dd>{data.nonDiseaseFindings}</dd></div>
          <div><dt>Chưa review</dt><dd>{data.unreviewedFindings}</dd></div>
          <div><dt>Vùng bệnh đã duyệt / bác bỏ</dt><dd>{data.approvedZones} / {data.rejectedZones}</dd></div>
        </dl>
        {blockers.length > 0 ? <Alert className="workflow-notice" type="warning" showIcon title="Còn việc cần xử lý trước khi phê duyệt"
          description={<ul>{blockers.map(item => <li key={item.key}>{item.label}: <strong>{item.count}</strong></li>)}</ul>} />
          : data.readyForApproval ? <Alert className="workflow-notice" type="success" showIcon title="Đã xử lý hết các mục chặn" description="Bước Phê duyệt và Phát hành kết quả thuộc Giai đoạn 3, chưa có trên giao diện." />
          : <Alert className="workflow-notice" type="info" showIcon title="Chưa sẵn sàng phê duyệt" description="Không còn mục chặn được đếm, nhưng kết quả chưa đủ điều kiện (ví dụ danh mục nhãn bệnh chưa khớp, hoặc đơn không ở trạng thái chờ duyệt)." />}
        {data.undecidedZones > 0 || data.invalidGuidance > 0 ? <p className="form-hint">Review vùng bệnh và chọn hướng dẫn xử lý theo đơn chưa có trên giao diện.</p> : null}
      </section> : null}
    {data ? <HealthFindingsTable token={token} orderId={orderId} farmId={order.farmId} tenantId={order.tenantId} canReview={order.status === 'PENDING_REVIEW'} /> : null}
  </>
}
