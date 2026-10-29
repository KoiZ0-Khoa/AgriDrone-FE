import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input } from 'antd'
import { intakeCoordinate } from './intakeNumbers'

export type BoundaryPoint = { longitude: number | string; latitude: number | string }
export function boundaryPoints(coordinates: number[][] = []): BoundaryPoint[] {
  const last = coordinates.at(-1), first = coordinates[0]
  const ring = first && last && first[0] === last[0] && first[1] === last[1] ? coordinates.slice(0, -1) : coordinates
  return ring.map(([longitude, latitude]) => ({ longitude: String(longitude), latitude: String(latitude) }))
}
export function parseBoundaryPoints(points: BoundaryPoint[]): { longitude: number; latitude: number }[] {
  return points.map(p => ({ longitude: intakeCoordinate(p.longitude, 'longitude'), latitude: intakeCoordinate(p.latitude, 'latitude') }))
}
export function BoundaryPointFields({ fixed = false, disabled = false }: { fixed?: boolean; disabled?: boolean }) {
  return <Form.List name="points">{(fields, { add, remove }) => <>{fields.map((field, index) => <fieldset className="workflow-checklist" key={field.key}>
    <legend>{fixed ? 'Góc' : 'Điểm'} {index + 1}</legend><div className="form-two-columns">
      <Form.Item name={[field.name, 'longitude']} label="Kinh độ" rules={[{ required: true, whitespace: true, message: 'Nhập kinh độ.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeCoordinate(value, 'longitude') } }]}><Input inputMode="decimal" placeholder="VD: 108,1234567" /></Form.Item>
      <Form.Item name={[field.name, 'latitude']} label="Vĩ độ" rules={[{ required: true, whitespace: true, message: 'Nhập vĩ độ.' }, { validator: async (_, value: string | number | undefined) => { if (value !== undefined && value !== '') intakeCoordinate(value, 'latitude') } }]}><Input inputMode="decimal" placeholder="VD: 11,0123456" /></Form.Item>
    </div>{!fixed ? <Button icon={<MinusCircleOutlined />} disabled={disabled || fields.length <= 3} onClick={() => remove(field.name)}>Bỏ điểm {index + 1}</Button> : null}
  </fieldset>)}{!fixed ? <Button icon={<PlusOutlined />} disabled={disabled} onClick={() => add({})}>Thêm điểm ranh giới</Button> : null}</>}</Form.List>
}
