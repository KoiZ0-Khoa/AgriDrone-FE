import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Image, Input, Select, Space, Tag } from 'antd'
import { lazy, Suspense, useState } from 'react'
import { getMapVersion } from '../baseMaps/api'
import { useBaseMapOrthophoto } from '../baseMaps/useBaseMapOrthophoto'
import { previewUrl } from '../baseMaps/workflow'
import { getMissionMediaDownloadUrl } from '../missions/missionApi'
import {
  blockerResolutionLabels, comboBlockerLabel, comboFindingLabel, comboReviewPlantLinks, findingDecisionLabels, zoneDecisionLabels,
  type BlockerDraft, type BlockerItem, type ComboReviewDraft, type FindingDraft, type ZoneDraft,
} from './resultReviewWorkflow'
import type { ComboPendingBatch, ResultReview } from './v3Types'
import './comboReviewVisuals.css'

const ComboReviewMap = lazy(() => import('./ComboReviewMap'))

export type ComboReviewSelection = { kind: 'finding' | 'boundary' | 'zone'; id: string | null }

export function selectionForComboBlocker(batch: ComboPendingBatch, blocker: BlockerItem): ComboReviewSelection | null {
  const id = blocker.sourceId
  if (blocker.sourceType === 'BOUNDARY_EXCEPTION' && batch.boundaryExceptions.some(item => item.sourceReferenceId === id)) return { kind: 'boundary', id }
  if (batch.findings.some(item => item.findingId === id)) return { kind: 'finding', id }
  if (batch.diseaseZones.some(item => item.sourceProposalId === id)) return { kind: 'zone', id }
  return null
}

type Props = {
  token: string; review: ResultReview; batch: ComboPendingBatch; draft: ComboReviewDraft; blockers: BlockerItem[]; disabled: boolean
  selection: ComboReviewSelection; onSelect: (selection: ComboReviewSelection) => void
  onFindingChange: (id: string, change: Partial<FindingDraft>) => void
  onZoneChange: (id: string, change: Partial<ZoneDraft>) => void
  onBlockerChange: (key: string, change: Partial<BlockerDraft>) => void
}

