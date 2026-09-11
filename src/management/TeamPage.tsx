import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Space, Table } from 'antd'
import { CommonState } from '../components/CommonState'
import { useAuth } from '../features/auth/AuthContext'
import * as api from './api'
import { confirmation, inviteAction, roleLabel, type Action } from './actions'
import { ActionModal } from './ActionModal'

export function TeamPage() {
  const { session, logout } = useAuth()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<Action | null>(null)
  const allowed = session?.role === 'OWNER' || session?.role === 'TENANT_ADMIN'
  const query = useQuery({ queryKey: ['members', session?.tenant?.id, page], queryFn: () => api.getMembers(session!.accessToken, page), enabled: allowed })
  if (!allowed || !session) return <CommonState type="forbidden" />
  const token = session.accessToken
  return <><section className="resource-page-heading"><div><span className="page-kicker">{session.tenant?.name}</span><h1>Thành viên đơn vị</h1><p>Quản lý vai trò và quyền truy cập của từng thành viên.</p></div>{session.role === 'OWNER' ? <Button type="primary" onClick={() => setAction(inviteAction(token))}>Mời quản trị viên</Button> : null}</section>
    {query.isError ? <CommonState type="error" description={query.error.message} retry={() => query.refetch()} /> : null}
    <Table<api.User> loading={query.isPending} rowKey="id" dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 700 }} columns={[
      { title: 'Họ và tên', dataIndex: 'fullName' }, { title: 'Email', dataIndex: 'email' }, { title: 'Vai trò', render: (_, user) => roleLabel(user.role) },
      { title: 'Thao tác', render: (_, user) => session.role === 'OWNER' && user.role !== 0 && user.email !== session.email ? <Space wrap>
        <Button onClick={() => setAction(confirmation('Đổi vai trò', `Đổi vai trò của ${user.fullName} thành ${user.role === 1 ? 'Thành viên' : 'Quản trị viên'}?`, () => api.changeMemberRole(token, user.id, user.role === 1 ? 'MEMBER' : 'TENANT_ADMIN')))}>Đổi vai trò</Button>
        <Button onClick={() => setAction(confirmation('Kích hoạt quyền truy cập', `Cho phép ${user.fullName} truy cập đơn vị?`, () => api.changeMemberStatus(token, user.id, 'ACTIVE')))}>Kích hoạt</Button>
        <Button danger onClick={() => setAction(confirmation('Ngừng quyền truy cập', `${user.fullName} sẽ không còn quyền truy cập đơn vị này.`, () => api.changeMemberStatus(token, user.id, 'INACTIVE')))}>Ngừng truy cập</Button>
        <Button danger onClick={() => setAction(confirmation('Chuyển quyền Owner', `Chuyển quyền sở hữu cho ${user.fullName} (${user.email})? Bạn sẽ trở thành Tenant Admin và cần đăng nhập lại. Người nhận phải có membership đang hoạt động.`, () => api.transferOwnership(token, user.id), logout))}>Chuyển Owner</Button>
      </Space> : '—' },
    ]} />
    <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
