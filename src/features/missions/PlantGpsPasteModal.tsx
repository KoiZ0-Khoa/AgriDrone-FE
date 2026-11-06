import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Alert, Input, Modal } from 'antd'
import * as api from './missionApi'
import type { ReplacePlantGpsResult } from './missionTypes'
import { missionError, parsePlantGpsTrees } from './missionWorkflow'

const placeholder = '[\n  { "treeId": "TREE-001", "row": 1, "col": 1, "latitude": 10.123456, "longitude": 105.812345, "confidence": 0.98, "status": "DETECTED", "source": "DRONE_DETECTION" }\n]'

export function PlantGpsPasteModal({ token, farmId, missionId, close, onSaved }: { token: string; farmId: string; missionId: string; close: () => void; onSaved: (result: ReplacePlantGpsResult) => void }) {
  const [json, setJson] = useState('')
  const mutation = useMutation({
    mutationFn: () => api.replaceMissionPlantGps(token, farmId, missionId, parsePlantGpsTrees(json)),
    onSuccess: data => { onSaved(data); close() },
  })
  return <Modal open title="Dán danh sách GPS cây" okText="Lưu (thay toàn bộ danh sách)" cancelText="Hủy"
    confirmLoading={mutation.isPending} okButtonProps={{ disabled: mutation.isPending || !json.trim() }} cancelButtonProps={{ disabled: mutation.isPending }}
    closable={!mutation.isPending} maskClosable={!mutation.isPending} keyboard={!mutation.isPending}
    onOk={() => { if (!mutation.isPending) mutation.mutate() }} onCancel={() => { if (!mutation.isPending) close() }}>
    <p className="form-hint">Dán mảng JSON các cây (1–10.000 cây). Thao tác này thay toàn bộ danh sách cây hiện có của nhiệm vụ, không cộng dồn.</p>
    <Input.TextArea rows={12} value={json} disabled={mutation.isPending} onChange={event => setJson(event.target.value)} placeholder={placeholder} />
    {mutation.error ? <Alert type="error" showIcon message={missionError(mutation.error)} /> : null}
  </Modal>
}
