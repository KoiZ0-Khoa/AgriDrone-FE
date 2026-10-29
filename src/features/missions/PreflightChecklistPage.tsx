import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Select, Space } from 'antd'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { workflowError } from '../surveys/workflow'
import { changeChecklistConditions, createChecklist, type ChecklistDefinitionSummary } from './checklistApi'
import type { ChecklistItem } from './types'

type ItemFormValues = { items: ChecklistItem[] }
type ConditionsFormValues = { itemsToAdd: ChecklistItem[]; keysToRemove: string[] }

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

function ResultPanel({ title, result }: { title: string; result: ChecklistDefinitionSummary }) {
  return <Alert className="workflow-notice" type="success" showIcon title={title} description={
    <dl className="detail-list">
      <div><dt>Mã checklist</dt><dd>{result.code}</dd></div>
      <div><dt>Phiên bản</dt><dd>{result.versionNumber}</dd></div>
      <div><dt>Có hiệu lực từ</dt><dd>{new Date(result.effectiveFrom).toLocaleString('vi-VN')}</dd></div>
      <div><dt>Definition ID</dt><dd><code>{result.definitionId}</code></dd></div>
    </dl>
  } />
}

export function PreflightChecklistPage() {
  const token = useAuth().session!.accessToken
  const [lastResult, setLastResult] = useState<ChecklistDefinitionSummary | null>(null)
  const [createForm] = Form.useForm<ItemFormValues>()
  const [conditionsForm] = Form.useForm<ConditionsFormValues>()

  const createMutation = useMutation({
    mutationFn: (values: ItemFormValues) => createChecklist(token, values.items),
    onSuccess: result => setLastResult(result),
  })
  const conditionsMutation = useMutation({
    mutationFn: (values: ConditionsFormValues) => changeChecklistConditions(token, values.itemsToAdd ?? [], values.keysToRemove ?? []),
    onSuccess: result => { setLastResult(result); conditionsForm.resetFields() },
  })

  return <>
    <section className="resource-page-heading">
      <div><span className="page-kicker">AN TOÀN BAY</span><h1>Checklist trước bay</h1><p>Bộ điều kiện preflight dùng chung cho mọi Mission.</p></div>
    </section>
    <Alert className="workflow-notice" type="warning" showIcon title="BE chưa có API đọc checklist hiện hành"
      description="Form dưới đây chỉ ghi, không tải lại được toàn bộ danh sách điều kiện đang áp dụng. Thông tin hiển thị chỉ phản ánh lần ghi gần nhất trong phiên làm việc này — không phải trạng thái đầy đủ hiện tại trên BE." />

    <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>Tạo checklist lần đầu</strong><span>Chỉ thành công khi hệ thống chưa có checklist active.</span></div></div>
      <Form form={createForm} layout="vertical" disabled={createMutation.isPending} onFinish={values => createMutation.mutate(values)}>
        <ItemRows name="items" />
        <Form.Item className="workflow-notice"><Button type="primary" htmlType="submit" loading={createMutation.isPending}>Tạo checklist</Button></Form.Item>
      </Form>
      {createMutation.isError ? <Alert type="error" showIcon title={workflowError(createMutation.error)} /> : null}
    </section>

    <section className="resource-panel workflow-section">
      <div className="resource-panel-heading"><div><strong>Thêm / sửa / xóa điều kiện</strong><span>Để sửa 1 điều kiện, xoá key cũ và thêm lại item đã sửa trong cùng lần gửi.</span></div></div>
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

    {lastResult ? <section className="resource-panel workflow-section"><ResultPanel title="Kết quả lần ghi gần nhất" result={lastResult} /></section> : null}
  </>
}
