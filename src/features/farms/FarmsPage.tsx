import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App as AntApp, Button, Form, Input, InputNumber, Modal, Pagination, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { createFarm, getFarm, getFarms } from './farmsApi'
import { FarmAssignmentPanel } from './FarmAssignmentPanel'
import type { CreateFarmRequest, Farm, GeneralStatus } from './types'

type FarmFormValues = {
  code: string
  name: string
  address?: string
  areaHectares?: number
  longitude?: number
  latitude?: number
}

function statusLabel(status: GeneralStatus) {
  return status === 0 || status === 'Active' ? 'Đang hoạt động' : 'Ngừng hoạt động'
}

function formatArea(area: number | null) {
  return area === null ? 'Chưa cập nhật' : `${area.toLocaleString('vi-VN')} ha`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value))
}

function FarmCard({ farm }: { farm: Farm }) {
  return (
    <article className="resource-card">
      <div className="resource-card-heading">
        <span className="resource-icon"><HomeOutlined aria-hidden="true" /></span>
        <Tag color={farm.status === 0 || farm.status === 'Active' ? 'success' : 'default'}>
          {statusLabel(farm.status)}
        </Tag>
      </div>
      <div>
        <span className="resource-code">{farm.code}</span>
        <h2>{farm.name}</h2>
        <p>{farm.address ?? 'Chưa cập nhật địa chỉ'}</p>
      </div>
      <dl className="resource-meta">
        <div><dt>Diện tích</dt><dd>{formatArea(farm.areaHectares)}</dd></div>
        <div><dt>Ngày tạo</dt><dd>{formatDate(farm.createdAt)}</dd></div>
      </dl>
      <Link className="resource-card-link" to={`/farms/${farm.id}`}>
        Xem chi tiết <span aria-hidden="true">→</span>
      </Link>
    </article>
  )
}

export function FarmsPage() {
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm<FarmFormValues>()
  const { message } = AntApp.useApp()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const canManageFarms = session?.role === 'OWNER' || session?.role === 'TENANT_ADMIN'

  const farmsQuery = useQuery({
    queryKey: ['farms', session?.tenant?.id, page],
    queryFn: () => getFarms(session!.accessToken, page),
    enabled: Boolean(session?.accessToken && session.tenant),
  })

  const createMutation = useMutation({
    mutationFn: (request: CreateFarmRequest) => createFarm(session!.accessToken, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farms', session?.tenant?.id] })
      form.resetFields()
      setCreateOpen(false)
      message.success('Đã tạo nông trại')
    },
    onError: (error) => message.error(error instanceof Error ? error.message : 'Không thể tạo nông trại.'),
  })

  function submitFarm(values: FarmFormValues) {
    const hasLongitude = typeof values.longitude === 'number'
    const hasLatitude = typeof values.latitude === 'number'

    if (hasLongitude !== hasLatitude) {
      message.error('Hãy nhập đủ cả kinh độ và vĩ độ, hoặc để trống cả hai.')
      return
    }

    createMutation.mutate({
      code: values.code.trim(),
      name: values.name.trim(),
      address: values.address?.trim() || null,
      areaHectares: values.areaHectares ?? null,
      centerPoint: hasLongitude && hasLatitude
        ? { type: 'Point', coordinates: [values.longitude!, values.latitude!] }
        : null,
      boundary: null,
    })
  }

  if (!session?.tenant) {
    return <CommonState type="forbidden" description="Hãy đăng nhập trong một tenant để xem danh sách nông trại." />
  }

  return (
    <>
      <section className="resource-page-heading">
        <div>
          <span className="page-kicker">NÔNG TRẠI</span>
          <h1>Không gian canh tác</h1>
          <p>Quản lý thông tin nền của từng nông trại trước khi thiết lập khu vực và nhiệm vụ bay.</p>
        </div>
        {canManageFarms ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Thêm nông trại
          </Button>
        ) : null}
      </section>

      <section className="resource-panel" aria-label="Danh sách nông trại">
        <div className="resource-panel-heading">
          <div>
            <strong>Danh sách nông trại</strong>
            <span>{farmsQuery.data ? `${farmsQuery.data.totalCount} nông trại` : 'Đang đồng bộ'}</span>
          </div>
          <span className="scope-note">{session.tenant.name}</span>
        </div>

        {farmsQuery.isPending ? <CommonState type="loading" title="Đang tải nông trại" /> : null}
        {farmsQuery.isError ? (
          farmsQuery.error instanceof ApiError && farmsQuery.error.status === 403
            ? <CommonState type="forbidden" description="API danh sách nông trại hiện chỉ cho Tenant Admin hoặc Owner truy cập." />
            : <CommonState type="error" description={farmsQuery.error.message} retry={() => farmsQuery.refetch()} />
        ) : null}
        {farmsQuery.isSuccess && farmsQuery.data.items.length === 0 ? (
          <CommonState
            type="empty"
            title="Chưa có nông trại"
            description="Tạo nông trại đầu tiên để tiếp tục thiết lập khu vực canh tác."
            action={canManageFarms ? () => setCreateOpen(true) : undefined}
            actionLabel="Thêm nông trại"
          />
        ) : null}
        {farmsQuery.isSuccess && farmsQuery.data.items.length > 0 ? (
          <>
            <div className="resource-grid">
              {farmsQuery.data.items.map((farm) => <FarmCard farm={farm} key={farm.id} />)}
            </div>
            {farmsQuery.data.totalCount > farmsQuery.data.pageSize ? (
              <Pagination
                current={farmsQuery.data.pageNumber}
                pageSize={farmsQuery.data.pageSize}
                total={farmsQuery.data.totalCount}
                showSizeChanger={false}
                onChange={setPage}
              />
            ) : null}
          </>
        ) : null}
      </section>

      <Modal
        title="Thêm nông trại"
        open={createOpen}
        okText="Tạo nông trại"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submitFarm} requiredMark={false}>
          <div className="form-two-columns">
            <Form.Item label="Mã nông trại" name="code" rules={[{ required: true, message: 'Nhập mã nông trại' }, { max: 30 }]}>
              <Input placeholder="VD: FARM_BT_01" />
            </Form.Item>
            <Form.Item label="Tên nông trại" name="name" rules={[{ required: true, message: 'Nhập tên nông trại' }, { max: 150 }]}>
              <Input placeholder="VD: Nông trại Bình Thuận" />
            </Form.Item>
          </div>
          <Form.Item label="Địa chỉ" name="address" rules={[{ max: 200 }]}>
            <Input placeholder="Địa chỉ hoặc mô tả vị trí" />
          </Form.Item>
          <Form.Item label="Diện tích (ha)" name="areaHectares">
            <InputNumber min={0} precision={2} placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
          <div className="form-section-label">Tọa độ tâm (không bắt buộc)</div>
          <div className="form-two-columns">
            <Form.Item label="Kinh độ" name="longitude">
              <InputNumber min={-180} max={180} precision={7} placeholder="108.1234567" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Vĩ độ" name="latitude">
              <InputNumber min={-90} max={90} precision={7} placeholder="10.1234567" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}

