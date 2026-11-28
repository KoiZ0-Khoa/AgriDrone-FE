// Types của luồng V3 — khớp contract BE (JSON SCREAMING_SNAKE_CASE cho enum).

export type V3OrderStatus =
  | 'AWAITING_APPOINTMENT' | 'AWAITING_DEPOSIT' | 'READY_FOR_CAPTURE' | 'CAPTURING' | 'AWAITING_CAPTURE_UPLOAD'
  | 'AWAITING_INPUT_REVIEW' | 'AWAITING_PROCESSING' | 'PROCESSING' | 'AWAITING_REFLIGHT_DECISION' | 'AWAITING_SETTLEMENT'
  | 'COMPLETED' | 'CANCELLED'

export type V3ServiceKind = 'MAP' | 'COMBO'

export type CaptureAttemptStatus =
  | 'PLANNED' | 'PREFLIGHT_READY' | 'IN_FLIGHT' | 'AWAITING_UPLOAD' | 'UPLOADED' | 'PROCESSING'
  | 'ACCEPTED' | 'REFLIGHT_REQUIRED' | 'FLIGHT_FAILED' | 'CANCELLED'

// ProposeV3CaptureAppointmentRequest — không có purpose: BE luôn tạo lịch CAPTURE. Ngày theo giờ Việt Nam (yyyy-MM-dd).
export type CaptureAppointmentBody = {
  scheduledDate: string
  expectedOrderVersion: number
  expectedCurrentAppointmentId: string | null
  expectedCurrentAppointmentVersion: number | null
}
// ConfirmV3CaptureAppointmentRequest / RequestV3CaptureAppointmentRescheduleRequest.
export type CaptureAppointmentOwnerBody = { expectedOrderVersion: number; expectedAppointmentVersion: number }
export type CaptureRescheduleBody = CaptureAppointmentOwnerBody & { reason: string }

// RecordV3CaptureNoShowRequest. occurredAt phải là UTC (BE từ chối offset khác 0), trong khoảng từ giờ bắt đầu lịch hẹn tới hiện tại.
export type CaptureNoShowBody = {
  appointmentId: string
  expectedOrderVersion: number
  expectedAppointmentVersion: number
  occurredAt: string
  reason: string
  evidenceReference: string
  operationId: string
  payloadFingerprint: string
}
// RecordCaptureNoShowResult — giá trị enum là ToString() của C# (PascalCase), không phải SCREAMING_SNAKE_CASE.
export type CaptureNoShowDisposition = 'FreeReschedule' | 'AdminReviewRequired'
export type CaptureNoShowResult = {
  success: boolean
  orderId: string
  appointmentId: string
  noShowId: string
  occurrenceIndex: number
  disposition: CaptureNoShowDisposition | string
  orderStatus: string
  appointmentStatus: string
}

// V3CaptureAttemptHistoryApiResponse — sắp theo transitionSequence tăng dần.
export type V3CaptureAttemptHistory = {
  transitionSequence: number
  action: string
  fromStatus: CaptureAttemptStatus | null
  toStatus: CaptureAttemptStatus
  reason: string
  createdAt: string
}

// V3CaptureAttemptApiResponse — GET api/v3/system-manager/survey-orders/{orderId}/capture-attempts, sắp theo attemptIndex tăng dần.
export type V3CaptureAttempt = {
  captureAttemptId: string
  attemptIndex: number
  status: CaptureAttemptStatus
  version: number
  missionId: string | null
  parentAttemptId: string | null
  parentMissionId: string | null
  mappingSourceAttemptId?: string | null
  startedAt: string | null
  endedAt: string | null
  history: V3CaptureAttemptHistory[]
  manifestId?: string | null
  manifestFingerprint?: string | null
  processingJobId?: string | null
  orderVersion?: number | null
}

type V3AttemptOperation = {
  expectedOrderVersion: number
  expectedAttemptVersion: number
  operationId: string
  payloadFingerprint: string
}
export type V3StartFlightBody = V3AttemptOperation & { missionId: string }
export type V3CompleteFlightBody = V3AttemptOperation & { endedAt: string; flightCompletedReceipt: string }
export type V3FailFlightBody = V3AttemptOperation & { failedAt: string; failureReason: string; failureIncidentEvidence: string }
export type V3FlightResult = { success: boolean; attemptId: string; status: string; version: number }
export type FreezeCaptureInputBody = V3AttemptOperation & { missionId: string }
export type FrozenCaptureInput = V3FlightResult & {
  manifestId: string
  manifestFingerprint: string
  totalFileCount: number
  totalSizeBytes: number
  processingJobId?: string | null
  orderVersion?: number | null
}

export type ReopenCaptureInputBody = V3AttemptOperation & { manifestId: string; reason: string }
export type ReopenCaptureInputResult = V3FlightResult & {
  missionId: string
  supersededManifestId: string
  orderVersion: number
}
export type ApproveCaptureInputBody = V3AttemptOperation & {
  manifestId: string
  manifestFingerprint: string
  processingJobId: string
  notes?: string
}
export type ApproveCaptureInputResult = V3FlightResult & { approvalId: string }
export type RecoverCaptureMissionResult = {
  success: boolean
  attemptId: string
  missionId: string
  approvalId: string
  manifestId: string
  processingJobId: string
  missionVersion: number
  alreadyReady: boolean
}

