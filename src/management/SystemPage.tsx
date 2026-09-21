import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Space, Table } from 'antd'
import { CommonState } from '../components/CommonState'
import { useAuth } from '../features/auth/AuthContext'
import * as api from './api'
import { confirmation, emailField, roleLabel, text, type Action } from './actions'
import { ActionModal } from './ActionModal'
import { HarvestQualityGradesPanel, PlantConditionsPanel } from './SystemCatalogs'

export type SystemSection = 'tenants' | 'users' | 'plant-conditions' | 'harvest-quality-grades'

const sectionCopy: Record<SystemSection, { title: string; description: string }> = {
  tenants: { title: 'Đơn vị trên hệ thống', description: 'Tạo đơn vị, quản lý trạng thái và thiết lập Owner ban đầu.' },
  users: { title: 'Người dùng hệ thống', description: 'Kiểm tra tài khoản và quyền tham gia của người dùng tại từng đơn vị.' },
  'plant-conditions': { title: 'Danh mục tình trạng cây', description: 'Quản lý bệnh và các dạng tổn thương được dùng trên toàn hệ thống.' },
  'harvest-quality-grades': { title: 'Chất lượng thu hoạch', description: 'Quản lý các cấp phân loại chất lượng dùng khi ghi nhận thu hoạch.' },
}

export function SystemPage({ section }: { section: SystemSection }) {
  const { session } = useAuth()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<Action | null>(null)
  const [user, setUser] = useState<api.User | null>(null)
  const allowed = session?.role === 'SYSTEM_ADMIN'
  const tenants = useQuery({ queryKey: ['system-tenants', page], queryFn: () => api.getTenants(session!.accessToken, page), enabled: allowed && section === 'tenants' })
  const users = useQuery({ queryKey: ['system-users', page], queryFn: () => api.getUsers(session!.accessToken, page), enabled: allowed && section === 'users' })
  if (!allowed || !session) return <CommonState type="forbidden" />
  const token = session.accessToken
  const directoryQuery = section === 'tenants' ? tenants : section === 'users' ? users : null
  const copy = sectionCopy[section]
  return <><section className="resource-page-heading"><div><span className="page-kicker">SYSTEM ADMIN</span><h1>{copy.title}</h1><p>{copy.description}</p></div>{section === 'tenants' ? <Button type="primary" onClick={() => setAction({ title: 'Tạo đơn vị', fields: [{ key: 'code', label: 'Mã đơn vị', max: 30 }, { key: 'name', label: 'Tên đơn vị', max: 150 }], run: v => api.createTenant(token, { tenantCode: text(v, 'code'), tenantName: text(v, 'name') }) })}>Tạo đơn vị</Button> : null}</section>
    {directoryQuery?.isError ? <CommonState type="error" description={directoryQuery.error.message} retry={() => directoryQuery.refetch()} /> : null}
    {section === 'tenants' ? <Table<api.Tenant> rowKey="id" loading={tenants.isPending} dataSource={tenants.data?.items ?? []} pagination={false} scroll={{ x: 650 }} columns={[
      { title: 'Mã', dataIndex: 'code' }, { title: 'Đơn vị', dataIndex: 'name' }, { title: 'Trạng thái', render: (_, item) => item.status === 0 ? 'Hoạt động' : 'Ngừng hoạt động' },
      { title: 'Thao tác', render: (_, item) => <Space wrap><Button danger={item.status === 0} onClick={() => setAction(confirmation(item.status === 0 ? 'Ngừng hoạt động đơn vị' : 'Kích hoạt đơn vị', `${item.name}: thay đổi trạng thái truy cập của toàn đơn vị?`, () => api.setTenantActive(token, item.id, item.status !== 0)))}>{item.status === 0 ? 'Ngừng hoạt động' : 'Kích hoạt'}</Button><Button onClick={() => setAction({ title: `Mời Owner · ${item.name}`, description: 'Gửi lời mời Owner. Đơn vị cần chưa có Owner đang hoạt động khi người nhận chấp nhận.', fields: [emailField], run: v => api.provisionOwner(token, item.id, text(v, 'email')), success: 'Đã tạo lời mời Owner.' })}>Mời Owner</Button></Space> },
    ]} /> : null}
    {section === 'users' ? <Table<api.User> rowKey="id" loading={users.isPending} dataSource={users.data?.items ?? []} pagination={false} columns={[
      { title: 'Họ và tên', dataIndex: 'fullName' }, { title: 'Email', dataIndex: 'email' }, { title: 'Thao tác', render: (_, item) => <Button onClick={() => setUser(item)}>Xem quyền đơn vị</Button> },
    ]} /> : null}
    {section === 'plant-conditions' ? <PlantConditionsPanel token={token} setAction={setAction} /> : null}
    {section === 'harvest-quality-grades' ? <HarvestQualityGradesPanel token={token} setAction={setAction} /> : null}
    {directoryQuery ? <Pagination current={page} pageSize={20} total={directoryQuery.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} /> : null}
    {user ? <MembershipList key={user.id} user={user} token={token} setAction={setAction} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
function MembershipList({ user, token, setAction }: { user: api.User; token: string; setAction: (action: Action) => void }) {
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['user-memberships', user.id, page], queryFn: () => api.getMemberships(token, user.id, page) })
  const tenantNames = useQuery({ queryKey: ['system-tenant-names'], queryFn: async () => {
    const names: Record<string, string> = {}
    let nextPage = 1
    let more = true
    while (more) {
      const result = await api.getTenants(token, nextPage++)
      for (const tenant of result.items) names[tenant.id] = `${tenant.name} (${tenant.code})`
      more = result.hasNextPage
    }
    return names
  } })
  return <section className="resource-panel"><h2>Quyền đơn vị · {user.fullName}</h2>{query.isError ? <CommonState type="error" description={query.error.message} retry={() => query.refetch()} /> : null}
    <Table<api.Membership> rowKey="id" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} columns={[
      { title: 'Đơn vị', render: (_, m) => tenantNames.data?.[m.tenantId] ?? m.tenantId }, { title: 'Vai trò', render: (_, m) => roleLabel(m.role) }, { title: 'Trạng thái', render: (_, m) => m.status === 0 ? 'Hoạt động' : 'Ngừng hoạt động' },
      { title: 'Thao tác', render: (_, m) => m.role === 0 && m.status === 0 ? 'Owner được bảo vệ' : <Button danger={m.status === 0} onClick={() => setAction(confirmation('Thay đổi quyền truy cập đơn vị', `Xác nhận ${m.status === 0 ? 'ngừng' : 'kích hoạt'} quyền truy cập của ${user.fullName}?`, () => api.setMembershipActive(token, m.id, m.status !== 0)))}>{m.status === 0 ? 'Ngừng truy cập' : 'Kích hoạt'}</Button> },
    ]} /><Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
  </section>
}
