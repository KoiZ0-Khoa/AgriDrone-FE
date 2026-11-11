import { useQuery } from '@tanstack/react-query'
import { Button, Select, Space, Table } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { readableCode } from '../../components/RecordReference'
import { compareMapVersions } from './api'
import { MapReadError } from './MapReadError'
import { MapChangesViewer } from './MapChangesViewer'
import type { MapComparison, MapVersion } from './types'
import { changeLabel, isReleasedMap } from './workflow'

export function MapComparisonPanel({ token, scopeKey, farmId, versions, path, owner }: { token: string; scopeKey: string; farmId: string; versions: MapVersion[]; path: string; owner: boolean }) {
  const released = versions.filter(item => isReleasedMap(item.status)).sort((a, b) => a.versionNumber - b.versionNumber)
  const [from, setFrom] = useState(released.at(-2)?.versionId ?? '')
  const [to, setTo] = useState(released.at(-1)?.versionId ?? '')
  const available = new Set(released.map(item => item.versionId))
  const valid = available.has(from) && available.has(to) && from !== to
  const query = useQuery({ queryKey: ['farm-map-comparison', scopeKey, farmId, from, to], queryFn: ({ signal }) => compareMapVersions(token, farmId, from, to, signal), enabled: valid, retry: false })
  if (released.length < 2) return <CommonState type="empty" title="Cần hai phiên bản để so sánh" description="Sau đợt khảo sát tiếp theo, bạn có thể xem các trụ thêm, loại bỏ hoặc thay đổi vị trí." />
  const options = released.map(item => ({ value: item.versionId, label: `Phiên bản ${item.versionNumber}` }))
  return <>
    <Space wrap className="workflow-toolbar"><label>Từ phiên bản <Select aria-label="Phiên bản gốc" value={from} onChange={setFrom} options={options} style={{ minWidth: 165 }} /></label><label>Đến phiên bản <Select aria-label="Phiên bản đích" value={to} onChange={setTo} options={options} style={{ minWidth: 165 }} /></label><Button disabled={!valid} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại so sánh</Button></Space>
    {!valid ? <p role="status">Chọn hai phiên bản khác nhau.</p> : query.isPending ? <CommonState type="loading" title="Đang so sánh bản đồ" /> : query.isError ? <MapReadError error={query.error} retry={() => query.refetch()} owner={owner} /> : query.data ? <>
      <div className="mapping-summary"><div><span>Trước</span><strong>{query.data.summary.polesBefore}</strong></div><div><span>Sau</span><strong>{query.data.summary.polesAfter}</strong></div><div><span>Chênh lệch</span><strong>{query.data.summary.netChange > 0 ? '+' : ''}{query.data.summary.netChange}</strong></div><div><span>Giữ nguyên</span><strong>{query.data.summary.unchangedCount}</strong></div></div>
      <Space wrap className="workflow-toolbar"><span>Thêm: {query.data.summary.createdCount}</span><span>Loại bỏ: {query.data.summary.removedCount}</span><span>Dời: {query.data.summary.relocatedCount}</span><span>Thay thế: {query.data.summary.replacedCount}</span><Link className="workflow-detail-link" to={`${path}/${encodeURIComponent(from)}`}>Xem bản đồ gốc →</Link><Link className="workflow-detail-link" to={`${path}/${encodeURIComponent(to)}`}>Xem bản đồ đích →</Link></Space>
      <MapChangesViewer key={`${from}:${to}`} comparison={query.data} />
      <Table<MapComparison['changes'][number]> rowKey={(_, index) => String(index)} dataSource={query.data.changes} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 850 }} locale={{ emptyText: 'Không có biến động giữa hai phiên bản.' }} columns={[
        { title: 'Trụ', render: (_, item) => readableCode(item.plantCode) ?? `Hàng ${item.row} · Cột ${item.col}` },
        { title: 'Biến động', render: (_, item) => changeLabel(item.changeType) },
        { title: 'Vị trí trước', render: (_, item) => item.oldPosition ? `${item.oldPosition.lat.toFixed(7)}, ${item.oldPosition.lon.toFixed(7)}` : '—' },
        { title: 'Vị trí sau', render: (_, item) => item.newPosition ? `${item.newPosition.lat.toFixed(7)}, ${item.newPosition.lon.toFixed(7)}` : '—' },
        { title: 'Dịch chuyển', render: (_, item) => item.distanceMovedM == null ? '—' : `${item.distanceMovedM.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m` },
        { title: 'Ghi chú', render: (_, item) => item.notes || '—' },
      ]} />
    </> : null}
  </>
}
