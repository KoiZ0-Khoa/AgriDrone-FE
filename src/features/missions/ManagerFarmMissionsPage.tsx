import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Pagination, Select, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { useAuth } from '../auth/AuthContext'
import { workflowError } from '../surveys/workflow'
import { getMissions } from './missionApi'
import type { MissionListItem, MissionStatus } from './types'
import { missionStatusLabels, processingStatusLabels } from './workflow'

const statusOptions = Object.entries(missionStatusLabels).map(([value, label]) => ({ value, label }))

export function ManagerFarmMissionsPage() {
  const token = useAuth().session!.accessToken
  const { farmId = '' } = useParams()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<MissionStatus | ''>('')
  const query = useQuery({
    queryKey: ['farm-missions', farmId, page, status],
    queryFn: ({ signal }) => getMissions(token, farmId, { pageNumber: page, pageSize: 20, status: status || undefined }, signal),
  })

  return <>
    <Link className="back-link" to={`/manager/farms/${encodeURIComponent(farmId)}`}><ArrowLeftOutlined /> Nông trại</Link>
    <section className="resource-page-heading">
      <div><span className="page-kicker">VẬN HÀNH</span><h1>Mission trong nông trại</h1><p>Toàn bộ Mission đã chuẩn bị, không giới hạn theo một đơn khảo sát.</p></div>
      <Button icon={<ReloadOutlined />} onClick={() => { void query.refetch() }}>Tải lại</Button>
    </section>
    <Alert className="workflow-notice" type="info" showIcon title="Danh sách này không gắn trực tiếp với đơn khảo sát"
      description="Để vận hành Mission theo một đơn cụ thể (checklist, bắt đầu/hoàn tất bay...), mở đơn khảo sát tương ứng và dùng 'Chuẩn bị Mission bay'. Trang này chỉ để xem tổng quan trạng thái Mission trong nông trại." />
    <section className="resource-panel">
      <div className="workflow-toolbar">
        <Select aria-label="Trạng thái Mission" value={status} onChange={value => { setPage(1); setStatus(value) }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...statusOptions]} />
      </div>
      {query.isError ? <CommonState type="error" description={workflowError(query.error)} retry={() => query.refetch()} /> : <>
        <Table<MissionListItem> rowKey="id" loading={query.isPending} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 820 }}
          locale={{ emptyText: 'Chưa có Mission phù hợp.' }}
          columns={[
            { title: 'Mã Mission', dataIndex: 'missionCode' },
            { title: 'Trạng thái', render: (_, mission) => <Tag>{missionStatusLabels[mission.status] ?? mission.status}</Tag> },
            { title: 'Xử lý', render: (_, mission) => processingStatusLabels[mission.processingStatus] ?? mission.processingStatus },
            { title: 'Lịch bay', render: (_, mission) => mission.scheduledAt ? new Date(mission.scheduledAt).toLocaleString('vi-VN') : 'Chưa có' },
            { title: 'Bắt đầu / kết thúc', render: (_, mission) => `${mission.startedAt ? new Date(mission.startedAt).toLocaleString('vi-VN') : '—'} / ${mission.endedAt ? new Date(mission.endedAt).toLocaleString('vi-VN') : '—'}` },
            { title: 'Phiên bản', dataIndex: 'version' },
          ]} />
        <Pagination current={page} pageSize={20} total={query.data?.totalCount ?? 0} showSizeChanger={false} onChange={setPage} />
      </>}
    </section>
  </>
}
