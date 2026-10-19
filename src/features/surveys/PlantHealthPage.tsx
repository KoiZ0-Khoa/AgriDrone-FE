import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Drawer, Space, Table, Tag } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { changeGuidanceState, createGuidance, getGuidanceHistory, getPlantHealth, type PlantHealthLabel, type SourcedGuidance } from './plantHealthApi'
import { dateTime, workflowError } from './workflow'

const statusLabels = { DRAFT: 'Bản nháp', ACTIVE: 'Đang sử dụng', RETIRED: 'Ngừng sử dụng' }
export function PlantHealthPage() {
  const token = useAuth().session!.accessToken
  const [action, setAction] = useState<Action | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const catalogue = useQuery({ queryKey: ['plant-health-master-data'], queryFn: ({ signal }) => getPlantHealth(token, signal) })
  const history = useQuery({ queryKey: ['plant-health-guidance-history'], queryFn: ({ signal }) => getGuidanceHistory(token, signal) })
  const selected = history.data?.find(item => item.id === selectedId)
  const suspected = catalogue.data?.labels.filter(label => label.labelKind === 'SUSPECTED_DISEASE') ?? []
  function createAction(): Action {
    return { title: 'Soạn hướng dẫn có nguồn', description: 'Tạo bản nháp cho một nhãn nghi ngờ bệnh. Dùng lại mã hướng dẫn sẽ tạo phiên bản tiếp theo; cần kích hoạt bản nháp sau khi kiểm tra.', fields: [
      { key: 'code', label: 'Mã hướng dẫn', max: 80 },
      { key: 'conditionId', label: 'Nhãn nghi ngờ bệnh', kind: 'select', options: suspected.map(label => ({ value: label.id, label: `${label.name} · ${label.code}` })) },
      { key: 'sourceTitle', label: 'Tên tài liệu nguồn', max: 300 }, { key: 'sourceReference', label: 'Đường dẫn hoặc mã tham chiếu nguồn', max: 1000 },
      { key: 'guidanceText', label: 'Nội dung hướng dẫn', kind: 'multiline', max: 4000 },
      { key: 'from', label: 'Có hiệu lực từ (để trống: thời điểm tạo)', kind: 'datetime-local', optional: true },
      { key: 'to', label: 'Hết hiệu lực (không bắt buộc)', kind: 'datetime-local', optional: true },
    ], run: values => {
      const code = text(values, 'code')
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(code)) throw new Error('Mã hướng dẫn phải bắt đầu bằng chữ, chỉ gồm chữ, số, gạch dưới hoặc gạch ngang.')
      if (!suspected.some(label => label.id === values.conditionId)) throw new Error('Chọn nhãn nghi ngờ bệnh đang sử dụng.')
      const effectiveFrom = values.from ? new Date(values.from).toISOString() : null
      const effectiveTo = values.to ? new Date(values.to).toISOString() : null
      if (effectiveTo && Date.parse(effectiveTo) <= (effectiveFrom ? Date.parse(effectiveFrom) : Date.now())) throw new Error('Thời điểm hết hiệu lực phải sau thời điểm bắt đầu.')
      return createGuidance(token, { code, plantConditionId: values.conditionId, sourceTitle: text(values, 'sourceTitle'), sourceReference: text(values, 'sourceReference'), guidanceText: text(values, 'guidanceText'), effectiveFrom, effectiveTo })
    }, success: 'Đã tạo bản nháp hướng dẫn' }
  }
  return <>
    <section className="resource-page-heading"><div><span className="page-kicker">DỮ LIỆU PLANT HEALTH</span><h1>Nhãn và hướng dẫn</h1><p>Quản lý nhãn nhận định sơ bộ và hướng dẫn có tài liệu tham chiếu.</p></div><Button icon={<ReloadOutlined />} onClick={() => { void catalogue.refetch(); void history.refetch() }}>Tải lại</Button></section>
    <Alert className="workflow-notice" showIcon type="info" title="Nhận định sơ bộ, không thay thế chẩn đoán" description="Các nhãn do nhóm xây dựng để hỗ trợ nhận định sơ bộ. Nhãn nghi ngờ bệnh và nhãn dễ nhầm không thể hiện mức độ nặng hoặc chẩn đoán xác định." />
    <section className="resource-panel"><div className="resource-panel-heading"><div><strong>Nhãn đang sử dụng</strong><span>Giới hạn diễn giải và phiên bản bộ dữ liệu</span></div><Link className="workflow-detail-link" to="/system/plant-conditions">Quản lý tình trạng cây →</Link></div>
      {catalogue.isError ? <CommonState type="error" description={workflowError(catalogue.error)} retry={() => catalogue.refetch()} /> : <Table<PlantHealthLabel> rowKey="id" loading={catalogue.isPending} dataSource={catalogue.data?.labels ?? []} pagination={false} scroll={{ x: 800 }} columns={[
        { title: 'Nhãn', render: (_, label) => <><strong>{label.name}</strong><div className="form-hint">{label.code}</div></> },
        { title: 'Phân loại', render: (_, label) => <Tag>{label.labelKind === 'SUSPECTED_DISEASE' ? 'Nghi ngờ bệnh' : 'Dễ nhầm, không phải bệnh'}</Tag> },
        { title: 'Phiên bản dữ liệu', render: (_, label) => <>{label.datasetVersion}<div className="form-hint">Quy tắc: {label.annotationRuleVersion}</div></> },
        { title: 'Giới hạn nhãn', dataIndex: 'teamLabelLimitation' },
      ]} />}
    </section>
    <section className="resource-panel workflow-section"><div className="resource-panel-heading"><div><strong>Lịch sử hướng dẫn có nguồn</strong><span>Bản nháp và các phiên bản đã kích hoạt/ngừng sử dụng</span></div><Button type="primary" disabled={!catalogue.isSuccess || !suspected.length} onClick={() => setAction(createAction())}>Soạn hướng dẫn</Button></div>
      {history.isError ? <CommonState type="error" description={workflowError(history.error)} retry={() => history.refetch()} /> : <Table<SourcedGuidance> rowKey="id" loading={history.isPending} dataSource={history.data ?? []} pagination={{ pageSize: 10 }} scroll={{ x: 850 }} columns={[
        { title: 'Hướng dẫn', render: (_, item) => <><strong>{item.code}</strong><div className="form-hint">Phiên bản {item.versionNumber} · {item.suspectedClassCode}</div></> },
        { title: 'Nguồn', dataIndex: 'sourceTitle' }, { title: 'Trạng thái', render: (_, item) => <Tag>{statusLabels[item.status] ?? item.status}</Tag> },
        { title: 'Hiệu lực từ', render: (_, item) => dateTime(item.effectiveFrom) },
        { title: 'Thao tác', render: (_, item) => <Button onClick={() => setSelectedId(item.id)}>Xem hướng dẫn</Button> },
      ]} />}
    </section>
    <Drawer open={Boolean(selectedId)} title="Hướng dẫn có nguồn" size={600} onClose={() => setSelectedId('')}>
      {selected ? <><h2>{selected.code} · v{selected.versionNumber}</h2><Tag>{statusLabels[selected.status]}</Tag><dl className="detail-list"><div><dt>Nhãn nghi ngờ</dt><dd>{selected.suspectedClassCode}</dd></div><div><dt>Tài liệu nguồn</dt><dd>{selected.sourceTitle}</dd></div><div><dt>Tham chiếu nguồn</dt><dd>{selected.sourceReference}</dd></div><div><dt>Hiệu lực</dt><dd>{dateTime(selected.effectiveFrom)} – {dateTime(selected.effectiveTo)}</dd></div></dl><p className="workflow-prewrap">{selected.guidanceText}</p><Space wrap>
        {selected.status !== 'RETIRED' ? <Button disabled={!Number.isSafeInteger(selected.version) || selected.version < 1} danger={selected.status === 'ACTIVE'} type={selected.status === 'DRAFT' ? 'primary' : 'default'} onClick={() => setAction({ title: selected.status === 'DRAFT' ? 'Kích hoạt hướng dẫn' : 'Ngừng sử dụng hướng dẫn', description: `${selected.code} · phiên bản ${selected.versionNumber}. Xác nhận đã kiểm tra nguồn và thời hạn hiệu lực?`, fields: [], danger: selected.status === 'ACTIVE', run: () => changeGuidanceState(token, selected.id, selected.status === 'DRAFT' ? 'activate' : 'retire', selected.version) })}>{selected.status === 'DRAFT' ? 'Kích hoạt bản nháp' : 'Ngừng sử dụng'}</Button> : null}
      </Space></> : <p>Không có hướng dẫn được chọn.</p>}
    </Drawer>
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