export type MarkCaptureBoundaryBody = {
  expectedOrderVersion: number
  expectedMissionVersion: number
  expectedBoundaryVersionNumber: number | null
  corners: { sequence: number; longitude: number; latitude: number }[]
}
export type MarkCaptureBoundaryResult = {
  surveyOrderId: string
  farmBoundaryId: string
  boundaryVersionNumber: number
  orderVersion: number
  missionVersion: number
  markedAt: string
}

// G6 — CreateV3QualityReflightRequest. Ngày bay lại theo giờ Việt Nam (yyyy-MM-dd); BE tự tạo lịch Capture cả ngày, ở trạng thái
// chờ Owner xác nhận. Lý do và bằng chứng kỹ thuật 1–500 ký tự. Không thu thêm cọc.
export type PrepareCaptureAttemptBody = {
  droneId: string; expectedOrderVersion: number; operationId: string; payloadFingerprint: string
}
export type PrepareCaptureAttemptResult = {
  success: boolean; attemptId: string; attemptIndex: number; missionId: string; status: string; version: number
}

export type DiseaseCaptureSchedule = { droneId: string; expectedOrderVersion: number; startAt: string; endAt: string }

export type QualityReflightBody = {
  droneId: string
  scheduledDate: string
  expectedOrderVersion: number
  expectedParentAttemptVersion: number
  reason: string
  technicalQualityEvidence: string
  operationId: string
  payloadFingerprint: string
}
// CreateQualityReflightResult — status là ToString() của C# (PascalCase).
export type QualityReflightResult = {
  success: boolean
  successorAttemptId: string
  successorAttemptIndex: number
  newMissionId: string
  status: string
  version: number
}

