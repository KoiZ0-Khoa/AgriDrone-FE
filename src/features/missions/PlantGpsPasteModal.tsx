import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Input, Modal } from 'antd'
import { operationFor } from '../surveys/workflow'
import * as api from './missionApi'
import type { ReplacePlantGpsResult } from './missionTypes'
import { parsePlantGpsImport, publishPlantGpsError } from './missionWorkflow'

const placeholder = `{
  "trees": [
    { "treeId": "TREE-001", "row": 1, "col": 1, "latitude": 10.123456, "longitude": 105.812345, "confidence": 0.98, "status": "DETECTED", "source": "DRONE_DETECTION" }
  ],
  "processing": {
    "modelVersionId": "UUID của phiên bản model",
    "sourceVersion": 1,
    "gridBearingDeg": 0,
    "rowSpacingM": 3,
    "plantSpacingM": 2.5,
    "algorithmVersion": "Phiên bản thuật toán",
    "startedAt": "Thời điểm bắt đầu theo ISO 8601 UTC"
  }
}`

export function PlantGpsPasteModal({ token, farmId, missionId, close, onSaved }: { token: string; farmId: string; missionId: string; close: () => void; onSaved: (result: ReplacePlantGpsResult) => void }) {
  const [json, setJson] = useState('')
  const operation = useRef<ReturnType<typeof operationFor> | null>(null)
  const mutation = useMutation({
    mutationFn: () => {
      const { trees, processing } = parsePlantGpsImport(json)
      operation.current = operationFor(operation.current, { farmId, missionId, trees, processing })
      return api.replaceMissionPlantGps(token, farmId, missionId, trees, { ...processing, clientOperationId: operation.current.key })
    },
    onSuccess: data => { onSaved(data); close() },
  })
  return <Modal open title="Dán danh sách GPS cây" okText="Lưu (thay toàn bộ danh sách)" cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending || !json.trim() }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => { if (!mutation.isPending) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) close() }}>
    <p className="form-hint">Dán JSON chứa danh sách trees (1–10.000 cây) và thông tin processing của lần xử lý gốc. Khi lưu, danh sách mới sẽ thay thế toàn bộ danh sách hiện có.</p>
    <Input.TextArea rows={12} value={json} disabled={mutation.isPending} onChange={event => setJson(event.target.value)} placeholder={placeholder} />
    {mutation.error ? <Alert type="error" showIcon message={publishPlantGpsError(mutation.error)} /> : null}
  </Modal>
}
