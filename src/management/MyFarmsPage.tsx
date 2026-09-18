import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Select, Space, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { CommonState } from '../components/CommonState'
import { getMyFarmAssignments } from './api'
import { farmRoleLabel } from './actions'

export function MyFarmsPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(1)
  const [role, setRole] = useState('')
  const query = useQuery({ queryKey: ['my-farm-assignments', session?.tenant?.id, session?.email, page, role], queryFn: ({ signal }) => getMyFarmAssignments(session!.accessToken, page, role, signal), enabled: Boolean(session?.tenant) })
  if (!session?.tenant) return <CommonState type="forbidden" />
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">{session.tenant.name}</span><h1>Nông trại được giao</h1><p>Các phân công đang hoạt động của bạn và khu vực được phép làm việc.</p></div></section>
    <Space wrap style={{ marginBottom: 20 }}><Select aria-label="Lọc vai trò được giao" style={{ minWidth: 180 }} value={role} onChange={value => { setRole(value); setPage(1) }} options={[{ value: '', label: 'Tất cả vai trò' }, { value: 'MANAGER', label: 'Quản lý' }, { value: 'WORKER', label: 'Nhân viên' }]} /><Button loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button></Space>
    {query.isPending ? <CommonState type="loading" /> : query.isError ? <CommonState type="error" description={query.error.message} retry={() => query.refetch()} /> : <>
      {query.data.items.length === 0 ? <CommonState type="empty" title="Chưa có nông trại được giao" description="Phân công phù hợp sẽ xuất hiện khi quản trị viên cấp quyền. Bạn có thể đổi bộ lọc hoặc tải lại." /> : null}
      <div className="resource-grid">{query.data.items.map(item => <article className="resource-card" key={item.farmMembershipId}>
        <span className="page-kicker">{item.farm.code}</span><h2>{item.farm.name}</h2><p>{item.farm.address ?? 'Chưa cập nhật địa chỉ'}</p>
        <Tag color="green">{farmRoleLabel(item.role)}</Tag><p>{item.accessScope === 'ALL_ZONES' ? 'Tất cả khu vực' : 'Các khu vực được chọn'}</p>
        {item.zones.length ? <ul>{item.zones.map(zone => <li key={zone.id}>{zone.name} · {zone.code}</li>)}</ul> : <p>Chưa có khu vực hoạt động trong phạm vi này.</p>}
        <Space wrap><Link className="resource-card-link" to={`/farms/${encodeURIComponent(item.farm.id)}`}>Mở nông trại →</Link><Link to={`/zones?farmId=${encodeURIComponent(item.farm.id)}`}>Xem khu vực</Link></Space>
      </article>)}</div>
      <Pagination current={page} pageSize={20} total={query.data.totalCount} showSizeChanger={false} onChange={setPage} />
    </>}
  </>
}
