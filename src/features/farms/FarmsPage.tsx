import { readableCode } from '../../components/RecordReference'
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Pagination, Space, Tag } from 'antd'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { getFarm, getFarms } from './farmsApi'
import { MyFarmsPage } from '../../management/MyFarmsPage'
import type { Farm, GeneralStatus } from './types'

function statusLabel(status: GeneralStatus) {
  return status === 0 || status === 'Active' || status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'
}

function formatArea(area: number | null) {
  return area === null ? 'Chưa cập nhật' : `${area.toLocaleString('vi-VN')} ha`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value))
}

function FarmCard({ farm }: { farm: Farm }) {
  return (
    <Link className="resource-card" to={`/farms/${farm.id}`}>
      <div className="resource-card-heading">
        <span className="resource-icon"><HomeOutlined aria-hidden="true" /></span>
        <Tag color={farm.status === 0 || farm.status === 'Active' || farm.status === 'ACTIVE' ? 'success' : 'default'}>
          {statusLabel(farm.status)}
        </Tag>
      </div>
      <div>
        <span className="resource-code">{readableCode(farm.code)}</span>
        <h2>{farm.name}</h2>
        <p>{farm.address ?? 'Chưa cập nhật địa chỉ'}</p>
      </div>
      <dl className="resource-meta">
        <div><dt>Diện tích</dt><dd>{formatArea(farm.areaHectares)}</dd></div>
        <div><dt>Ngày tạo</dt><dd>{formatDate(farm.createdAt)}</dd></div>
      </dl>
      <span className="resource-card-link">
        Xem chi tiết <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}

export function FarmsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { session } = useAuth()
  const canManageFarms = session?.role === 'OWNER' || session?.role === 'TENANT_ADMIN'

  const farmsQuery = useQuery({
    queryKey: ['farms', session?.tenant?.id, page],
    queryFn: () => getFarms(session!.accessToken, page),
    enabled: Boolean(session?.accessToken && session.tenant && canManageFarms),
  })

  if (!session?.tenant) {
    return <CommonState type="forbidden" description="Hãy đăng nhập trong một tenant để xem danh sách nông trại." />
  }
  if (session.role === 'MEMBER') return <MyFarmsPage />

  return (
    <>
      <section className="resource-page-heading">
        <div>
          <h1>Nông trại</h1>
          <p>{session.tenant.name}</p>
        </div>
        {canManageFarms ? (
          <Space size={12} wrap>
            {session.role === 'OWNER' ? (
              <Button color="primary" variant="outlined" icon={<InboxOutlined />} onClick={() => navigate('/farms/archived')}>
                Đã lưu trữ
              </Button>
            ) : null}
            {session.role === 'OWNER' ? <Button type="primary" onClick={() => navigate('/survey-requests/new')}>Đăng ký nông trại</Button> : null}
          </Space>
        ) : null}
      </section>

      <section className="resource-panel" aria-label="Danh sách nông trại">
        <div className="resource-panel-heading">
          <div>
            <strong>Danh sách nông trại</strong>
            <span>{farmsQuery.data ? `${farmsQuery.data.totalCount} nông trại` : 'Đang đồng bộ'}</span>
          </div>
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
            description="Chủ đơn vị gửi yêu cầu khảo sát nông trại mới để được xét duyệt."
            action={session.role === 'OWNER' ? () => navigate('/survey-requests/new') : undefined}
            actionLabel="Đăng ký khảo sát"
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


    </>
  )
}

export function FarmDetailPage() {
  const { farmId = '' } = useParams()
  const { session } = useAuth()
  const farmQuery = useQuery({
    queryKey: ['farm', session?.tenant?.id, farmId],
    queryFn: ({ signal }) => getFarm(session!.accessToken, farmId, signal),
    enabled: Boolean(session?.accessToken && session.tenant && farmId),
    retry: false,
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
          <span className="page-kicker">{readableCode(farm.code)}</span>
          <h1>{farm.name}</h1>
          <p>{farm.address ?? 'Chưa cập nhật địa chỉ cho nông trại này.'}</p>
        </div>
        <Space size={12} wrap>
          {session?.role === 'OWNER' ? <Link className="primary-action-link" to={`/survey-requests/new?farmId=${farm.id}`}>Đăng ký khảo sát</Link> : null}
          {session?.role === 'OWNER' ? <Link className="workflow-detail-link" to="/survey-payments">Xem đơn và thanh toán →</Link> : null}
          <Link className="primary-action-link" to={`/zones?farmId=${farm.id}`}>
            <EnvironmentOutlined aria-hidden="true" /> Xem khu vực
          </Link>
        </Space>
      </section>

      <div className="detail-layout">
        <section className="resource-panel detail-main-panel">
          <div className="resource-panel-heading"><div><strong>Thông tin nông trại</strong><span>Dữ liệu chính thức từ backend</span></div></div>
          <dl className="detail-list">
            {readableCode(farm.code) ? <div><dt>Mã nông trại</dt><dd>{readableCode(farm.code)}</dd></div> : null}
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
    </>
  )
}
