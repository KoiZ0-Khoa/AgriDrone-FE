import { useQuery } from '@tanstack/react-query'
import { Button, Table } from 'antd'
import { CommonState } from '../../components/CommonState'
import { getCaptureSession } from './orderApi'
import type { CaptureSample } from './orderTypes'
import { dateTime, workflowError } from './workflow'

export function BoundaryCapturePanel({ token, orderId, farmId, sessionId }: { token: string; orderId: string; farmId: string; sessionId: string }) {
  const query = useQuery({ queryKey: ['boundary-capture', orderId, sessionId], queryFn: ({ signal }) => getCaptureSession(token, orderId, sessionId, signal), retry: false })
  const session = query.data
  const matches = session?.surveyOrderId === orderId && session.farmId === farmId && session.sessionId === sessionId
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Lịch sử thu thập GNSS</strong><span>Các điểm đã lưu từ quy trình cũ, chỉ để tra cứu.</span></div><Button loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại lịch sử</Button></div>
    {query.isPending ? <CommonState type="loading" title="Đang tải lịch sử GNSS" /> : query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : !matches ? <CommonState type="error" description="Dữ liệu phiên thu thập không khớp đơn và nông trại hiện tại." /> : <Table<CaptureSample> rowKey="clientOperationId" dataSource={session.samples} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 650 }} locale={{ emptyText: 'Chưa có điểm GNSS đã lưu.' }} columns={[
      { title: 'Thứ tự', dataIndex: 'sequenceNumber' }, { title: 'Kinh độ', dataIndex: 'longitude' }, { title: 'Vĩ độ', dataIndex: 'latitude' }, { title: 'Sai số (m)', dataIndex: 'horizontalAccuracyMeters' }, { title: 'Thời điểm đo', render: (_, p) => dateTime(p.capturedAt) },
    ]} />}
  </section>
}
