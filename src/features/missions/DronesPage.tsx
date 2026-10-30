import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Drawer, Input, Select, Space, Table, Tag } from 'antd'
import { useMemo, useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action, type Values } from '../../management/actions'
import { workflowError } from '../surveys/workflow'
import * as api from './droneApi'
import type { Drone } from './types'
import { droneBody, droneStatusLabels, droneStatusOptions } from './workflow'

function registerAction(token: string): Action {
  return {
    title: 'Đăng ký Drone mới',
    description: 'Mã, số serial và số đăng ký (nếu có) phải duy nhất trong toàn hệ thống. Thông số kỹ thuật cần có capabilities phù hợp với nhiệm vụ sẽ bay (BASELINE_MAPPING, PLANT_HEALTH, HARVEST_READINESS).',
    fields: [
      { key: 'code', label: 'Mã Drone', max: 50 },
      { key: 'name', label: 'Tên Drone', max: 150 },
      { key: 'model', label: 'Model', optional: true, max: 150 },
      { key: 'manufacturer', label: 'Nhà sản xuất', optional: true, max: 150 },
      { key: 'specifications', label: 'Thông số kỹ thuật (JSON)', optional: true, kind: 'multiline', max: 2000, value: '{\n  "capabilities": ["BASELINE_MAPPING"]\n}' },
      { key: 'serialNumber', label: 'Số serial', optional: true, max: 100 },
      { key: 'registrationNumber', label: 'Số đăng ký bay', optional: true, max: 100 },
      { key: 'registrationDate', label: 'Ngày đăng ký', optional: true, kind: 'date' },
      { key: 'registrationExpiryDate', label: 'Ngày hết hạn đăng ký', optional: true, kind: 'date' },
      { key: 'weightKg', label: 'Trọng lượng (kg)', optional: true, kind: 'number' },
      { key: 'notes', label: 'Ghi chú', optional: true, kind: 'multiline', max: 1000 },
    ],
    success: 'Đã đăng ký Drone mới.',
    run: v => api.registerDrone(token, { code: text(v, 'code'), ...droneBody(v) }),
  }
}

function updateAction(token: string, drone: Drone): Action {
  const specifications = JSON.stringify(drone.specifications ?? {}, null, 2)
  return {
    title: `Sửa Drone · ${drone.code}`,
    fields: [
      { key: 'name', label: 'Tên Drone', value: drone.name, max: 150 },
      { key: 'model', label: 'Model', value: drone.model ?? '', optional: true, max: 150 },
      { key: 'manufacturer', label: 'Nhà sản xuất', value: drone.manufacturer ?? '', optional: true, max: 150 },
      { key: 'specifications', label: 'Thông số kỹ thuật (JSON)', value: specifications, optional: true, kind: 'multiline', max: 2000 },
      { key: 'serialNumber', label: 'Số serial', value: drone.serialNumber ?? '', optional: true, max: 100 },
      { key: 'registrationNumber', label: 'Số đăng ký bay', value: drone.registrationNumber ?? '', optional: true, max: 100 },
      { key: 'registrationDate', label: 'Ngày đăng ký', value: drone.registrationDate ?? '', optional: true, kind: 'date' },
      { key: 'registrationExpiryDate', label: 'Ngày hết hạn đăng ký', value: drone.registrationExpiryDate ?? '', optional: true, kind: 'date' },
      { key: 'weightKg', label: 'Trọng lượng (kg)', value: drone.weightKg == null ? '' : String(drone.weightKg), optional: true, kind: 'number' },
      { key: 'notes', label: 'Ghi chú', value: drone.notes ?? '', optional: true, kind: 'multiline', max: 1000 },
    ],
    run: (v: Values) => {
      if (!Number.isSafeInteger(drone.version) || drone.version < 1) throw new Error('Hãy tải lại danh sách Drone trước khi sửa.')
      return api.updateDrone(token, drone.id, { expectedVersion: drone.version, ...droneBody(v) })
    },
  }
}

function statusAction(token: string, drone: Drone): Action {
  return {
    title: `Đổi trạng thái · ${drone.code}`,
    description: 'Trạng thái Bảo trì nên kèm lịch bảo trì kế tiếp. Drone chỉ được chọn để chuẩn bị Mission khi đang Sẵn sàng (Available).',
    fields: [
      { key: 'status', label: 'Trạng thái', kind: 'select', value: drone.status, options: droneStatusOptions },
      { key: 'nextMaintenanceAt', label: 'Lịch bảo trì kế tiếp (chỉ áp dụng khi chọn Bảo trì)', optional: true, kind: 'datetime-local' },
      { key: 'reason', label: 'Lý do', optional: true, kind: 'multiline', max: 1000 },
    ],
    run: (v: Values) => {
      if (!Number.isSafeInteger(drone.version) || drone.version < 1) throw new Error('Hãy tải lại danh sách Drone trước khi đổi trạng thái.')
      const nextMaintenanceAt = v.nextMaintenanceAt ? new Date(v.nextMaintenanceAt).toISOString() : null
      return api.changeDroneStatus(token, drone.id, {
        status: v.status as Drone['status'],
        nextMaintenanceAt,
        expectedVersion: drone.version,
        reason: text(v, 'reason') || null,
      })
    },
  }
}

