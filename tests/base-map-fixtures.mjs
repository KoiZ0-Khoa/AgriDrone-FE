export const farmId = '10000000-0000-0000-0000-000000000001'
export const draftId = '20000000-0000-0000-0000-000000000001'
export const plantId = '30000000-0000-0000-0000-000000000001'
export const candidate = {
  candidateId: '40000000-0000-0000-0000-000000000001', sourceObservationId: 'observation', evidenceMediaAssetIds: [],
  longitude: 108.12, latitude: 11.01, proposedRowIndex: 1, proposedColumnIndex: 2, positionConfidence: 0.95,
  boundaryClassification: 'IN_BOUNDARY', reviewDecision: 'Pending', correctedLongitude: null, correctedLatitude: null,
  correctedRowIndex: null, correctedColumnIndex: null, proposedMatchedPlantId: plantId, correctedMatchedPlantId: null, reviewReason: null, reviewedAt: null, treeId: 'tree_r1_c2',
}
export const draft = {
  draftId, farmId, versionNumber: 2, status: 'Draft', sourceSurveyOrderId: '50000000-0000-0000-0000-000000000001', sourceMissionId: null,
  farmBoundaryVersionId: null, handoffId: null, batchId: 'batch', batchStatus: 'PendingReview', jobId: null, modelVersion: 'model', algorithmVersion: null,
  producedAt: '2026-10-28T00:00:00Z', totalCandidates: 1, pendingCount: 1, acceptedCount: 0, rejectedCount: 0, relocatedCount: 0, replacedCount: 0,
  zones: [{ zoneId: 'zone', gridBearingDeg: 0, rowSpacingM: 3, plantSpacingM: 3, candidates: [candidate] }],
}
export const validation = { isValid: true, totalCandidates: 1, acceptedCount: 1, rejectedCount: 0, relocatedCount: 0, replacedCount: 0, pendingCount: 0, confirmedPublishablePoleCount: 1, issues: [] }
