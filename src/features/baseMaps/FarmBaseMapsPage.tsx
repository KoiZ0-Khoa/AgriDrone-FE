import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Space, Switch, Table, Tabs, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getFarm } from '../farms/farmsApi'
import { getAssignedFarms } from '../surveys/api'
import { validGuid } from '../surveys/baseMapWorkflow'
import { dateTime } from '../surveys/workflow'
import { getMapVersions } from './api'
import { MapReadError } from './MapReadError'
import { MapVersionPanel } from './MapVersionPanel'
import { MapComparisonPanel } from './MapComparisonPanel'
import { MapAnalyticsPanel } from './MapAnalyticsPanel'
import type { MapVersion } from './types'
import { isReleasedMap, mapStatusLabel } from './workflow'
import './baseMaps.css'

export function FarmBaseMapsPage() {
  const { session } = useAuth()
  const { farmId = '', versionId } = useParams()
  const manager = session?.role === 'SYSTEM_MANAGER'
  const scopeKey = `${session?.role}:${session?.tenant?.id ?? ''}:${session?.email}`
  const valid = validGuid(farmId) && (!versionId || validGuid(versionId))
  const access = useQuery({ queryKey: ['base-map-farm-access', scopeKey, farmId], retry: false, staleTime: 0,
    enabled: valid && !!session,
    queryFn: async ({ signal }) => {
      if (manager) return (await getAssignedFarms(session!.accessToken, signal)).find(farm => farm.farmId.toLowerCase() === farmId.toLowerCase()) ?? null
      const farm = await getFarm(session!.accessToken, farmId, signal)
      if (farm.id.toLowerCase() !== farmId.toLowerCase() || farm.tenantId !== session!.tenant?.id) throw new Error('Nông trại không khớp đơn vị hiện tại.')
      return farm
    },
  })
  if (!valid) return <CommonState type="error" description="Liên kết bản đồ không hợp lệ." />
  if (access.isPending) return <CommonState type="loading" title="Đang kiểm tra quyền xem bản đồ" />
  if (access.isError) return <MapReadError error={access.error} retry={() => access.refetch()} owner={!manager} />
  if (!access.data) return <CommonState type="forbidden" description="Nông trại không thuộc phân công hiện tại." />
  const farmPath = `${manager ? '/manager' : ''}/farms/${encodeURIComponent(farmId)}`
  return <MapWorkspace key={`${scopeKey}:${farmId}:${versionId ?? ''}`} token={session!.accessToken} scopeKey={scopeKey} farmId={farmId} farmName={access.data.name} farmPath={farmPath} versionId={versionId} manager={manager} />
}

function MapWorkspace({ token, scopeKey, farmId, farmName, farmPath, versionId, manager }: { token: string; scopeKey: string; farmId: string; farmName: string; farmPath: string; versionId?: string; manager: boolean }) {
  const [includeDraft, setIncludeDraft] = useState(false)
  const versions = useQuery({ queryKey: ['farm-map-versions', scopeKey, farmId, includeDraft], queryFn: ({ signal }) => getMapVersions(token, farmId, manager && includeDraft, signal), retry: false })
  const path = `${farmPath}/base-maps`
  if (versionId) return <MapVersionPanel token={token} scopeKey={scopeKey} farmId={farmId} farmName={farmName} versionId={versionId} path={path} manager={manager} />
  const items = versions.data?.filter(item => manager || isReleasedMap(item.status)) ?? []
  return <>
    <Link className="back-link" to={farmPath}><ArrowLeftOutlined /> Chi tiết nông trại</Link>
    <section className="resource-page-heading"><div><span className="page-kicker">{farmName}</span><h1>Bản đồ nông trại</h1><p>Xem các phiên bản bản đồ và lịch sử trụ cây.</p></div><Space wrap>{manager ? <Space><Switch checked={includeDraft} onChange={setIncludeDraft} aria-label="Hiện bản đồ nháp" />Hiện bản nháp</Space> : null}<Button icon={<ReloadOutlined />} loading={versions.isFetching} onClick={() => { void versions.refetch() }}>Tải lại</Button></Space></section>
    {versions.isError ? <MapReadError error={versions.error} retry={() => versions.refetch()} owner={!manager} /> : <section className="resource-panel">
      <Tabs destroyOnHidden items={[{ key: 'versions', label: 'Các phiên bản', children: <Table<MapVersion> rowKey="versionId" loading={versions.isPending} dataSource={items} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 780 }} locale={{ emptyText: 'Chưa có phiên bản bản đồ.' }} columns={[
        { title: 'Bản đồ', render: (_, item) => <Link className="workflow-detail-link" to={`${path}/${encodeURIComponent(item.versionId)}`}>Phiên bản {item.versionNumber} →</Link> },
        { title: 'Trạng thái', render: (_, item) => <Tag color={item.status.toUpperCase() === 'PUBLISHED' ? 'success' : 'default'}>{mapStatusLabel(item.status)}</Tag> },
        { title: 'Số trụ', dataIndex: 'totalPoles' },
        { title: 'Chỉnh sửa thực địa', render: (_, item) => item.manualChangesCount ?? 0 },
        { title: 'Ngày bay', render: (_, item) => item.flightDate ? dateTime(item.flightDate) : 'Chưa có' },
        { title: 'Phát hành', render: (_, item) => item.publishedAt ? dateTime(item.publishedAt) : 'Chưa phát hành' },
      ]} /> }, { key: 'compare', label: 'So sánh', children: versions.isPending ? <CommonState type="loading" /> : <MapComparisonPanel key={items.map(item => item.versionId).join(':')} token={token} scopeKey={scopeKey} farmId={farmId} versions={items} path={path} owner={!manager} /> }, { key: 'analytics', label: 'Thống kê', children: <MapAnalyticsPanel token={token} scopeKey={scopeKey} farmId={farmId} path={path} owner={!manager} /> }]} />
    </section>}
  </>
}
