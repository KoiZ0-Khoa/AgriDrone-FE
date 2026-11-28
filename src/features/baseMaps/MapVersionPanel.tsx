import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { readableCode } from '../../components/RecordReference'
import { useAuth } from '../auth/AuthContext'
import { getPublishedSurveyHistory, getPublishedSurveyResult } from '../surveys/ownerSurveyResultApi'
import { PublishedPlantFindings, publishedFindingsByProfile } from '../surveys/PublishedPlantFindings'
import { dateTime } from '../surveys/workflow'
import { getMapVersion } from './api'
import { BaseMapViewer } from './BaseMapViewer'
import { EditableBaseMapViewer } from './EditableBaseMapViewer'
import { MapReadError } from './MapReadError'
import { PlantLifecycleDialog } from './PlantLifecycleDialog'
import type { ManualMapChange, MapPlant, MapVersionDetail } from './types'
import { useBaseMapOrthophoto } from './useBaseMapOrthophoto'
import { changeLabel, formatGridMeters, isReleasedMap, lifecycleLabel, mapState, mapStatusLabel } from './workflow'

export function MapVersionPanel({ token, scopeKey, farmId, farmName, versionId, path, manager }: { token: string; scopeKey: string; farmId: string; farmName: string; versionId: string; path: string; manager: boolean }) {
  const query = useQuery({ queryKey: ['farm-map-version', scopeKey, farmId, versionId], queryFn: ({ signal }) => getMapVersion(token, farmId, versionId, signal), retry: false })
  const back = <Link className="back-link" to={path}><ArrowLeftOutlined /> Các phiên bản bản đồ</Link>
  if (query.isPending) return <>{back}<CommonState type="loading" title="Đang tải bản đồ" /></>
  if (query.isError) return <>{back}<MapReadError error={query.error} retry={() => query.refetch()} owner={!manager} /></>
  if (!manager && !isReleasedMap(query.data.status)) return <>{back}<CommonState type="forbidden" description="Bản đồ này chưa được phát hành." /></>
  return <>{back}<MapDetail key={versionId} token={token} scopeKey={scopeKey} map={query.data} farmName={farmName} manager={manager} refresh={() => { void query.refetch() }} refreshing={query.isFetching} /></>
}

function MapDetail({ token, scopeKey, map, farmName, manager, refresh, refreshing }: { token: string; scopeKey: string; map: MapVersionDetail; farmName: string; manager: boolean; refresh: () => void; refreshing: boolean }) {
  const { session } = useAuth()
  const [plant, setPlant] = useState<MapPlant | null>(null)
  // This read endpoint signs existing media. It does not start map reconstruction.
  const { shownMap, image } = useBaseMapOrthophoto(token, scopeKey, map, manager)
  const tenantId = session?.role === 'OWNER' ? session.tenant?.id : undefined
  const canReadPublication = !!tenantId && !!map.sourceSurveyOrderId
  const history = useQuery({
    queryKey: ['owner-published-history', tenantId, map.farmId],
    queryFn: ({ signal }) => getPublishedSurveyHistory(token, map.farmId, signal),
    enabled: canReadPublication,
    retry: false,
  })
  const combo = history.isError ? undefined : history.data?.find(item =>
    item.serviceCode === 'COMBO' && item.orderId === map.sourceSurveyOrderId && item.mapVersionId === map.versionId)
  const publication = useQuery({
    queryKey: ['owner-published-result', tenantId, combo?.orderId],
    queryFn: ({ signal }) => getPublishedSurveyResult(token, combo!.orderId, signal),
    enabled: canReadPublication && !!combo,
    retry: false,
  })
  const result = publication.isError ? null : publication.data
  const matchesMap = result?.summary.mapVersionId === map.versionId && result.summary.farmId === map.farmId
  const findingsByProfile = publishedFindingsByProfile(matchesMap ? result : null)
  const hasHighlightedPlants = map.plants.some(item => item.plantProfileId && findingsByProfile.has(item.plantProfileId.toLowerCase()))
  const displayedMap = shownMap ?? map

  function reload() {
    refresh()
    if (manager && map.sourceMissionId) void image.refetch()
    if (canReadPublication) void history.refetch()
    if (canReadPublication && combo) void publication.refetch()
  }

  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">{farmName}</span><h1>Bản đồ phiên bản {map.versionNumber}</h1><p>{mapStatusLabel(map.status)}{map.publishedAt ? ` · ${dateTime(map.publishedAt)}` : ''}</p></div><Space wrap>{manager && mapState(map.status) === 'DRAFT' ? <Link className="workflow-detail-link" to={`/manager/farms/${encodeURIComponent(map.farmId)}/base-map-drafts/${encodeURIComponent(map.versionId)}`}>Duyệt bản đồ nháp →</Link> : null}<Button icon={<ReloadOutlined />} loading={refreshing || image.isFetching || history.isFetching || publication.isFetching} onClick={reload}>Tải lại</Button></Space></section>
    <div className="mapping-summary"><div><span>Số trụ</span><strong>{map.totalPoles}</strong></div><div><span>Khoảng cách hàng</span><strong>{formatGridMeters(map.rowSpacingM)}</strong></div><div><span>Khoảng cách trụ</span><strong>{formatGridMeters(map.plantSpacingM)}</strong></div><div><span>Chỉnh sửa thực địa</span><strong>{map.manualChanges?.length ?? 0}</strong></div></div>
    <section className="resource-panel">
      {canReadPublication && (history.isError || publication.isError) ? <Alert className="workflow-notice" showIcon type="warning" title="Chưa tải được kết quả sàng lọc. Bấm Tải lại để thử lại." /> : null}
      {hasHighlightedPlants ? <p className="form-hint">Trụ màu đỏ có dấu hiệu nghi bệnh. Bấm vào trụ để xem chi tiết.</p> : null}
      {manager ? <EditableBaseMapViewer token={token} scopeKey={scopeKey} map={displayedMap} canEdit={['PUBLISHED', 'DRAFT'].includes(mapState(map.status))} disabled={refreshing} selectPlant={setPlant} />
        : <BaseMapViewer key={`${map.versionId}:${map.previewUrl}`} map={map} selectPlant={setPlant} plantAnnotation={item => {
          const findings = item.plantProfileId ? findingsByProfile.get(item.plantProfileId.toLowerCase()) : undefined
          return findings ? <PublishedPlantFindings findings={findings} /> : null
        }} />}
    </section>
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
  </>
}
