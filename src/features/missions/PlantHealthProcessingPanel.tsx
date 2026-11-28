import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Form, InputNumber, Space, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormSubmit } from '../../components/FormSubmit'
import { SurveyMutationError } from '../surveys/SurveyMutationError'
import type { GeoJsonPolygon } from '../farms/types'
import { surveyOrderIdFromMissionCode } from './missionWorkflow'
import { detectMissionDiseases, getMissionDiseaseJob, isDiseaseJobActive, publishMissionPlantHealth, publishMissionComboAnalysis, type DiseaseDetectOptions, type DiseaseDetectResult, type HealthHandoffResult, type MissionDiseaseJob } from './plantHealthProcessingApi'

export function PlantHealthProcessingPanel({ token, farmId, missionId, missionCode, surveyOrderId, boundary, disabled, onComboHandoff }: { token: string; farmId: string; missionId: string; missionCode?: string; surveyOrderId?: string | null; boundary?: GeoJsonPolygon | null; disabled: boolean; onComboHandoff?: () => Promise<void> }) {
  const client = useQueryClient()
  const [form] = Form.useForm<Omit<DiseaseDetectOptions, 'polygonGeoJson'>>()
  const [handoff, setHandoff] = useState<HealthHandoffResult | null>(null)
  const operation = useRef<{ jobId: string; key: string } | null>(null)
  const detecting = useRef(false), publishing = useRef(false)
  const combo = Boolean(onComboHandoff)
  const orderId = surveyOrderId ?? (missionCode && surveyOrderIdFromMissionCode(missionCode))
  const jobKey = ['mission-disease-job', farmId, missionId] as const
  const jobQuery = useQuery({
    queryKey: jobKey,
    queryFn: ({ signal }) => {
      const current = client.getQueryData<MissionDiseaseJob | null>(jobKey)
      return getMissionDiseaseJob(token, farmId, missionId, isDiseaseJobActive(current) ? current?.jobId : undefined, signal)
    },
    refetchInterval: query => query.state.status !== 'error' && isDiseaseJobActive(query.state.data) ? 5000 : false,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const job = jobQuery.data
  const result = job?.status === 'COMPLETED' ? job.result : null
  const comboJobReady = Boolean(result?.jobId && Number.isInteger(result.sourceRevision) && result.sourceRevision! > 0)
  const publish = useMutation({ retry: false, mutationFn: async () => {
    if (!result || !job) throw new Error('Chạy nhận diện trước khi gửi kết quả sơ bộ.')
    if (operation.current?.jobId !== job.jobId) {
      operation.current = { jobId: job.jobId, key: crypto.randomUUID() }
    }
    const key = operation.current.key
    if (combo) {
      if (!result.jobId || !result.sourceRevision || !comboJobReady) throw new Error('Máy chủ chưa trả mã job và phiên bản kết quả COMBO.')
      return publishMissionComboAnalysis(token, farmId, missionId, key, { jobId: result.jobId, sourceRevision: result.sourceRevision })
    }
    return publishMissionPlantHealth(token, farmId, missionId, key)
  }, onSuccess: async data => {
    setHandoff(data)
    await Promise.all([
      client.invalidateQueries({ queryKey: ['manager-orders'] }),
      client.invalidateQueries({ queryKey: ['manager-order-context'] }),
      client.invalidateQueries({ queryKey: ['manager-order-scope'] }),
      client.invalidateQueries({ queryKey: ['farm-plant-health-map', farmId] }),
      onComboHandoff?.(),
    ])
  }, onSettled: () => { publishing.current = false } })
  const detect = useMutation({ retry: false, mutationFn: (values: Omit<DiseaseDetectOptions, 'polygonGeoJson'>) => detectMissionDiseases(token, farmId, missionId, combo ? {} : { ...values, ...(boundary ? { polygonGeoJson: boundary } : {}) }),
    onMutate: () => { publish.reset() },
    onSuccess: async data => {
      await client.cancelQueries({ queryKey: jobKey, exact: true })
      client.setQueryData(jobKey, data)
    },
    onSettled: () => { detecting.current = false },
  })
  const busy = disabled || detect.isPending || publish.isPending || isDiseaseJobActive(job) || !jobQuery.isSuccess || jobQuery.isFetching
  return <section className="resource-panel workflow-section">
    <div className="resource-panel-heading"><div><strong>Nhận diện bệnh và gửi kết quả sơ bộ</strong><span>Phân tích ảnh của chuyến bay dịch vụ trước khi chuyển sang bước kiểm duyệt.</span></div></div>
    <Alert showIcon type="info" title="Kết quả AI là nhận định nghi ngờ ban đầu" description={combo ? 'Ảnh của lần bay và thông số theo cấu hình COMBO được dùng để nhận diện. Manager duyệt kết quả trước khi phát hành.' : 'Cần kiểm duyệt trước khi phát hành kết quả chính thức. Nhận diện bệnh dùng ảnh chuyến bay dịch vụ.'} />
    {disabled ? <Alert className="workflow-notice" showIcon type="warning" title="Đang chờ dữ liệu phạm vi khảo sát" description="Tải đủ thông tin nông trại trước khi chạy nhận diện. Nếu tải lỗi, hãy tải lại trang." /> : null}
    {jobQuery.isError ? <>
      <SurveyMutationError error={jobQuery.error} />
      <Button loading={jobQuery.isFetching} onClick={() => { void jobQuery.refetch() }}>Kiểm tra lại tiến độ</Button>
    </> : null}
    {!jobQuery.isError && isDiseaseJobActive(job) ? <Alert className="workflow-notice" showIcon type="info"
      title={job?.status === 'QUEUED' ? 'Đang chờ nhận diện bệnh' : 'Đang nhận diện bệnh'}
      description="Kết quả sẽ xuất hiện tại đây khi xử lý xong. Bạn có thể tải lại trang để tiếp tục theo dõi." /> : null}
    {job?.status === 'FAILED' ? <Alert className="workflow-notice" showIcon type="error" title="Nhận diện bệnh thất bại"
      description={job.error ?? 'Hãy thử chạy nhận diện lại.'} /> : null}
    {handoff ? <Alert className="workflow-notice" showIcon type="success" title="Đã gửi kết quả sơ bộ, chờ kiểm duyệt" description={onComboHandoff ? <><p>Kết quả đang được nhập. Mã tra cứu <code>{handoff.handoffId ?? handoff.messageId}</code></p><Button onClick={() => { void onComboHandoff() }}>Kiểm tra kết quả phân tích</Button></> : orderId ? <Link className="workflow-detail-link" to={`/manager/orders/${encodeURIComponent(orderId)}`}>Mở đơn khảo sát →</Link> : 'Kết quả được xử lý không đồng bộ; kiểm tra lại đơn khảo sát sau ít phút.'} /> : <>
      <Form form={form} layout="vertical" initialValues={{ confidenceThreshold: 0.25, matchingToleranceMeters: 2.5, zoneRadiusMeters: 5, minDiseasedTrees: 3 }} disabled={busy} onFinish={values => { if (busy || detecting.current) return; detecting.current = true; detect.mutate(values) }}>
        <FormSubmit disabled={busy} />
        {!combo ? <div className="mapping-form-grid">
          <Form.Item name="confidenceThreshold" label="Ngưỡng nhận diện" rules={[{ required: true }, { type: 'number', min: 0, max: 1 }]}><InputNumber min={0} max={1} step={0.05} /></Form.Item>
          <Form.Item name="matchingToleranceMeters" label="Khoảng cách ghép trụ (m)" rules={[{ required: true }, { type: 'number', min: 0.1 }]}><InputNumber min={0.1} step={0.1} /></Form.Item>
          <Form.Item name="zoneRadiusMeters" label="Bán kính nhóm điểm bệnh (m)" rules={[{ required: true }, { type: 'number', min: 0.1 }]}><InputNumber min={0.1} step={0.5} /></Form.Item>
          <Form.Item name="minDiseasedTrees" label="Số cây tối thiểu trong nhóm" rules={[{ required: true }, { type: 'number', min: 1 }]}><InputNumber min={1} precision={0} /></Form.Item>
        </div> : null}
        <Button type="primary" htmlType="submit" loading={detect.isPending} disabled={busy}>{result || job?.status === 'FAILED' ? 'Nhận diện lại' : 'Chạy nhận diện bệnh'}</Button>
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
        {combo && !comboJobReady ? <Alert className="workflow-notice" type="error" showIcon title="Máy chủ chưa trả mã job và phiên bản kết quả COMBO." /> : null}
        <Button type="primary" disabled={busy || (combo && !comboJobReady) || (!combo && !!publish.error)} loading={publish.isPending} onClick={() => { if (busy || publishing.current || handoff) return; publishing.current = true; publish.mutate() }}>Gửi kết quả sơ bộ sang đơn khảo sát</Button>
      </> : null}
      <SurveyMutationError error={publish.error} />
    </>}
  </section>
}
