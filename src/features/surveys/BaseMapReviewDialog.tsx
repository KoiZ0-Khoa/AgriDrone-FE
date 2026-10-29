import { Alert, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import { reviewMappingBatch, reviewMappingCandidate } from './baseMapApi'
import type { BaseMapDraft, ReviewDecision } from './baseMapTypes'
import { batchReviewBody, candidateReviewBody, decisionLabels, draftFingerprint, editableDraft, type ReviewValues } from './baseMapWorkflow'
import { mutationNeedsReload, SurveyMutationError } from './SurveyMutationError'

export type ReviewSelection = { snapshot: BaseMapDraft; candidateIds: string[]; batch: boolean }
export function BaseMapReviewDialog({ token, selection, current, disabled, close, done }: { token: string; selection: ReviewSelection; current: BaseMapDraft; disabled: boolean; close: () => void; done: (message: string) => Promise<void> }) {
  const [form] = Form.useForm<ReviewValues>()
  const decision = Form.useWatch('decision', form)
  const pending = useRef(false)
  const { snapshot, candidateIds, batch } = selection
  const candidate = snapshot.zones.flatMap(zone => zone.candidates).find(item => item.candidateId === candidateIds[0])!
  const stale = draftFingerprint(snapshot) !== draftFingerprint(current) || !editableDraft(current)
  const mutation = useMutation({ retry: false, mutationFn: async (values: ReviewValues) => {
    if (stale || disabled) throw new Error('Bản đồ vừa thay đổi. Đóng biểu mẫu và tải lại.')
    if (batch) {
      const body = batchReviewBody(snapshot, candidateIds, values.decision as 'CreateNew' | 'MatchExisting' | 'Reject', values.reason ?? '')
      const result = await reviewMappingBatch(token, snapshot.farmId, snapshot.draftId, body)
      if (result.totalReviewed !== candidateIds.length) throw new Error(`Máy chủ đã duyệt ${result.totalReviewed}/${candidateIds.length} điểm. Đóng và tải lại để kiểm tra kết quả.`)
    } else await reviewMappingCandidate(token, snapshot.farmId, snapshot.draftId, candidate.candidateId, candidateReviewBody(candidate, values))
  }, onSuccess: () => done(batch ? `Đã duyệt ${candidateIds.length} điểm.` : 'Đã lưu quyết định duyệt.'), onSettled: () => { pending.current = false } })
  const blocked = disabled || stale || mutationNeedsReload(mutation.error) || mutation.isError
  return <Modal open title={batch ? `Duyệt ${candidateIds.length} điểm đã chọn` : `Duyệt ${candidate.treeId ?? 'điểm nhận diện'}`} okText="Lưu quyết định" cancelText="Hủy" confirmLoading={mutation.isPending} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} cancelButtonProps={{ disabled: mutation.isPending }} okButtonProps={{ disabled: blocked }} onCancel={() => { if (!mutation.isPending) close() }} onOk={() => form.submit()}>
    {stale ? <Alert showIcon type="warning" title="Bản đồ đã thay đổi. Đóng biểu mẫu và tải lại trước khi duyệt." /> : null}
    <Form form={form} layout="vertical" disabled={blocked || mutation.isPending} initialValues={batch ? {} : { decision: candidate.reviewDecision in decisionLabels && candidate.reviewDecision !== 'Pending' ? candidate.reviewDecision : undefined,
      longitude: candidate.correctedLongitude, latitude: candidate.correctedLatitude, row: candidate.correctedRowIndex, column: candidate.correctedColumnIndex,
      plantId: candidate.correctedMatchedPlantId ?? candidate.proposedMatchedPlantId, reason: candidate.reviewReason }} onFinish={values => { if (blocked || pending.current) return; pending.current = true; mutation.mutate(values) }}>
      <Form.Item label="Quyết định" name="decision" rules={[{ required: true, message: 'Chọn quyết định duyệt.' }]}><Select placeholder="Chọn cách xử lý điểm" options={(batch ? ['CreateNew', 'MatchExisting', 'Reject'] : Object.keys(decisionLabels).filter(value => value !== 'Pending')).map(value => ({ value, label: decisionLabels[value as ReviewDecision] }))} /></Form.Item>
      {decision === 'CreateNew' ? <Alert className="workflow-notice" showIcon type="info" title="Các điểm này sẽ tạo cây có ID mới khi phát hành bản đồ." /> : null}
      {batch && decision === 'MatchExisting' ? <Alert className="workflow-notice" showIcon type="info" title="Mỗi điểm dùng mã cây tương ứng đã được BE đề xuất hoặc đã sửa. Điểm thiếu mã cây cần duyệt riêng." /> : null}
      {!batch && ['MatchExisting', 'Relocate', 'Replace'].includes(decision) ? <Form.Item name="plantId" label="Mã cây hiện có" rules={[{ required: true, message: 'Nhập mã cây cần ghép hoặc thay thế.' }]} extra="Dùng mã cây chính thức, không phải mã TreeId của điểm nhận diện."><Input placeholder="Mã cây (GUID)" /></Form.Item> : null}
      {!batch && decision !== 'Reject' ? <><div className="mapping-form-grid"><Form.Item name="longitude" label="Kinh độ hiệu chỉnh" rules={[{ required: decision === 'Relocate', message: 'Nhập kinh độ mới.' }]}><InputNumber min={-180} max={180} controls={false} /></Form.Item><Form.Item name="latitude" label="Vĩ độ hiệu chỉnh" rules={[{ required: decision === 'Relocate', message: 'Nhập vĩ độ mới.' }]}><InputNumber min={-90} max={90} controls={false} /></Form.Item><Form.Item name="row" label="Hàng hiệu chỉnh"><InputNumber min={1} precision={0} /></Form.Item><Form.Item name="column" label="Cột hiệu chỉnh"><InputNumber min={1} precision={0} /></Form.Item></div><p className="form-hint">Để trống các trường hiệu chỉnh để dùng giá trị gốc. Sửa vị trí bắt buộc có cả kinh độ và vĩ độ.</p></> : null}
      <Form.Item name="reason" label="Lý do / ghi chú"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
    </Form>
    <SurveyMutationError error={mutation.error} />
    {mutation.isError ? <p className="form-hint">Đóng biểu mẫu, tải lại bản đồ và kiểm tra kết quả trước khi thao tác tiếp.</p> : null}
  </Modal>
}
