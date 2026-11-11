import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { readableCode } from '../../components/RecordReference'
import { getOrthophotoStatus } from '../missions/missionApi'
import { dateTime } from '../surveys/workflow'
import { getMapVersion } from './api'
import { BaseMapViewer } from './BaseMapViewer'
import { MapReadError } from './MapReadError'
import { PlantLifecycleDialog } from './PlantLifecycleDialog'
import { ManualMapEditDialog } from './ManualMapEditDialog'
import type { ManualMapChange, MapPlant, MapVersionDetail } from './types'
import { changeLabel, isReleasedMap, lifecycleLabel, mapState, mapStatusLabel } from './workflow'

export function MapVersionPanel({ token, scopeKey, farmId, farmName, versionId, path, manager }: { token: string; scopeKey: string; farmId: string; farmName: string; versionId: string; path: string; manager: boolean }) {
  const query = useQuery({ queryKey: ['farm-map-version', scopeKey, farmId, versionId], queryFn: ({ signal }) => getMapVersion(token, farmId, versionId, signal), retry: false })
  const back = <Link className="back-link" to={path}><ArrowLeftOutlined /> Các phiên bản bản đồ</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải bản đồ" /></>
  if (query.isError) return <>{back}<MapReadError error={query.error} retry={() => query.refetch()} owner={!manager} /></>
  if (!manager && !isReleasedMap(query.data.status)) return <>{back}<CommonState type="forbidden" description="Bản đồ này chưa được phát hành." /></>
  return <>{back}<MapDetail key={versionId} token={token} scopeKey={scopeKey} map={query.data} farmName={farmName} manager={manager} refresh={() => { void query.refetch() }} refreshing={query.isFetching} /></>
}

function MapDetail({ token, scopeKey, map, farmName, manager, refresh, refreshing }: { token: string; scopeKey: string; map: MapVersionDetail; farmName: string; manager: boolean; refresh: () => void; refreshing: boolean }) {
  const [plant, setPlant] = useState<MapPlant | null>(null)
  const [editing, setEditing] = useState(false)
  // This read endpoint signs existing media. It does not start map reconstruction.
  const image = useQuery({ queryKey: ['base-map-orthophoto', scopeKey, map.farmId, map.sourceMissionId], queryFn: ({ signal }) => getOrthophotoStatus(token, map.farmId, map.sourceMissionId!, signal), enabled: manager && !!map.sourceMissionId, retry: false })
  const shownMap = image.data?.status === 'COMPLETED' && image.data.previewUrl ? { ...map, previewUrl: image.data.previewUrl, bounds: image.data.bounds ?? map.bounds } : map
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">{farmName}</span><h1>Bản đồ phiên bản {map.versionNumber}</h1><p>{mapStatusLabel(map.status)}{map.publishedAt ? ` · ${dateTime(map.publishedAt)}` : ''}</p></div><Space wrap>{manager && !isReleasedMap(map.status) ? <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(map.farmId)}/base-map-drafts/${encodeURIComponent(map.versionId)}`}>Duyệt bản đồ nháp →</Link> : null}<Button icon={<ReloadOutlined />} loading={refreshing || image.isFetching} onClick={() => { refresh(); if (manager && map.sourceMissionId) void image.refetch() }}>Tải lại</Button></Space></section>
    <div className="mapping-summary"><div><span>Số trụ</span><strong>{map.totalPoles}</strong></div><div><span>Khoảng cách hàng</span><strong>{map.rowSpacingM} m</strong></div><div><span>Khoảng cách trụ</span><strong>{map.plantSpacingM} m</strong></div><div><span>Chỉnh sửa thực địa</span><strong>{map.manualChanges?.length ?? 0}</strong></div></div>
    <section className="resource-panel">{manager && ['PUBLISHED', 'DRAFT'].includes(mapState(map.status)) ? <div className="resource-panel-heading"><div><strong>Điều chỉnh thực địa</strong><span>Ghi nhận trụ mới, trụ đã loại bỏ hoặc dời vị trí.</span></div><Button type="primary" disabled={refreshing || editing} onClick={() => setEditing(true)}>Điều chỉnh trụ</Button></div> : null}<BaseMapViewer key={`${map.versionId}:${shownMap.previewUrl}`} map={shownMap} selectPlant={setPlant} /></section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Trụ trên bản đồ</strong><span>Bấm vào trụ để xem lịch sử vòng đời.</span></div></div><Table<MapPlant> rowKey="plantId" dataSource={map.plants} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 700 }} locale={{ emptyText: 'Phiên bản này chưa có trụ.' }} columns={[
      { title: 'Trụ', render: (_, item) => readableCode(item.plantCode) ?? `Hàng ${item.row} · Cột ${item.col}` },
      { title: 'Hàng · Cột', render: (_, item) => `${item.row} · ${item.col}` },
      { title: 'Tọa độ', render: (_, item) => `${item.lat.toFixed(7)}, ${item.lon.toFixed(7)}` },
      { title: 'Trạng thái', render: (_, item) => <Tag>{lifecycleLabel(item.lifecycleStatus)}</Tag> },
      { title: 'Thao tác', render: (_, item) => <Button onClick={() => setPlant(item)}>Lịch sử trụ</Button> },
    ]} /></section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Chỉnh sửa thực địa</strong><span>Các thay đổi được ghi nhận cho phiên bản này.</span></div></div><Table<ManualMapChange> rowKey="eventId" dataSource={map.manualChanges ?? []} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 650 }} locale={{ emptyText: 'Chưa có chỉnh sửa thực địa.' }} columns={[
      { title: 'Thay đổi', render: (_, item) => changeLabel(item.changeType) },
      { title: 'Vị trí', render: (_, item) => `${item.oldRow ?? '—'} · ${item.oldCol ?? '—'} → ${item.newRow ?? '—'} · ${item.newCol ?? '—'}` },
      { title: 'Lý do', render: (_, item) => item.notes || '—' },
      { title: 'Thời điểm', render: (_, item) => dateTime(item.createdAt) },
    ]} /></section>
    {plant ? <PlantLifecycleDialog key={plant.plantId} token={token} scopeKey={scopeKey} farmId={map.farmId} plantId={plant.plantId} owner={!manager} close={() => setPlant(null)} /> : null}
    {editing ? <ManualMapEditDialog token={token} scopeKey={scopeKey} map={map} close={() => setEditing(false)} /> : null}
  </>
}
