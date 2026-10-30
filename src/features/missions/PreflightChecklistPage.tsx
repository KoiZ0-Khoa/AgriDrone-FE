import { MinusCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Select, Space, Table, Tag } from 'antd'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { workflowError } from '../surveys/workflow'
import { changeChecklistConditions, createChecklist, getAllChecklistDefinitions } from './checklistApi'
import type { ChecklistItem, PreflightChecklistDefinitionStatus } from './types'

type ItemFormValues = { items: ChecklistItem[] }
type ConditionsFormValues = { itemsToAdd: ChecklistItem[]; keysToRemove: string[] }

const statusColor: Record<PreflightChecklistDefinitionStatus, string> = { DRAFT: 'default', ACTIVE: 'success', RETIRED: 'default' }
const statusLabel: Record<PreflightChecklistDefinitionStatus, string> = { DRAFT: 'Bản nháp', ACTIVE: 'Đang áp dụng', RETIRED: 'Đã ngừng' }

function ItemRows({ name }: { name: string }) {
  return <Form.List name={name} rules={[{ validator: async (_, items) => { if (!items || items.length === 0) throw new Error('Cần ít nhất một điều kiện.') } }]}>
    {(fields, { add, remove }, { errors }) => <>
      {fields.map(field => <fieldset className="workflow-checklist" key={field.key}>
        <div className="form-two-columns">
          <Form.Item name={[field.name, 'key']} label="Key" rules={[{ required: true, whitespace: true }, { max: 100 }]}><Input /></Form.Item>
          <Form.Item name={[field.name, 'prompt']} label="Câu hỏi hiển thị" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        </div>
        <Form.Item name={[field.name, 'required']} valuePropName="checked" initialValue={true}><Checkbox>Bắt buộc</Checkbox></Form.Item>
        <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>Bỏ điều kiện</Button>
      </fieldset>)}
      <Button icon={<PlusOutlined />} onClick={() => add({ required: true })}>Thêm điều kiện</Button>
      <Form.ErrorList errors={errors} />
    </>}
  </Form.List>
}

export function PreflightChecklistPage() {
  const token = useAuth().session!.accessToken
  const client = useQueryClient()
  const [createForm] = Form.useForm<ItemFormValues>()
  const [conditionsForm] = Form.useForm<ConditionsFormValues>()
  const query = useQuery({ queryKey: ['checklist-definitions'], queryFn: ({ signal }) => getAllChecklistDefinitions(token, signal) })

  async function afterWrite() { await client.invalidateQueries({ queryKey: ['checklist-definitions'] }) }
  const createMutation = useMutation({
    mutationFn: (values: ItemFormValues) => createChecklist(token, values.items),
    onSuccess: async () => { createForm.resetFields(); await afterWrite() },
  })
  const conditionsMutation = useMutation({
    mutationFn: (values: ConditionsFormValues) => changeChecklistConditions(token, values.itemsToAdd ?? [], values.keysToRemove ?? []),
    onSuccess: async () => { conditionsForm.resetFields(); await afterWrite() },
  })

  const definitions = [...(query.data ?? [])].sort((a, b) => b.versionNumber - a.versionNumber)

  return <>
    <section className="resource-page-heading">
      <div><span className="page-kicker">AN TOÀN BAY</span><h1>Checklist trước bay</h1><p>Bộ điều kiện preflight dùng chung cho mọi Mission.</p></div>
      <Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button>
    </section>

    <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>Các phiên bản checklist</strong><span>Phiên bản mới nhất ở trên cùng; phiên bản cũ và checklist Mission đã lưu được giữ nguyên.</span></div></div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : (
        <Table
          rowKey="id"
          loading={query.isPending}
          dataSource={definitions}
          pagination={false}
          locale={{ emptyText: 'Chưa có checklist nào.' }}
          columns={[
            { title: 'Mã', dataIndex: 'code' },
            { title: 'Phiên bản', dataIndex: 'versionNumber' },
            { title: 'Trạng thái', render: (_, def) => <Tag color={statusColor[def.status]}>{statusLabel[def.status] ?? def.status}</Tag> },
            { title: 'Có hiệu lực từ', render: (_, def) => new Date(def.effectiveFrom).toLocaleString('vi-VN') },
            { title: 'Ngừng áp dụng', render: (_, def) => def.retiredAt ? new Date(def.retiredAt).toLocaleString('vi-VN') : '—' },
            { title: 'Số điều kiện', render: (_, def) => def.items.length },
          ]}
          expandable={{
            expandedRowRender: def => <Table
              rowKey="key" size="small" pagination={false} dataSource={def.items}
              columns={[{ title: 'Key', dataIndex: 'key' }, { title: 'Câu hỏi', dataIndex: 'prompt' }, { title: 'Bắt buộc', render: (_, item) => item.required ? 'Có' : 'Không' }]}
            />,
          }}
        />
      )}
    </section>

    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Tạo checklist lần đầu</strong><span>Chỉ thành công khi hệ thống chưa có checklist đang áp dụng.</span></div></div>
      <Form form={createForm} layout="vertical" disabled={createMutation.isPending} onFinish={values => createMutation.mutate(values)}>
        <ItemRows name="items" />
        <Form.Item className="workflow-notice"><Button type="primary" htmlType="submit" loading={createMutation.isPending}>Tạo checklist</Button></Form.Item>
      </Form>
      {createMutation.isError ? <Alert type="error" showIcon title={workflowError(createMutation.error)} /> : null}
    </section>

    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Thêm / sửa / xóa điều kiện</strong><span>Để sửa 1 điều kiện, xoá key cũ và thêm lại item đã sửa trong cùng lần gửi. Xem key hiện tại ở bảng phía trên.</span></div></div>
      <Form form={conditionsForm} layout="vertical" disabled={conditionsMutation.isPending} onFinish={values => conditionsMutation.mutate(values)}>
        <ItemRows name="itemsToAdd" />
        <Form.Item name="keysToRemove" label="Key cần xóa (nhấn Enter sau mỗi key)">
          <Select mode="tags" tokenSeparators={[',']} open={false} placeholder="Nhập key rồi Enter" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={conditionsMutation.isPending}>Gửi thay đổi</Button>
        </Space>
      </Form>
      {conditionsMutation.isError ? <Alert type="error" showIcon title={workflowError(conditionsMutation.error)} /> : null}
    </section>
  </>
}
