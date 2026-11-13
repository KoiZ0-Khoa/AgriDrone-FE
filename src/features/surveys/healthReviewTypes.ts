// Review kết quả Plant Health theo đơn khảo sát (nhóm B, Giai đoạn 2).
// Contract lấy từ BE: SystemManagerSurveyResultsController.cs + IPlantHealthReviewService.cs + PlantHealthReviewService.*.cs
// (mốc BE fda57ec). Mọi body đều bị BE từ chối nếu có trường lạ (JsonUnmappedMemberHandling.Disallow).

// Giá trị decision phải khớp CHÍNH XÁC tên enum HealthReviewDecision (phân biệt hoa thường).
export type FindingDecision = 'Approve' | 'Correct' | 'Reject' | 'NonDisease' | 'Ambiguous'
// Tài liệu ghi "RetainEvidence" nhưng BE không có giá trị đó.
export type BoundaryDecision = 'AcceptCorrectedPosition' | 'ExcludeEvidence' | 'NeedsEvidence'
export type ResolutionState = 'PENDING_REVIEW' | 'NEEDS_REVIEW' | 'RESOLVED'
export type HealthReviewQueue = 'findings' | 'exceptions'

export type HealthReviewQuery = {
  pageNumber?: number; pageSize?: number; batchId?: string
  decision?: FindingDecision | 'Pending'; classCode?: string; zoneId?: string; resolutionState?: ResolutionState
}

// Các khóa trong `snapshot`/`original` là PascalCase vì BE serialize bằng JsonSerializer mặc định
// (không qua chính sách camelCase của ASP.NET) — đọc qua healthReviewWorkflow.ts, không truy cập thẳng.
export type HealthReviewState = {
  reviewId: string; version: number | null; decision: string
  reviewedBy: string; reviewedAt: string; reason: string; snapshot: unknown
}
export type HealthReviewItem = {
  id: string; sourceVersion: number | null; sourceRowVersion: number; observedAt: string
  resolutionState: ResolutionState | 'HISTORY'; original: unknown
  review: HealthReviewState | null; blockingReasons: string[]; guidanceReview?: HealthReviewState | null
}
export type HealthReviewPage = {
  resultId: string; batchId: string; resultVersion: number; reviewRevision: number
  resultNature: string; teamLabelLimitation: string; isCurrentBatch: boolean
  pageNumber: number; pageSize: number; totalCount: number; items: HealthReviewItem[]
}

export type HealthReviewSummary = {
  resultId: string; batchId: string; resultVersion: number; reviewRevision: number
  unreviewedFindings: number; ambiguousFindings: number; acceptedFindings: number; rejectedFindings: number; nonDiseaseFindings: number
  unresolvedBoundaryExceptions: number; undecidedZones: number; rejectedZones: number; approvedZones: number
  invalidGuidance: number; staleDependencies: number; readyForApproval: boolean
}

export type HealthReviewPoint = { type: 'Point'; coordinates: [number, number] }
export type FindingReviewItemInput = {
  findingId: string
  expectedSourceVersion: number
  // null khi finding CHƯA có review nào; ngược lại phải bằng review.version hiện tại (BE CheckHead). Tài liệu ghi 0 là sai.
  expectedReviewVersion: number | null
  decision: FindingDecision
  reason: string
  evidenceMediaIds: string[]
  correctedClassCode?: string
  correctedPlantId?: string
  correctedPosition?: HealthReviewPoint
}
export type FindingBatchRequest = { operationId: string; batchId: string; expectedResultVersion: number; items: FindingReviewItemInput[] }

export type BoundaryReviewRequest = {
  operationId: string; batchId: string; expectedResultVersion: number
  expectedExceptionVersion: number; expectedReviewVersion: number | null
  decision: BoundaryDecision; reason: string; evidenceMediaIds: string[]
  // Bắt buộc với AcceptCorrectedPosition/ExcludeEvidence; NeedsEvidence phải bỏ trống.
  findingId?: string; findingReviewId?: string
}

export type HealthReviewedVersion = { kind: string; subjectId: string; reviewId: string; version: number; subjectRowVersion: number | null }
export type HealthReviewOutcome = {
  operationId: string; resultId: string; batchId: string; resultVersion: number; reviewRevision: number
  reviews: HealthReviewedVersion[]; invalidatedZoneIds: string[]; isReplay: boolean; isCurrentBatch: boolean
}

// Đọc từ `original` của finding (PlantHealthFindingV4).
export type FindingOriginal = {
  findingId: string | null; plantId: string | null; mappingCandidateId: string | null
  lon: number | null; lat: number | null; observedAt: string | null
  suspectedClassCode: string | null; confidence: number | null; uncertainty: string | null
  evidenceMediaIds: string[]
}
// Đọc từ `original` của ngoại lệ ranh giới (HealthBoundaryExceptionV4).
export type BoundaryExceptionOriginal = {
  sourceReferenceId: string | null; lon: number | null; lat: number | null
  boundaryClassification: string | null; measuredBoundaryDistanceM: number | null; boundaryThresholdM: number | null
  evidenceMediaIds: string[]
}