export function DronesPage() {
  const token = useAuth().session!.accessToken
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [action, setAction] = useState<Action | null>(null)
  const query = useQuery({ queryKey: ['system-drones'], queryFn: ({ signal }) => api.getDrones(token, signal) })
  const history = useQuery({
    queryKey: ['drone-maintenance-history', selectedId],
    queryFn: ({ signal }) => api.getDroneMaintenanceHistory(token, selectedId, signal),
    enabled: Boolean(selectedId),
  })
  const drones = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return (query.data ?? []).filter(drone =>
      (!status || drone.status === status) &&
      (!keyword || drone.code.toLowerCase().includes(keyword) || drone.name.toLowerCase().includes(keyword)))
  }, [query.data, search, status])
  const selected = (query.data ?? []).find(drone => drone.id === selectedId) ?? null

  return <>
    <section className="resource-page-heading">
      <div><span className="page-kicker">THIẾT BỊ BAY</span><h1>Drone</h1><p>Danh sách Drone cấp hệ thống dùng để chuẩn bị Mission khảo sát.</p></div>
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAction(registerAction(token))}>Đăng ký Drone mới</Button>
      </Space>
    </section>
    <section className="resource-panel">
      <div className="workflow-toolbar">
        <Input.Search allowClear placeholder="Tìm theo mã hoặc tên" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <Select aria-label="Trạng thái Drone" value={status} onChange={setStatus} options={[{ value: '', label: 'Tất cả trạng thái' }, ...droneStatusOptions]} />
      </div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : (
        <Table<Drone>
          rowKey="id"
          loading={query.isPending}
          dataSource={drones}
          scroll={{ x: 820 }}
          locale={{ emptyText: 'Chưa có Drone phù hợp.' }}
          columns={[
            { title: 'Drone', render: (_, drone) => <div><strong>{drone.name}</strong><div className="form-hint">{drone.code}</div></div> },
            { title: 'Model', render: (_, drone) => drone.model ?? '—' },
            { title: 'Trạng thái', render: (_, drone) => <Tag color={drone.status === 'AVAILABLE' ? 'success' : drone.status === 'RETIRED' || drone.status === 'INACTIVE' ? 'default' : 'warning'}>{droneStatusLabels[drone.status] ?? drone.status}</Tag> },
            { title: 'Hết hạn đăng ký', render: (_, drone) => drone.registrationExpiryDate ?? 'Chưa có' },
            { title: 'Thao tác', render: (_, drone) => <Button onClick={() => setSelectedId(drone.id)}>Xem chi tiết</Button> },
          ]}
        />
      )}
    </section>
    <Drawer open={Boolean(selectedId)} title="Chi tiết Drone" onClose={() => setSelectedId('')} size={560}>
      {selected ? <>
        <h2>{selected.name}</h2>
        <p>{selected.code} · {droneStatusLabels[selected.status] ?? selected.status}</p>
        <dl className="detail-list">
          <div><dt>Model</dt><dd>{selected.model ?? 'Chưa có'}</dd></div>
          <div><dt>Nhà sản xuất</dt><dd>{selected.manufacturer ?? 'Chưa có'}</dd></div>
          <div><dt>Số serial</dt><dd>{selected.serialNumber ?? 'Chưa có'}</dd></div>
          <div><dt>Số đăng ký bay</dt><dd>{selected.registrationNumber ?? 'Chưa có'}</dd></div>
          <div><dt>Hạn đăng ký</dt><dd>{selected.registrationExpiryDate ?? 'Chưa có'}</dd></div>
          <div><dt>Trọng lượng</dt><dd>{selected.weightKg == null ? 'Chưa có' : `${selected.weightKg} kg`}</dd></div>
          <div><dt>Bảo trì kế tiếp</dt><dd>{selected.nextMaintenanceAt ? new Date(selected.nextMaintenanceAt).toLocaleString('vi-VN') : 'Chưa có'}</dd></div>
          <div><dt>Phiên bản</dt><dd>{selected.version}</dd></div>
        </dl>
        <p className="form-hint">Thông số kỹ thuật: <code>{JSON.stringify(selected.specifications ?? {})}</code></p>
        <Space wrap>
          <Button onClick={() => setAction(updateAction(token, selected))}>Sửa Drone</Button>
          <Button onClick={() => setAction(statusAction(token, selected))}>Đổi trạng thái / bảo trì</Button>
        </Space>
        <h3 className="workflow-section">Lịch sử bảo trì</h3>
        {history.isPending ? <CommonState type="loading" /> : history.isError ? <CommonState type="error" description={workflowError(history.error)} retry={() => history.refetch()} /> : (history.data ?? []).length === 0 ? <Alert type="info" showIcon title="Chưa có lịch sử bảo trì." /> : (
          <Table rowKey="id" dataSource={history.data} pagination={false} size="small" columns={[
            { title: 'Bắt đầu', render: (_, entry) => new Date(entry.startedAt).toLocaleString('vi-VN') },
            { title: 'Lý do', dataIndex: 'reason', render: (value: string | null) => value ?? '—' },
            { title: 'Kết thúc', render: (_, entry) => entry.closedAt ? new Date(entry.closedAt).toLocaleString('vi-VN') : 'Đang bảo trì' },
            { title: 'Trạng thái sau đó', render: (_, entry) => entry.closingStatus ? droneStatusLabels[entry.closingStatus] ?? entry.closingStatus : '—' },
          ]} />
        )}
      </> : null}
    </Drawer>
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
