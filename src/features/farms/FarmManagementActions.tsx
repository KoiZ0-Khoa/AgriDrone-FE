import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, InputNumber, Modal, Space } from 'antd'
import { ApiError } from '../../api/client'
import { useAuth } from '../auth/AuthContext'
import { archiveFarm, archiveZone, getFarm, getZone, updateZone } from './farmsApi'
import { isVersionConflict, managementError } from './managementErrors'
import type { Zone } from './types'

type Values = { name: string; areaHectares: number | null; reason: string }
type Props = { farmId: string; name: string; version: number; zone?: Zone; onArchived: () => void }

export function FarmManagementActions({ farmId, name, version, zone, onArchived }: Props) {
  const { session } = useAuth()
  const client = useQueryClient()
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [mode, setMode] = useState<'edit' | 'archive' | null>(null)
  // Capture the version and geometry the user reviewed, independently of background refetches.
  const [snapshot, setSnapshot] = useState({ version, boundary: zone?.boundary ?? null })
  const [reloading, setReloading] = useState(false)
  const [reloadError, setReloadError] = useState<unknown>(null)
  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1) throw new Error('Thiếu phiên bản dữ liệu. Hãy mở lại màn hình chi tiết.')
      const token = session!.accessToken
      if (mode === 'edit' && zone) {
        await updateZone(token, farmId, zone.zoneId, { name: values.name.trim(), areaHectares: values.areaHectares ?? null, boundary: snapshot.boundary, expectedVersion: snapshot.version })
        return
      }
      if (session?.role !== 'OWNER') throw new Error('Chỉ Owner có quyền lưu trữ.')
      const body = { expectedVersion: snapshot.version, reason: values.reason.trim() }
      if (zone) await archiveZone(token, farmId, zone.zoneId, body)
      else await archiveFarm(token, farmId, body)
    },
    onSuccess: async () => {
      const archived = mode === 'archive'
      setMode(null)
      if (archived) onArchived()
      message.success(archived ? 'Đã lưu trữ, lịch sử liên quan được giữ lại.' : 'Đã cập nhật khu vực')
      await Promise.all([
        client.invalidateQueries({ queryKey: ['farms', session?.tenant?.id] }),
        client.invalidateQueries({ queryKey: ['archived-farms', session?.tenant?.id] }),
        client.invalidateQueries({ queryKey: ['archived-farm', session?.tenant?.id, farmId] }),
        client.invalidateQueries({ queryKey: ['farm', session?.tenant?.id, farmId] }),
        client.invalidateQueries({ queryKey: ['zones', session?.tenant?.id, farmId] }),
        client.invalidateQueries({ queryKey: ['zone', session?.tenant?.id, farmId, zone?.zoneId] }),
      ])
    },
  })
  function open(next: 'edit' | 'archive') {
    mutation.reset()
    setReloadError(null)
    setSnapshot({ version, boundary: zone?.boundary ?? null })
    form.setFieldsValue({ name, areaHectares: zone?.areaHectares ?? null, reason: '' })
    setMode(next)
  }
  async function reload() {
    setReloading(true)
    setReloadError(null)
    try {
      const latest = zone ? await getZone(session!.accessToken, farmId, zone.zoneId) : await getFarm(session!.accessToken, farmId)
      client.setQueryData(zone ? ['zone', session?.tenant?.id, farmId, zone.zoneId] : ['farm', session?.tenant?.id, farmId], latest)
      setSnapshot({ version: latest.version, boundary: latest.boundary })
      if (mode === 'edit') form.setFieldsValue({ name: latest.name, areaHectares: latest.areaHectares })
      mutation.reset()
    } catch (error) { setReloadError(error) }
    finally { setReloading(false) }
  }
  const blocked = isVersionConflict(mutation.error) || (mutation.error instanceof ApiError && [403, 404].includes(mutation.error.status))
  const busy = mutation.isPending || reloading
  return <>
    <Space wrap>
      {zone ? <Button onClick={() => open('edit')}>Chỉnh sửa khu vực</Button> : null}
      {session?.role === 'OWNER' ? <Button danger onClick={() => open('archive')}>Lưu trữ {zone ? 'khu vực' : 'nông trại'}</Button> : null}
    </Space>
    <Modal forceRender title={mode === 'edit' ? 'Chỉnh sửa khu vực' : `Lưu trữ ${name}`} open={mode !== null}
      okText={mode === 'edit' ? 'Lưu thay đổi' : 'Xác nhận lưu trữ'} cancelText="Hủy"
      okButtonProps={{ danger: mode === 'archive', disabled: blocked || reloading || !Number.isSafeInteger(snapshot.version) || snapshot.version < 1 }}
      confirmLoading={mutation.isPending} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} keyboard={!busy}
      onOk={() => form.submit()} onCancel={() => { if (!busy) setMode(null) }}>
      <Form form={form} layout="vertical" requiredMark={false} disabled={busy} onFinish={values => { if (mode && !blocked && !busy) mutation.mutate(values) }}>
        {mode === 'edit' ? <>
          <p>Owner hoặc người được phân công quản lý khu vực có thể chỉnh sửa thông tin này.</p>
          <Form.Item name="name" label="Tên khu vực" rules={[{ required: true, whitespace: true, message: 'Nhập tên khu vực' }, { max: 100 }]}><Input maxLength={100} /></Form.Item>
          <Form.Item name="areaHectares" label="Diện tích (ha)" rules={[{ validator: (_, value: number | null | undefined) => value == null || (Number.isFinite(value) && value >= 0) ? Promise.resolve() : Promise.reject(new Error('Diện tích phải là số không âm.')) }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <p className="form-hint">Mã khu vực và ranh giới hiện có được giữ nguyên.</p>
        </> : <>
          <p>{zone ? 'Khu vực' : 'Nông trại'} sẽ được đưa khỏi danh sách sử dụng. Lịch sử được giữ lại. {zone ? 'Cần hoàn tất các nhiệm vụ bay và công việc đang mở trước.' : 'Cần lưu trữ các khu vực còn lại và hoàn tất nhiệm vụ bay, công việc đang mở trước.'}</p>
          <Form.Item name="reason" label="Lý do lưu trữ" rules={[{ required: true, whitespace: true, message: 'Nhập lý do lưu trữ' }, { max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
        </>}
        {mutation.error || reloadError ? <Alert type="error" showIcon title={managementError(reloadError ?? mutation.error)} /> : null}
      </Form>
      {isVersionConflict(mutation.error) ? <Button loading={reloading} onClick={() => void reload()}>Tải bản mới {mode === 'edit' ? '(thay nội dung đang nhập)' : ''}</Button> : null}
    </Modal>
  </>
}
