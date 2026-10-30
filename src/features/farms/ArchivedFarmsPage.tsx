import { readableCode } from '../../components/RecordReference'
import { ArrowLeftOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getArchivedFarm, getArchivedFarms } from './farmsApi'
import type { ArchivedFarm } from './types'

const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const area = (value: number | null) => value === null ? 'Chưa cập nhật' : `${value.toLocaleString('vi-VN')} ha`
const ownerOnly = 'Chỉ Owner được xem nông trại đã lưu trữ.'

export function ArchivedFarmsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(1)
  const allowed = Boolean(session?.tenant && session.role === 'OWNER')
  const query = useQuery({ queryKey: ['archived-farms', session?.tenant?.id, page], queryFn: () => getArchivedFarms(session!.accessToken, page), enabled: allowed })
  if (!allowed) return <CommonState type="forbidden" description={ownerOnly} />
  return <>
    <Link className="back-link" to="/farms"><ArrowLeftOutlined /> Nông trại đang sử dụng</Link>
    <section className="resource-page-heading"><div><span className="page-kicker">{session?.tenant?.name}</span><h1>Nông trại đã lưu trữ</h1><p>Xem thông tin và lịch sử của các nông trại đã lưu trữ.</p></div><Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel" aria-label="Nông trại đã lưu trữ">
      {query.isError ? <ArchivedError error={query.error} retry={() => { void query.refetch() }} /> : <>
        <Table<ArchivedFarm> rowKey="id" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: 'Chưa có nông trại đã lưu trữ trong trang này.' }} columns={[
          { title: 'Nông trại', render: (_, farm) => <><strong>{farm.name}</strong><div className="resource-code">{readableCode(farm.code)}</div></> },
          { title: 'Diện tích', render: (_, farm) => area(farm.areaHectares) },
          { title: 'Thời điểm lưu trữ', render: (_, farm) => date(farm.archivedAt) },
          { title: 'Thao tác', render: (_, farm) => <Link className="table-action-link" to={`/farms/archived/${encodeURIComponent(farm.id)}`}><EyeOutlined aria-hidden="true" /> Xem chi tiết</Link> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
  </>
}

export function ArchivedFarmDetailPage() {
  const { farmId = '' } = useParams()
  const { session } = useAuth()
  const allowed = Boolean(session?.tenant && session.role === 'OWNER')
  const query = useQuery({ queryKey: ['archived-farm', session?.tenant?.id, farmId], queryFn: () => getArchivedFarm(session!.accessToken, farmId), enabled: allowed && Boolean(farmId) })
  if (!allowed) return <CommonState type="forbidden" description={ownerOnly} />
  const farm = query.data
  return <>
    <Link className="back-link" to="/farms/archived"><ArrowLeftOutlined /> Danh sách đã lưu trữ</Link>
    {query.isPending ? <CommonState type="loading" title="Đang tải nông trại đã lưu trữ" /> : query.isError ? <ArchivedError error={query.error} retry={() => { void query.refetch() }} /> : farm ? <>
      <section className="resource-page-heading"><div><span className="page-kicker">{readableCode(farm.code)}</span><h1>{farm.name}</h1><p>{farm.address ?? 'Chưa cập nhật địa chỉ'}</p></div><Tag>Đã lưu trữ</Tag></section>
      <section className="resource-panel">
        <div className="resource-panel-heading"><div><strong>Thông tin nông trại đã lưu trữ</strong><span>{session?.tenant?.name}</span></div><span className="form-hint">Khôi phục đang tạm ngừng trong luồng vận hành hiện tại.</span></div>
        <dl className="detail-list">
          {readableCode(farm.code) ? <div><dt>Mã nông trại</dt><dd>{readableCode(farm.code)}</dd></div> : null}
          <div><dt>Diện tích</dt><dd>{area(farm.areaHectares)}</dd></div>
          <div><dt>Ngày tạo</dt><dd>{date(farm.createdAt)}</dd></div>
          <div><dt>Cập nhật lần cuối</dt><dd>{date(farm.updatedAt)}</dd></div>
          <div><dt>Thời điểm lưu trữ</dt><dd>{date(farm.archivedAt)}</dd></div>
          <div><dt>Tọa độ tâm</dt><dd>{farm.centerPoint ? `${farm.centerPoint.coordinates[1].toFixed(7)}, ${farm.centerPoint.coordinates[0].toFixed(7)}` : 'Chưa cập nhật'}</dd></div>
          <div><dt>Ranh giới</dt><dd>{farm.boundary ? `Đã lưu ${farm.boundary.coordinates[0]?.length ?? 0} điểm ranh giới.` : 'Chưa thiết lập'}</dd></div>
        </dl>
      </section>
    </> : null}
  </>
}

function ArchivedError({ error, retry }: { error: Error; retry: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <CommonState type="forbidden" description={ownerOnly} />
  if (error instanceof ApiError && error.status === 404) return <CommonState type="empty" title="Không tìm thấy nông trại đã lưu trữ" description="Nông trại có thể đã được khôi phục hoặc không thuộc đơn vị hiện tại. Hãy quay lại danh sách." />
  return <CommonState type="error" description={error.message} retry={retry} />
}
