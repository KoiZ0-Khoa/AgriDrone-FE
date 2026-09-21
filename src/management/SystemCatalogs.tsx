import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Space, Table, Tag } from 'antd'
import { CommonState } from '../components/CommonState'
import * as api from './api'
import { confirmation, text, type Action, type Values } from './actions'

const conditionTypeOptions: { label: string; value: api.PlantConditionType }[] = [
  { label: 'Bệnh cây', value: 'DISEASE' },
  { label: 'Tổn thương phi sinh học', value: 'ABIOTIC_DAMAGE' },
  { label: 'Tổn thương cơ học', value: 'MECHANICAL_DAMAGE' },
  { label: 'Khác', value: 'OTHER' },
]

const conditionTypeLabels = Object.fromEntries(conditionTypeOptions.map(item => [item.value, item.label])) as Record<api.PlantConditionType, string>
const versionUnavailable = 'BE chưa trả version trong API danh sách nên chưa thể gửi expectedVersion an toàn.'

function nullableText(values: Values, key: string) {
  return text(values, key) || null
}

function validateCode(value: string, max: number) {
  const code = value.trim()
  if (code.length > max || !/^[A-Za-z][A-Za-z0-9_]*$/.test(code)) {
    throw new Error(`Mã phải bắt đầu bằng chữ, chỉ gồm chữ, số, dấu gạch dưới và tối đa ${max} ký tự.`)
  }
  return code
}

function displayOrder(values: Values) {
  const raw = text(values, 'displayOrder')
  if (!/^\d+$/.test(raw)) throw new Error('Thứ tự hiển thị phải là số nguyên không âm.')
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new Error('Thứ tự hiển thị không hợp lệ.')
  return value
}

function createPlantConditionAction(token: string): Action {
  return {
    title: 'Thêm tình trạng cây',
    description: 'Tạo mục mới trong danh mục dùng chung của toàn hệ thống.',
    fields: [
      { key: 'code', label: 'Mã tình trạng', max: 50 },
      { key: 'name', label: 'Tên tình trạng', max: 150 },
      { key: 'scientificName', label: 'Tên khoa học', optional: true, max: 150 },
      { key: 'conditionType', label: 'Loại tình trạng', kind: 'select', value: 'DISEASE', options: conditionTypeOptions },
      { key: 'description', label: 'Mô tả', optional: true, max: 2000, kind: 'multiline' },
    ],
    run: values => api.createPlantCondition(token, {
      code: validateCode(text(values, 'code'), 50),
      name: text(values, 'name'),
      scientificName: nullableText(values, 'scientificName'),
      conditionType: text(values, 'conditionType') as api.PlantConditionType,
      description: nullableText(values, 'description'),
    }),
    success: 'Đã thêm tình trạng cây.',
  }
}

function versionPlantConditionAction(token: string, item: api.PlantCondition): Action {
  return {
    title: `Tạo phiên bản mới · ${item.name}`,
    description: 'Phiên bản hiện tại được giữ lại để bảo toàn dữ liệu lịch sử.',
    fields: [
      { key: 'name', label: 'Tên tình trạng', value: item.name, max: 150 },
      { key: 'scientificName', label: 'Tên khoa học', value: item.scientificName ?? '', optional: true, max: 150 },
      { key: 'description', label: 'Mô tả', value: item.description ?? '', optional: true, max: 2000, kind: 'multiline' },
    ],
    run: values => api.versionPlantCondition(token, item.id, {
      name: text(values, 'name'),
      scientificName: nullableText(values, 'scientificName'),
      description: nullableText(values, 'description'),
      expectedVersion: item.version!,
    }),
    success: 'Đã tạo phiên bản tình trạng cây mới.',
  }
}

function createHarvestGradeAction(token: string): Action {
  return {
    title: 'Thêm cấp chất lượng thu hoạch',
    description: 'Tạo cấp chất lượng mới trong danh mục dùng chung của toàn hệ thống.',
    fields: [
      { key: 'code', label: 'Mã cấp chất lượng', max: 30 },
      { key: 'name', label: 'Tên cấp chất lượng', max: 100 },
      { key: 'displayOrder', label: 'Thứ tự hiển thị', kind: 'number', value: '0' },
    ],
    run: values => api.createHarvestQualityGrade(token, {
      code: validateCode(text(values, 'code'), 30),
      name: text(values, 'name'),
      displayOrder: displayOrder(values),
    }),
    success: 'Đã thêm cấp chất lượng thu hoạch.',
  }
}

function versionHarvestGradeAction(token: string, item: api.HarvestQualityGrade): Action {
  return {
    title: `Tạo phiên bản mới · ${item.name}`,
    description: 'Phiên bản hiện tại được giữ lại để bảo toàn dữ liệu lịch sử.',
    fields: [
      { key: 'name', label: 'Tên cấp chất lượng', value: item.name, max: 100 },
      { key: 'displayOrder', label: 'Thứ tự hiển thị', value: String(item.displayOrder), kind: 'number' },
    ],
    run: values => api.versionHarvestQualityGrade(token, item.id, {
      name: text(values, 'name'),
      displayOrder: displayOrder(values),
      expectedVersion: item.version!,
    }),
    success: 'Đã tạo phiên bản cấp chất lượng mới.',
  }
}

