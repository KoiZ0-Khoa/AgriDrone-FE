import type { PublishedSurveyResult } from './ownerSurveyResultApi'
import { comboFindingLabel } from './resultReviewWorkflow'

type Finding = PublishedSurveyResult['findings'][number]

export function publishedFindingsByProfile(result: PublishedSurveyResult | null | undefined) {
  const byProfile = new Map<string, Finding[]>()
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

export function PublishedPlantFindings({ findings }: { findings: Finding[] }) {
  return <div>
    <strong>Dấu hiệu nghi bệnh đã được duyệt</strong>
    <ul>{findings.map(finding => <li key={finding.findingId}>
      {comboFindingLabel(finding.suspectedClassCode)} · {(finding.confidence * 100).toFixed(1)}%
    </li>)}</ul>
  </div>
}