export function ComboReviewVisuals({ token, review, batch, draft, blockers, disabled, selection: requestedSelection, onSelect, onFindingChange, onZoneChange, onBlockerChange }: Props) {
  const mapVersionId = batch.farmBaseMapVersionId ?? review.farmBaseMapVersionId
  const mapQuery = useQuery({
    queryKey: ['combo-review-map-version', review.tenantId, review.farmId, mapVersionId],
    queryFn: ({ signal }) => getMapVersion(token, review.farmId, mapVersionId, signal),
    enabled: Boolean(mapVersionId), retry: false,
  })
  const { shownMap, image } = useBaseMapOrthophoto(token, review.tenantId, mapQuery.data)
  const links = comboReviewPlantLinks(batch, shownMap?.plants ?? [])
  const selection: ComboReviewSelection = requestedSelection.kind === 'finding' && requestedSelection.id && !links.plantByFinding.has(requestedSelection.id)
    ? { kind: 'boundary', id: requestedSelection.id } : requestedSelection
  const layers = [
    { kind: 'finding', label: 'Trụ khảo sát', count: shownMap?.plants.length ?? review.verifiedBillablePoleCount },
    { kind: 'boundary', label: 'Điểm cần đối chiếu', count: batch.boundaryExceptions.length + links.gpsFindings.length },
    { kind: 'zone', label: 'Vùng nghi bệnh', count: batch.diseaseZones.length },
  ] as const
  const finding = selection.kind !== 'zone' ? batch.findings.find(item => item.findingId === selection.id) : undefined
  const boundary = selection.kind === 'boundary' ? batch.boundaryExceptions.find(item => item.sourceReferenceId === selection.id) : undefined
  const zone = selection.kind === 'zone' ? batch.diseaseZones.find(item => item.sourceProposalId === selection.id) : undefined
  const plant = selection.kind === 'finding' && selection.id ? links.plantByFinding.get(selection.id) : undefined
  const findingLabel = (item: ComboPendingBatch['findings'][number]) => `${comboFindingLabel(item.suspectedClassCode)} · ${Math.round(item.confidence * 100)}%`
  const options = selection.kind === 'finding'
    ? (plant ? links.findingsByPlant.get(plant.plantId) ?? [] : batch.findings.filter(item => links.plantByFinding.has(item.findingId)))
      .map(item => ({ value: item.findingId, label: findingLabel(item) }))
    : selection.kind === 'boundary'
      ? [...batch.boundaryExceptions.map(item => ({ value: item.sourceReferenceId, label: comboBlockerLabel(item.boundaryClassification) })),
        ...links.gpsFindings.map(item => ({ value: item.findingId, label: findingLabel(item) }))].map((item, index) => ({ ...item, label: `${index + 1}. ${item.label}` }))
      : batch.diseaseZones.map((item, index) => ({ value: item.sourceProposalId, label: `${index + 1}. ${comboFindingLabel(item.suspectedClassCode)}` }))
  const matchingBlockers = blockers.filter(item => item.sourceId === selection.id)
  const mediaIds = [...new Set([...(boundary?.evidenceMediaIds ?? []), ...(finding?.evidenceMediaIds ?? []), ...(zone?.evidenceMediaIds ?? [])])]

  return <section className="combo-review-visuals" aria-label="Bản đồ và ảnh minh chứng">
    <div className="combo-review-visual-heading">
      <h3>Bản đồ và ảnh minh chứng</h3>
      <Space wrap>{layers.map(({ kind, label, count }) => <Button key={kind} aria-pressed={selection.kind === kind} type={selection.kind === kind ? 'primary' : 'default'}
        onClick={() => onSelect({ kind, id: null })}>{label} ({count})</Button>)}</Space>
    </div>
    <div className="combo-review-visual-grid">
      <div className="combo-review-map-stack">
        {mapVersionId && mapQuery.isPending ? <div className="combo-review-map-placeholder" role="status">Đang tải bản đồ khảo sát…</div>
          : shownMap ? <Suspense fallback={<div className="combo-review-map-placeholder" role="status">Đang tải bản đồ khảo sát…</div>}>
            <ComboReviewMap map={shownMap} batch={batch} links={links} selection={selection} onSelect={onSelect} />
          </Suspense> : <Alert type="warning" showIcon title="Chưa tải được bản đồ trụ"
            action={mapVersionId ? <Button size="small" onClick={() => void mapQuery.refetch()}>Tải lại bản đồ</Button> : undefined} />}
        {shownMap && image.isError && !shownMap.previewUrl ? <Button size="small" onClick={() => void image.refetch()}>Tải lại ảnh nền</Button> : null}
        {shownMap && selection.kind === 'finding' ? <p className="form-hint">{links.plantByFinding.size
          ? 'Màu đỏ đánh dấu trụ có phát hiện nghi bệnh. Bấm vào trụ để xem từng phát hiện.'
          : 'Chưa có liên kết trụ đối chiếu được với phiên bản bản đồ này. Xem GPS và ngoại lệ trong Điểm cần đối chiếu.'}</p> : null}
      </div>
      <aside className="combo-review-inspector" aria-label="Chi tiết mục đang chọn">
        <Select aria-label="Chọn mục trên bản đồ" placeholder="Chọn một mục" showSearch={{ optionFilterProp: 'label' }} value={selection.id ?? undefined}
          options={options} onChange={id => onSelect({ kind: selection.kind, id })} notFoundContent="Không có mục trong nhóm này" />
        {finding || boundary || zone ? <>
          <Space wrap>
            {plant ? <Tag>Trụ hàng {plant.row}, cột {plant.col}</Tag> : null}
            {finding ? <Tag color="blue">{comboFindingLabel(finding.suspectedClassCode)} · {Math.round(finding.confidence * 100)}%</Tag> : null}
            {boundary ? <Tag color="orange">{comboBlockerLabel(boundary.boundaryClassification)} · {boundary.measuredBoundaryDistanceM.toFixed(2)} m</Tag> : null}
            {zone ? <Tag color="orange">{comboFindingLabel(zone.suspectedClassCode)} · {zone.memberships.length} phát hiện</Tag> : null}
          </Space>
          <ComboEvidenceImage key={`${selection.kind}:${selection.id}`} token={token} farmId={review.farmId} missionId={review.missionId} mediaIds={mediaIds} />
          {finding ? <div className="combo-review-fields">
            <strong>Quyết định phát hiện</strong>
            <Select aria-label="Quyết định phát hiện đang chọn" disabled={disabled} value={draft.findings[finding.findingId]?.decision}
              options={Object.entries(findingDecisionLabels).map(([value, label]) => ({ value, label }))}
              onChange={decision => onFindingChange(finding.findingId, { decision })} />
            {draft.findings[finding.findingId]?.decision === 'Exclude' ? <Input.TextArea aria-label="Lý do loại phát hiện" placeholder="Nhập lý do loại" autoSize maxLength={500} disabled={disabled}
              value={draft.findings[finding.findingId]?.reason} onChange={event => onFindingChange(finding.findingId, { reason: event.target.value })} /> : null}
          </div> : null}
          {zone ? <div className="combo-review-fields">
            <strong>Quyết định vùng</strong>
            <Select aria-label="Quyết định vùng đang chọn" disabled={disabled} value={draft.zones[zone.sourceProposalId]?.decision}
              options={Object.entries(zoneDecisionLabels).map(([value, label]) => ({ value, label }))}
              onChange={decision => onZoneChange(zone.sourceProposalId, { decision })} />
            {draft.zones[zone.sourceProposalId]?.decision === 'Reject' ? <Input.TextArea aria-label="Lý do từ chối vùng" placeholder="Nhập lý do từ chối" autoSize maxLength={500} disabled={disabled}
              value={draft.zones[zone.sourceProposalId]?.reason} onChange={event => onZoneChange(zone.sourceProposalId, { reason: event.target.value })} />
              : zone.guidanceCandidates.length ? <Select aria-label="Hướng dẫn xử lý vùng đang chọn" placeholder="Chọn hướng dẫn xử lý" disabled={disabled}
                value={draft.zones[zone.sourceProposalId]?.guidanceId ?? undefined} onChange={guidanceId => onZoneChange(zone.sourceProposalId, { guidanceId })}
                options={zone.guidanceCandidates.map(item => ({ value: item.guidanceId, label: `${item.code} · v${item.versionNumber}` }))} /> : null}
          </div> : null}
          {matchingBlockers.map(item => <div key={item.key} className="combo-review-fields">
            <strong>{comboBlockerLabel(item.reasonCode)}</strong>
            <Select aria-label={`Xử lý ${comboBlockerLabel(item.reasonCode)}`} disabled={disabled} value={draft.blockers[item.key]?.resolution}
              options={Object.entries(blockerResolutionLabels).map(([value, label]) => ({ value, label }))}
              onChange={resolution => onBlockerChange(item.key, { resolution })} />
            {draft.blockers[item.key]?.resolution !== 'Unresolved' ? <Input.TextArea aria-label={`Giải trình ${comboBlockerLabel(item.reasonCode)}`} placeholder="Nhập giải trình" autoSize maxLength={500} disabled={disabled}
              value={draft.blockers[item.key]?.reason} onChange={event => onBlockerChange(item.key, { reason: event.target.value })} /> : null}
          </div>)}
        </> : <p className="form-hint">{selection.kind === 'finding' ? 'Bấm một trụ có phát hiện để xem ảnh và duyệt.' : 'Bấm điểm hoặc vùng trên bản đồ để xem ảnh và duyệt.'}</p>}
      </aside>
    </div>
  </section>
}

