import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App as AntApp, Button, Form, Input, Select } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import type { AuthSession } from '../auth/types'
import { assignFarmMember, getFarmAssignment, getAssignableUsers } from './farmAssignmentsApi'
import { getZones } from './farmsApi'
import type { AssignFarmMemberRequest, FarmAssignment, TenantUser, Zone } from './types'

export function FarmAssignmentPanel({ farmId, session }: { farmId: string; session: AuthSession }) {
  const [userId, setUserId] = useState<string>()
  const adminsQuery = useQuery({
    queryKey: ['assignable-users', session.tenant!.id, session.role],
    queryFn: ({ signal }) => getAssignableUsers(session.accessToken, session.role, signal),
  })
  const selectedUser = adminsQuery.data?.find((user) => user.id === userId)

  return (
    <section className="resource-panel farm-assignment-panel" aria-label="Phân công thành viên">
      <div className="resource-panel-heading">
        <div>
          <strong>Phân công thành viên</strong>
          <span>Chọn thành viên đã tham gia đơn vị, vai trò và khu vực làm việc.</span>
        </div>
      </div>
      {adminsQuery.isPending ? <CommonState type="loading" title="Đang tải thành viên" /> : null}
      {adminsQuery.isError ? (
        adminsQuery.error instanceof ApiError && adminsQuery.error.status === 403
          ? <CommonState type="forbidden" />
          : <CommonState type="error" description={adminsQuery.error.message} retry={() => adminsQuery.refetch()} />
      ) : null}
      {adminsQuery.isSuccess && adminsQuery.data.length === 0 ? (
        <CommonState type="empty" title="Chưa có thành viên phù hợp" description="Mời thành viên vào đơn vị và chờ họ chấp nhận trước khi phân công. Chỉ Owner được phân công cho quản trị viên." />
      ) : null}
      {adminsQuery.isSuccess && adminsQuery.data.length > 0 ? (
        <>
          <label className="assignment-select-label" htmlFor="farm-assignment-user">Thành viên đơn vị</label>
          <Select
            id="farm-assignment-user"
            className="assignment-user-select"
            placeholder="Tìm theo tên hoặc email"
            showSearch={{ optionFilterProp: 'label' }}
            value={userId}
            onChange={setUserId}
            options={adminsQuery.data.map((user) => ({ value: user.id, label: `${user.fullName} — ${user.email}` }))}
          />
          {selectedUser ? (
            <AssignmentEditor key={selectedUser.id} farmId={farmId} user={selectedUser} session={session} />
          ) : <p className="assignment-help">Chọn một người để xem hoặc cập nhật phân công.</p>}
        </>
      ) : null}
    </section>
  )
}

function AssignmentEditor({ farmId, user, session }: { farmId: string; user: TenantUser; session: AuthSession }) {
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()
  const queryKey = ['farm-assignment', session.tenant!.id, farmId, user.id, session.accessToken]
  const assignmentQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getFarmAssignment(session.accessToken, farmId, user.id, signal),
    staleTime: 0,
    retry: false,
    refetchOnReconnect: false,
  })
  const zonesQuery = useQuery({ queryKey: ['zones', session.tenant!.id, farmId], queryFn: () => getZones(session.accessToken, farmId) })
  const mutation = useMutation({
    mutationFn: (request: AssignFarmMemberRequest) => assignFarmMember(session.accessToken, farmId, user.id, request),
    onSuccess: async (assignment) => {
      queryClient.setQueryData(queryKey, assignment)
      message.success(`Đã lưu phân công cho ${user.fullName}`)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['farm-members'] }), queryClient.invalidateQueries({ queryKey: ['my-farm-assignments'] })])
    },
  })
  const assignment = assignmentQuery.data
  const alreadyAssigned = assignment?.status === 'ACTIVE'
  const conflict = mutation.error instanceof ApiError
    && ['FarmMembership.ConcurrentUpdate', 'FarmMembership.ExpectedVersionRequired'].includes(mutation.error.code ?? '')
  const forbidden = mutation.error instanceof ApiError && mutation.error.status === 403

  async function reloadAssignment() {
    await assignmentQuery.refetch()
    mutation.reset()
  }

  if (assignmentQuery.isPending) return <CommonState type="loading" title="Đang kiểm tra phân công" />
  if (assignmentQuery.isError) {
    return assignmentQuery.error instanceof ApiError && assignmentQuery.error.status === 403
      ? <CommonState type="forbidden" />
      : <CommonState type="error" description={assignmentQuery.error.message} retry={reloadAssignment} />
  }

  return (
    <div className="assignment-editor">
      <Alert
        type={alreadyAssigned ? 'success' : 'info'}
        showIcon
        title={alreadyAssigned ? 'Đang được phân công' : assignment ? 'Phân công đã được thu hồi' : 'Chưa được phân công vào nông trại này'}
        description={assignment
          ? `Vai trò: ${assignment.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'} · Phạm vi: ${assignment.accessScope === 'ALL_ZONES' ? 'Tất cả khu vực' : `${assignment.zoneIds.length} khu vực được chọn`} · ${assignment.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}`
          : 'Chọn vai trò và phạm vi trước khi lưu.'}
      />
      {conflict ? <CommonState type="conflict" reload={reloadAssignment} /> : null}
      {forbidden ? <CommonState type="forbidden" /> : null}
      {mutation.isError && !conflict && !forbidden ? (
        <Alert type="error" showIcon title="Không thể lưu phân công" description={
          mutation.error instanceof ApiError && mutation.error.code === 'FarmMembership.TargetTenantMembershipInactive'
            ? 'Tư cách thành viên đã ngừng hoạt động. Hãy chọn người khác.'
            : mutation.error.message
        } />
      ) : null}
      {zonesQuery.isPending ? <CommonState type="loading" title="Đang tải khu vực" /> : zonesQuery.isError ? <CommonState type="error" description={zonesQuery.error.message} retry={() => zonesQuery.refetch()} /> : <AssignmentForm key={assignment?.version ?? 'new'} user={user} assignment={assignment ?? null} zones={zonesQuery.data} busy={mutation.isPending} disabled={assignmentQuery.isFetching || conflict || forbidden} submit={body => mutation.mutate(body)} />}
    </div>
  )
}

