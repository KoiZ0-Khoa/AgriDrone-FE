import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Button, Drawer, Form, Input, InputNumber, Modal, Tag } from 'antd'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { createZone, getFarm, getFarms, getZone, getZones } from './farmsApi'
import type { CreateZoneRequest, GeneralStatus, Zone } from './types'

type ZoneFormValues = {
  code: string
  name: string
  areaHectares?: number
}

function formatStatus(status: GeneralStatus) {
  return status === 0 || status === 'Active' ? 'Đang hoạt động' : 'Ngừng hoạt động'
}

function formatArea(area: number | null) {
  return area === null ? 'Chưa cập nhật' : `${area.toLocaleString('vi-VN')} ha`
}

function ZoneCard({ zone, onOpen }: { zone: Zone; onOpen: () => void }) {
  return (
    <button className="zone-card" type="button" onClick={onOpen}>
      <span className="resource-icon"><EnvironmentOutlined aria-hidden="true" /></span>
      <span className="zone-card-copy">
        <span className="resource-code">{zone.code}</span>
        <strong>{zone.name}</strong>
        <small>{formatArea(zone.areaHectares)}</small>
      </span>
      <Tag color={zone.status === 0 || zone.status === 'Active' ? 'success' : 'default'}>
        {formatStatus(zone.status)}
      </Tag>
      <RightOutlined className="zone-card-arrow" aria-hidden="true" />
    </button>
  )
}

