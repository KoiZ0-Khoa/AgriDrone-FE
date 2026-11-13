import { useMutation } from '@tanstack/react-query'
import { Alert, Form, Input, InputNumber, Modal, Radio, Select, Space } from 'antd'
import { useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { MAX_REVIEW_REASON_LENGTH, reviewHealthFindings } from './healthReviewApi'
import type { HealthReviewItem, HealthReviewOutcome } from './healthReviewTypes'
import { correctionFields, findingVersions, healthReviewError, isStaleReviewError, plantsByDistance, type FindingRow } from './healthReviewWorkflow'
import type { PlantHealthLabel } from './plantHealthApi'
import type { FarmHealthPlant } from './plantHealthMapTypes'
import { operationFor } from './workflow'

type PositionMode = 'keep' | 'plant' | 'manual'
type Props = {
  token: string; orderId: string; page: { batchId: string; resultVersion: number }
  item: HealthReviewItem; row: FindingRow
  // Nhãn "nghi bệnh" đang hoạt động trong catalog; null khi không tải được catalog.
  labels: PlantHealthLabel[] | null; plants: FarmHealthPlant[]
  close: (reload: boolean) => void; done: (outcome: HealthReviewOutcome) => void
}

// Khoảng cách hàng/cột thường ~2.7–2.8 m — trụ xa hơn ngưỡng này nhiều khả năng là chọn nhầm.
const FAR_PLANT_METERS = 3
const fmt = (value: number | null) => value === null ? '—' : value.toFixed(7)

export function CorrectFindingModal({ token, orderId, page, item, row, labels, plants, close, done }: Props) {
  const currentClass = row.reviewedClass ?? row.originalClass ?? ''
  const [classCode, setClassCode] = useState(currentClass)
  const [plantId, setPlantId] = useState<string | null>(row.plantId)
  const [positionMode, setPositionMode] = useState<PositionMode>('keep')
  const [manual, setManual] = useState<{ lat: number | null; lon: number | null }>({ lat: row.lat, lon: row.lon })
  const [reason, setReason] = useState('')
  const submitting = useRef(false)
  const operation = useRef<{ payload: string; key: string } | null>(null)

  const activePlants = useMemo(() => plants.filter(plant => plant.lifecycleStatus === 'ACTIVE'), [plants])
  const nearby = useMemo(() => plantsByDistance(activePlants, row.lat, row.lon), [activePlants, row.lat, row.lon])
  const selectedPlant = activePlants.find(plant => plant.id.toLowerCase() === plantId?.toLowerCase()) ?? null
  const selectedDistance = nearby.find(entry => entry.plant.id === selectedPlant?.id)?.distance ?? null
  const position = positionMode === 'plant' ? { lat: selectedPlant?.lat ?? null, lon: selectedPlant?.lon ?? null }
    : positionMode === 'manual' ? manual : { lat: row.lat, lon: row.lon }

  const classOptions = useMemo(() => {
    const options = (labels ?? []).map(label => ({ value: label.code, label: `${label.name} (${label.code})` }))
    if (currentClass && !options.some(option => option.value.toUpperCase() === currentClass.toUpperCase())) options.unshift({ value: currentClass, label: `${currentClass} (hiện tại)` })
    return options
  }, [labels, currentClass])

  let fields: ReturnType<typeof correctionFields> | null = null
  let formError: string | null = null
  try { fields = correctionFields(row, { classCode, plantId, lat: position.lat, lon: position.lon }) } catch (error) { formError = (error as Error).message }

  const mutation = useMutation({
    mutationFn: () => {
      const input = { ...findingVersions(item), decision: 'Correct' as const, reason: reason.trim(), evidenceMediaIds: [] as string[], ...fields! }
      operation.current = operationFor(operation.current, { input, batchId: page.batchId, resultVersion: page.resultVersion })
      return reviewHealthFindings(token, orderId, { operationId: operation.current.key, batchId: page.batchId, expectedResultVersion: page.resultVersion, items: [input] })
    },
    onSuccess: done,
    onSettled: () => { submitting.current = false },
  })
  const stale = isStaleReviewError(mutation.error)
  const blocked = mutation.isPending || stale
  const canSubmit = !blocked && fields !== null && reason.trim().length > 0
  function submit() {
    if (!canSubmit || submitting.current) return
    submitting.current = true
    mutation.mutate()
  }

  return <Modal open width={620} title="Sửa và xác nhận phát hiện bệnh" okText="Lưu sửa đổi" cancelText={stale ? 'Đóng và tải lại' : 'Hủy'}
    okButtonProps={{ danger: true, disabled: !canSubmit }} confirmLoading={mutation.isPending}
    cancelButtonProps={{ disabled: mutation.isPending }} closable={!mutation.isPending} mask={{ closable: !mutation.isPending }} keyboard={!mutation.isPending}
    onOk={submit} onCancel={() => { if (!mutation.isPending) close(stale) }}>
    <p className="form-hint">"Sửa" là xác nhận đây đúng là bệnh, kèm loại bệnh / trụ cây / vị trí đã chỉnh. Muốn bác bỏ thì dùng "Bác bỏ" hoặc "Không phải bệnh".</p>
    <dl className="detail-list">
      <div><dt>AI đề xuất</dt><dd>{row.originalClass ?? '—'} · {row.originalPlantId ? 'đã gắn trụ' : 'chưa gắn trụ'}</dd></div>
      <div><dt>Hiện tại</dt><dd>{row.className} · {row.plantLabel} · {row.decisionLabel}</dd></div>
    </dl>
    <Form layout="vertical" disabled={blocked} onFinish={submit}>
      <Form.Item label="Loại bệnh" required extra={labels === null ? 'Không tải được danh mục nhãn bệnh — chỉ giữ được loại hiện tại.' : undefined}>
        <Select aria-label="Loại bệnh" showSearch optionFilterProp="label" value={classCode || undefined} options={classOptions} onChange={setClassCode} />
      </Form.Item>
      <Form.Item label="Trụ cây" required extra={activePlants.length === 0 ? 'Không tải được danh sách trụ của nông trại.' : 'Sắp xếp theo khoảng cách tới vị trí phát hiện. Gõ mã trụ để tìm.'}>
        <Select aria-label="Trụ cây" showSearch value={plantId ?? undefined} placeholder="Chọn trụ cây" optionFilterProp="label" onChange={setPlantId}
          options={nearby.map(({ plant, distance }) => ({ value: plant.id, label: `${plant.plantCode} · H${plant.row}-C${plant.col}${distance === null ? '' : ` · ${distance.toFixed(1)} m`}` }))} />
      </Form.Item>
      <Form.Item label="Vị trí phát hiện" required>
        <Radio.Group value={positionMode} onChange={event => setPositionMode(event.target.value)}>
          <Space direction="vertical">
            <Radio value="keep">Giữ vị trí hiện tại ({fmt(row.lat)}, {fmt(row.lon)})</Radio>
            <Radio value="plant" disabled={!selectedPlant}>Đặt tại trụ đã chọn{selectedPlant ? ` (${fmt(selectedPlant.lat)}, ${fmt(selectedPlant.lon)})` : ''}</Radio>
            <Radio value="manual">Nhập tọa độ</Radio>
          </Space>
        </Radio.Group>
        {positionMode === 'manual' ? <Space wrap style={{ marginTop: 8 }}>
          <InputNumber aria-label="Vĩ độ" placeholder="Vĩ độ" step={0.000001} precision={7} style={{ width: 180 }} value={manual.lat} onChange={value => setManual(current => ({ ...current, lat: value }))} />
          <InputNumber aria-label="Kinh độ" placeholder="Kinh độ" step={0.000001} precision={7} style={{ width: 180 }} value={manual.lon} onChange={value => setManual(current => ({ ...current, lon: value }))} />
        </Space> : null}
      </Form.Item>
      <Form.Item label="Lý do" required extra={`${reason.length}/${MAX_REVIEW_REASON_LENGTH} ký tự.`}>
        <Input.TextArea rows={3} maxLength={MAX_REVIEW_REASON_LENGTH} value={reason} onChange={event => setReason(event.target.value)} />
      </Form.Item>
    </Form>
    {formError && !mutation.error ? <Alert type="info" showIcon title={formError} /> : null}
    {selectedDistance !== null && selectedDistance > FAR_PLANT_METERS ? <Alert type="warning" showIcon title={`Trụ ${selectedPlant?.plantCode} cách vị trí phát hiện ${selectedDistance.toFixed(1)} m`} description="Kiểm tra lại đã chọn đúng trụ chưa. Các trụ gần nhất nằm đầu danh sách." /> : null}
    {fields ? <p className="form-hint">Sẽ gửi: {[
      fields.correctedClassCode ? `loại bệnh → ${fields.correctedClassCode}` : null,
      fields.correctedPlantId ? `trụ cây → ${selectedPlant?.plantCode ?? fields.correctedPlantId}${selectedDistance === null ? '' : ` (cách ${selectedDistance.toFixed(1)} m)`}` : null,
      fields.correctedPosition ? `vị trí → ${fields.correctedPosition.coordinates[1].toFixed(7)}, ${fields.correctedPosition.coordinates[0].toFixed(7)}` : null,
    ].filter(Boolean).join('; ')}.</p> : null}
    {mutation.error ? <Alert type="error" showIcon title={healthReviewError(mutation.error)}
      description={mutation.error instanceof ApiError ? <>Mã lỗi: <code>{mutation.error.code ?? `HTTP ${mutation.error.status}`}</code>{mutation.error.traceId ? <> · Mã tra cứu: <code>{mutation.error.traceId}</code></> : null}</> : undefined} /> : null}
  </Modal>
}