function AssignmentForm({ user, assignment, zones, busy, disabled, submit }: { user: TenantUser; assignment: FarmAssignment | null; zones: Zone[]; busy: boolean; disabled: boolean; submit: (body: AssignFarmMemberRequest) => void }) {
  const [form] = Form.useForm<AssignFarmMemberRequest>()
  const scope = Form.useWatch('accessScope', form) ?? assignment?.accessScope ?? 'ALL_ZONES'
  const activeZones = zones.filter(zone => zone.status === 0 || zone.status === 'Active')
  const tenantAdmin = user.role === 1 || user.role === 'TenantAdmin'
  return <Form form={form} layout="vertical" disabled={busy || disabled} initialValues={{ role: tenantAdmin ? 'MANAGER' : assignment?.role ?? 'WORKER', accessScope: assignment?.accessScope ?? 'ALL_ZONES', zoneIds: assignment?.zoneIds ?? [] }} onFinish={values => {
    if (busy || disabled) return
    submit({ role: tenantAdmin ? 'MANAGER' : values.role, accessScope: values.accessScope, zoneIds: values.accessScope === 'ALL_ZONES' ? [] : values.zoneIds, expectedVersion: assignment?.version ?? null, reason: values.reason?.trim() || null })
  }}>
    <Form.Item name="role" label="Vai trò tại nông trại" rules={[{ required: true }]}><Select disabled={busy || disabled || tenantAdmin} options={[{ value: 'MANAGER', label: 'Quản lý' }, { value: 'WORKER', label: 'Nhân viên' }]} /></Form.Item>
    {tenantAdmin ? <p>Quản trị viên đơn vị chỉ được phân công vai trò Quản lý.</p> : null}
    <Form.Item name="accessScope" label="Phạm vi làm việc" rules={[{ required: true }]}><Select options={[{ value: 'ALL_ZONES', label: 'Tất cả khu vực' }, { value: 'SELECTED_ZONES', label: 'Chọn khu vực' }]} /></Form.Item>
    {scope === 'SELECTED_ZONES' ? <Form.Item name="zoneIds" label="Khu vực được giao" rules={[{ validator: (_, ids: string[]) => ids?.length && ids.every(id => activeZones.some(zone => zone.zoneId === id)) ? Promise.resolve() : Promise.reject(new Error('Chọn ít nhất một khu vực đang hoạt động. Bỏ các khu vực không còn khả dụng.')) }]}><Select mode="multiple" placeholder="Chọn khu vực" options={activeZones.map(zone => ({ value: zone.zoneId, label: `${zone.name} · ${zone.code}` }))} /></Form.Item> : null}
    <Form.Item name="reason" label="Lý do phân công (không bắt buộc)" rules={[{ max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
    <Button type="primary" htmlType="submit" loading={busy} disabled={disabled}>{assignment ? 'Cập nhật phân công' : 'Lưu phân công'}</Button>
  </Form>
}
