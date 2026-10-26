import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { AuthorizationDialog, authorizationLabels, authorizationStatusLabels } from './SurveyAuthorizationDialog'
import { orderStatusLabels } from './orderWorkflow'
import * as api from './systemOrderApi'
import type { AuthorizationType, CaptureAuthorization, SystemOrder } from './systemOrderTypes'
import { dateTime, workflowError } from './workflow'

export function SystemOrdersPage() {
  const token = useAuth().session!.accessToken
  const [page, setPage] = useState(1)
  const [params, setParams] = useSearchParams()
  const filters = { status: params.get('status') ?? '', tenantId: params.get('tenantId') ?? '', farmId: params.get('farmId') ?? '' }
  const query = useQuery({ queryKey: ['system-survey-orders', page, filters], queryFn: ({ signal }) => api.getSystemOrders(token, page, filters, signal) })
  function filter(key: keyof typeof filters, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setPage(1); setParams(next)
  }
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">QUẢN LÝ KHẢO SÁT</span><h1>Đơn khảo sát</h1><p>Theo dõi tiến độ và quản lý giấy tờ khảo sát trên toàn hệ thống.</p></div><Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel">
      <div className="workflow-toolbar">
        <Select aria-label="Trạng thái đơn khảo sát" value={filters.status} onChange={value => filter('status', value)} options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.entries(orderStatusLabels).map(([value, label]) => ({ value, label }))]} />
        {filters.tenantId ? <Tag closable onClose={() => filter('tenantId', '')}>Cùng đơn vị đã chọn</Tag> : null}
        {filters.farmId ? <Tag closable onClose={() => filter('farmId', '')}>Nông trại đã chọn</Tag> : null}
      </div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<SystemOrder> rowKey="surveyOrderId" dataSource={query.data?.items ?? []} loading={query.isPending} pagination={false} scroll={{ x: 950 }} locale={{ emptyText: 'Chưa có đơn khảo sát phù hợp với bộ lọc.' }} columns={[
          { title: 'Đơn khảo sát', dataIndex: 'orderNumber' },
          { title: 'Nông trại', render: (_, order) => <><strong>{order.farmName}</strong><div className="form-hint">{order.farmCode}</div></> },
          { title: 'Dịch vụ', dataIndex: 'surveyServiceName' },
          { title: 'Trạng thái', render: (_, order) => <Tag>{orderStatusLabels[order.status] ?? order.status}</Tag> },
          { title: 'Cập nhật', render: (_, order) => dateTime(order.updatedAt) },
          { title: 'Thao tác', render: (_, order) => <Space orientation="vertical" align="start"><Link className="workflow-detail-link" to={`/system/survey-orders/${encodeURIComponent(order.surveyOrderId)}/authorizations`}>Quản lý giấy tờ →</Link><Space wrap><Button size="small" onClick={() => filter('farmId', order.farmId)}>Cùng nông trại</Button><Button size="small" onClick={() => { const next = new URLSearchParams(params); next.set('tenantId', order.tenantId); next.delete('farmId'); setPage(1); setParams(next) }}>Cùng đơn vị</Button></Space></Space> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} onChange={setPage} showSizeChanger={false} />
      </>}
    </section>
  </>
}

export function SystemOrderAuthorizationsPage() {
  const token = useAuth().session!.accessToken
  const { orderId = '' } = useParams()
  const [selected, setSelected] = useState<AuthorizationType | null>(null)
  const query = useQuery({ queryKey: ['survey-authorizations', orderId], queryFn: ({ signal }) => api.getCaptureAuthorizations(token, orderId, signal) })
  return <>
    <Link className="back-link" to="/system/survey-orders"><ArrowLeftOutlined /> Danh sách đơn khảo sát</Link>
    <section className="resource-page-heading"><div><span className="page-kicker">HỒ SƠ KHẢO SÁT</span><h1>Giấy tờ khảo sát</h1><p>Kiểm tra văn bản đồng ý sử dụng dữ liệu và giấy phép bay trước khi thu thập dữ liệu.</p></div><Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel">
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <Table<CaptureAuthorization> rowKey="id" loading={query.isPending} dataSource={query.data ?? []} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: 'Chưa có yêu cầu giấy tờ cho đơn khảo sát này.' }} columns={[
        { title: 'Giấy tờ', render: (_, item) => authorizationLabels[item.type] ?? item.type },
        { title: 'Trạng thái', render: (_, item) => <Tag color={item.status === 'VERIFIED' ? 'success' : item.status === 'REVOKED' ? 'error' : 'default'}>{authorizationStatusLabels[item.status] ?? item.status}</Tag> },
        { title: 'Xác minh lúc', render: (_, item) => dateTime(item.verifiedAt) },
        { title: 'Hết hiệu lực', render: (_, item) => item.expiresAt ? <>{dateTime(item.expiresAt)}{Date.parse(item.expiresAt) <= Date.now() ? <div>Đã hết hạn</div> : null}</> : 'Chưa quy định' },
        { title: 'Thao tác', render: (_, item) => <Button disabled={query.isFetching || item.surveyOrderId !== orderId || !authorizationLabels[item.type]} onClick={() => setSelected(item.type)}>Xem và quản lý</Button> },
      ]} />}
    </section>
    {selected ? <AuthorizationDialog key={`${orderId}:${selected}`} token={token} orderId={orderId} type={selected} close={() => { setSelected(null); void query.refetch() }} /> : null}
  </>
}
