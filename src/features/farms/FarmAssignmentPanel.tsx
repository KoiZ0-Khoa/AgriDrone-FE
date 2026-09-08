import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App as AntApp, Button, Form, Input, Select } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import type { AuthSession } from '../auth/types'
import { assignFarmMember, getFarmAssignment, getTenantAdmins } from './farmAssignmentsApi'
import type { AssignFarmMemberRequest, TenantUser } from './types'

export function FarmAssignmentPanel({ farmId, session }: { farmId: string; session: AuthSession }) {
  const [userId, setUserId] = useState<string>()
  const adminsQuery = useQuery({
    queryKey: ['tenant-admins', session.tenant!.id, session.accessToken],
    queryFn: ({ signal }) => getTenantAdmins(session.accessToken, signal),
  })
  const selectedUser = adminsQuery.data?.find((user) => user.id === userId)

  return (
    <section className="resource-panel farm-assignment-panel" aria-label="Phân công quản lý nông trại">
      <div className="resource-panel-heading">
        <div>
          <strong>Phân công quản lý nông trại</strong>
          <span>Gán quản trị viên tenant quản lý tất cả khu vực trong nông trại này.</span>
        </div>
      </div>
      {adminsQuery.isPending ? <CommonState type="loading" title="Đang tải quản trị viên" /> : null}
      {adminsQuery.isError ? (
        adminsQuery.error instanceof ApiError && adminsQuery.error.status === 403
          ? <CommonState type="forbidden" />
          : <CommonState type="error" description={adminsQuery.error.message} retry={() => adminsQuery.refetch()} />
      ) : null}
      {adminsQuery.isSuccess && adminsQuery.data.length === 0 ? (
        <CommonState type="empty" title="Chưa có quản trị viên phù hợp" description="Tenant cần có quản trị viên đang hoạt động để phân công quản lý nông trại." />
      ) : null}
      {adminsQuery.isSuccess && adminsQuery.data.length > 0 ? (
        <>
          <label className="assignment-select-label" htmlFor="farm-assignment-user">Quản trị viên tenant</label>
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
          ) : <p className="assignment-help">Chọn một người để xem phân công hiện tại và cấp quyền quản lý.</p>}
        </>
      ) : null}
    </section>
  )
}

function AssignmentEditor({ farmId, user, session }: { farmId: string; user: TenantUser; session: AuthSession }) {
  const [form] = Form.useForm<{ reason?: string }>()
  const { message } = AntApp.useApp()
  const queryClient = useQueryClient()
  const queryKey = ['farm-assignment', session.tenant!.id, farmId, user.id, session.accessToken]
  const assignmentQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => getFarmAssignment(session.accessToken, farmId, user.id, signal),
    staleTime: 0,
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: (request: AssignFarmMemberRequest) => assignFarmMember(session.accessToken, farmId, user.id, request),
    onSuccess: (assignment) => {
      queryClient.setQueryData(queryKey, assignment)
      form.resetFields()
      message.success(`Đã phân công ${user.fullName} quản lý nông trại`)
    },
  })
  const assignment = assignmentQuery.data
  const alreadyAssigned = assignment?.status === 'ACTIVE'
    && assignment.role === 'MANAGER' && assignment.accessScope === 'ALL_ZONES'
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
        title={alreadyAssigned ? 'Đã được phân công quản lý tất cả khu vực' : assignment ? 'Đã có phân công trong nông trại' : 'Chưa được phân công vào nông trại này'}
        description={assignment
          ? `Vai trò: ${assignment.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'} · Phạm vi: ${assignment.accessScope === 'ALL_ZONES' ? 'Tất cả khu vực' : `${assignment.zoneIds.length} khu vực được chọn`} · ${assignment.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}`
          : 'Sau khi lưu, người này có quyền quản lý tất cả khu vực trong nông trại.'}
      />
      {conflict ? <CommonState type="conflict" reload={reloadAssignment} /> : null}
      {forbidden ? <CommonState type="forbidden" /> : null}
      {mutation.isError && !conflict && !forbidden ? (
        <Alert type="error" showIcon title="Không thể lưu phân công" description={
          mutation.error instanceof ApiError && mutation.error.code === 'FarmMembership.TargetTenantMembershipInactive'
            ? 'Tư cách thành viên của quản trị viên đã ngừng hoạt động. Hãy chọn người khác.'
            : mutation.error.message
        } />
      ) : null}
      {!alreadyAssigned ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            if (assignmentQuery.isFetching || mutation.isPending || conflict || forbidden) return
            mutation.mutate({
              role: 'MANAGER',
              accessScope: 'ALL_ZONES',
              zoneIds: [],
              expectedVersion: assignment?.version ?? null,
              reason: values.reason?.trim() || null,
            })
          }}
        >
          <p className="assignment-help">Quyền được cấp: Quản lý nông trại · Tất cả khu vực.</p>
          <Form.Item label="Lý do phân công (không bắt buộc)" name="reason" rules={[{ max: 500, message: 'Lý do không được vượt quá 500 ký tự.' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount disabled={mutation.isPending} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={mutation.isPending} disabled={assignmentQuery.isFetching || conflict || forbidden}>
            {assignment ? 'Cập nhật phân công' : 'Gán quản lý nông trại'}
          </Button>
        </Form>
      ) : null}
    </div>
  )
}
