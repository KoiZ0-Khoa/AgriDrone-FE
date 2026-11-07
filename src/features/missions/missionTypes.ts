// Prepare response purpose/status are raw C# enum ToString() values (PascalCase),
// unlike most other Mission JSON which uses SCREAMING_SNAKE_CASE — verified against BE source.
export type MissionPurpose = 'BaselineMapping' | 'PlantHealth' | 'HarvestReadiness'
export type AvailableDrone = {
  id: string; code: string; name: string; model: string | null; manufacturer: string | null
  specifications: { capabilities: string[] }
  registrationNumber: string | null; registrationExpiryDate: string | null
  weightKg: number | null; status: string; nextMaintenanceAt: string | null
}
export type PreparedMission = { missionId: string; purpose: string; status: string; scheduledAt: string | null; scheduledEndAt: string | null; version: number }
export type PrepareMissionSetResult = { surveyOrderId: string; farmId: string; reusedExistingSet: boolean; missions: PreparedMission[] }

// Mission list/detail JSON uses real enums (SCREAMING_SNAKE_CASE), unlike PreparedMission above.
export type MissionListItem = {
  id: string; farmId: string; zoneId: string | null; droneId: string; missionCode: string
  missionType: string | null; status: string; processingStatus: string
  scheduledAt: string | null; scheduledEndAt: string | null; startedAt: string | null; endedAt: string | null
  version: number; createdAt: string
}
export type MissionDetail = {
  id: string; tenantId: string; farmId: string; zoneId: string | null; droneId: string; pilotUserId: string | null
  missionCode: string; missionType: string | null; status: string; processingStatus: string
  scheduledAt: string | null; scheduledEndAt: string | null; startedAt: string | null; endedAt: string | null
  sourceMapVersionId: string | null; publishedMapVersionId: string | null
  preflightConfirmedBy: string | null; preflightConfirmedAt: string | null
  notes: string | null; version: number; createdAt: string; updatedAt: string
  surveyOrderId: string | null; purpose: string | null; scopeZoneIds: string[]; requiresBaselineCompletion: boolean
  preflightOperationId: string | null; preflightChecklistVersion: number | null
  preflightChecklistAnswers: Record<string, boolean> | null; preflightSuitableForFlight: boolean | null
  preflightNotes: string | null; farmBoundaryVersionId: string | null
}
export type PreflightChecklistItem = { key: string; prompt: string; required: boolean }
export type ActiveMissionChecklist = { definitionId: string; code: string; versionNumber: number; items: PreflightChecklistItem[] }
export type CompleteMissionPreflightResult = { mission: MissionDetail; reusedOperation: boolean }

export type PlantGpsTree = { treeId: string; row: number; col: number; latitude: number; longitude: number; confidence: number; status: 'DETECTED' | 'MISSING'; source: string }
export type PlantGpsResult = { missionId: string; savedCount: number; trees: PlantGpsTree[] }
export type ReplacePlantGpsResult = { missionId: string; savedCount: number; boundaryPointCount: number; boundaryId: string | null; boundaryVersionNumber: number | null; boundaryStatus: string | null }

// Candidates must exactly match the rows just saved via ReplacePlantGpsResult above (same shape) — verified against MissionPlantGpsPublisher.
export type PlantGpsPublishPayload = { surveyOrderId: string; candidates: PlantGpsTree[]; rowSpacingM: number; plantSpacingM: number; gridBearingDeg: number }
export type PlantGpsPublishResult = { missionId: string; messageId: string; status: string }

// Literal strings, not enum JSON — verified against UploadMissionMediaItemResponse (api/missions/{missionId}/farms/{farmId}/media).
export type MediaUploadStatus = 'Completed' | 'Failed' | 'NotAttempted'
export type CompletedMediaUpload = { uploadSessionId: string; mediaAssetId: string; status: string; mimeType: string; fileSizeBytes: number; sha256Checksum: string; reusedCompletion: boolean }
export type MediaUploadItemResult = { index: number; fileName: string; status: MediaUploadStatus; media: CompletedMediaUpload | null; errorCode: string | null; errorMessage: string | null }
export type MissionMediaType = 'IMAGE' | 'VIDEO'
export type MissionMediaRole = 'RAW_VIDEO' | 'RAW_IMAGE' | 'PROCESSED_IMAGE' | 'THUMBNAIL' | 'OTHER'
export type MissionMedia = {
  mediaId: string; missionId: string; mediaType: MissionMediaType; mediaRole: MissionMediaRole
  mimeType: string | null; fileSizeBytes: number | null; sha256Checksum: string | null
  widthPx: number | null; heightPx: number | null; durationMs: number | null
  capturedAt: string | null; telemetryTimeOffsetMs: number | null; captureClockSource: string | null; createdAt: string
}
export type MediaDownloadUrl = { mediaId: string; downloadUrl: string; expiresAt: string }

