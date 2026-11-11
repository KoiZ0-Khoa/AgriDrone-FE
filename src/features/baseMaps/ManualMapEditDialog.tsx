import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useRef, useState } from 'react'
import { FormSubmit } from '../../components/FormSubmit'
import { readableCode } from '../../components/RecordReference'
import { getBaseMapDraft, reviewMappingCandidate } from '../surveys/baseMapApi'
import { mutationNeedsReload, SurveyMutationError } from '../surveys/SurveyMutationError'
import { MapReadError } from './MapReadError'
import type { MapVersionDetail } from './types'
import { manualReviewBody, mapState } from './workflow'

type Values = { decision: string; candidateId?: string; longitude?: number | null; latitude?: number | null; row?: number | null; col?: number | null; reason: string }
export function ManualMapEditDialog({ token, scopeKey, map, close }: { token: string; scopeKey: string; map: MapVersionDetail; close: () => void }) {
  const { message } = App.useApp(), client = useQueryClient()
  const [form] = Form.useForm<Values>()
  const [validationError, setValidationError] = useState('')
  const decision = Form.useWatch('decision', form)
  const pending = useRef(false), newId = useRef(crypto.randomUUID())
  const draft = useQuery({ queryKey: ['manual-map-candidates', scopeKey, map.farmId, map.versionId], queryFn: ({ signal }) => getBaseMapDraft(token, map.farmId, map.versionId, signal), retry: false, staleTime: 0 })
  const mutation = useMutation({ retry: false, mutationFn: async (values: Values) => {
    if (!['PUBLISHED', 'DRAFT'].includes(mapState(map.status)) || !draft.data || draft.isFetching || draft.isError || !['PUBLISHED', 'DRAFT'].includes(mapState(draft.data.status))) throw new Error('Bản đồ không còn cho phép điều chỉnh. Đóng và tải lại.')
    const candidate = draft.data.candidates.find(item => item.candidateId === values.candidateId)
    const body = manualReviewBody(values, candidate, map.boundaryGeoJson)
    const candidateId = values.decision === 'CreateNew' ? newId.current : candidate!.candidateId
    const result = await reviewMappingCandidate(token, map.farmId, map.versionId, candidateId, body)
    if (result.candidateId.toLowerCase() !== candidateId.toLowerCase()) throw new Error('Phản hồi không khớp điểm trụ. Đóng và tải lại để kiểm tra.')
  }, onSuccess: async () => {
    const keys = ['farm-map-version', 'farm-map-versions', 'farm-map-comparison', 'farm-map-analytics', 'plant-lifecycle', 'manual-map-candidates']
    await Promise.all([
      ...keys.map(key => client.invalidateQueries({ queryKey: [key, scopeKey, map.farmId] })),
      client.invalidateQueries({ queryKey: ['manager-base-map-draft', map.farmId] }),
      client.invalidateQueries({ queryKey: ['manager-farm-context', map.farmId] }),
      client.invalidateQueries({ queryKey: ['farm-plant-health-map', map.farmId] }),
    ])
    void message.success('Đã lưu điều chỉnh trụ. Dữ liệu bản đồ đang được tải lại.')
    close()
  }, onSettled: () => { pending.current = false } })
  const blocked = draft.isPending || draft.isFetching || draft.isError || mutation.isError || mutationNeedsReload(mutation.error)
  function chooseCandidate(id: string) {
    const candidate = draft.data?.candidates.find(item => item.candidateId === id)
    if (candidate) form.setFieldsValue({ longitude: candidate.correctedLongitude ?? candidate.longitude, latitude: candidate.correctedLatitude ?? candidate.latitude, row: candidate.correctedRowIndex ?? candidate.proposedRowIndex, col: candidate.correctedColumnIndex ?? candidate.proposedColumnIndex })
  }
  return <Modal open title="Điều chỉnh trụ ngoài thực địa" okText={decision === 'Reject' ? 'Xác nhận loại bỏ trụ' : 'Lưu điều chỉnh'} cancelText="Đóng" confirmLoading={mutation.isPending} okButtonProps={{ disabled: blocked, danger: decision === 'Reject' }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }}>
    <p>{mapState(map.status) === 'PUBLISHED' ? 'Điều chỉnh bản đồ đang sử dụng. Thay đổi cây được ghi nhận vào lịch sử thực địa.' : 'Điều chỉnh điểm trong bản nháp. Cây chính thức được cập nhật khi phát hành bản đồ.'}</p>
    {draft.isError ? <MapReadError error={draft.error} retry={() => draft.refetch()} /> : null}
    <Form form={form} layout="vertical" initialValues={{ decision: 'Relocate', reason: '' }} disabled={blocked || mutation.isPending} onValuesChange={() => setValidationError('')} onFinish={values => {
      if (blocked || pending.current) return
      try { manualReviewBody(values, draft.data?.candidates.find(item => item.candidateId === values.candidateId), map.boundaryGeoJson) }
      catch (error) { setValidationError(error instanceof Error ? error.message : 'Kiểm tra lại thông tin điều chỉnh.'); return }
      pending.current = true; mutation.mutate(values)
    }}>
      <FormSubmit disabled={blocked || mutation.isPending} />
      <Form.Item name="decision" label="Thao tác" rules={[{ required: true }]}><Select onChange={() => form.setFieldsValue({ candidateId: undefined, longitude: null, latitude: null, row: null, col: null })} options={[{ value: 'CreateNew', label: 'Thêm trụ mới' }, { value: 'Relocate', label: 'Dời vị trí / sửa hàng cột' }, { value: 'Reject', label: 'Loại bỏ trụ' }]} /></Form.Item>
      {decision !== 'CreateNew' ? <Form.Item name="candidateId" label="Điểm trụ cần điều chỉnh" rules={[{ required: true, message: 'Chọn điểm trụ.' }]}><Select showSearch optionFilterProp="label" placeholder="Chọn theo mã hoặc hàng, cột" onChange={chooseCandidate} options={draft.data?.candidates.map((item, index) => ({ value: item.candidateId, label: `${readableCode(item.treeId) ?? `Điểm ${index + 1}`} · Hàng ${item.correctedRowIndex ?? item.proposedRowIndex ?? '—'}, cột ${item.correctedColumnIndex ?? item.proposedColumnIndex ?? '—'}` })) ?? []} /></Form.Item> : null}
      {decision === 'Reject' ? <Alert showIcon type="warning" title="Ghi nhận trụ đã bị loại bỏ ngoài thực địa" description="Lịch sử trụ được giữ lại để tra cứu." /> : <div className="mapping-form-grid">
        <Form.Item name="longitude" label="Kinh độ" rules={[{ required: true }]}><InputNumber min={-180} max={180} controls={false} /></Form.Item>
        <Form.Item name="latitude" label="Vĩ độ" rules={[{ required: true }]}><InputNumber min={-90} max={90} controls={false} /></Form.Item>
        <Form.Item name="row" label="Hàng" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item>
        <Form.Item name="col" label="Cột" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item>
      </div>}
      <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{ required: true, whitespace: true, message: 'Nhập lý do điều chỉnh.' }, { max: 2000 }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
    </Form>
    {validationError ? <Alert showIcon type="error" title={validationError} /> : null}
    <SurveyMutationError error={mutation.error} />
  </Modal>
}
