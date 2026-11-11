import { useQuery } from '@tanstack/react-query'
import { Button, Table } from 'antd'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { dateTime } from '../surveys/workflow'
import { getMapAnalytics } from './api'
import { MapReadError } from './MapReadError'
import type { MapAnalytics } from './types'

export function MapAnalyticsPanel({ token, scopeKey, farmId, path, owner }: { token: string; scopeKey: string; farmId: string; path: string; owner: boolean }) {
  const query = useQuery({ queryKey: ['farm-map-analytics', scopeKey, farmId], queryFn: ({ signal }) => getMapAnalytics(token, farmId, signal), retry: false })
  if (query.isPending) return <CommonState type="loading" title="Đang tải thống kê" />
  if (query.isError) return <MapReadError error={query.error} retry={() => query.refetch()} owner={owner} />
  const data = query.data, maxPoles = Math.max(1, ...data.timeline.map(item => item.totalPoles))
  return <>
    <div className="resource-panel-heading"><div><strong>Biến động số trụ</strong><span>{data.farmAreaHa == null ? 'Chưa có diện tích chính thức' : `Diện tích: ${data.farmAreaHa.toLocaleString('vi-VN')} ha`}</span></div><Button loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></div>
    {!data.timeline.length ? <CommonState type="empty" title="Chưa có dữ liệu thống kê" /> : <>
      <div className="base-map-bars" aria-label="Số trụ theo phiên bản">{data.timeline.map(item => <div className="base-map-bar-row" key={item.versionId}><Link to={`${path}/${encodeURIComponent(item.versionId)}`}>Phiên bản {item.versionNumber}</Link><div className="base-map-bar-track"><div className="base-map-bar" style={{ width: `${Math.max(0, item.totalPoles) / maxPoles * 100}%` }} /></div><strong>{item.totalPoles} trụ</strong></div>)}</div>
      <Table<MapAnalytics['timeline'][number]> rowKey="versionId" dataSource={data.timeline} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 700 }} columns={[
        { title: 'Bản đồ', render: (_, item) => <Link className="workflow-detail-link" to={`${path}/${encodeURIComponent(item.versionId)}`}>Phiên bản {item.versionNumber} →</Link> },
        { title: 'Số trụ', dataIndex: 'totalPoles' },
        { title: 'Chênh lệch', render: (_, item) => `${item.polesDelta > 0 ? '+' : ''}${item.polesDelta}` },
        { title: 'Mật độ', render: (_, item) => item.densityPolesPerHa == null ? 'Chưa xác định' : `${item.densityPolesPerHa.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} trụ/ha` },
        { title: 'Chỉnh sửa', render: (_, item) => item.manualChangesCount ?? 0 },
        { title: 'Phát hành', render: (_, item) => item.publishedAt ? dateTime(item.publishedAt) : 'Chưa phát hành' },
      ]} />
    </>}
  </>
}
