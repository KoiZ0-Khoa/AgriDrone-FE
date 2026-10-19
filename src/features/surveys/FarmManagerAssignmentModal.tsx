import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Pagination, Select } from 'antd'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { assignFarmManager, getManagers } from './api'
import { dateTime, isEligibleManager, workflowError } from './workflow'

type AssignmentValues = { farmId: string; managerId: string; reason: string }

export function FarmManagerAssignmentModal({ token, close }: { token: string; close: () => void }) {
  const [form] = Form.useForm<AssignmentValues>()
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const managers = useQuery({ queryKey: ['eligible-system-managers', page], queryFn: ({ signal }) => getManagers(token, page, { status: 'ACTIVE', availability: 'AVAILABLE', qualificationStatus: 'QUALIFIED' }, signal) })
  const eligible = managers.data?.items.filter(manager => isEligibleManager(manager)) ?? []
  const mutation = useMutation({ retry: false, mutationFn: async (values: AssignmentValues) => {
    const manager = eligible.find(item => item.id === values.managerId)
    if (!managers.isSuccess || !manager) throw new Error('Manager không còn đủ điều kiện. Tải lại danh sách và chọn lại.')
    return assignFarmManager(token, values.farmId.trim(), { systemManagerProfileId: manager.id, reason: values.reason.trim() })
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['manager-assigned-farms'] }) } })
  const result = mutation.data
  const error = mutation.error
  const assignmentConflict = error instanceof ApiError && (error.code === 'SystemManager.ConcurrentUpdate' || error.code === 'SystemManager.ActiveAssignmentConflict')

  return <Modal open width={620} title="Phân công nông trại" okText={result ? 'Đóng' : 'Xác nhận phân công'} cancelText="Hủy" confirmLoading={mutation.isPending} cancelButtonProps={{ hidden: Boolean(result) }} okButtonProps={{ disabled: !result && !managers.isSuccess }} onOk={() => { if (result) close(); else form.submit() }} onCancel={() => { if (!mutation.isPending) close() }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }}>
    {result ? <>
      <Alert showIcon type="success" title="Đã phân công nông trại" description="Manager đăng nhập vào Nông trại phụ trách và bấm Tải lại để xem nông trại được giao." />
      <dl className="detail-list"><div><dt>Farm ID</dt><dd>{result.farmId}</dd></div><div><dt>Manager</dt><dd>{eligible.find(manager => manager.id === result.systemManagerProfileId)?.fullName ?? result.systemManagerProfileId}</dd></div><div><dt>Thời điểm phân công</dt><dd>{dateTime(result.assignedAt)}</dd></div></dl>
    </> : <>
      <p>Giao nông trại hiện có cho System Manager phụ trách. Thao tác này không tạo đơn khảo sát hoặc phê duyệt yêu cầu khảo sát.</p>
      <Form form={form} layout="vertical" disabled={mutation.isPending} onValuesChange={() => { if (mutation.isError) mutation.reset() }} onFinish={values => { if (!mutation.isPending && managers.isSuccess) mutation.mutate(values) }}>
        <Form.Item label="Farm ID" name="farmId" extra="Lấy ID sau /farms/ trên URL trang chi tiết nông trại. Không nhập mã nông trại như TAN AN." rules={[{ required: true, whitespace: true, message: 'Nhập Farm ID' }, { validator: (_, value: string | undefined) => !value || (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim()) && value.trim() !== '00000000-0000-0000-0000-000000000000') ? Promise.resolve() : Promise.reject(new Error('Farm ID phải là UUID hợp lệ trong URL nông trại.')) }]}>
          <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </Form.Item>
        <Form.Item label="Manager phụ trách" name="managerId" extra="Chỉ hiển thị hồ sơ hoạt động, sẵn sàng nhận việc và có chứng chỉ chưa hết hạn." rules={[{ required: true, message: 'Chọn Manager phụ trách' }]}>
          <Select showSearch optionFilterProp="label" loading={managers.isPending} disabled={mutation.isPending || !managers.isSuccess} placeholder="Chọn Manager đủ điều kiện" options={eligible.map(manager => ({ value: manager.id, label: `${manager.fullName} · ${manager.email}` }))} />
        </Form.Item>
        <Pagination size="small" current={page} total={managers.data?.totalCount ?? 0} pageSize={20} showSizeChanger={false} disabled={mutation.isPending} onChange={next => { form.setFieldValue('managerId', undefined); mutation.reset(); setPage(next) }} />
        {managers.isError ? <Alert className="workflow-notice" showIcon type="error" title={workflowError(managers.error)} action={<Button onClick={() => { void managers.refetch() }}>Thử lại</Button>} /> : managers.isSuccess && eligible.length === 0 ? <Alert className="workflow-notice" showIcon type="info" title="Trang này chưa có Manager đủ điều kiện" description="Kiểm tra trạng thái hồ sơ, chứng chỉ hoặc chuyển sang trang khác." /> : null}
        <Form.Item label="Lý do phân công" name="reason" rules={[{ required: true, whitespace: true, message: 'Nhập lý do phân công' }, { max: 1000 }]}>
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>
      </Form>
      <p className="form-hint">Chỉ phân công lần đầu cho nông trại chưa có người phụ trách. Hiện chưa hỗ trợ đổi Manager qua biểu mẫu này.</p>
      {mutation.isError ? <Alert showIcon type="error" title={assignmentConflict ? 'Farm đã có phân công hoặc phân công vừa thay đổi. Chức năng này không thay thế Manager hiện tại.' : error instanceof ApiError && error.code === 'SystemManager.FarmNotFound' ? 'Không tìm thấy nông trại đang hoạt động. Kiểm tra lại Farm ID.' : error instanceof ApiError && error.code === 'SystemManager.NotAssignable' ? 'Manager chưa đủ điều kiện nhận việc. Kiểm tra hồ sơ, chứng chỉ và khả năng nhận việc.' : workflowError(error)} description={error instanceof ApiError ? <><p>Lý do từ máy chủ: {error.message}</p><p>Mã lỗi: <code>{error.code ?? `HTTP ${error.status}`}</code></p>{error.traceId ? <p>Mã tra cứu: <code>{error.traceId}</code></p> : null}</> : undefined} /> : null}
    </>}
  </Modal>
}