export function ZonesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedFarmId = searchParams.get('farmId') ?? ''
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm<ZoneFormValues>()
  const { message } = AntApp.useApp()
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const farmsQuery = useQuery({
    queryKey: ['farms', session?.tenant?.id, 1],
    queryFn: () => getFarms(session!.accessToken, 1, 20),
    enabled: Boolean(session?.accessToken && session.tenant),
  })
  const farmQuery = useQuery({
    queryKey: ['farm', session?.tenant?.id, selectedFarmId],
    queryFn: () => getFarm(session!.accessToken, selectedFarmId),
    enabled: Boolean(session?.accessToken && selectedFarmId),
  })
  const zonesQuery = useQuery({
    queryKey: ['zones', session?.tenant?.id, selectedFarmId],
    queryFn: () => getZones(session!.accessToken, selectedFarmId),
    enabled: Boolean(session?.accessToken && selectedFarmId),
  })
  const zoneQuery = useQuery({
    queryKey: ['zone', session?.tenant?.id, selectedFarmId, selectedZoneId],
    queryFn: () => getZone(session!.accessToken, selectedFarmId, selectedZoneId),
    enabled: Boolean(session?.accessToken && selectedFarmId && selectedZoneId),
  })

  const createMutation = useMutation({
    mutationFn: (request: CreateZoneRequest) => createZone(session!.accessToken, selectedFarmId, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['zones', session?.tenant?.id, selectedFarmId] })
      form.resetFields()
      setCreateOpen(false)
      message.success('Đã tạo khu vực')
    },
    onError: (error) => message.error(error instanceof Error ? error.message : 'Không thể tạo khu vực.'),
  })

  function chooseFarm(farmId: string) {
    setSearchParams({ farmId })
  }

  function clearFarm() {
    setSelectedZoneId('')
    setSearchParams({})
  }

  function submitZone(values: ZoneFormValues) {
    createMutation.mutate({
      code: values.code.trim(),
      name: values.name.trim(),
      areaHectares: values.areaHectares ?? null,
      boundary: null,
    })
  }

  if (!session?.tenant) {
    return <CommonState type="forbidden" description="Hãy đăng nhập trong một tenant để xem khu vực." />
  }

  if (!selectedFarmId) {
    return (
      <>
        <section className="resource-page-heading">
          <div>
            <span className="page-kicker">KHU VỰC</span>
            <h1>Chọn nông trại</h1>
            <p>Mỗi khu vực thuộc một nông trại. Chọn phạm vi để xem dữ liệu phù hợp.</p>
          </div>
        </section>
        <section className="resource-panel" aria-label="Chọn nông trại">
          <div className="resource-panel-heading"><div><strong>Nông trại hiện có</strong><span>{session.tenant.name}</span></div></div>
          {farmsQuery.isPending ? <CommonState type="loading" /> : null}
          {farmsQuery.isError ? (
            farmsQuery.error instanceof ApiError && farmsQuery.error.status === 403
              ? <CommonState type="forbidden" description="Backend chưa cung cấp API tìm farm được phân công cho tài khoản Member. Hãy mở khu vực từ một farm đã biết hoặc dùng tài khoản Tenant Admin/Owner." />
              : <CommonState type="error" description={farmsQuery.error.message} retry={() => farmsQuery.refetch()} />
          ) : null}
          {farmsQuery.isSuccess && farmsQuery.data.items.length === 0 ? (
            <CommonState type="empty" title="Chưa có nông trại" description="Tạo nông trại trước khi thiết lập khu vực." />
          ) : null}
          {farmsQuery.isSuccess && farmsQuery.data.items.length > 0 ? (
            <div className="farm-picker-grid">
              {farmsQuery.data.items.map((farm) => (
                <button className="farm-picker" type="button" key={farm.id} onClick={() => chooseFarm(farm.id)}>
                  <span className="resource-icon"><EnvironmentOutlined aria-hidden="true" /></span>
                  <span><strong>{farm.name}</strong><small>{farm.code} · {formatArea(farm.areaHectares)}</small></span>
                  <RightOutlined aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </>
    )
  }

  return (
    <>
      <button className="back-link as-button" type="button" onClick={clearFarm}>
        <ArrowLeftOutlined /> Chọn nông trại khác
      </button>
      <section className="resource-page-heading detail-heading">
        <div>
          <span className="page-kicker">KHU VỰC CANH TÁC</span>
          <h1>{farmQuery.data?.name ?? 'Đang tải nông trại'}</h1>
          <p>Thiết lập các khu vực vận hành độc lập trong phạm vi nông trại.</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Thêm khu vực
        </Button>
      </section>

      <section className="resource-panel" aria-label="Danh sách khu vực">
        <div className="resource-panel-heading">
          <div><strong>Danh sách khu vực</strong><span>{zonesQuery.data ? `${zonesQuery.data.length} khu vực` : 'Đang đồng bộ'}</span></div>
          {farmQuery.data ? <span className="scope-note">{farmQuery.data.code}</span> : null}
        </div>
        {zonesQuery.isPending ? <CommonState type="loading" title="Đang tải khu vực" /> : null}
        {zonesQuery.isError ? (
          zonesQuery.error instanceof ApiError && zonesQuery.error.status === 403
            ? <CommonState type="forbidden" />
            : <CommonState type="error" description={zonesQuery.error.message} retry={() => zonesQuery.refetch()} />
        ) : null}
        {zonesQuery.isSuccess && zonesQuery.data.length === 0 ? (
          <CommonState
            type="empty"
            title="Chưa có khu vực"
            description="Tạo khu vực đầu tiên để phân chia phạm vi canh tác và nhiệm vụ bay."
            action={() => setCreateOpen(true)}
            actionLabel="Thêm khu vực"
          />
        ) : null}
        {zonesQuery.isSuccess && zonesQuery.data.length > 0 ? (
          <div className="zone-list">
            {zonesQuery.data.map((zone) => (
              <ZoneCard zone={zone} key={zone.zoneId} onOpen={() => setSelectedZoneId(zone.zoneId)} />
            ))}
          </div>
        ) : null}
      </section>

      <Modal
        title="Thêm khu vực"
        open={createOpen}
        okText="Tạo khu vực"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submitZone} requiredMark={false}>
          <div className="form-two-columns">
            <Form.Item label="Mã khu vực" name="code" rules={[{ required: true, message: 'Nhập mã khu vực' }, { max: 30 }]}>
              <Input placeholder="VD: ZONE_A01" />
            </Form.Item>
            <Form.Item label="Tên khu vực" name="name" rules={[{ required: true, message: 'Nhập tên khu vực' }, { max: 100 }]}>
              <Input placeholder="VD: Khu thanh long A" />
            </Form.Item>
          </div>
          <Form.Item label="Diện tích (ha)" name="areaHectares">
            <InputNumber min={0} precision={2} placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
          <p className="form-hint">Ranh giới polygon sẽ được bổ sung khi màn hình bản đồ tương tác được triển khai.</p>
        </Form>
      </Modal>

      <Drawer
        title="Chi tiết khu vực"
        open={Boolean(selectedZoneId)}
        width={440}
        onClose={() => setSelectedZoneId('')}
        destroyOnHidden
      >
        {zoneQuery.isPending ? <CommonState type="loading" /> : null}
        {zoneQuery.isError ? <CommonState type="error" description={zoneQuery.error.message} retry={() => zoneQuery.refetch()} /> : null}
        {zoneQuery.isSuccess ? (
          <div className="zone-detail">
            <span className="resource-icon"><EnvironmentOutlined aria-hidden="true" /></span>
            <span className="resource-code">{zoneQuery.data.code}</span>
            <h2>{zoneQuery.data.name}</h2>
            <Tag color={zoneQuery.data.status === 0 || zoneQuery.data.status === 'Active' ? 'success' : 'default'}>
              {formatStatus(zoneQuery.data.status)}
            </Tag>
            <dl className="detail-list">
              <div><dt>Diện tích</dt><dd>{formatArea(zoneQuery.data.areaHectares)}</dd></div>
              <div><dt>Phiên bản</dt><dd>{zoneQuery.data.version}</dd></div>
              <div><dt>Ranh giới</dt><dd>{zoneQuery.data.boundary ? 'Đã thiết lập' : 'Chưa thiết lập'}</dd></div>
              <div><dt>Cập nhật</dt><dd>{zoneQuery.data.updatedAt ? new Date(zoneQuery.data.updatedAt).toLocaleString('vi-VN') : 'Chưa cập nhật'}</dd></div>
            </dl>
          </div>
        ) : null}
      </Drawer>
    </>
  )
}
