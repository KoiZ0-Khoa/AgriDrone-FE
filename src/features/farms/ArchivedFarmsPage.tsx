import { ArrowLeftOutlined, EyeOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Modal, Pagination, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getArchivedFarm, getArchivedFarms, restoreFarm } from './farmsApi'
import { isVersionConflict } from './managementErrors'
import type { ArchivedFarm } from './types'

const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const area = (value: number | null) => value === null ? 'Chưa cập nhật' : `${value.toLocaleString('vi-VN')} ha`
const ownerOnly = 'Chỉ Owner được xem và khôi phục nông trại đã lưu trữ.'

export function ArchivedFarmsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(1)
  const allowed = Boolean(session?.tenant && session.role === 'OWNER')
  const query = useQuery({ queryKey: ['archived-farms', session?.tenant?.id, page], queryFn: () => getArchivedFarms(session!.accessToken, page), enabled: allowed })
  if (!allowed) return <CommonState type="forbidden" description={ownerOnly} />
  return <>
    <Link className="back-link" to="/farms"><ArrowLeftOutlined /> Nông trại đang sử dụng</Link>
    <section className="resource-page-heading"><div><span className="page-kicker">{session?.tenant?.name}</span><h1>Nông trại đã lưu trữ</h1><p>Xem lại thông tin và khôi phục nông trại khi cần tiếp tục sử dụng.</p></div><Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></section>
    <section className="resource-panel" aria-label="Nông trại đã lưu trữ">
      {query.isError ? <ArchivedError error={query.error} retry={() => { void query.refetch() }} /> : <>
        <Table<ArchivedFarm> rowKey="id" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: 'Chưa có nông trại đã lưu trữ trong trang này.' }} columns={[
          { title: 'Nông trại', render: (_, farm) => <><strong>{farm.name}</strong><div className="resource-code">{farm.code}</div></> },
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
      <section className="resource-page-heading"><div><span className="page-kicker">{farm.code}</span><h1>{farm.name}</h1><p>{farm.address ?? 'Chưa cập nhật địa chỉ'}</p></div><Tag>Đã lưu trữ</Tag></section>
      <section className="resource-panel">
        <div className="resource-panel-heading"><div><strong>Thông tin nông trại đã lưu trữ</strong><span>{session?.tenant?.name}</span></div><RestoreFarmButton key={`${session?.tenant?.id}:${farm.id}`} farm={farm} refreshing={query.isFetching} reload={() => { void query.refetch() }} /></div>
        <dl className="detail-list">
          <div><dt>Mã nông trại</dt><dd>{farm.code}</dd></div>
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

function RestoreFarmButton({ farm, refreshing, reload }: { farm: ArchivedFarm; refreshing: boolean; reload: () => void }) {
  const { session } = useAuth()
  const client = useQueryClient()
  const navigate = useNavigate()
  const { message } = App.useApp()
  // Keep the confirmation's reviewed version even if the detail refreshes in the background.
  const [snapshot, setSnapshot] = useState<ArchivedFarm | null>(null)
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!session?.tenant || session.role !== 'OWNER') throw new Error(ownerOnly)
      if (!snapshot || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1) throw new Error('Hãy tải lại chi tiết nông trại trước khi khôi phục.')
      await restoreFarm(session.accessToken, snapshot.id, { expectedVersion: snapshot.version })
    },
    onSuccess: async () => {
      setSnapshot(null)
      message.success('Đã khôi phục nông trại')
      navigate(`/farms/${encodeURIComponent(farm.id)}`, { replace: true })
      await Promise.all([
        client.invalidateQueries({ queryKey: ['archived-farms', session?.tenant?.id] }),
        client.invalidateQueries({ queryKey: ['archived-farm', session?.tenant?.id, farm.id] }),
        client.invalidateQueries({ queryKey: ['farms', session?.tenant?.id] }),
        client.invalidateQueries({ queryKey: ['farm', session?.tenant?.id, farm.id] }),
        client.invalidateQueries({ queryKey: ['my-farm-assignments', session?.tenant?.id] }),
      ])
    },
  })
  const conflict = isVersionConflict(mutation.error)
  const forbidden = mutation.error instanceof ApiError && mutation.error.status === 403
  const missing = mutation.error instanceof ApiError && mutation.error.status === 404
  const duplicateCode = mutation.error instanceof ApiError && mutation.error.code === 'Farm.FarmCodeAlreadyExist'
  const blocked = conflict || forbidden || missing || duplicateCode
  return <>
    <Button type="primary" icon={<UndoOutlined aria-hidden="true" />} disabled={refreshing} onClick={() => { mutation.reset(); setSnapshot({ ...farm }) }}>Khôi phục nông trại</Button>
    <Modal open={snapshot !== null} title="Khôi phục nông trại" okText="Xác nhận khôi phục" cancelText="Hủy" confirmLoading={mutation.isPending}
      okButtonProps={{ disabled: blocked }} cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
      onOk={() => { if (!blocked && !mutation.isPending && snapshot) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) setSnapshot(null) }}>
      <p>Khôi phục <strong>{snapshot?.name}</strong> ({snapshot?.code}) về danh sách nông trại đang sử dụng. Thông tin và lịch sử được giữ lại.</p>
      <p>Các khu vực đã lưu trữ không tự được khôi phục cùng nông trại.</p>
      {mutation.isError ? <Alert type="error" showIcon title={conflict ? 'Nông trại vừa được cập nhật. Tải lại, kiểm tra thông tin và xác nhận lại.' : forbidden ? ownerOnly : missing ? 'Nông trại không còn trong phạm vi truy cập. Hãy quay lại danh sách.' : duplicateCode ? 'Không thể khôi phục vì đã có nông trại đang sử dụng cùng mã. Hãy xử lý mã trùng trước.' : mutation.error.message} /> : null}
      {conflict ? <Button onClick={() => { setSnapshot(null); reload() }}>Đóng và tải lại chi tiết</Button> : null}
    </Modal>
  </>
}
