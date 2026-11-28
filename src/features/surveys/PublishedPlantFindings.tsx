import { Button, Modal } from 'antd'
import type { PublishedSurveyFinding, PublishedSurveyResult, PublishedSurveySummary } from './ownerSurveyResultApi'
import { PublishedSurveyImagePicker } from './PublishedSurveyImagePicker'
import { comboFindingLabel } from './resultReviewWorkflow'

export function publishedFindingsByProfile(result: PublishedSurveyResult | null | undefined) {
  const byProfile = new Map<string, PublishedSurveyFinding[]>()
  if (result?.summary.serviceCode !== 'COMBO') return byProfile
  for (const finding of result.findings) {
    if (finding.suspectedClassCode.toUpperCase().startsWith('HEALTHY_')) continue
    const profileId = finding.plantProfileId.toLowerCase()
    const findings = byProfile.get(profileId) ?? []
    findings.push(finding)
    byProfile.set(profileId, findings)
  }
  return byProfile
}

export function PublishedPlantFindings({ findings, onViewEvidence }: {
  findings: PublishedSurveyFinding[]; onViewEvidence?: (findingId: string) => void
}) {
  return <div>
    <strong>Dấu hiệu nghi bệnh đã được duyệt</strong>
    <ul>{findings.map(finding => <li key={finding.findingId}>
      {comboFindingLabel(finding.suspectedClassCode)} · {(finding.confidence * 100).toFixed(1)}%
      {onViewEvidence && !!finding.evidenceMediaIds?.length ? <Button type="link" size="small"
        onClick={() => onViewEvidence(finding.findingId)}>Xem ảnh minh chứng</Button> : null}
    </li>)}</ul>
    {onViewEvidence && !findings.some(finding => finding.evidenceMediaIds?.length)
      ? <p>Chưa có ảnh minh chứng được phát hành cho trụ này.</p> : null}
  </div>
}

export function PublishedFindingEvidenceDialog({ token, tenantId, summary, finding, close }: {
  token: string; tenantId: string; summary: PublishedSurveySummary; finding: PublishedSurveyFinding; close: () => void
}) {
  const imageIds = finding.evidenceMediaIds
  if (!imageIds?.length) return null
  const title = `Ảnh minh chứng · ${comboFindingLabel(finding.suspectedClassCode)}`
  return <Modal open title={title} footer={null} width={820} onCancel={close}>
    <PublishedSurveyImagePicker key={`${summary.publicationId}:${finding.findingId}`} token={token} tenantId={tenantId}
      summary={summary} imageIds={imageIds} label={title} initialImageId={imageIds[0]} />
  </Modal>
}
