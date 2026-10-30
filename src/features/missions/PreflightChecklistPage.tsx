import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { confirmation, text, type Action, type Field } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import * as api from './checklistApi'
import type { PreflightChecklistDefinition, PreflightChecklistItem } from './checklistTypes'
import { checklistError, checklistStatusLabels, dateTime } from './checklistWorkflow'

const requiredOptions = [{ value: 'true', label: 'Bắt buộc' }, { value: 'false', label: 'Không bắt buộc' }]

function conditionAction(args: { token: string; hasActiveChecklist: boolean; existingKeys: Set<string>; edit?: PreflightChecklistItem }): Action {
  const { token, hasActiveChecklist, existingKeys, edit } = args
  const fields: Field[] = [
    { key: 'key', label: 'Khóa (key)', value: edit?.key ?? '', max: 100 },
    { key: 'prompt', label: 'Câu hỏi', kind: 'multiline', value: edit?.prompt ?? '', max: 500 },
    { key: 'required', label: 'Bắt buộc?', kind: 'select', value: String(edit?.required ?? true), options: requiredOptions },
  ]
  return {
    title: edit ? `Sửa điều kiện · ${edit.key}` : hasActiveChecklist ? 'Thêm điều kiện mới' : 'Tạo checklist (điều kiện đầu tiên)',
    description: edit ? 'Hệ thống sẽ xóa điều kiện cũ và thêm lại điều kiện đã sửa trong cùng một lần cập nhật. Các Mission đã preflight bằng phiên bản cũ không bị ảnh hưởng.' : undefined,
    fields,
    run: values => {
      const key = text(values, 'key')
      if (!edit && existingKeys.has(key)) throw new Error('Khóa đã tồn tại trong checklist hiện tại.')
      const item: PreflightChecklistItem = { key, prompt: text(values, 'prompt'), required: values.required === 'true' }
      if (!hasActiveChecklist) return api.createChecklist(token, [item])
      return api.changeChecklistConditions(token, { itemsToAdd: [item], keysToRemove: edit ? [edit.key] : [] })
    },
    success: edit ? 'Đã cập nhật điều kiện.' : 'Đã lưu điều kiện.',
  }
}

export function PreflightChecklistPage() {
  const token = useAuth().session!.accessToken
  const [action, setAction] = useState<Action | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const query = useQuery({ queryKey: ['preflight-checklist'], queryFn: ({ signal }) => api.getChecklistDefinitions(token, signal) })
  const definitions = query.data ?? []
  const active = definitions.find(definition => definition.status === 'ACTIVE') ?? null
  const items = active?.items ?? []
  const existingKeys = new Set(items.map(item => item.key))

  return <>
    <section className="resource-page-heading">
      <div><span className="page-kicker">QUẢN TRỊ VẬN HÀNH</span><h1>Checklist Preflight</h1><p>Bộ điều kiện kiểm tra trước khi bay, dùng chung cho mọi nhiệm vụ. Mỗi thay đổi tạo phiên bản mới; các Mission đã preflight bằng phiên bản cũ được giữ nguyên.</p></div>
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button>
        <Button onClick={() => setHistoryOpen(true)} disabled={definitions.length === 0}>Lịch sử phiên bản</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAction(conditionAction({ token, hasActiveChecklist: Boolean(active), existingKeys }))}>{active ? 'Thêm điều kiện' : 'Tạo checklist'}</Button>
      </Space>
    </section>
    <section className="resource-panel">
      {query.isError ? <CommonState type="error" description={checklistError(query.error)} retry={() => query.refetch()} />
        : !query.isPending && !active ? <CommonState type="empty" title="Chưa có checklist preflight" description="Tạo checklist dùng chung đầu tiên trước khi Mission có thể hoàn tất preflight." action={() => setAction(conditionAction({ token, hasActiveChecklist: false, existingKeys }))} actionLabel="Tạo checklist" />
        : <Table<PreflightChecklistItem> rowKey="key" loading={query.isPending} dataSource={items} pagination={false} columns={[
          { title: 'Khóa (key)', render: (_, item) => <code>{item.key}</code> },
          { title: 'Câu hỏi', dataIndex: 'prompt' },
          { title: 'Bắt buộc', render: (_, item) => <Tag color={item.required ? 'success' : 'default'}>{item.required ? 'Bắt buộc' : 'Không bắt buộc'}</Tag> },
          { title: 'Thao tác', render: (_, item) => <Space>
            <Button onClick={() => setAction(conditionAction({ token, hasActiveChecklist: true, existingKeys, edit: item }))}>Sửa</Button>
            <Button danger disabled={items.length <= 1} title={items.length <= 1 ? 'Checklist cần còn tối thiểu một điều kiện' : undefined}
              onClick={() => setAction(confirmation('Xóa điều kiện', `Xóa điều kiện "${item.prompt}" khỏi checklist hiện hành?`, () => api.changeChecklistConditions(token, { itemsToAdd: [], keysToRemove: [item.key] })))}>Xóa</Button>
          </Space> },
        ]} />}
      {active ? <p className="form-hint">Phiên bản hiện hành: v{active.versionNumber} · hiệu lực từ {dateTime(active.effectiveFrom)}</p> : null}
    </section>
    <Drawer open={historyOpen} title="Lịch sử phiên bản checklist" size={560} onClose={() => setHistoryOpen(false)}>
      <Table<PreflightChecklistDefinition> size="small" rowKey="id" dataSource={[...definitions].sort((a, b) => b.versionNumber - a.versionNumber)} pagination={false} columns={[
        { title: 'Version', render: (_, definition) => `v${definition.versionNumber}` },
        { title: 'Trạng thái', render: (_, definition) => <Tag color={definition.status === 'ACTIVE' ? 'success' : 'default'}>{checklistStatusLabels[definition.status]}</Tag> },
        { title: 'Số điều kiện', render: (_, definition) => definition.items.length },
        { title: 'Hiệu lực từ', render: (_, definition) => dateTime(definition.effectiveFrom) },
        { title: 'Ngừng hiệu lực', render: (_, definition) => definition.retiredAt ? dateTime(definition.retiredAt) : '—' },
      ]} />
    </Drawer>
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
