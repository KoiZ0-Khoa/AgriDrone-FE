import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Drawer, Form, Modal, Pagination, Select, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { ActionModal } from '../../management/ActionModal'
import { emailField, text, type Action, type Field } from '../../management/actions'
import { getUsers } from '../../management/api'
import * as api from './api'
import type { Manager } from './types'
import { dateTime, isEligibleManager, managerLabels, workflowError } from './workflow'

const reason: Field = { key: 'reason', label: 'Lý do thay đổi', kind: 'multiline', max: 2000 }
const options = (values: string[]) => values.map(value => ({ value, label: managerLabels[value] }))

export function ManagersPage() {
  const token = useAuth().session!.accessToken
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', availability: '', qualificationStatus: '' })
  const [selectedId, setSelectedId] = useState('')
  const [action, setAction] = useState<Action | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const query = useQuery({ queryKey: ['system-managers', page, filters], queryFn: ({ signal }) => api.getManagers(token, page, filters, signal) })
  const detail = useQuery({ queryKey: ['system-manager', selectedId], queryFn: ({ signal }) => api.getManager(token, selectedId, signal), enabled: Boolean(selectedId) })
  function filter(key: keyof typeof filters, value: string) { setPage(1); setFilters(previous => ({ ...previous, [key]: value })) }
  function stateAction(manager: Manager): Action {
    const activate = manager.status !== 'ACTIVE'
    return { title: `${activate ? 'Kích hoạt' : 'Đình chỉ'} · ${manager.fullName}`, description: activate ? 'Sau khi kích hoạt, cần kiểm tra chứng chỉ và khả năng nhận việc riêng.' : 'Manager sẽ ngừng nhận việc mới. Lịch sử phân công được giữ lại.', fields: [reason], danger: !activate,
      run: values => api.changeManagerState(token, manager.id, activate ? 'activate' : 'suspend', { reason: text(values, 'reason'), expectedVersion: manager.version }) }
  }
  function qualificationAction(manager: Manager): Action {
    return { title: `Chứng chỉ bay · ${manager.fullName}`, fields: [
      { key: 'status', label: 'Tình trạng chứng chỉ', kind: 'select', value: manager.qualificationStatus, options: options(['PENDING', 'QUALIFIED', 'SUSPENDED', 'REVOKED']) },
      { key: 'expiresAt', label: 'Hết hạn lúc (bắt buộc khi đủ điều kiện)', kind: 'datetime-local', optional: true }, reason,
    ], run: values => {
      const status = values.status as Manager['qualificationStatus']
      const expiresAt = values.expiresAt ? new Date(values.expiresAt).toISOString() : null
      if (status === 'QUALIFIED' && (!expiresAt || Date.parse(expiresAt) <= Date.now())) throw new Error('Chứng chỉ đủ điều kiện cần ngày hết hạn trong tương lai.')
      return api.changeManagerQualification(token, manager.id, { status, expiresAt, reason: text(values, 'reason'), expectedVersion: manager.version })
    } }
  }
  const manager = detail.data
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">NHÂN SỰ VẬN HÀNH</span><h1>System Manager</h1><p>Quản lý hồ sơ, chứng chỉ bay và khả năng nhận công việc khảo sát.</p></div>
      <Space wrap><Button onClick={() => setCreateOpen(true)}>Tạo hồ sơ từ tài khoản</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setAction({ title: 'Mời System Manager', description: 'Gửi lời mời qua email. Người đã có tài khoản sử dụng tài khoản hiện tại để chấp nhận.', fields: [emailField], success: 'Đã tạo lời mời System Manager', run: values => api.inviteManager(token, text(values, 'email')) })}>Mời System Manager</Button></Space>
    </section>
    <section className="resource-panel">
      <div className="workflow-toolbar">
        <Select aria-label="Trạng thái hồ sơ" value={filters.status} onChange={value => filter('status', value)} options={[{ value: '', label: 'Tất cả trạng thái' }, ...options(['ACTIVE', 'SUSPENDED'])]} />
        <Select aria-label="Khả năng nhận việc" value={filters.availability} onChange={value => filter('availability', value)} options={[{ value: '', label: 'Tất cả khả năng nhận việc' }, ...options(['AVAILABLE', 'UNAVAILABLE'])]} />
        <Select aria-label="Tình trạng chứng chỉ" value={filters.qualificationStatus} onChange={value => filter('qualificationStatus', value)} options={[{ value: '', label: 'Tất cả chứng chỉ' }, ...options(['PENDING', 'QUALIFIED', 'SUSPENDED', 'REVOKED'])]} />
        <Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button>
      </div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<Manager> rowKey="id" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 820 }} locale={{ emptyText: 'Chưa có Manager phù hợp với bộ lọc.' }} columns={[
          { title: 'Manager', render: (_, item) => <div><strong>{item.fullName}</strong><div className="form-hint">{item.email}</div></div> },
          { title: 'Hồ sơ', render: (_, item) => <Tag color={item.status === 'ACTIVE' ? 'success' : 'default'}>{managerLabels[item.status]}</Tag> },
          { title: 'Nhận việc', render: (_, item) => managerLabels[item.availability] },
          { title: 'Chứng chỉ', render: (_, item) => <><span>{managerLabels[item.qualificationStatus]}</span><div className="form-hint">{dateTime(item.qualificationExpiresAt)}</div></> },
          { title: 'Thao tác', render: (_, item) => <Button onClick={() => setSelectedId(item.id)}>Xem hồ sơ</Button> },
        ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
    <Drawer open={Boolean(selectedId)} title="Hồ sơ System Manager" onClose={() => setSelectedId('')} size={560}>
      {detail.isPending ? <CommonState type="loading" /> : detail.isError ? <CommonState type="error" description={workflowError(detail.error)} retry={() => detail.refetch()} /> : manager ? <>
        <h2>{manager.fullName}</h2><p>{manager.email}</p>
        <Alert showIcon type={isEligibleManager(manager) ? 'success' : 'info'} title={isEligibleManager(manager) ? 'Đủ điều kiện nhận phân công' : 'Chưa đủ điều kiện nhận phân công'} description="Cần hồ sơ hoạt động, sẵn sàng nhận việc và chứng chỉ hợp lệ chưa hết hạn." />
        <dl className="detail-list"><div><dt>Hồ sơ</dt><dd>{managerLabels[manager.status]}</dd></div><div><dt>Nhận việc</dt><dd>{managerLabels[manager.availability]}</dd></div><div><dt>Chứng chỉ</dt><dd>{managerLabels[manager.qualificationStatus]}</dd></div><div><dt>Hết hạn</dt><dd>{dateTime(manager.qualificationExpiresAt)}</dd></div></dl>
        <Space wrap><Button danger={manager.status === 'ACTIVE'} onClick={() => setAction(stateAction(manager))}>{manager.status === 'ACTIVE' ? 'Đình chỉ hồ sơ' : 'Kích hoạt hồ sơ'}</Button>
          <Button onClick={() => setAction({ title: `Khả năng nhận việc · ${manager.fullName}`, fields: [{ key: 'availability', label: 'Nhận việc', kind: 'select', value: manager.availability, options: options(['AVAILABLE', 'UNAVAILABLE']) }, reason], run: values => api.changeManagerAvailability(token, manager.id, { availability: values.availability as Manager['availability'], reason: text(values, 'reason'), expectedVersion: manager.version }) })}>Cập nhật nhận việc</Button>
          <Button onClick={() => setAction(qualificationAction(manager))}>Cập nhật chứng chỉ</Button></Space>
      </> : null}
    </Drawer>
    {createOpen ? <CreateManager token={token} close={() => setCreateOpen(false)} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}

function CreateManager({ token, close }: { token: string; close: () => void }) {
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState<string>()
  const client = useQueryClient()
  const users = useQuery({ queryKey: ['system-users', page], queryFn: () => getUsers(token, page) })
  const mutation = useMutation({ mutationFn: () => api.createManager(token, userId!), onSuccess: async () => { close(); await client.invalidateQueries({ queryKey: ['system-managers'] }) } })
  return <Modal open title="Tạo hồ sơ System Manager" okText="Tạo hồ sơ" cancelText="Hủy" confirmLoading={mutation.isPending} okButtonProps={{ disabled: !userId || users.isError }} onOk={() => { if (userId && !mutation.isPending) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    <p>Chọn tài khoản đã có trên hệ thống. Hồ sơ mới sẽ chờ kích hoạt và xác minh chứng chỉ.</p>
    <Form layout="vertical"><Form.Item label="Tài khoản" required><Select showSearch optionFilterProp="label" value={userId} loading={users.isPending} disabled={mutation.isPending} onChange={setUserId} options={users.data?.items.map(user => ({ value: user.id, label: `${user.fullName} · ${user.email}` }))} /></Form.Item></Form>
    <Pagination size="small" current={page} total={users.data?.totalCount ?? 0} pageSize={20} showSizeChanger={false} disabled={mutation.isPending} onChange={next => { setUserId(undefined); setPage(next) }} />
    {users.isError || mutation.isError ? <Alert showIcon type="error" title={workflowError(mutation.error ?? users.error)} /> : null}
  </Modal>
}
