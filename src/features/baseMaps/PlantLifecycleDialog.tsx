import { useQuery } from '@tanstack/react-query'
import { Drawer, Empty, Timeline } from 'antd'
import { readableCode } from '../../components/RecordReference'
import { dateTime } from '../surveys/workflow'
import { getPlantLifecycle } from './api'
import { MapReadError } from './MapReadError'
import { changeLabel, lifecycleLabel } from './workflow'

export function PlantLifecycleDialog({ token, scopeKey, farmId, plantId, close, owner }: { token: string; scopeKey: string; farmId: string; plantId: string; close: () => void; owner: boolean }) {
  const query = useQuery({ queryKey: ['plant-lifecycle', scopeKey, farmId, plantId], queryFn: ({ signal }) => getPlantLifecycle(token, farmId, plantId, signal), retry: false })
  return <Drawer open title="Lịch sử trụ cây" size={520} onClose={close} loading={query.isPending}>
    {query.isError ? <MapReadError error={query.error} retry={() => query.refetch()} owner={owner} /> : query.data ? <>
      <h2>{readableCode(query.data.plantCode) ?? 'Trụ cây'}</h2>
      <dl className="detail-list"><div><dt>Trạng thái hiện tại</dt><dd>{lifecycleLabel(query.data.lifecycleStatus)}</dd></div><div><dt>Vị trí hiện tại</dt><dd>Hàng {query.data.currentRow ?? '—'} · Cột {query.data.currentCol ?? '—'}</dd></div><div><dt>Tọa độ hiện tại</dt><dd>{query.data.currentLocation ? `${query.data.currentLocation.lat}, ${query.data.currentLocation.lon}` : 'Chưa có'}</dd></div></dl>
      {query.data.timeline.length ? <Timeline items={query.data.timeline.map(event => ({ key: event.eventId, children: <><strong>{changeLabel(event.changeType)}</strong><p className="form-hint">{dateTime(event.createdAt)}</p><p>{event.summary || event.notes}</p>{event.oldPosition || event.newPosition ? <p className="form-hint">{event.oldPosition ? `${event.oldPosition.lat}, ${event.oldPosition.lon}` : 'Chưa có vị trí'} → {event.newPosition ? `${event.newPosition.lat}, ${event.newPosition.lon}` : 'Không có vị trí mới'}</p> : null}</> }))} /> : <Empty description="Chưa có sự kiện vòng đời." />}
    </> : null}
  </Drawer>
}
