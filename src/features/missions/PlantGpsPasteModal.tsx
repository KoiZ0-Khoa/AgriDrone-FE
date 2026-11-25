import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Input, Modal } from 'antd'
import * as api from './missionApi'
import type { ReplacePlantGpsResult } from './missionTypes'
import { buildMappingProcessing, parsePlantGpsTrees, publishPlantGpsError } from './missionWorkflow'

const placeholder = '[\n  { "treeId": "TREE-001", "row": 1, "col": 1, "latitude": 10.123456, "longitude": 105.812345, "confidence": 0.98, "status": "DETECTED", "source": "DRONE_DETECTION" }\n]'

export function PlantGpsPasteModal({ token, farmId, missionId, close, onSaved, modelVersionId, rowSpacingM, plantSpacingM, gridBearingDeg }: {
  token: string; farmId: string; missionId: string; close: () => void; onSaved: (result: ReplacePlantGpsResult) => void
  modelVersionId: string | null; rowSpacingM: number; plantSpacingM: number; gridBearingDeg: number
}) {
  const [json, setJson] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const trees = parsePlantGpsTrees(json)
      if (!modelVersionId) throw new Error('Chưa cấu hình model nhận diện cây (VITE_MAPPING_MODEL_VERSION_ID). Liên hệ dev.')
      // BE lưu mỗi lần dán là một lần xử lý bản đồ riêng (nguồn "manual-json").
      const processing = buildMappingProcessing({ clientOperationId: crypto.randomUUID(), modelVersionId, gridBearingDeg, rowSpacingM, plantSpacingM, algorithmVersion: 'manual-json', startedAt: new Date() })
      return api.replaceMissionPlantGps(token, farmId, missionId, trees, processing)
    },
    onSuccess: data => { onSaved(data); close() },
  })
  return <Modal open title="Dán danh sách GPS cây" okText="Lưu (thay toàn bộ danh sách)" cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending || !json.trim() }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => { if (!mutation.isPending) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) close() }}>
    <p className="form-hint">Dán mảng JSON các cây (1–10.000 cây). Thao tác này thay toàn bộ danh sách cây hiện có của nhiệm vụ, không cộng dồn.</p>
    <p className="form-hint">Lưu kèm khoảng cách hàng {rowSpacingM} m, khoảng cách cây {plantSpacingM} m, góc lưới {gridBearingDeg}° (chỉnh ở mục “Đưa vào hệ thống chính thức”).</p>
    <Input.TextArea rows={12} value={json} disabled={mutation.isPending} onChange={event => setJson(event.target.value)} placeholder={placeholder} />
    {mutation.error ? <Alert type="error" showIcon message={publishPlantGpsError(mutation.error)} /> : null}
  </Modal>
}
