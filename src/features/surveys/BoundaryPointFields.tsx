import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, InputNumber } from 'antd'

export type BoundaryPoint = { longitude: number; latitude: number }
export function boundaryPoints(coordinates: number[][] = []): BoundaryPoint[] {
  const last = coordinates.at(-1), first = coordinates[0]
  const ring = first && last && first[0] === last[0] && first[1] === last[1] ? coordinates.slice(0, -1) : coordinates
  return ring.map(([longitude, latitude]) => ({ longitude, latitude }))
}
export function BoundaryPointFields({ fixed = false, disabled = false }: { fixed?: boolean; disabled?: boolean }) {
  return <Form.List name="points">{(fields, { add, remove }) => <>{fields.map((field, index) => <fieldset className="workflow-checklist" key={field.key}>
    <legend>{fixed ? 'Góc' : 'Điểm'} {index + 1}</legend><div className="form-two-columns">
      <Form.Item name={[field.name, 'longitude']} label="Kinh độ" rules={[{ required: true }]}><InputNumber min={-180} max={180} /></Form.Item>
      <Form.Item name={[field.name, 'latitude']} label="Vĩ độ" rules={[{ required: true }]}><InputNumber min={-90} max={90} /></Form.Item>
    </div>{!fixed ? <Button icon={<MinusCircleOutlined />} disabled={disabled || fields.length <= 3} onClick={() => remove(field.name)}>Bỏ điểm {index + 1}</Button> : null}
  </fieldset>)}{!fixed ? <Button icon={<PlusOutlined />} disabled={disabled} onClick={() => add({})}>Thêm điểm ranh giới</Button> : null}</>}</Form.List>
}