// G7 — duyệt kết quả V3 (GET/POST api/v3/system-manager/survey-orders/{orderId}/result-review...).
export type GeoJsonPolygonV3 = { type: 'Polygon'; coordinates: number[][][] }
export type ComboPendingFinding = {
  findingId: string; findingVersion: number; plantProfileId: string | null; mappingCandidateId: string | null
  longitude: number; latitude: number; observedAt: string; suspectedClassCode: string; classificationNature: string
  confidence: number; uncertainty: string; limitations: string[]; evidenceMediaIds: string[]
}
export type ComboPendingBoundaryException = {
  sourceReferenceId: string; longitude: number; latitude: number; boundaryClassification: string
  measuredBoundaryDistanceM: number; boundaryThresholdM: number; evidenceMediaIds: string[]
}
export type ComboPendingGuidanceCandidate = { guidanceId: string; versionNumber: number; code: string; sourceReference: string }
export type ComboPendingZone = {
  sourceProposalId: string; geometry: GeoJsonPolygonV3; suspectedClassCode: string; membershipVersion: number
  memberships: { findingId: string; plantProfileId: string | null; mappingCandidateId: string | null; confidence: number }[]
  guidanceCandidates: ComboPendingGuidanceCandidate[]; evidenceMediaIds: string[]
}
export type ComboPendingBatch = {
  batchId: string; jobId: string; sourceRevision: number; canonicalFingerprint: string; producedAt: string; importedAt: string
  farmBaseMapVersionId?: string
  // blockingReasons: mỗi mục dạng "SourceType:SourceId:ReasonCode" (SurveyComboPendingReadPort).
  blockingCount: number; blockingReasons: string[]; status: string; resultNature: string; limitationNotice: string
  findings: ComboPendingFinding[]; boundaryExceptions: ComboPendingBoundaryException[]; diseaseZones: ComboPendingZone[]
}
export type ComboFindingDecisionValue = 'Accept' | 'Exclude'
export type ComboSnapTarget = {
  plantProfileId: string; mappingCandidateId: string; sourceCandidateId: string
  latitude: number; longitude: number; row: number | null; column: number | null
}
export type ComboZoneDecisionValue = 'Approve' | 'Reject' | 'Adjust'
export type ComboBlockerResolutionValue = 'Resolved' | 'AcceptedWithJustification' | 'Excluded' | 'Corrected' | 'Unresolved'
export type ComboFindingDecision = {
  findingId: string; decision: ComboFindingDecisionValue; reason: string | null; evidenceMediaIds: string[]
  reviewedPlantProfileId?: string | null
}
export type ComboZoneDecision = {
  sourceProposalId: string; decision: ComboZoneDecisionValue; reviewedGeometry: GeoJsonPolygonV3 | null; reviewedFindingIds: string[] | null
  selectedGuidanceId: string | null; selectedGuidanceVersionNumber: number | null; reason: string | null; evidenceMediaIds: string[]
}
export type ComboBlockerResolution = { sourceType: string; sourceId: string; reasonCode: string; resolution: ComboBlockerResolutionValue; reason: string | null; evidenceMediaIds: string[] }
export type ComboReviewSummary = {
  reviewRevisionId: string; revisionNumber: number; predecessorReviewId: string | null; outcome: string; reviewReason: string
  confirmNoDiseaseObserved: boolean; negativeResultConfirmationEvidence: string | null; reviewedBy: string; reviewedAt: string; decisionFingerprint: string
  findingsCount: number; acceptedFindingsCount: number; excludedFindingsCount: number; zonesCount: number; approvedZonesCount: number; rejectedZonesCount: number
  blockersCount: number; resolvedBlockersCount: number; unresolvedBlockersCount: number
  findingDecisions: ComboFindingDecision[]; zoneDecisions: ComboZoneDecision[]; blockerResolutions: ComboBlockerResolution[]
}
export type ExpectedFreezeTokens = {
  orderId: string; expectedOrderVersion: number; expectedAttemptId: string; expectedCountSnapshotId: string; expectedCountFingerprint: string
  expectedComboBatchId: string | null; expectedComboSourceRevision: number | null; expectedComboBatchFingerprint: string | null
  expectedComboReviewRevisionId: string | null; expectedComboReviewFingerprint: string | null
}
export type ResultReview = {
  orderId: string; tenantId: string; farmId: string; orderVersion: number; orderStatus: string; serviceCode: string; screensDisease: boolean
  mappingKind: string; captureAttemptId: string; captureAttemptVersion: number; captureAttemptStatus: string; missionId: string
  farmBaseMapVersionId: string; baselineMapVersionId: string; farmBoundaryVersionId: string; mappingCandidateBatchId: string
  verifiedPoleCountSnapshotId: string; verifiedBillablePoleCount: number; countSnapshotFingerprint: string; countSnapshotRevision: number
  currentApprovedResultRevisionId: string | null; currentApprovedResultFingerprint: string | null
  comboPendingBatch: ComboPendingBatch | null; currentComboReview: ComboReviewSummary | null; expectedFreezeTokens: ExpectedFreezeTokens
  comboSnapTargets?: ComboSnapTarget[] | null
}
export type ComboReviewOutcome = 'Approved' | 'Rejected'
export type RecordComboReviewBody = {
  operationId: string; expectedOrderVersion: number; expectedBatchId: string; expectedSourceRevision: number; expectedBatchFingerprint: string
  expectedPreviousReviewId: string | null; outcome: ComboReviewOutcome; reviewReason: string
  findingDecisions: ComboFindingDecision[]; zoneDecisions: ComboZoneDecision[]; blockerResolutions: ComboBlockerResolution[]
  confirmNoDiseaseObserved: boolean; negativeResultConfirmationEvidence: string | null
}
export type ComboReviewResult = {
  orderId: string; batchId: string; sourceRevision: number; reviewRevisionId: string; reviewRevisionNumber: number; predecessorReviewId: string | null
  decisionFingerprint: string; outcome: string; unresolvedBlockersCount: number; unresolvedBlockers: string[]; reviewedAt: string; isReplay: boolean
}
// FreezeV3InternalResultRequest. reviewDecision: Approved | ApprovedWithObservations (BE còn nhận InternalApproved).
export type FreezeResultReviewDecision = 'Approved' | 'ApprovedWithObservations'
export type FreezeResultBody = {
  operationId: string; expectedOrderVersion: number; expectedAttemptId: string; expectedCountSnapshotId: string; expectedCountFingerprint: string
  reviewDecision: FreezeResultReviewDecision; freezeReason: string
  expectedComboBatchId: string | null; expectedComboSourceRevision: number | null; expectedComboBatchFingerprint: string | null
  expectedComboReviewRevisionId: string | null; expectedComboReviewFingerprint: string | null
}
export type ManagerSurveyInvoice = {
  orderId: string; orderVersion: number; orderStatus: string; invoiceRevisionNumber: number
  verifiedBillablePoleCount: number; pricePerPole: number; currency: string; totalAmount: number
  validAllocatedDepositNet: number; confirmedNetReceipts: number; dueAmount: number; overpaymentAmount: number
  finalizedAt: string; hasOpenReconciliation: boolean; reconciliationReasons: string[] | null
}
export type FinalizeManagerInvoiceBody = {
  operationId: string; expectedOrderVersion: number; expectedApprovedResultRevisionId: string
  expectedApprovedResultFingerprint: string; expectedCountSnapshotId: string; expectedCountFingerprint: string
  finalizationReason: string; zeroPoleReasonCode: string | null; zeroPoleEvidenceReference: string | null
}

export type FreezeResult = {
  orderId: string; orderVersion: number; orderStatus: string; serviceCode: string; screensDisease: boolean
  approvedResultRevisionId: string; approvedResultRevisionNumber: number; approvedResultFingerprint: string; reviewDecision: string
  healthAssessmentStatus: string; limitationNotice: string | null; attemptId: string; attemptStatus: string
  verifiedBillablePoleCount: number; frozenAt: string; isReplay: boolean
}
