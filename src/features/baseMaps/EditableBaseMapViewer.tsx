import { Alert, Button, Space } from 'antd'
import { useCallback, useState } from 'react'
import { readableCode } from '../../components/RecordReference'
import { BaseMapViewer } from './BaseMapViewer'
import { ManualMapEditDialog } from './ManualMapEditDialog'
import type { GeoCoordinate, MapPlant, MapVersionDetail } from './types'
import { mapEditPointError, type VisualMapEdit } from './workflow'

type PositionEdit = VisualMapEdit & { decision: 'CreateNew' | 'Relocate' }
export function EditableBaseMapViewer({ token, scopeKey, map, canEdit, disabled, selectPlant }: { token: string; scopeKey: string; map: MapVersionDetail; canEdit: boolean; disabled: boolean; selectPlant: (plant: MapPlant) => void }) {
  const [stage, setStage] = useState<PositionEdit | null>(null)
  const [dialog, setDialog] = useState<{ initial?: VisualMapEdit } | null>(null)
  const [error, setError] = useState('')
  const [loadedImage, setLoadedImage] = useState<string | null>(null)
  const onImageState = useCallback((ready: boolean) => setLoadedImage(ready ? map.previewUrl : null), [map.previewUrl])
  const imageReady = !!map.previewUrl && loadedImage === map.previewUrl
  const blocked = disabled || !!dialog || !imageReady
  function pick(position: GeoCoordinate) {
    if (!canEdit || blocked || !stage) return false
    const error = mapEditPointError(map, position)
    if (error) { setError(error); return false }
    setError(''); setStage({ ...stage, position }); return true
  }
  function editPlant(plant: MapPlant, decision: 'Relocate' | 'Reject') {
    if (blocked) return
    setError('')
    if (decision === 'Reject') { setStage(null); setDialog({ initial: { decision, plant } }) }
    else setStage({ decision, plant, position: { lat: plant.lat, lon: plant.lon } })
  }
  const changed = stage?.decision === 'CreateNew' || (stage?.position && stage.plant && (stage.position.lat !== stage.plant.lat || stage.position.lon !== stage.plant.lon))
  return <>
    {canEdit ? <>
      <div className="resource-panel-heading"><div><strong>Điều chỉnh thực địa</strong><span>Thêm trụ trên ảnh hoặc bấm một trụ để dời, loại bỏ.</span></div><Button title="Mở form nhập tọa độ" disabled={disabled || !!dialog} onClick={() => { setStage(null); setError(''); setDialog({}) }}>Điều chỉnh trụ</Button></div>
      <Space wrap className="base-map-edit-toolbar"><Button type="primary" disabled={blocked} onClick={() => { setError(''); setStage({ decision: 'CreateNew' }) }}>Thêm trụ trên ảnh</Button>{stage ? <><Button type="primary" disabled={blocked || !stage.position || !changed} onClick={() => setDialog({ initial: stage })}>Tiếp tục xác nhận</Button><Button disabled={disabled || !!dialog} onClick={() => { setStage(null); setError('') }}>Hủy chọn vị trí</Button></> : null}</Space>
      {stage ? <Alert showIcon type="info" title={stage.decision === 'CreateNew' ? 'Bấm trên ảnh để đặt trụ mới' : `Đang dời ${readableCode(stage.plant?.plantCode) ?? 'trụ đã chọn'}`} description={<>{stage.decision === 'Relocate' ? 'Kéo ghim màu cam hoặc bấm vị trí mới. ' : 'Có thể kéo ghim màu cam để chỉnh lại. '}Bấm Tiếp tục xác nhận để nhập lý do và lưu.{stage.position ? <span className="base-map-picked-coordinate">Vĩ độ: {stage.position.lat.toFixed(7)} · Kinh độ: {stage.position.lon.toFixed(7)}</span> : null}</>} /> : !imageReady ? <p className="form-hint">Chờ ảnh trực giao tải xong để thao tác trên ảnh. Bạn vẫn có thể dùng form nhập tọa độ.</p> : null}
      {error ? <Alert showIcon type="error" title={error} /> : null}
    </> : null}
    <BaseMapViewer key={`${map.versionId}:${map.previewUrl}`} map={map} selectPlant={selectPlant} onImageState={onImageState} interaction={canEdit ? { mode: stage?.decision, point: stage?.position, disabled: blocked, pick, editPlant } : undefined} />
    {dialog && canEdit ? <ManualMapEditDialog token={token} scopeKey={scopeKey} map={map} initial={dialog.initial} close={saved => { setDialog(null); if (saved) { setStage(null); setError('') } }} /> : null}
  </>
}
