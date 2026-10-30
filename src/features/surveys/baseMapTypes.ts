export type ReviewDecision = 'MatchExisting' | 'Relocate' | 'CreateNew' | 'Replace' | 'Reject'
export type MappingCandidate = {
  candidateId: string; sourceObservationId: string; evidenceMediaAssetIds: string[]
  longitude: number; latitude: number; proposedRowIndex: number | null; proposedColumnIndex: number | null
  positionConfidence: number; boundaryClassification: string; reviewDecision: string
  correctedLongitude: number | null; correctedLatitude: number | null; correctedRowIndex: number | null; correctedColumnIndex: number | null
  proposedMatchedPlantId: string | null; correctedMatchedPlantId: string | null; reviewReason: string | null; reviewedAt: string | null; treeId: string | null
}
export type CandidateZone = { zoneId: string; gridBearingDeg: number; rowSpacingM: number; plantSpacingM: number; candidates: MappingCandidate[] }
export type BaseMapDraft = {
  draftId: string; farmId: string; versionNumber: number; status: string; sourceSurveyOrderId: string
  sourceMissionId: string | null; farmBoundaryVersionId: string | null; handoffId: string | null; batchId: string | null; batchStatus: string | null
  jobId: string | null; modelVersion: string | null; algorithmVersion: string | null; producedAt: string | null
  totalCandidates: number; pendingCount: number; acceptedCount: number; rejectedCount: number; relocatedCount: number; replacedCount: number; zones: CandidateZone[]
}
export type CandidateReviewBody = {
  decision: ReviewDecision; correctedLongitude: number | null; correctedLatitude: number | null
  correctedRowIndex: number | null; correctedColumnIndex: number | null; correctedMatchedPlantId: string | null; reason: string | null
}
export type CandidateReviewResult = Omit<CandidateReviewBody, 'decision'> & { candidateId: string; reviewDecision: string; reviewedAt: string }
export type BatchReviewBody = { reviews: (CandidateReviewBody & { candidateId: string })[]; batchReason: string | null }
export type BatchReviewResult = { totalReviewed: number; acceptedCount: number; rejectedCount: number; relocatedCount: number; replacedCount: number; remainingPendingCount: number }
export type MappingValidation = {
  isValid: boolean; totalCandidates: number; acceptedCount: number; rejectedCount: number; relocatedCount: number; replacedCount: number
  pendingCount: number; confirmedPublishablePoleCount: number
  issues: { candidateId: string | null; code: string; message: string; severity: string }[]
}
export type PublishedBaseMap = { farmBaseMapVersionId: string; versionNumber: number; confirmedSurveyPoleCount: number; publishedAt: string }
