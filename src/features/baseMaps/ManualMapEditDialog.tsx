import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { FormSubmit } from '../../components/FormSubmit'
import { readableCode } from '../../components/RecordReference'
import { getBaseMapDraft, reviewMappingCandidate } from '../surveys/baseMapApi'
import { mutationNeedsReload, SurveyMutationError } from '../surveys/SurveyMutationError'
import { MapReadError } from './MapReadError'
import type { MapVersionDetail } from './types'
import { candidateForMapPlant, manualReviewBody, mapEditPointError, mapState, type VisualMapEdit } from './workflow'

type Values = { decision: string; candidateId?: string; longitude?: number | null; latitude?: number | null; row?: number | null; col?: number | null; reason: string }
export function ManualMapEditDialog({ token, scopeKey, map, initial, close }: { token: string; scopeKey: string; map: MapVersionDetail; initial?: VisualMapEdit; close: (saved?: boolean) => void }) {
  const { message } = App.useApp(), client = useQueryClient()
  const [form] = Form.useForm<Values>()
  const [validationError, setValidationError] = useState('')
  const decision = Form.useWatch('decision', form)
  const pending = useRef(false), newId = useRef(crypto.randomUUID()), initialized = useRef(false)
  const draft = useQuery({ queryKey: ['manual-map-candidates', scopeKey, map.farmId, map.versionId], queryFn: ({ signal }) => getBaseMapDraft(token, map.farmId, map.versionId, signal), retry: false, staleTime: 0 })
  const visualCandidate = initial?.plant && draft.data ? candidateForMapPlant(initial.plant, draft.data.candidates) : undefined
  const currentPlant = initial?.plant ? map.plants.find(item => item.plantId === initial.plant!.plantId) : undefined
  const targetChanged = initial?.plant && (!currentPlant || currentPlant.lat !== initial.plant.lat || currentPlant.lon !== initial.plant.lon || currentPlant.row !== initial.plant.row || currentPlant.col !== initial.plant.col)
  const selectionError = targetChanged ? 'Trụ đã thay đổi. Đóng và tải lại bản đồ trước khi chọn lại.' : initial?.plant && draft.data && !draft.isFetching && !visualCandidate ? 'Chưa xác định được điểm nhận diện tương ứng với trụ đã chọn. Đóng và dùng form Điều chỉnh trụ để đối chiếu; không lưu bằng một điểm khác.' : ''
  useEffect(() => {
    if (!initial || !draft.data || draft.isFetching || initialized.current) return
    form.setFieldsValue({ decision: initial.decision, candidateId: visualCandidate?.candidateId,
      latitude: initial.position?.lat ?? initial.plant?.lat, longitude: initial.position?.lon ?? initial.plant?.lon,
      row: initial.plant?.row, col: initial.plant?.col })
    initialized.current = true
  }, [initial, draft.data, draft.isFetching, visualCandidate, form])
  function reviewBody(values: Values) {
    const candidate = draft.data?.candidates.find(item => item.candidateId === values.candidateId)
    if (initial) {
      if (selectionError || values.decision !== initial.decision || (initial.plant && candidate?.candidateId !== visualCandidate?.candidateId)) throw new Error(selectionError || 'Điểm trụ không khớp thao tác đã chọn trên ảnh.')
      if (values.decision !== 'Reject') {
        const error = mapEditPointError(map, { lat: values.latitude ?? NaN, lon: values.longitude ?? NaN })
        if (error) throw new Error(error)
      }
    }
    return manualReviewBody(values, candidate, map.boundaryGeoJson)
  }
  const mutation = useMutation({ retry: false, mutationFn: async (values: Values) => {
    if (!['PUBLISHED', 'DRAFT'].includes(mapState(map.status)) || !draft.data || draft.isFetching || draft.isError || !['PUBLISHED', 'DRAFT'].includes(mapState(draft.data.status))) throw new Error('Bản đồ không còn cho phép điều chỉnh. Đóng và tải lại.')
    const candidate = draft.data.candidates.find(item => item.candidateId === values.candidateId)
    const body = reviewBody(values)
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
    close(true)
  }, onSettled: () => { pending.current = false } })
  const blocked = draft.isPending || draft.isFetching || draft.isError || !!selectionError || mutation.isError || mutationNeedsReload(mutation.error)
  function chooseCandidate(id: string) {
    const candidate = draft.data?.candidates.find(item => item.candidateId === id)
    if (candidate) form.setFieldsValue({ longitude: candidate.correctedLongitude ?? candidate.longitude, latitude: candidate.correctedLatitude ?? candidate.latitude, row: candidate.correctedRowIndex ?? candidate.proposedRowIndex, col: candidate.correctedColumnIndex ?? candidate.proposedColumnIndex })
  }
  return <Modal open title={initial ? 'Xác nhận điều chỉnh trên ảnh' : 'Điều chỉnh trụ ngoài thực địa'} okText={decision === 'Reject' ? 'Xác nhận loại bỏ trụ' : 'Lưu điều chỉnh'} cancelText="Hủy" confirmLoading={mutation.isPending} okButtonProps={{ disabled: blocked, danger: decision === 'Reject' }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} onOk={() => form.submit()} onCancel={() => { if (!mutation.isPending) close() }}>
    <p>{mapState(map.status) === 'PUBLISHED' ? 'Điều chỉnh bản đồ đang sử dụng. Thay đổi cây được ghi nhận vào lịch sử thực địa.' : 'Điều chỉnh điểm trong bản nháp. Cây chính thức được cập nhật khi phát hành bản đồ.'}</p>
    {initial?.plant ? <p><strong>{readableCode(initial.plant.plantCode) ?? 'Trụ đã chọn'}</strong> · Hàng {initial.plant.row}, cột {initial.plant.col}{initial.decision === 'Relocate' ? <span className="base-map-picked-coordinate">Vị trí trước: {initial.plant.lat.toFixed(7)}, {initial.plant.lon.toFixed(7)}</span> : null}</p> : null}
    {initial ? <p><strong>{({ CreateNew: 'Thêm trụ mới', Relocate: 'Dời vị trí / sửa hàng cột', Reject: 'Loại bỏ trụ' })[initial.decision]}</strong>{initial.position ? <span className="base-map-picked-coordinate">Vị trí đã chọn: {initial.position.lat.toFixed(7)}, {initial.position.lon.toFixed(7)}</span> : null}</p> : null}
    {draft.isError ? <MapReadError error={draft.error} retry={() => draft.refetch()} /> : null}
    {selectionError ? <Alert showIcon type="error" title={selectionError} /> : null}
    <Form form={form} layout="vertical" initialValues={{ decision: 'Relocate', reason: '' }} disabled={blocked || mutation.isPending} onValuesChange={() => setValidationError('')} onFinish={values => {
      if (blocked || pending.current) return
      try { reviewBody(values) }
      catch (error) { setValidationError(error instanceof Error ? error.message : 'Kiểm tra lại thông tin điều chỉnh.'); return }
      pending.current = true; mutation.mutate(values)
    }}>
      <FormSubmit disabled={blocked || mutation.isPending} />
      <Form.Item hidden={!!initial} name="decision" label="Thao tác" rules={[{ required: true }]}><Select disabled={!!initial || blocked || mutation.isPending} onChange={() => form.setFieldsValue({ candidateId: undefined, longitude: null, latitude: null, row: null, col: null })} options={[{ value: 'CreateNew', label: 'Thêm trụ mới' }, { value: 'Relocate', label: 'Dời vị trí / sửa hàng cột' }, { value: 'Reject', label: 'Loại bỏ trụ' }]} /></Form.Item>
      {decision !== 'CreateNew' ? <Form.Item hidden={!!initial} name="candidateId" label="Điểm trụ cần điều chỉnh" rules={[{ required: true, message: 'Chọn điểm trụ.' }]}><Select disabled={!!initial || blocked || mutation.isPending} showSearch optionFilterProp="label" placeholder="Chọn theo mã hoặc hàng, cột" onChange={chooseCandidate} options={draft.data?.candidates.map((item, index) => ({ value: item.candidateId, label: `${readableCode(item.treeId) ?? `Điểm ${index + 1}`} · Hàng ${item.correctedRowIndex ?? item.proposedRowIndex ?? '—'}, cột ${item.correctedColumnIndex ?? item.proposedColumnIndex ?? '—'}` })) ?? []} /></Form.Item> : null}
      {decision === 'Reject' ? <Alert showIcon type="warning" title="Ghi nhận trụ đã bị loại bỏ ngoài thực địa" description="Lịch sử trụ được giữ lại để tra cứu." /> : <div className="mapping-form-grid">
        <Form.Item hidden={!!initial} name="longitude" label="Kinh độ" rules={[{ required: true }]}><InputNumber min={-180} max={180} controls={false} /></Form.Item>
        <Form.Item hidden={!!initial} name="latitude" label="Vĩ độ" rules={[{ required: true }]}><InputNumber min={-90} max={90} controls={false} /></Form.Item>
        <Form.Item name="row" label="Hàng" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item>
        <Form.Item name="col" label="Cột" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item>
      </div>}
      <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{ required: true, whitespace: true, message: 'Nhập lý do điều chỉnh.' }, { max: 2000 }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
    </Form>
    {validationError ? <Alert showIcon type="error" title={validationError} /> : null}
    <SurveyMutationError error={mutation.error} />
  </Modal>
}
