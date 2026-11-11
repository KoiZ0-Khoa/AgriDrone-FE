import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, InputNumber, Space, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormSubmit } from '../../components/FormSubmit'
import { SurveyMutationError } from '../surveys/SurveyMutationError'
import type { GeoJsonPolygon } from '../farms/types'
import { surveyOrderIdFromMissionCode } from './missionWorkflow'
import { detectMissionDiseases, publishMissionPlantHealth, type DiseaseDetectOptions, type DiseaseDetectResult, type HealthHandoffResult } from './plantHealthProcessingApi'

export function PlantHealthProcessingPanel({ token, farmId, missionId, missionCode, surveyOrderId, boundary, disabled }: { token: string; farmId: string; missionId: string; missionCode: string; surveyOrderId?: string | null; boundary: GeoJsonPolygon | null; disabled: boolean }) {
  const client = useQueryClient()
  const [form] = Form.useForm<Omit<DiseaseDetectOptions, 'polygonGeoJson'>>()
  const [result, setResult] = useState<DiseaseDetectResult | null>(null)
  const [handoff, setHandoff] = useState<HealthHandoffResult | null>(null)
  const operationKey = useRef<string | null>(null), detecting = useRef(false), publishing = useRef(false)
  const orderId = surveyOrderId ?? surveyOrderIdFromMissionCode(missionCode)
  const publish = useMutation({ retry: false, mutationFn: async () => {
    if (!result || !operationKey.current) throw new Error('Chạy nhận diện trước khi gửi kết quả sơ bộ.')
    return publishMissionPlantHealth(token, farmId, missionId, operationKey.current)
  }, onSuccess: async data => {
    setHandoff(data)
    await Promise.all([
      client.invalidateQueries({ queryKey: ['manager-orders'] }),
      client.invalidateQueries({ queryKey: ['manager-order-context'] }),
      client.invalidateQueries({ queryKey: ['manager-order-scope'] }),
      client.invalidateQueries({ queryKey: ['farm-plant-health-map', farmId] }),
    ])
  }, onSettled: () => { publishing.current = false } })
  const detect = useMutation({ retry: false, mutationFn: (values: Omit<DiseaseDetectOptions, 'polygonGeoJson'>) => detectMissionDiseases(token, farmId, missionId, { ...values, ...(boundary ? { polygonGeoJson: boundary } : {}) }),
    onMutate: () => { setResult(null); setHandoff(null); operationKey.current = null; publish.reset() },
    onSuccess: data => { setResult(data); operationKey.current = crypto.randomUUID() },
    onSettled: () => { detecting.current = false },
  })
  const busy = disabled || detect.isPending || publish.isPending
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Nhận diện bệnh và gửi kết quả sơ bộ</strong><span>Phân tích ảnh của chuyến bay dịch vụ trước khi chuyển sang bước kiểm duyệt.</span></div></div>
    <Alert showIcon type="info" title="Kết quả AI là nhận định nghi ngờ ban đầu" description="Cần kiểm duyệt trước khi phát hành kết quả chính thức. Nhận diện bệnh dùng ảnh chuyến bay dịch vụ, không ghép lại bản đồ nền." />
    {disabled ? <Alert className="workflow-notice" showIcon type="warning" title="Đang chờ dữ liệu phạm vi khảo sát" description="Tải đủ thông tin nông trại trước khi chạy nhận diện. Nếu tải lỗi, hãy tải lại trang." /> : null}
    {handoff ? <Alert className="workflow-notice" showIcon type="success" title="Đã gửi kết quả sơ bộ, chờ kiểm duyệt" description={orderId ? <Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(orderId)}`}>Mở đơn khảo sát →</Link> : 'Kết quả được xử lý không đồng bộ; kiểm tra lại đơn khảo sát sau ít phút.'} /> : <>
      <Form form={form} layout="vertical" initialValues={{ confidenceThreshold: 0.25, matchingToleranceMeters: 2.5, zoneRadiusMeters: 5, minDiseasedTrees: 3 }} disabled={busy} onFinish={values => { if (busy || detecting.current) return; detecting.current = true; detect.mutate(values) }}>
        <FormSubmit disabled={busy} />
        <div className="mapping-form-grid">
          <Form.Item name="confidenceThreshold" label="Ngưỡng nhận diện" rules={[{ required: true }, { type: 'number', min: 0, max: 1 }]}><InputNumber min={0} max={1} step={0.05} /></Form.Item>
          <Form.Item name="matchingToleranceMeters" label="Khoảng cách ghép trụ (m)" rules={[{ required: true }, { type: 'number', min: 0.1 }]}><InputNumber min={0.1} step={0.1} /></Form.Item>
          <Form.Item name="zoneRadiusMeters" label="Bán kính nhóm điểm bệnh (m)" rules={[{ required: true }, { type: 'number', min: 0.1 }]}><InputNumber min={0.1} step={0.5} /></Form.Item>
          <Form.Item name="minDiseasedTrees" label="Số cây tối thiểu trong nhóm" rules={[{ required: true }, { type: 'number', min: 1 }]}><InputNumber min={1} precision={0} /></Form.Item>
        </div>
        <Button type="primary" htmlType="submit" loading={detect.isPending} disabled={busy}>{result ? 'Nhận diện lại' : 'Chạy nhận diện bệnh'}</Button>
      </Form>
      <SurveyMutationError error={detect.error} />
      {result ? <>
        <Space wrap className="workflow-toolbar"><Tag>Đã quét: {result.totalImagesScanned} ảnh</Tag><Tag color="orange">Phát hiện nghi ngờ: {result.totalDetections}</Tag>{Object.entries(result.diseaseSummary).map(([label, count]) => <Tag key={label}>{label}: {count}</Tag>)}</Space>
        <Table<DiseaseDetectResult['detections'][number]> rowKey={item => `${item.imageName}:${item.id}`} dataSource={result.detections} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 600 }} locale={{ emptyText: 'Không có phát hiện nghi ngờ trong kết quả nhận diện.' }} columns={[
          { title: 'Nhãn nghi ngờ', dataIndex: 'className' },
          { title: 'Độ tin cậy', render: (_, item) => `${(item.confidence * 100).toFixed(1)}%` },
          { title: 'Tọa độ', render: (_, item) => `${item.lat.toFixed(7)}, ${item.lon.toFixed(7)}` },
          { title: 'Ảnh nguồn', dataIndex: 'imageName' },
        ]} />
        <Button type="primary" disabled={busy || !!publish.error} loading={publish.isPending} onClick={() => { if (busy || publishing.current || handoff) return; publishing.current = true; publish.mutate() }}>Gửi kết quả sơ bộ sang đơn khảo sát</Button>
      </> : null}
      <SurveyMutationError error={publish.error} />
    </>}
  </section>
}