function ComboEvidenceImage({ token, farmId, missionId, mediaIds }: { token: string; farmId: string; missionId: string; mediaIds: string[] }) {
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null)
  const mediaId = selectedMediaId ?? mediaIds[0]
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const imageQuery = useQuery({
    queryKey: ['combo-review-evidence-image', farmId, missionId, mediaId],
    queryFn: ({ signal }) => getMissionMediaDownloadUrl(token, farmId, missionId, mediaId!, signal),
    enabled: Boolean(mediaId && missionId), staleTime: 60_000, gcTime: 60_000, retry: false, refetchOnWindowFocus: false,
  })
  const image = previewUrl(imageQuery.data?.downloadUrl ?? null)
  return <div className="combo-review-fields">
    {mediaIds.length > 1 ? <Select aria-label="Chọn ảnh minh chứng" value={mediaId} onChange={setSelectedMediaId}
      options={mediaIds.map((id, index) => ({ value: id, label: `Ảnh minh chứng ${index + 1}` }))} /> : null}
    {!mediaId ? <p className="form-hint">Mục này chưa có ảnh minh chứng.</p>
      : imageQuery.isPending ? <p className="form-hint" role="status">Đang tải ảnh minh chứng…</p>
      : imageQuery.isError || !image || failedUrl === image ? <Alert type="warning" showIcon title="Chưa tải được ảnh minh chứng"
        action={<Button size="small" onClick={() => { setFailedUrl(null); void imageQuery.refetch() }}>Tải lại ảnh</Button>} />
      : <Image src={image} alt="Ảnh minh chứng của mục đang chọn" width="100%" onError={() => setFailedUrl(image)} />}
  </div>
}
