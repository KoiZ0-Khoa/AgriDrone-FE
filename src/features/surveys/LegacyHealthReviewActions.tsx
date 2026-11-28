import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Modal, Select } from 'antd'
import { useState } from 'react'
import { findMissionById } from '../missions/missionApi'
import { plantsByDistance } from './healthReviewWorkflow'
import type { FarmHealthPlant } from './plantHealthMapTypes'
import { plantHealthReviewError, type FlaggedMarker } from './plantHealthMapWorkflow'
import { resolveFlaggedObservation, reviewPlantObservation } from './plantHealthReviewApi'
import type { ObservationReviewDecision, ResolveFlagAction } from './plantHealthReviewTypes'

type Context = { token: string; farmId: string; onSaved: () => Promise<void> }
const modalLock = (pending: boolean) => ({ closable: !pending, keyboard: !pending, mask: { closable: !pending }, cancelButtonProps: { disabled: pending } })

export function LegacyObservationReview({ token, farmId, observationId, decision, onSaved, onClose }: Context & {
  observationId: string; decision: ObservationReviewDecision; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const mutation = useMutation({ mutationFn: () => reviewPlantObservation(token, farmId, observationId, { decision, reason }),
    onSuccess: async () => { await onSaved(); onClose() } })
  return <Modal open title={decision === 'CONFIRMED' ? 'Xác nhận phát hiện' : 'Bác bỏ phát hiện'} okText="Lưu quyết định" cancelText="Hủy"
    {...modalLock(mutation.isPending)} confirmLoading={mutation.isPending} okButtonProps={{ disabled: !reason.trim() || mutation.isPending }} onCancel={onClose}
    onOk={() => { if (reason.trim() && !mutation.isPending) mutation.mutate() }}>
    <Form layout="vertical"><Form.Item label="Lý do" required><Input.TextArea aria-label="Lý do duyệt phát hiện" value={reason} maxLength={500} rows={3}
      disabled={mutation.isPending} onChange={event => setReason(event.target.value)} /></Form.Item></Form>
    {mutation.error ? <Alert type="error" showIcon title={plantHealthReviewError(mutation.error)} /> : null}
  </Modal>
}

export function LegacyFlagReview({ token, farmId, marker, plants, onSaved, onClose }: Context & {
  marker: FlaggedMarker; plants: FarmHealthPlant[]; onClose: () => void
}) {
  const mission = useQuery({ queryKey: ['legacy-flag-mission', farmId, marker.missionId],
    queryFn: ({ signal }) => findMissionById(token, farmId, marker.missionId, signal), retry: false })
  const legacyHealthMission = !mission.isError && /^ORD-[0-9a-f]{32}-HEALTH$/i.test(mission.data?.missionCode ?? '')
  const activePlants = plantsByDistance(plants.filter(plant => plant.lifecycleStatus === 'ACTIVE'), marker.lat, marker.lon)
  const [action, setAction] = useState<ResolveFlagAction>('SNAP')
  const [plantId, setPlantId] = useState(marker.suggested?.id)
  const [newPlantCode, setNewPlantCode] = useState('')
  const [reason, setReason] = useState('')
  const canSave = legacyHealthMission && !!reason.trim() && (action === 'SNAP' ? activePlants.some(({ plant }) => plant.id === plantId)
    : action !== 'CREATE_NEW_PLANT' || (marker.lat !== null && marker.lon !== null))
  const mutation = useMutation({ mutationFn: () => resolveFlaggedObservation(token, farmId, marker.id,
    action === 'SNAP' ? { action, targetPlantId: plantId!, reason } : action === 'CREATE_NEW_PLANT' ? { action, newPlantCode, reason } : { action, reason }),
    onSuccess: async () => { await onSaved(); onClose() } })
  return <Modal open title="Xử lý vết lệch tọa độ" okText="Lưu quyết định" cancelText="Hủy" {...modalLock(mutation.isPending)}
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: !canSave || mutation.isPending }} onCancel={onClose}
    onOk={() => { if (canSave && !mutation.isPending) mutation.mutate() }}>
    {mission.isPending ? <p role="status">Đang kiểm tra chuyến bay nguồn…</p> : null}
    {mission.isError ? <Alert type="error" showIcon title="Không tải được chuyến bay nguồn" action={<Button size="small" onClick={() => mission.refetch()}>Thử lại</Button>} /> : null}
    {!mission.isPending && !mission.isError && !legacyHealthMission ? <Alert type="info" showIcon title="Mở trang duyệt kết quả của đơn khảo sát để xử lý điểm này." /> : null}
    {legacyHealthMission ? <Form layout="vertical" disabled={mutation.isPending}>
      <Form.Item label="Cách xử lý"><Select aria-label="Cách xử lý vết lệch" value={action} onChange={setAction} options={[
        { value: 'SNAP', label: 'Gắn vào trụ có sẵn' }, { value: 'CREATE_NEW_PLANT', label: 'Tạo trụ mới tại điểm GPS' }, { value: 'DISMISS', label: 'Bỏ qua phát hiện' },
      ]} /></Form.Item>
      {action === 'SNAP' ? <Form.Item label="Trụ muốn gắn" required>
        <Select aria-label="Trụ muốn gắn" showSearch={{ optionFilterProp: 'label' }} value={plantId} onChange={setPlantId}
          options={activePlants.map(({ plant, distance }) => ({ value: plant.id, label: `${plant.plantCode} · Hàng ${plant.row}, cột ${plant.col}${distance == null ? '' : ` · ${distance.toFixed(1)} m`}` }))} />
      </Form.Item> : null}
      {action === 'CREATE_NEW_PLANT' ? <Form.Item label="Mã trụ mới (tùy chọn)">
        <Input aria-label="Mã trụ mới" value={newPlantCode} onChange={event => setNewPlantCode(event.target.value)} />
      </Form.Item> : null}
      <Form.Item label="Lý do" required><Input.TextArea aria-label="Lý do xử lý vết lệch" rows={3} maxLength={500} value={reason}
        onChange={event => setReason(event.target.value)} /></Form.Item>
    </Form> : null}
    {mutation.error ? <Alert type="error" showIcon title={plantHealthReviewError(mutation.error)} /> : null}
  </Modal>
}