export function PlantConditionsPanel({ token, setAction }: { token: string; setAction: (action: Action) => void }) {
  const query = useQuery({ queryKey: ['system-plant-conditions'], queryFn: () => api.getPlantConditions(token) })
  if (query.isError) return <CommonState type="error" description={query.error.message} retry={() => query.refetch()} />
  const items = query.data ?? []
  const missingVersion = items.some(item => !Number.isSafeInteger(item.version) || item.version! <= 0)
  return <section className="resource-panel" aria-label="Danh mục tình trạng cây">
    <div className="resource-panel-heading"><div><strong>Tình trạng cây</strong><span>Bệnh và tình trạng được dùng khi ghi nhận, phân tích cây trồng.</span></div><Button type="primary" onClick={() => setAction(createPlantConditionAction(token))}>Thêm tình trạng</Button></div>
    {missingVersion ? <Alert className="catalog-contract-alert" type="warning" showIcon title="Chưa thể sửa phiên bản hoặc ngừng sử dụng" description={versionUnavailable} /> : null}
    <Table<api.PlantCondition> rowKey="id" loading={query.isPending} dataSource={items} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Chưa có tình trạng cây nào.' }} columns={[
      { title: 'Mã', dataIndex: 'code', width: 150 },
      { title: 'Tên', render: (_, item) => <div className="catalog-name"><strong>{item.name}</strong>{item.scientificName ? <span>{item.scientificName}</span> : null}</div> },
      { title: 'Loại', render: (_, item) => <Tag>{conditionTypeLabels[item.conditionType] ?? item.conditionType}</Tag> },
      { title: 'Phiên bản nghiệp vụ', dataIndex: 'revisionNumber', width: 160 },
      { title: 'Thao tác', width: 240, render: (_, item) => {
        const disabled = !Number.isSafeInteger(item.version) || item.version! <= 0
        return <Space wrap><Button disabled={disabled} title={disabled ? versionUnavailable : undefined} onClick={() => setAction(versionPlantConditionAction(token, item))}>Tạo phiên bản mới</Button><Button danger disabled={disabled} title={disabled ? versionUnavailable : undefined} onClick={() => setAction(confirmation('Ngừng sử dụng tình trạng cây', `Ngừng sử dụng “${item.name}” trong các lựa chọn mới?`, () => api.retirePlantCondition(token, item.id, item.version!)))}>Ngừng sử dụng</Button></Space>
      } },
    ]} />
  </section>
}

export function HarvestQualityGradesPanel({ token, setAction }: { token: string; setAction: (action: Action) => void }) {
  const query = useQuery({ queryKey: ['system-harvest-quality-grades'], queryFn: () => api.getHarvestQualityGrades(token) })
  if (query.isError) return <CommonState type="error" description={query.error.message} retry={() => query.refetch()} />
  const items = query.data ?? []
  const missingVersion = items.some(item => !Number.isSafeInteger(item.version) || item.version! <= 0)
  return <section className="resource-panel" aria-label="Danh mục cấp chất lượng thu hoạch">
    <div className="resource-panel-heading"><div><strong>Cấp chất lượng thu hoạch</strong><span>Các mức phân loại chất lượng dùng khi ghi nhận kết quả thu hoạch.</span></div><Button type="primary" onClick={() => setAction(createHarvestGradeAction(token))}>Thêm cấp chất lượng</Button></div>
    {missingVersion ? <Alert className="catalog-contract-alert" type="warning" showIcon title="Chưa thể sửa phiên bản hoặc ngừng sử dụng" description={versionUnavailable} /> : null}
    <Table<api.HarvestQualityGrade> rowKey="id" loading={query.isPending} dataSource={items} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: 'Chưa có cấp chất lượng thu hoạch nào.' }} columns={[
      { title: 'Thứ tự', dataIndex: 'displayOrder', width: 100 },
      { title: 'Mã', dataIndex: 'code', width: 180 },
      { title: 'Tên', dataIndex: 'name' },
      { title: 'Phiên bản nghiệp vụ', dataIndex: 'revisionNumber', width: 160 },
      { title: 'Thao tác', width: 240, render: (_, item) => {
        const disabled = !Number.isSafeInteger(item.version) || item.version! <= 0
        return <Space wrap><Button disabled={disabled} title={disabled ? versionUnavailable : undefined} onClick={() => setAction(versionHarvestGradeAction(token, item))}>Tạo phiên bản mới</Button><Button danger disabled={disabled} title={disabled ? versionUnavailable : undefined} onClick={() => setAction(confirmation('Ngừng sử dụng cấp chất lượng', `Ngừng sử dụng “${item.name}” trong các lựa chọn mới?`, () => api.retireHarvestQualityGrade(token, item.id, item.version!)))}>Ngừng sử dụng</Button></Space>
      } },
    ]} />
  </section>
}