export type TelemetryPoint = { sequenceNumber: number; recordedAt: string; longitude: number; latitude: number; altitudeM: number | null; headingDeg: number | null; speedMps: number | null; horizontalAccuracyM: number | null }
export type TelemetrySegment = {
  segmentIndex: number; sourcePointCount: number; rejectedPointCount: number; pointCount: number
  firstRecordedAt: string | null; lastRecordedAt: string | null; fitsPointCountLimit: boolean; warnings: string[]; points: TelemetryPoint[]
}
export type NormalizedTelemetryLog = { sourceFileName: string; sourceChecksum: string; warnings: string[]; segments: TelemetrySegment[] }
export type AltitudeReference = 'RelativeToTakeoff' | 'Agl' | 'Msl' | 'Unknown'
export type ImportTelemetryPointInput = {
  sequenceNumber: number; recordedAt: string; longitude: number; latitude: number; altitudeM: number | null
  altitudeReference: AltitudeReference | null; headingDeg: number | null; speedMps: number | null; horizontalAccuracyM: number | null
}
export type ImportTelemetryResult = { telemetryImportId: string; missionId: string; pointCount: number; firstRecordedAt: string; lastRecordedAt: string; missionVersion: number; reusedOperation: boolean }

export type UploadReadiness = {
  missionId: string; missionVersion: number; status: string; canFinalize: boolean
  rawImageCount: number; rawVideoCount: number; telemetryPointCount: number; hasActiveUploadSessions: boolean; blockers: string[]
}
export type FinalizeUploadResult = { missionId: string; status: string; mediaCount: number; telemetryPointCount: number; missionVersion: number }
// status is raw enum.ToString() (PascalCase) like Finalize/Prepare — normalize with toScreamingSnakeCase before storing.
export type ResetMissionUploadResult = { missionId: string; status: string; deletedMediaCount: number; telemetryReset: boolean; missionVersion: number }

export type ProcessMetashapeOptions = { cameraType?: string; alignAccuracy?: string; genericPreselection?: boolean }
export type ProcessMetashapeResult = { missionId: string; taskId: string; status: string; message: string }
export type OrthophotoBounds = { minLat: number; maxLat: number; minLon: number; maxLon: number }
export type OrthophotoCorners = {
  northWest: { latitude: number; longitude: number }; northEast: { latitude: number; longitude: number }
  southEast: { latitude: number; longitude: number }; southWest: { latitude: number; longitude: number }
}
// status is a plain string from the external photogrammetry service (NOT_STARTED/QUEUED/.../COMPLETED/ERROR) — never run through toScreamingSnakeCase, it is not a Mission status.
export type OrthophotoStatus = {
  missionId: string; taskId: string | null; status: string; progress: number; processingTimeMs: number
  previewUrl: string | null; tifUrl: string | null; bounds: OrthophotoBounds | null; corners: OrthophotoCorners | null; errorMessage: string | null
  stage: string | null
}

// GeoJSON ring order is [lng, lat] throughout the tiling/YOLO contracts below.
export type GeoJsonPolygon = { type: 'Polygon'; coordinates: [number, number][][] }
export type MissionTile = {
  tileIndex: number; tileSize: number | null; colOff: number; rowOff: number; width: number; height: number
  fileName: string; storageKey: string | null; url: string | null; bounds: OrthophotoBounds; corners: OrthophotoCorners; affineTransform: number[]
}
export type SliceTilesResult = { missionId: string; totalTiles: number; totalTiles640: number; totalTiles1280: number; dualScale: boolean; tiles: MissionTile[] }

export type DetectedTree = { id: string; row: number; col: number; lat: number; lon: number; confidence: number; status: string; source: string; isAnchor: boolean }
export type DetectMissionTreesOptions = { confidenceThreshold?: number; rowSpacing?: number; colSpacing?: number; anchorLat?: number; anchorLon?: number; customAngleDeg?: number; polygonGeoJson?: GeoJsonPolygon }
export type DetectMissionTreesResult = {
  missionId: string; modelName: string; totalTilesScanned: number; totalRawDetections: number; totalUniqueTrees: number; totalMissingTrees: number
  suggestedRowSpacing: number | null; suggestedColSpacing: number | null; maxRow: number; maxCol: number; csvDownloadUrl: string | null
  activeTrees: DetectedTree[]; missingTrees: DetectedTree[]
}