export function FarmDetailPage() {
  const { farmId = '' } = useParams()
  const { session } = useAuth()
  const farmQuery = useQuery({
    queryKey: ['farm', session?.tenant?.id, farmId],
    queryFn: () => getFarm(session!.accessToken, farmId),
    enabled: Boolean(session?.accessToken && session.tenant && farmId),
  })

  if (farmQuery.isPending) return <CommonState type="loading" title="Đang tải nông trại" />
  if (farmQuery.isError) {
    return farmQuery.error instanceof ApiError && farmQuery.error.status === 403
      ? <CommonState type="forbidden" />
      : <CommonState type="error" description={farmQuery.error.message} retry={() => farmQuery.refetch()} />
  }

  const farm = farmQuery.data
  const coordinates = farm.centerPoint?.coordinates

  return (
    <>
      <Link className="back-link" to="/farms"><ArrowLeftOutlined /> Danh sách nông trại</Link>
      <section className="resource-page-heading detail-heading">
        <div>
          <span className="page-kicker">{farm.code}</span>
          <h1>{farm.name}</h1>
          <p>{farm.address ?? 'Chưa cập nhật địa chỉ cho nông trại này.'}</p>
        </div>
        <Link className="primary-action-link" to={`/zones?farmId=${farm.id}`}>
          <EnvironmentOutlined /> Xem khu vực
        </Link>
      </section>

      <div className="detail-layout">
        <section className="resource-panel detail-main-panel">
          <div className="resource-panel-heading"><div><strong>Thông tin nông trại</strong><span>Dữ liệu chính thức từ backend</span></div></div>
          <dl className="detail-list">
            <div><dt>Mã nông trại</dt><dd>{farm.code}</dd></div>
            <div><dt>Trạng thái</dt><dd>{statusLabel(farm.status)}</dd></div>
            <div><dt>Diện tích</dt><dd>{formatArea(farm.areaHectares)}</dd></div>
            <div><dt>Ngày tạo</dt><dd>{formatDate(farm.createdAt)}</dd></div>
            <div><dt>Kinh độ</dt><dd>{coordinates ? coordinates[0].toFixed(7) : 'Chưa cập nhật'}</dd></div>
            <div><dt>Vĩ độ</dt><dd>{coordinates ? coordinates[1].toFixed(7) : 'Chưa cập nhật'}</dd></div>
          </dl>
        </section>
        <aside className="resource-panel boundary-panel">
          <span className="resource-icon"><EnvironmentOutlined aria-hidden="true" /></span>
          <strong>Ranh giới canh tác</strong>
          <p>{farm.boundary ? `Đã lưu ${farm.boundary.coordinates[0]?.length ?? 0} điểm ranh giới.` : 'Chưa thiết lập polygon ranh giới.'}</p>
        </aside>
      </div>
      {session?.tenant && (session.role === 'OWNER' || session.role === 'TENANT_ADMIN') && (farm.status === 0 || farm.status === 'Active') ? (
        <FarmAssignmentPanel key={`${session.tenant.id}:${farm.id}:${session.accessToken}`} farmId={farm.id} session={session} />
      ) : null}
    </>
  )
}
