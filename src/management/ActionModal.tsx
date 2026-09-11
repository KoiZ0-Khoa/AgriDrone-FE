import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Form, Input, Modal } from 'antd'
import { ApiError } from '../api/client'
import { validate, type Action, type Values } from './actions'

export function ActionModal({ action, close }: { action: Action; close: () => void }) {
  const [values, setValues] = useState<Values>(() => Object.fromEntries(action.fields.map(f => [f.key, f.value ?? ''])))
  const client = useQueryClient()
  const { message } = App.useApp()
  const mutation = useMutation({ mutationFn: async () => { validate(action.fields, values); await action.run(values) }, onSuccess: async () => {
    message.success(action.success ?? 'Đã lưu thay đổi')
    close()
    await client.invalidateQueries()
    await action.after?.()
  } })
  const conflict = mutation.error instanceof ApiError && mutation.error.code?.includes('ConcurrentUpdate')
  const forbidden = mutation.error instanceof ApiError && [403, 404].includes(mutation.error.status)
  return <Modal open title={action.title} okText="Xác nhận" cancelText={conflict ? 'Đóng và tải lại' : 'Hủy'} confirmLoading={mutation.isPending}
    okButtonProps={{ danger: action.danger, disabled: Boolean(conflict || forbidden) }} cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => mutation.mutate()} onCancel={() => { if (!mutation.isPending) { if (conflict) void client.refetchQueries({ type: 'active' }); close() } }}>
    {action.description ? <p>{action.description}</p> : null}
    <Form layout="vertical" disabled={mutation.isPending}>
      {action.fields.map(f => <Form.Item key={f.key} label={f.label} required={!f.optional}>
        {f.kind === 'password' ? <Input.Password autoComplete="off" value={values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} /> : <Input value={values[f.key]} maxLength={f.max} type={f.kind === 'email' ? 'email' : 'text'} inputMode={f.kind === 'number' ? 'decimal' : undefined} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />}
      </Form.Item>)}
    </Form>
    {mutation.error ? <Alert type="error" showIcon title={conflict ? 'Dữ liệu đã thay đổi. Đóng form, chờ tải lại và mở chỉnh sửa để kiểm tra bản mới.' : forbidden ? 'Bạn không có quyền hoặc dữ liệu không còn trong phạm vi truy cập.' : mutation.error.message} /> : null}
  </Modal>
}
