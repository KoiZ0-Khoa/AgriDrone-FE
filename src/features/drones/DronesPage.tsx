import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Divider, Drawer, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action, type Field } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import * as api from './api'
import { DroneFormModal } from './DroneFormModal'
import type { Drone, DroneMaintenanceRecord, DroneStatus } from './types'
import { allowedTransitions, capabilityLabels, dateOnly, dateTime, droneError, droneStatusColors, droneStatusLabels, transitionLabels } from './workflow'

export function DronesPage() {
  const token = useAuth().session!.accessToken
  const [selectedId, setSelectedId] = useState('')
  const [formDrone, setFormDrone] = useState<Drone | 'new' | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const query = useQuery({ queryKey: ['system-drones'], queryFn: ({ signal }) => api.getDrones(token, signal) })
  const selected = query.data?.find(drone => drone.id === selectedId) ?? null
  const history = useQuery({ queryKey: ['drone-maintenance-history', selectedId], queryFn: ({ signal }) => api.getMaintenanceHistory(token, selectedId, signal), enabled: Boolean(selectedId) })

  function transitionAction(drone: Drone, target: DroneStatus): Action {
    const fields: Field[] = [{ key: 'reason', label: 'Lý do (không bắt buộc)', kind: 'multiline', optional: true, max: 2000 }]
    if (drone.status === 'MAINTENANCE' && target === 'AVAILABLE') fields.unshift({ key: 'nextMaintenanceAt', label: 'Lịch bảo trì kế tiếp (không bắt buộc)', kind: 'datetime-local', optional: true })
    return {
      title: `${transitionLabels[target]} · ${drone.name}`,
      description: `Chuyển trạng thái từ "${droneStatusLabels[drone.status]}" sang "${droneStatusLabels[target]}".`,
      danger: target === 'RETIRED',
      fields,
      run: values => {
        const nextMaintenanceAt = values.nextMaintenanceAt ? new Date(values.nextMaintenanceAt).toISOString() : null
        if (nextMaintenanceAt && Date.parse(nextMaintenanceAt) <= Date.now()) throw new Error('Lịch bảo trì kế tiếp phải ở thời điểm trong tương lai.')
        return api.changeDroneStatus(token, drone.id, { status: target, nextMaintenanceAt, expectedVersion: drone.version, reason: text(values, 'reason') || null })
      },
      success: `Đã chuyển sang "${droneStatusLabels[target]}".`,
    }
  }

  return <>
    <section className="resource-page-heading">
      <div><span className="page-kicker">QUẢN TRỊ VẬN HÀNH</span><h1>Drone hệ thống</h1><p>Đăng ký, cập nhật và theo dõi trạng thái vận hành của drone dùng cho nhiệm vụ bay.</p></div>
      <Space wrap><Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setFormDrone('new')}>Tạo Drone</Button></Space>
    </section>
    <section className="resource-panel">
      {query.isError ? <CommonState type="error" description={droneError(query.error)} retry={() => query.refetch()} /> : <Table<Drone> rowKey="id" loading={query.isPending} dataSource={query.data ?? []} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Chưa có drone nào được đăng ký.' }} columns={[
        { title: 'Drone', render: (_, drone) => <><strong>{drone.name}</strong><p className="form-hint">{drone.code}{drone.model ? ` · ${drone.model}` : ''}</p></> },
        { title: 'Năng lực', render: (_, drone) => <Space size={4} wrap>{drone.specifications.capabilities.map(capability => <Tag key={capability}>{capabilityLabels[capability]}</Tag>)}</Space> },
        { title: 'Trạng thái', render: (_, drone) => <Tag color={droneStatusColors[drone.status]}>{droneStatusLabels[drone.status]}</Tag> },
        { title: 'Bảo trì kế tiếp', render: (_, drone) => dateTime(drone.nextMaintenanceAt) },
        { title: 'Thao tác', render: (_, drone) => <Button onClick={() => setSelectedId(drone.id)}>Chi tiết</Button> },
      ]} />}
    </section>
    <Drawer open={Boolean(selectedId)} title="Chi tiết Drone" size={560} onClose={() => setSelectedId('')}>
      {selected ? <>
        <h2>{selected.name}</h2><p className="form-hint">{selected.code}</p>
        <dl className="detail-list">
          <div><dt>Model</dt><dd>{selected.model ?? 'Chưa có'}</dd></div>
          <div><dt>Hãng sản xuất</dt><dd>{selected.manufacturer ?? 'Chưa có'}</dd></div>
          <div><dt>Số serial</dt><dd>{selected.serialNumber ?? 'Chưa có'}</dd></div>
          <div><dt>Số đăng ký</dt><dd>{selected.registrationNumber ?? 'Chưa có'}</dd></div>
          <div><dt>Ngày đăng ký</dt><dd>{dateOnly(selected.registrationDate)}</dd></div>
          <div><dt>Hạn đăng ký</dt><dd>{dateOnly(selected.registrationExpiryDate)}</dd></div>
          <div><dt>Khối lượng</dt><dd>{selected.weightKg != null ? `${selected.weightKg} kg` : 'Chưa có'}</dd></div>
          <div><dt>Bảo trì gần nhất</dt><dd>{dateTime(selected.lastMaintenanceAt)}</dd></div>
          <div><dt>Ghi chú</dt><dd>{selected.notes ?? 'Không có'}</dd></div>
        </dl>
        <Space wrap>
          <Button onClick={() => setFormDrone(selected)}>Chỉnh sửa</Button>
          {allowedTransitions(selected.status).map(target => <Button key={target} danger={target === 'RETIRED'} onClick={() => setAction(transitionAction(selected, target))}>{transitionLabels[target]}</Button>)}
        </Space>
        <Divider titlePlacement="left">Lịch sử bảo trì</Divider>
        {history.isError ? <Alert type="error" showIcon message={droneError(history.error)} /> : <Table<DroneMaintenanceRecord> size="small" rowKey="id" loading={history.isPending} dataSource={history.data ?? []} pagination={false} locale={{ emptyText: 'Chưa có lượt bảo trì nào.' }} columns={[
          { title: 'Bắt đầu', render: (_, record) => dateTime(record.startedAt) },
          { title: 'Lý do', render: (_, record) => record.reason ?? 'Không có' },
          { title: 'Kết thúc', render: (_, record) => record.closedAt ? dateTime(record.closedAt) : 'Đang mở' },
          { title: 'Bảo trì kế tiếp', render: (_, record) => dateTime(record.nextMaintenanceAt) },
        ]} />}
      </> : null}
    </Drawer>
    {formDrone ? <DroneFormModal token={token} drone={formDrone === 'new' ? null : formDrone} close={() => setFormDrone(null)} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
