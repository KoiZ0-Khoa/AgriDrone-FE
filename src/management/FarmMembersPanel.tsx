import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Select, Space, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { CommonState } from '../components/CommonState'
import { getFarmMembers, type FarmMember } from './api'
import { canRevokeFarmMember, farmRoleLabel, revokeFarmAction, type Action } from './actions'
import { ActionModal } from './ActionModal'

export function FarmMembersPanel({ farmId }: { farmId: string }) {
  const { session } = useAuth()
  const [page, setPage] = useState(1)
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [action, setAction] = useState<Action | null>(null)
  const allowed = session?.role === 'OWNER' || session?.role === 'TENANT_ADMIN'
  const query = useQuery({ queryKey: ['farm-members', session?.tenant?.id, farmId, page, role, status], queryFn: ({ signal }) => getFarmMembers(session!.accessToken, farmId, page, role, status, signal), enabled: allowed })
  if (!session || !allowed) return null
  return <section className="resource-panel" style={{ marginTop: 18 }}>
    <div className="resource-panel-heading"><div><strong>Thành viên nông trại</strong><span>Vai trò và phạm vi làm việc được phân công tại nông trại này.</span></div><Link to="/team">Mời thành viên vào đơn vị</Link></div>
    <Space wrap style={{ marginBottom: 20 }}>
      <Select aria-label="Lọc vai trò trong nông trại" style={{ minWidth: 170 }} value={role} onChange={value => { setRole(value); setPage(1) }} options={[{ value: '', label: 'Tất cả vai trò' }, { value: 'MANAGER', label: 'Quản lý' }, { value: 'WORKER', label: 'Nhân viên' }]} />
      <Select aria-label="Lọc trạng thái phân công" style={{ minWidth: 180 }} value={status} onChange={value => { setStatus(value); setPage(1) }} options={[{ value: 'ACTIVE', label: 'Đang được phân công' }, { value: 'INACTIVE', label: 'Đã thu hồi' }]} />
      <Button loading={query.isFetching} onClick={() => { void query.refetch() }}>Tải lại</Button>
    </Space>
    {query.isError ? <CommonState type="error" description={query.error.message} retry={() => query.refetch()} /> : <>
      <Table<FarmMember> loading={query.isPending} rowKey="farmMembershipId" dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: 'Chưa có thành viên phù hợp với bộ lọc.' }} columns={[
        { title: 'Thành viên', render: (_, member) => <><strong>{member.fullName}</strong><div>{member.email}</div></> },
        { title: 'Vai trò', render: (_, member) => farmRoleLabel(member.role) },
        { title: 'Phạm vi', render: (_, member) => member.accessScope === 'ALL_ZONES' ? 'Tất cả khu vực' : `${member.zoneIds.length} khu vực được chọn` },
        { title: 'Trạng thái', render: (_, member) => <Tag color={member.status === 'ACTIVE' ? 'green' : 'default'}>{member.status === 'ACTIVE' ? 'Đang phân công' : 'Đã thu hồi'}</Tag> },
        { title: 'Thao tác', render: (_, member) => canRevokeFarmMember(session.role, member) ? <Button danger onClick={() => setAction(revokeFarmAction(session.accessToken, { ...member }, session.role))}>Thu hồi</Button> : member.status === 'INACTIVE' ? '—' : 'Chỉ Owner được thu hồi' },
      ]} />
      <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
    </>}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </section>
}
