import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Checkbox, Divider, Form, Input, InputNumber, Radio, Space, Steps, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommonState } from '../../components/CommonState'
import { CopyReference } from '../../components/RecordReference'
import { ActionModal } from '../../management/ActionModal'
import { text, type Action } from '../../management/actions'
import { useAuth } from '../auth/AuthContext'
import { getFarmContext } from '../surveys/farmOperationsApi'
import { operationFor } from '../surveys/workflow'
import * as api from './missionApi'
import type { DetectMissionTreesResult, GeoJsonPolygon, ImportTelemetryResult, MediaUploadItemResult, MissionDetail, MissionMedia, MissionPlantGpsBoundaryPoint, NormalizedTelemetryLog, PlantGpsPublishResult, PlantGpsTree, ReplacePlantGpsResult, SliceTilesResult, TelemetrySegment } from './missionTypes'
import { dateTime, fileSizeLabel, isBaselineMappingMissionCode, isNotFound, isOrthophotoTerminal, mediaRoleLabels, mediaTypeLabels, mediaUploadStatusLabels, missionError, missionPurposeLabel, missionStatusLabel, orthophotoStatusLabel, publishPlantGpsError, surveyOrderIdFromMissionCode, toScreamingSnakeCase, uploadBlockerLabel } from './missionWorkflow'
import { BoundaryTilingPanel } from './BoundaryTilingPanel'
import { PlantGpsPasteModal } from './PlantGpsPasteModal'
import { RescheduleMissionModal } from './RescheduleMissionModal'
import { StepSection } from './StepSection'
import { YoloDetectionPanel } from './YoloDetectionPanel'
import { PlantHealthProcessingPanel } from './PlantHealthProcessingPanel'

const missionStepTitles = ['Preflight', 'Bay', 'Upload & Telemetry', 'Ghép bản đồ', 'Ranh giới, YOLO & Publish GPS']
function missionStepIndex(status: string, preflightDone: boolean) {
  if (status === 'DRAFT') return 0
  if (status === 'SCHEDULED') return preflightDone ? 1 : 0
  if (status === 'IN_FLIGHT' || status === 'FLIGHT_FAILED') return 1
  if (status === 'FLIGHT_COMPLETED' || status === 'UPLOADING' || status === 'UPLOAD_FAILED') return 2
  if (status === 'READY_FOR_PROCESSING' || status === 'PROCESSING' || status === 'PROCESSING_FAILED') return 3
  if (status === 'AWAITING_REVIEW' || status === 'COMPLETED') return 4
  return 0
}

const incidentTypeOptions = [
  { value: 'SIGNAL_LOSS', label: 'Mất tín hiệu điều khiển' },
  { value: 'LOW_BATTERY', label: 'Pin yếu' },
  { value: 'INTERRUPTION', label: 'Gián đoạn khác' },
  { value: 'FLIGHT_FAILURE', label: 'Lỗi chuyến bay' },
]
const recoveryDecisionOptions = [
  { value: 'ABORT', label: 'Hủy, không bay lại' },
  { value: 'RESCHEDULE_REQUIRED', label: 'Cần lên lịch lại' },
]
// Backend caps requests at 20 files (UploadMissionMediaRequest.Files has [MaxLength(20)]) and 5 GiB total — split by both.
const maxUploadBatchBytes = 5 * 1024 * 1024 * 1024
const maxUploadBatchFiles = 20
function batchFilesBySize(files: File[], maxBytes: number, maxFiles: number): File[][] {
  const batches: File[][] = []
  let current: File[] = [], currentBytes = 0
  for (const file of files) {
    if (current.length > 0 && (current.length >= maxFiles || currentBytes + file.size > maxBytes)) { batches.push(current); current = []; currentBytes = 0 }
    current.push(file)
    currentBytes += file.size
  }
  if (current.length > 0) batches.push(current)
  return batches
}

// Kéo-thả cả thư mục vào vùng upload: trình duyệt chỉ trao FileSystemEntry (không phải File) cho
// thư mục, nên phải tự đọc đệ quy. Dùng khi kéo-thả thay vì input[webkitdirectory] để nút "Chọn
// tệp" chỉ cần làm đúng 1 việc (mở hộp thoại chọn file) — không cần hỏi trước người dùng muốn chọn
// file hay thư mục.
async function readDirectoryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))]
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const files: File[] = []
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
      if (batch.length === 0) break
      for (const child of batch) files.push(...await readDirectoryFiles(child))
    }
    return files
  }
  return []
}
async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = Array.from(dataTransfer.items).map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => entry != null)
  if (entries.length === 0) return Array.from(dataTransfer.files)
  return (await Promise.all(entries.map(readDirectoryFiles))).flat()
}

export function ManagerMissionDetailPage() {
  const { message } = App.useApp()
  const token = useAuth().session!.accessToken
  const { farmId = '', missionId = '' } = useParams()
  const client = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [suitableForFlight, setSuitableForFlight] = useState(false)
  const [notes, setNotes] = useState('')
  const [operation, setOperation] = useState<{ payload: string; key: string } | null>(null)
  // Tracks the freshest Mission snapshot across preflight/start/complete-flight/cancel/fail/reschedule responses, overriding the list-based fetch below.
  const [latest, setLatest] = useState<MissionDetail | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [pastingPlantGps, setPastingPlantGps] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [mediaDropActive, setMediaDropActive] = useState(false)
  const [uploadResults, setUploadResults] = useState<MediaUploadItemResult[] | null>(null)
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [logFile, setLogFile] = useState<File | null>(null)
  const [normalized, setNormalized] = useState<NormalizedTelemetryLog | null>(null)
  const [selectedSegmentIndexes, setSelectedSegmentIndexes] = useState<number[]>([])
  const [telemetryOperation, setTelemetryOperation] = useState<{ payload: string; key: string } | null>(null)
  const [importResult, setImportResult] = useState<ImportTelemetryResult | null>(null)
  const [engine, setEngine] = useState<'metashape' | 'odm'>('metashape')
  const [sliceResult, setSliceResult] = useState<SliceTilesResult | null>(null)
  const [boundaryPolygon, setBoundaryPolygon] = useState<GeoJsonPolygon | null>(null)
  const [yoloResult, setYoloResult] = useState<DetectMissionTreesResult | null>(null)
  const [rowSpacingM, setRowSpacingM] = useState(3)
  const [plantSpacingM, setPlantSpacingM] = useState(2.5)
  const [gridBearingDeg, setGridBearingDeg] = useState(0)
  const [publishOperation, setPublishOperation] = useState<{ payload: string; key: string } | null>(null)
  const [publishResult, setPublishResult] = useState<PlantGpsPublishResult | null>(null)
  const [boundaryUpdateResult, setBoundaryUpdateResult] = useState<ReplacePlantGpsResult | null>(null)

  const missionQuery = useQuery({ queryKey: ['mission-detail', farmId, missionId], queryFn: ({ signal }) => api.findMissionById(token, farmId, missionId, signal) })
  const mission = missionQuery.data
  const status = latest?.status ?? mission?.status
  const version = latest?.version ?? mission?.version
  const draft = status === 'DRAFT'
  const scheduled = status === 'SCHEDULED'
  const inFlight = status === 'IN_FLIGHT'
  const flightFailed = status === 'FLIGHT_FAILED'
  const preflightDone = Boolean(latest?.preflightConfirmedAt)
  const droneQuery = useQuery({ queryKey: ['mission-drone', farmId, mission?.droneId], queryFn: ({ signal }) => api.getFarmDroneDetails(token, farmId, mission!.droneId, signal), enabled: Boolean(mission) })
  const checklistQuery = useQuery({ queryKey: ['mission-checklist', farmId, missionId], queryFn: ({ signal }) => api.getActivePreflightChecklist(token, farmId, missionId, signal), enabled: scheduled && !preflightDone })
  const currentAnswers = checklistQuery.data ? { ...Object.fromEntries(checklistQuery.data.items.map(item => [item.key, false])), ...answers } : answers
  // Dùng để quyết định có cần gửi kèm boundary trong lần publish GPS cây đầu tiên không (farm chưa có ranh giới nào) — cùng queryKey với ManagerFarmDetailPage/ManagerPlantHealthMapPage nên cache dùng chung.
  const farmContextQuery = useQuery({ queryKey: ['manager-farm-context', farmId], queryFn: ({ signal }) => getFarmContext(token, farmId, signal) })
  // latest.purpose chỉ có trong cùng phiên (giống surveyOrderId) — mất sau khi tải lại trang. Suy từ hậu tố missionCode
  // (luôn có sẵn từ GET .../missions) làm fallback, tránh im lặng không set được boundary vì isBaselineMapping sai thành false.
  const isBaselineMapping = latest?.purpose ? toScreamingSnakeCase(latest.purpose) === 'BASELINE_MAPPING' : Boolean(mission && isBaselineMappingMissionCode(mission.missionCode))
  const isPlantHealth = latest?.purpose ? toScreamingSnakeCase(latest.purpose) === 'PLANT_HEALTH' : Boolean(mission && /-HEALTH$/.test(mission.missionCode))
  const plantGpsQuery = useQuery({ queryKey: ['mission-plant-gps', farmId, missionId], queryFn: ({ signal }) => api.getMissionPlantGps(token, farmId, missionId, signal), enabled: !!mission && !isPlantHealth })
  const canDetectDiseases = isPlantHealth && ['READY_FOR_PROCESSING', 'AWAITING_REVIEW', 'PROCESSING_FAILED'].includes(status ?? '')
  const farmBoundaryMissing = farmContextQuery.data ? !farmContextQuery.data.approvedBoundary : false
  const postFlight = ['FLIGHT_COMPLETED', 'UPLOADING', 'READY_FOR_PROCESSING', 'PROCESSING', 'AWAITING_REVIEW', 'COMPLETED'].includes(status ?? '')
  const telemetryEligible = status === 'FLIGHT_COMPLETED' || status === 'UPLOADING'
  const uploading = status === 'UPLOADING'
  const canResetUpload = status === 'UPLOADING' || status === 'UPLOAD_FAILED' || status === 'READY_FOR_PROCESSING' || status === 'PROCESSING_FAILED'
  const mediaQuery = useQuery({ queryKey: ['mission-media', farmId, missionId], queryFn: ({ signal }) => api.getMissionMedia(token, farmId, missionId, 1, 20, signal), enabled: postFlight })
  const readinessQuery = useQuery({ queryKey: ['mission-readiness', farmId, missionId], queryFn: ({ signal }) => api.getUploadReadiness(token, farmId, missionId, signal), enabled: uploading })
  const canStartOrthophoto = !isPlantHealth && (status === 'READY_FOR_PROCESSING' || status === 'AWAITING_REVIEW' || status === 'PROCESSING_FAILED')
  const orthophotoProcessing = !isPlantHealth && status === 'PROCESSING'
  const orthophotoEligible = canStartOrthophoto || orthophotoProcessing
  const orthophotoStatusQuery = useQuery({
    queryKey: ['mission-orthophoto-status', farmId, missionId],
    queryFn: ({ signal }) => api.getOrthophotoStatus(token, farmId, missionId, signal),
    enabled: orthophotoEligible,
    refetchInterval: query => { const current = query.state.data; return current && current.status !== 'NOT_STARTED' && !isOrthophotoTerminal(current.status) ? 60000 : false },
  })

  async function refreshAfter(mission: MissionDetail) {
    setLatest(mission)
    await client.invalidateQueries({ queryKey: ['mission-detail', farmId, missionId] })
  }

  const preflightMutation = useMutation({
    mutationFn: async () => {
      if (!mission || !checklistQuery.data || version === undefined) throw new Error('Chưa tải đủ dữ liệu nhiệm vụ hoặc checklist.')
      if (suitableForFlight && Object.values(currentAnswers).some(value => value === false)) throw new Error('Không thể đánh dấu phù hợp để bay khi còn câu trả lời "Không".')
      const body = { expectedMissionVersion: version, checklistDefinitionId: checklistQuery.data.definitionId, checklistVersion: checklistQuery.data.versionNumber, answers: currentAnswers, suitableForFlight, notes: notes.trim() || null, deviceCompletedAt: new Date().toISOString() }
      const next = operationFor(operation, body)
      setOperation(next)
      return api.completeMissionPreflight(token, farmId, missionId, body, next.key)
    },
    onSuccess: async data => { await refreshAfter(data.mission); void message.success(data.reusedOperation ? 'Checklist đã được ghi nhận từ trước.' : 'Đã hoàn tất checklist preflight.') },
  })
  const startMutation = useMutation({
    mutationFn: () => { if (version === undefined) throw new Error('Chưa tải được phiên bản nhiệm vụ.'); return api.startMission(token, farmId, missionId, version) },
    onSuccess: async data => { await refreshAfter(data); void message.success('Đã bắt đầu chuyến bay.') },
  })
  const completeFlightMutation = useMutation({
    mutationFn: () => { if (version === undefined) throw new Error('Chưa tải được phiên bản nhiệm vụ.'); return api.completeFlightMission(token, farmId, missionId, version) },
    onSuccess: async data => { await refreshAfter(data); void message.success('Đã ghi nhận kết thúc chuyến bay.') },
  })
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results: MediaUploadItemResult[] = []
      let offset = 0
      for (const batch of batchFilesBySize(files, maxUploadBatchBytes, maxUploadBatchFiles)) {
        const batchResults = await api.uploadMissionMedia(token, farmId, missionId, batch)
        results.push(...batchResults.map(item => ({ ...item, index: offset + item.index })))
        offset += batch.length
        if (batchResults.some(item => item.status !== 'Completed')) break
      }
      return results
    },
    onSuccess: async results => {
      setUploadResults(results)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['mission-media', farmId, missionId] }),
        client.invalidateQueries({ queryKey: ['mission-readiness', farmId, missionId] }),
      ])
    },
  })
  async function openMediaDownloadUrl(mediaId: string) {
    try {
      const result = await api.getMissionMediaDownloadUrl(token, farmId, missionId, mediaId)
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (error) { void message.error(missionError(error)) }
  }
  // Sinh CSV ngay từ yoloResult hiện có (có thể đã sửa tay trong YoloDetectionPanel) thay vì gọi API yolo-csv,
  // vốn chỉ phản ánh lần yolo-detect cuối lưu trên server và sẽ lệch với các chỗ đã sửa tay trên FE.
  function downloadTreesCsv() {
    if (!yoloResult) return
    const header = 'tree_id,row,col,latitude,longitude,confidence,status,source'
    const rows = [...yoloResult.activeTrees, ...yoloResult.missingTrees].map(tree => [tree.id, tree.row, tree.col, tree.lat, tree.lon, tree.confidence, tree.status, tree.source].join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trees_${missionId}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const publishPlantGpsMutation = useMutation({
    mutationFn: async () => {
      if (!yoloResult) throw new Error('Chưa có kết quả nhận diện cây.')
      // latest.surveyOrderId chỉ có trong cùng phiên vừa hoàn tất chuyến bay/upload (MissionDetail không có API GET riêng).
      // Sau khi tải lại trang, suy ngược lại từ missionCode (luôn có sẵn từ GET .../missions) thay vì chặn hẳn thao tác publish.
      const surveyOrderId = latest?.surveyOrderId ?? (mission ? surveyOrderIdFromMissionCode(mission.missionCode) : null)
      if (!surveyOrderId) throw new Error('Thiếu mã đơn khảo sát (surveyOrderId) của nhiệm vụ — không suy ra được từ mã nhiệm vụ. Hãy publish trong cùng phiên vừa hoàn tất chuyến bay/upload, hoặc liên hệ dev kiểm tra.')
      const trees: PlantGpsTree[] = [
        ...yoloResult.activeTrees.map(tree => ({ treeId: tree.id, row: tree.row, col: tree.col, latitude: tree.lat, longitude: tree.lon, confidence: tree.confidence, status: 'DETECTED' as const, source: tree.source })),
        ...yoloResult.missingTrees.map(tree => ({ treeId: tree.id, row: tree.row, col: tree.col, latitude: tree.lat, longitude: tree.lon, confidence: tree.confidence, status: 'MISSING' as const, source: tree.source })),
      ]
      if (trees.length === 0) throw new Error('Không có cây nào trong kết quả nhận diện để đưa vào hệ thống chính thức.')
      // Chỉ gửi kèm boundary khi: đúng mission Khảo sát bản đồ nền (ranh giới vẽ trên ảnh mission này mới có ý nghĩa
      // là ranh giới chính thức farm) VÀ farm hiện chưa có ranh giới nào — tránh gửi lại mỗi lần publish, ghi đè
      // ranh giới farm đã đúng bằng polygon vẽ hơi khác ở lần chạy YOLO lại.
      const shouldSetFarmBoundary = isBaselineMapping && farmBoundaryMissing && Boolean(boundaryPolygon)
      const boundary: MissionPlantGpsBoundaryPoint[] | undefined = shouldSetFarmBoundary
        ? boundaryPolygon!.coordinates[0].map(([longitude, latitude]) => ({ longitude, latitude }))
        : undefined
      // Stage first so the saved rows exactly match the candidates below — PublishPlantGps requires a byte-identical match.
      const replaceResult = await api.replaceMissionPlantGps(token, farmId, missionId, trees, boundary)
      await client.invalidateQueries({ queryKey: ['mission-plant-gps', farmId, missionId] })
      if (boundary) await client.invalidateQueries({ queryKey: ['manager-farm-context', farmId] })
      const payload = { surveyOrderId, candidates: trees, rowSpacingM, plantSpacingM, gridBearingDeg }
      const next = operationFor(publishOperation, payload)
      setPublishOperation(next)
      const publishResult = await api.publishMissionPlantGps(token, farmId, missionId, payload, next.key)
      return { publishResult, replaceResult }
    },
    onSuccess: ({ publishResult, replaceResult }) => {
      setPublishResult(publishResult)
      setBoundaryUpdateResult(replaceResult)
      void message.success(replaceResult.boundaryId ? 'Đã lưu nháp, set ranh giới nông trại và gửi yêu cầu đưa vào hệ thống chính thức.' : 'Đã lưu nháp và gửi yêu cầu đưa vào hệ thống chính thức.')
    },
  })
  const normalizeMutation = useMutation({
    mutationFn: () => { if (!logFile) throw new Error('Chọn file log bay (TXT/BBL).'); return api.normalizeTelemetryLog(token, farmId, missionId, logFile) },
    onSuccess: data => { setNormalized(data); setSelectedSegmentIndexes([]); setImportResult(null) },
  })
  const importMutation = useMutation({
    mutationFn: () => {
      if (!normalized || version === undefined) throw new Error('Chưa có dữ liệu log đã decode.')
      const segments = normalized.segments.filter(segment => selectedSegmentIndexes.includes(segment.segmentIndex))
      if (segments.length === 0) throw new Error('Chọn ít nhất 1 segment để import.')
      const totalPoints = segments.reduce((sum, segment) => sum + segment.points.length, 0)
      if (totalPoints < 2 || totalPoints > 50000) throw new Error('Tổng số điểm của các segment đã chọn phải từ 2 đến 50.000.')
      const body = {
        sourceFileName: normalized.sourceFileName, sourceChecksum: normalized.sourceChecksum, expectedMissionVersion: version,
        segments: segments.map(segment => ({
          segmentIndex: segment.segmentIndex,
          points: segment.points.map(point => ({ sequenceNumber: point.sequenceNumber, recordedAt: point.recordedAt, longitude: point.longitude, latitude: point.latitude, altitudeM: point.altitudeM, altitudeReference: null, headingDeg: point.headingDeg, speedMps: point.speedMps, horizontalAccuracyM: point.horizontalAccuracyM })),
        })),
      }
      const next = operationFor(telemetryOperation, body)
      setTelemetryOperation(next)
      return api.importMissionTelemetry(token, farmId, missionId, body, next.key)
    },
    onSuccess: async data => {
      setImportResult(data)
      setLatest(previous => previous ? { ...previous, version: data.missionVersion, status: 'UPLOADING' } : previous)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['mission-detail', farmId, missionId] }),
        client.invalidateQueries({ queryKey: ['mission-readiness', farmId, missionId] }),
      ])
      void message.success(data.reusedOperation ? 'Telemetry đã được ghi nhận từ trước.' : 'Đã import telemetry.')
    },
  })
  const finalizeMutation = useMutation({
    mutationFn: () => { if (version === undefined) throw new Error('Chưa tải được phiên bản nhiệm vụ.'); return api.finalizeMissionUpload(token, farmId, missionId, version) },
    onSuccess: async data => {
      // data.status is raw enum.ToString() (PascalCase) like the Prepare response — normalize before storing so later status === 'X' checks keep working.
      setLatest(previous => previous ? { ...previous, version: data.missionVersion, status: toScreamingSnakeCase(data.status) } : previous)
      await client.invalidateQueries({ queryKey: ['mission-detail', farmId, missionId] })
      void message.success('Đã hoàn tất upload. Nhiệm vụ chuyển sang chờ xử lý — chưa phải đã hoàn tất.')
    },
  })
  const processMutation = useMutation({
    mutationFn: () => (engine === 'metashape' ? api.processMetashape : api.processOdm)(token, farmId, missionId),
    onSuccess: async () => {
      setLatest(previous => previous ? { ...previous, status: 'PROCESSING' } : previous)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['mission-detail', farmId, missionId] }),
        client.invalidateQueries({ queryKey: ['mission-orthophoto-status', farmId, missionId] }),
      ])
      void message.success('Đã gửi yêu cầu ghép bản đồ. Theo dõi tiến độ bên dưới.')
    },
  })

  function resetUploadAction(): Action {
    return {
      title: 'Reset upload', danger: true,
      description: 'Xóa toàn bộ ảnh/video đã tải lên của nhiệm vụ này (không thể hoàn tác) và đưa về lại trạng thái "Đang tải lên" để nạp lại từ đầu. Dùng khi lỡ upload nhầm ảnh khiến Geotag/ghép bản đồ lỗi.',
      fields: [{ key: 'resetTelemetry', label: 'Xóa luôn dữ liệu telemetry (log bay) đã nhập?', kind: 'select', value: 'false', options: [{ label: 'Không', value: 'false' }, { label: 'Có, xóa luôn', value: 'true' }] }],
      run: async values => {
        const result = await api.resetMissionUpload(token, farmId, missionId, version!, values.resetTelemetry === 'true')
        // result.status is raw enum.ToString() (PascalCase) like Finalize/Prepare — normalize so later status === 'X' checks keep working.
        setLatest(previous => previous ? { ...previous, version: result.missionVersion, status: toScreamingSnakeCase(result.status) } : previous)
        await Promise.all([
          client.invalidateQueries({ queryKey: ['mission-detail', farmId, missionId] }),
          client.invalidateQueries({ queryKey: ['mission-media', farmId, missionId] }),
          client.invalidateQueries({ queryKey: ['mission-readiness', farmId, missionId] }),
        ])
      },
      success: 'Đã xóa dữ liệu upload, nhiệm vụ quay về trạng thái Đang tải lên.',
    }
  }
  function cancelAction(): Action {
    return {
      title: 'Hủy nhiệm vụ bay', danger: true,
      description: 'Chỉ hủy được khi nhiệm vụ còn ở trạng thái Bản nháp hoặc Đã lên lịch.',
      fields: [{ key: 'reason', label: 'Lý do', kind: 'multiline', max: 1000 }],
      run: async values => { const result = await api.cancelMission(token, farmId, missionId, version!, text(values, 'reason')); await refreshAfter(result) },
      success: 'Đã hủy nhiệm vụ bay.',
    }
  }
  function failFlightAction(): Action {
    const key = crypto.randomUUID()
    return {
      title: 'Báo lỗi chuyến bay', danger: true,
      description: 'Ghi nhận sự cố khi nhiệm vụ đang bay. Drone sẽ chuyển sang bảo trì.',
      fields: [
        { key: 'reason', label: 'Lý do', kind: 'multiline', max: 1000 },
        { key: 'incidentType', label: 'Loại sự cố', kind: 'select', options: incidentTypeOptions },
        { key: 'incidentOutcome', label: 'Kết quả xử lý', kind: 'multiline', max: 1000 },
        { key: 'recoveryDecision', label: 'Quyết định khắc phục', kind: 'select', options: recoveryDecisionOptions },
        { key: 'evidenceReference', label: 'Tham chiếu bằng chứng', max: 500 },
      ],
      run: async values => {
        const result = await api.failFlightMission(token, farmId, missionId, {
          expectedMissionVersion: version!, reason: text(values, 'reason'), incidentType: values.incidentType,
          incidentOutcome: text(values, 'incidentOutcome'), recoveryDecision: values.recoveryDecision, evidenceReference: text(values, 'evidenceReference'),
        }, key)
        await refreshAfter(result)
      },
      success: 'Đã ghi nhận chuyến bay lỗi.',
    }
  }

  const back = <Link className="back-link" to="/manager/orders"><ArrowLeftOutlined /> Đơn khảo sát được giao</Link>
  if (missionQuery.isPending) return <>{back}<CommonState type="loading" /></>
  if (missionQuery.isError) return <>{back}<CommonState type="error" description={missionError(missionQuery.error)} retry={() => missionQuery.refetch()} /></>
  if (!mission) return <>{back}<CommonState type="forbidden" description="Nhiệm vụ bay không còn trong phạm vi được phân công." /></>

  return <>
    {back}
    <section className="resource-page-heading">
      <div><span className="page-kicker">NHIỆM VỤ BAY</span><h1>{latest?.purpose ? missionPurposeLabel(latest.purpose) : 'Nhiệm vụ bay'}</h1>{droneQuery.data ? <p>{droneQuery.data.name}</p> : null}<CopyReference value={mission.missionCode} label="Sao chép mã nhiệm vụ" /></div>
      <Space wrap><Tag color="blue">{missionStatusLabel(status ?? mission.status)}</Tag><Button icon={<ReloadOutlined />} onClick={() => { void missionQuery.refetch(); void checklistQuery.refetch() }}>Tải lại</Button></Space>
    </section>
    <section className="resource-panel">
      <dl className="detail-list">
        <div><dt>Drone</dt><dd>{droneQuery.data ? `${droneQuery.data.name} · ${droneQuery.data.code}` : mission.droneId}</dd></div>
        <div><dt>Lịch bay</dt><dd>{mission.scheduledAt ? `${dateTime(mission.scheduledAt)} – ${dateTime(mission.scheduledEndAt)}` : 'Chưa lên lịch'}</dd></div>
        <div><dt>Phiên bản</dt><dd>v{version}</dd></div>
      </dl>
    </section>
    <Steps className="mission-steps" size="small" current={missionStepIndex(status ?? mission.status, preflightDone)} items={(isPlantHealth ? ['Preflight', 'Bay', 'Upload & Telemetry', 'Nhận diện bệnh', 'Chuyển kết quả kiểm duyệt'] : missionStepTitles).map(title => ({ title }))} />
    {!draft && !scheduled && !inFlight && !flightFailed && !postFlight && !orthophotoEligible && !canResetUpload ? <Alert className="workflow-notice" type="info" showIcon message={`Nhiệm vụ đang ở trạng thái "${missionStatusLabel(status ?? mission.status)}", không ở bước có thao tác trong phạm vi đã triển khai.`} /> : null}
    {flightFailed ? <Alert className="workflow-notice" type="warning" showIcon message="Chuyến bay trước đã lỗi." description="Chỉ lên lịch lại được nếu quyết định khắc phục khi báo lỗi là &quot;Cần lên lịch lại&quot;." /> : null}
    {!draft ? <StepSection title="Checklist trước khi bay" status={scheduled && !preflightDone ? 'active' : 'done'} summary={preflightDone ? `Phù hợp để bay: ${latest?.preflightSuitableForFlight ? 'Có' : 'Không'}.` : undefined}>
      {preflightDone ? <Alert type="success" showIcon message="Đã hoàn tất checklist preflight." description={`Phù hợp để bay: ${latest?.preflightSuitableForFlight ? 'Có' : 'Không'}.`} />
        : checklistQuery.isPending ? <CommonState type="loading" />
        : checklistQuery.isError ? <CommonState type="error" description={missionError(checklistQuery.error)} retry={() => checklistQuery.refetch()} />
        : checklistQuery.data ? <>
          <p className="form-hint">Checklist trước khi bay · v{checklistQuery.data.versionNumber}</p>
          <Form layout="vertical">
            <fieldset className="workflow-checklist">
              <legend>Các điều kiện cần đạt</legend>
              {checklistQuery.data.items.map(item => <Form.Item key={item.key}>
                <Checkbox checked={currentAnswers[item.key] === true} disabled={preflightMutation.isPending} onChange={event => setAnswers(previous => ({ ...previous, [item.key]: event.target.checked }))}>
                  {item.prompt}{item.required ? ' *' : ''}
                </Checkbox>
              </Form.Item>)}
            </fieldset>
            <Form.Item label="Ghi chú (không bắt buộc)"><Input.TextArea rows={3} disabled={preflightMutation.isPending} value={notes} onChange={event => setNotes(event.target.value)} /></Form.Item>
            <Form.Item><Checkbox checked={suitableForFlight} disabled={preflightMutation.isPending} onChange={event => setSuitableForFlight(event.target.checked)}>Phù hợp để bay</Checkbox></Form.Item>
          </Form>
          <p className="form-hint">* là điều kiện bắt buộc.</p>
          {preflightMutation.error ? <Alert type="error" showIcon message={missionError(preflightMutation.error)} /> : null}
          <Button type="primary" loading={preflightMutation.isPending} onClick={() => preflightMutation.mutate()}>Hoàn tất checklist</Button>
        </> : null}
    </StepSection> : null}
    {scheduled && !preflightDone ? <Alert className="workflow-notice" type="info" showIcon message="Hoàn tất checklist trước khi bay để mở bước &quot;Bắt đầu bay&quot;." /> : null}
    {preflightDone ? <StepSection title="Bắt đầu bay" status={scheduled ? 'active' : 'done'} summary="Đã bắt đầu bay.">
      <p className="form-hint">Chỉ bắt đầu được trong khung giờ đã lên lịch và lịch hẹn Owner đã xác nhận, sau khi checklist preflight đã hoàn tất với kết quả phù hợp để bay.</p>
      {startMutation.error ? <Alert type="error" showIcon message={missionError(startMutation.error)} /> : null}
      <Button type="primary" loading={startMutation.isPending} onClick={() => startMutation.mutate()}>Bắt đầu bay</Button>
    </StepSection> : null}
    {inFlight || postFlight || orthophotoEligible || canResetUpload ? <StepSection title="Kết thúc chuyến bay" status={inFlight ? 'active' : 'done'} summary="Đã kết thúc chuyến bay.">
      <p className="form-hint">Xác nhận chuyến bay đã kết thúc an toàn. Upload ảnh và dữ liệu bay được thực hiện ở bước riêng sau khi kết thúc.</p>
      {completeFlightMutation.error ? <Alert type="error" showIcon message={missionError(completeFlightMutation.error)} /> : null}
      <Button type="primary" loading={completeFlightMutation.isPending} onClick={() => completeFlightMutation.mutate()}>Kết thúc chuyến bay</Button>
    </StepSection> : null}
    {postFlight ? <StepSection title="Upload ảnh/video" status={status === 'FLIGHT_COMPLETED' || status === 'UPLOADING' || status === 'UPLOAD_FAILED' ? 'active' : 'done'} summary={mediaQuery.data ? `${mediaQuery.data.totalCount} file đã upload.` : undefined}>
      <p className="form-hint">Chọn ảnh/video từ drone, hoặc kéo-thả cả thư mục vào đây để lấy toàn bộ file bên trong.</p>
      <input ref={mediaInputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} disabled={uploadMutation.isPending}
        onChange={event => setSelectedFiles(Array.from(event.target.files ?? []))} />
      <div
        style={{ border: `1px dashed ${mediaDropActive ? 'var(--mint)' : 'var(--line, #d9d9d9)'}`, borderRadius: 6, minHeight: 96, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: mediaDropActive ? 'var(--mint-soft)' : undefined }}
        onDragOver={event => { event.preventDefault(); if (!uploadMutation.isPending) setMediaDropActive(true) }}
        onDragLeave={() => setMediaDropActive(false)}
        onDrop={event => {
          event.preventDefault()
          setMediaDropActive(false)
          if (uploadMutation.isPending) return
          void filesFromDrop(event.dataTransfer).then(setSelectedFiles)
        }}
      >
        <Space>
          <Button disabled={uploadMutation.isPending} onClick={() => mediaInputRef.current?.click()}>Chọn tệp</Button>
          <span className="form-hint">{selectedFiles.length ? `${selectedFiles.length} file đã chọn` : 'Chưa chọn tệp nào'}</span>
        </Space>
      </div>
      <div><Button type="primary" disabled={selectedFiles.length === 0} loading={uploadMutation.isPending} onClick={() => uploadMutation.mutate(selectedFiles)}>Tải lên{selectedFiles.length ? ` (${selectedFiles.length} file)` : ''}</Button></div>
      {uploadMutation.error ? <Alert type="error" showIcon message={missionError(uploadMutation.error)} /> : null}
      {uploadResults ? <Table<MediaUploadItemResult> size="small" rowKey="index" dataSource={uploadResults} pagination={false} columns={[
        { title: 'File', dataIndex: 'fileName' },
        { title: 'Kết quả', render: (_, item) => <Tag color={item.status === 'Completed' ? 'success' : item.status === 'Failed' ? 'error' : 'default'}>{mediaUploadStatusLabels[item.status] ?? item.status}</Tag> },
        { title: 'Chi tiết', render: (_, item) => item.media ? fileSizeLabel(item.media.fileSizeBytes) : item.errorMessage ?? '—' },
      ]} /> : null}
      <Divider />
      <div className="resource-panel-heading"><div><strong>Media đã upload</strong>{mediaQuery.data ? <span>{mediaQuery.data.totalCount} file</span> : null}</div><Button onClick={() => setShowAllMedia(value => !value)}>{showAllMedia ? 'Ẩn danh sách' : 'Xem toàn bộ'}</Button></div>
      {showAllMedia ? (mediaQuery.isError ? <CommonState type="error" description={missionError(mediaQuery.error)} retry={() => mediaQuery.refetch()} /> : <Table<MissionMedia> size="small" rowKey="mediaId" loading={mediaQuery.isPending} dataSource={mediaQuery.data?.items ?? []} pagination={false} locale={{ emptyText: 'Chưa có media nào.' }} columns={[
        { title: 'Loại', render: (_, media) => mediaTypeLabels[media.mediaType] ?? media.mediaType },
        { title: 'Vai trò', render: (_, media) => mediaRoleLabels[media.mediaRole] ?? media.mediaRole },
        { title: 'Kích thước', render: (_, media) => fileSizeLabel(media.fileSizeBytes) },
        { title: 'Tải lên lúc', render: (_, media) => dateTime(media.createdAt) },
        { title: 'Thao tác', render: (_, media) => <Button size="small" onClick={() => { void openMediaDownloadUrl(media.mediaId) }}>Xem / tải</Button> },
      ]} />) : null}
    </StepSection> : null}
    {telemetryEligible || orthophotoEligible ? <StepSection title="Decode & Import Telemetry" status={telemetryEligible ? 'active' : 'done'} summary={importResult ? `${importResult.pointCount} điểm đã import.` : undefined}>
      <p className="form-hint">Giải mã file log bay Blackbox (TXT/BBL), chọn (các) segment hợp lệ rồi import. Import thay toàn bộ dữ liệu telemetry hiện có của nhiệm vụ, không cộng dồn.</p>
      <input type="file" accept=".txt,.bbl,.csv" disabled={normalizeMutation.isPending} onChange={event => setLogFile(event.target.files?.[0] ?? null)} />
      <div><Button disabled={!logFile} loading={normalizeMutation.isPending} onClick={() => normalizeMutation.mutate()}>Giải mã (Decode)</Button></div>
      {normalizeMutation.error ? <Alert type="error" showIcon message={missionError(normalizeMutation.error)} /> : null}
      {normalized ? <>
        {normalized.warnings.length > 0 ? <Alert type="warning" showIcon message="Cảnh báo khi giải mã" description={normalized.warnings.join('; ')} /> : null}
        <Table<TelemetrySegment> size="small" rowKey="segmentIndex" dataSource={normalized.segments} pagination={false}
          rowSelection={{ selectedRowKeys: selectedSegmentIndexes, onChange: keys => setSelectedSegmentIndexes(keys as number[]), getCheckboxProps: segment => ({ disabled: !segment.fitsPointCountLimit }) }}
          columns={[
            { title: 'Segment', dataIndex: 'segmentIndex' },
            { title: 'Số điểm', render: (_, segment) => `${segment.pointCount} (gốc ${segment.sourcePointCount}, loại ${segment.rejectedPointCount})` },
            { title: 'Thời gian', render: (_, segment) => segment.firstRecordedAt ? `${dateTime(segment.firstRecordedAt)} – ${dateTime(segment.lastRecordedAt)}` : '—' },
            { title: 'Hợp lệ để import', render: (_, segment) => <Tag color={segment.fitsPointCountLimit ? 'success' : 'default'}>{segment.fitsPointCountLimit ? 'Đạt' : 'Không đạt (2–50.000 điểm)'}</Tag> },
          ]} />
        {importResult ? <Alert type="success" showIcon message={importResult.reusedOperation ? 'Telemetry đã được ghi nhận từ trước.' : 'Đã import telemetry.'} description={`${importResult.pointCount} điểm · phiên bản nhiệm vụ mới: v${importResult.missionVersion}.`} /> : null}
        {importMutation.error ? <Alert type="error" showIcon message={missionError(importMutation.error)} /> : null}
        <Button type="primary" disabled={selectedSegmentIndexes.length === 0} loading={importMutation.isPending} onClick={() => importMutation.mutate()}>Import telemetry đã chọn</Button>
      </> : null}
    </StepSection> : null}
    {uploading || orthophotoEligible ? <StepSection title="Hoàn tất upload" status={uploading ? 'active' : 'done'}>
      {!uploading ? <p className="form-hint">Đã hoàn tất upload.</p>
        : readinessQuery.isPending ? <CommonState type="loading" />
        : readinessQuery.isError ? <CommonState type="error" description={missionError(readinessQuery.error)} retry={() => readinessQuery.refetch()} />
        : readinessQuery.data ? <>
          <dl className="detail-list">
            <div><dt>Ảnh gốc</dt><dd>{readinessQuery.data.rawImageCount}</dd></div>
            <div><dt>Video gốc</dt><dd>{readinessQuery.data.rawVideoCount}</dd></div>
            <div><dt>Điểm telemetry</dt><dd>{readinessQuery.data.telemetryPointCount}</dd></div>
            <div><dt>Phiên upload đang mở</dt><dd>{readinessQuery.data.hasActiveUploadSessions ? 'Có' : 'Không'}</dd></div>
          </dl>
          {readinessQuery.data.blockers.length > 0 ? <Alert type="warning" showIcon message="Chưa thể hoàn tất upload" description={<ul>{readinessQuery.data.blockers.map(code => <li key={code}>{uploadBlockerLabel(code)}</li>)}</ul>} /> : null}
          {finalizeMutation.error ? <Alert type="error" showIcon message={missionError(finalizeMutation.error)} /> : null}
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { void readinessQuery.refetch() }}>Kiểm tra lại</Button>
            <Button type="primary" disabled={!readinessQuery.data.canFinalize || readinessQuery.data.blockers.length > 0} loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()}>Hoàn tất upload</Button>
          </Space>
        </> : null}
    </StepSection> : null}
    {canResetUpload ? <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>Reset upload</strong><span>Xóa toàn bộ ảnh/video đã tải lên và đưa nhiệm vụ về lại "Đang tải lên" để nạp lại từ đầu. Dùng khi lỡ upload nhầm ảnh khiến Geotag/ghép bản đồ lỗi. Không thể hoàn tác.</span></div></div>
      <Button danger onClick={() => setAction(resetUploadAction())}>Reset upload</Button>
    </section> : null}
    {orthophotoEligible ? <StepSection title="Ghép bản đồ trực giao" status={orthophotoStatusQuery.data?.status === 'COMPLETED' ? 'done' : 'active'} summary={orthophotoStatusQuery.data?.previewUrl ? 'Đã ghép xong.' : undefined}>
      {canStartOrthophoto ? <>
        <p className="form-hint">Gửi toàn bộ ảnh gốc đã upload sang Metashape (mặc định) hoặc OpenDroneMap để ghép thành bản đồ trực giao.</p>
        <Space direction="vertical">
          <Radio.Group disabled={processMutation.isPending} value={engine} onChange={event => setEngine(event.target.value)} options={[{ value: 'metashape', label: 'Metashape' }, { value: 'odm', label: 'OpenDroneMap (ODM)' }]} />
          {processMutation.error ? <Alert type="error" showIcon message={missionError(processMutation.error)} /> : null}
          <Button type="primary" loading={processMutation.isPending} onClick={() => processMutation.mutate()}>Ghép bản đồ</Button>
        </Space>
      </> : null}
      {orthophotoProcessing || orthophotoStatusQuery.data ? <>
        <Divider />
        {orthophotoStatusQuery.isPending ? <CommonState type="loading" />
          : orthophotoStatusQuery.isError ? <CommonState type="error" description={missionError(orthophotoStatusQuery.error)} retry={() => orthophotoStatusQuery.refetch()} />
          : orthophotoStatusQuery.data ? <>
            <Space><Tag color={orthophotoStatusQuery.data.status === 'COMPLETED' ? 'success' : orthophotoStatusQuery.data.status === 'ERROR' || orthophotoStatusQuery.data.status === 'FAILED' ? 'error' : 'processing'}>{orthophotoStatusLabel(orthophotoStatusQuery.data.status)}</Tag>
              {!isOrthophotoTerminal(orthophotoStatusQuery.data.status) ? <span className="form-hint">{orthophotoStatusQuery.data.progress}%{orthophotoStatusQuery.data.stage ? ` · ${orthophotoStatusQuery.data.stage}` : ''}</span> : null}
              <Button size="small" icon={<ReloadOutlined />} onClick={() => { void orthophotoStatusQuery.refetch() }}>Kiểm tra ngay</Button>
            </Space>
            {orthophotoStatusQuery.data.errorMessage ? <Alert type="error" showIcon message={orthophotoStatusQuery.data.errorMessage} /> : null}
            {orthophotoStatusQuery.data.status === 'COMPLETED' ? <>
              {orthophotoStatusQuery.data.previewUrl && orthophotoStatusQuery.data.bounds
                // Có bounds → bản đồ tương tác ở mục "Vẽ ranh giới vườn" bên dưới đã hiển thị chính ảnh này rồi, nên không hiện lại ảnh ở đây nữa (tránh lặp).
                ? <p className="form-hint">Xem ảnh đầy đủ & chọn ranh giới ở mục "Vẽ ranh giới vườn + cắt tiles" bên dưới.</p>
                : orthophotoStatusQuery.data.previewUrl ? <p><img src={orthophotoStatusQuery.data.previewUrl} alt="Bản đồ trực giao" style={{ maxWidth: '100%' }} /></p> : null}
              {orthophotoStatusQuery.data.tifUrl ? <div><Button onClick={() => window.open(orthophotoStatusQuery.data!.tifUrl!, '_blank', 'noopener,noreferrer')}>Tải GeoTIFF</Button></div> : null}
              {!orthophotoStatusQuery.data.bounds ? <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Chưa thể vẽ ranh giới" description="Ảnh đã ghép xong nhưng dịch vụ xử lý ảnh không trả về tọa độ góc bản đồ (bounds) — thường do ảnh gốc thiếu dữ liệu GPS/telemetry hợp lệ để định vị. Không thể vẽ ranh giới chính xác nếu thiếu tọa độ thật. Kiểm tra lại telemetry đã import (nhiệm vụ 9), hoặc liên hệ đội BE kiểm tra kết quả xử lý ảnh của nhiệm vụ này." /> : null}
            </> : null}
          </> : null}
      </> : null}
    </StepSection> : null}
    {!isPlantHealth && orthophotoStatusQuery.data?.status === 'COMPLETED' && orthophotoStatusQuery.data.previewUrl && orthophotoStatusQuery.data.bounds ? <StepSection title="Vẽ ranh giới vườn + cắt tiles" status={sliceResult ? 'done' : 'active'} summary={sliceResult ? `${sliceResult.totalTiles} tile đã cắt.` : undefined}>
      <p className="form-hint">Click lên ảnh để thêm điểm ranh giới. Từ 3 điểm trở lên tự khép kín. Khóa viền trước khi cắt tiles.</p>
      <BoundaryTilingPanel token={token} farmId={farmId} missionId={missionId} previewUrl={orthophotoStatusQuery.data.previewUrl} bounds={orthophotoStatusQuery.data.bounds}
        onSliced={(result, polygon) => { setSliceResult(result); setBoundaryPolygon(polygon) }} />
      {sliceResult ? <p className="form-hint">Đã sẵn sàng {sliceResult.totalTiles} tile để nhận diện cây ở bước tiếp theo.</p> : null}
    </StepSection> : null}
    {!isPlantHealth && sliceResult && boundaryPolygon && orthophotoStatusQuery.data?.previewUrl && orthophotoStatusQuery.data.bounds ? <StepSection title="Nhận diện cây YOLO & Publish GPS" status={publishResult ? 'done' : 'active'} summary={publishResult ? `Đã gửi yêu cầu publish (${publishResult.status}).` : yoloResult ? `${yoloResult.totalUniqueTrees} cây đã nhận diện.` : undefined}>
      <p className="form-hint">Chạy nhận diện trong phạm vi ranh giới đã khóa. Có thể chọn lại cây neo (Hàng 1 - Cột 1) từ kết quả lần chạy trước rồi chạy lại để đánh số đúng theo thực địa.</p>
      <YoloDetectionPanel token={token} farmId={farmId} missionId={missionId} previewUrl={orthophotoStatusQuery.data.previewUrl} bounds={orthophotoStatusQuery.data.bounds}
        boundaryPolygon={boundaryPolygon} onDetected={setYoloResult} />
      {yoloResult ? <>
        <p className="form-hint">Kết quả gần nhất: {yoloResult.totalUniqueTrees} cây, {yoloResult.totalMissingTrees} vị trí thiếu — dùng ở bước lưu nháp GPS cây tiếp theo.</p>
        <Button onClick={downloadTreesCsv}>Tải CSV kết quả cây</Button>
        <Divider />
        <div className="resource-panel-heading"><div><strong>Đưa vào hệ thống chính thức</strong><span>Lưu nháp lại danh sách cây ở trên rồi gửi yêu cầu publish cho đơn khảo sát. Chỉ áp dụng cho nhiệm vụ Khảo sát bản đồ nền.</span></div></div>
        <Form layout="inline">
          <Form.Item label="Khoảng cách hàng (m)"><InputNumber min={0.1} step={0.1} value={rowSpacingM} disabled={publishPlantGpsMutation.isPending} onChange={value => setRowSpacingM(value ?? 3)} /></Form.Item>
          <Form.Item label="Khoảng cách cây (m)"><InputNumber min={0.1} step={0.1} value={plantSpacingM} disabled={publishPlantGpsMutation.isPending} onChange={value => setPlantSpacingM(value ?? 2.5)} /></Form.Item>
          <Form.Item label="Góc lưới (độ)"><InputNumber step={1} value={gridBearingDeg} disabled={publishPlantGpsMutation.isPending} onChange={value => setGridBearingDeg(value ?? 0)} /></Form.Item>
        </Form>
        {!isBaselineMapping ? <Alert type="warning" showIcon message="Nhiệm vụ này không phải Khảo sát bản đồ nền — yêu cầu sẽ bị từ chối." /> : null}
        {isBaselineMapping && farmBoundaryMissing ? <Alert type="info" showIcon message="Nông trại này chưa có ranh giới nào." description="Ranh giới đã vẽ ở bước trên sẽ được dùng để set luôn ranh giới chính thức của nông trại khi bấm nút bên dưới." /> : null}
        {publishPlantGpsMutation.error ? <Alert type="error" showIcon message={publishPlantGpsError(publishPlantGpsMutation.error)} /> : null}
        {publishResult ? <Alert type="success" showIcon message={`Đã gửi yêu cầu (${publishResult.status})`} description={`messageId: ${publishResult.messageId} — hệ thống xử lý không đồng bộ, kiểm tra lại sau ít phút.`} /> : null}
        {boundaryUpdateResult?.boundaryId ? <Alert type="success" showIcon message="Đã set ranh giới nông trại." description={`boundaryId: ${boundaryUpdateResult.boundaryId} · phiên bản ${boundaryUpdateResult.boundaryVersionNumber} · ${boundaryUpdateResult.boundaryPointCount} điểm.`} /> : null}
        <Button type="primary" loading={publishPlantGpsMutation.isPending} onClick={() => publishPlantGpsMutation.mutate()}>Đưa vào hệ thống chính thức</Button>
      </> : null}
    </StepSection> : null}
    {!isPlantHealth ? <section className="resource-panel">
      <div className="resource-panel-heading"><div><strong>GPS cây (lưu nháp)</strong><span>Bước lưu nháp trước khi đưa vào hệ thống chính thức (xem mục Publish ở màn kết quả nhận diện cây). Lưu sẽ thay toàn bộ danh sách hiện có, không cộng dồn.</span></div>
        <Button onClick={() => setPastingPlantGps(true)}>Dán danh sách cây</Button>
      </div>
      {plantGpsQuery.isError && isNotFound(plantGpsQuery.error) ? <CommonState type="empty" title="Nhiệm vụ này không áp dụng GPS cây" />
        : plantGpsQuery.isError ? <CommonState type="error" description={missionError(plantGpsQuery.error)} retry={() => plantGpsQuery.refetch()} />
        : <Table<PlantGpsTree> size="small" rowKey="treeId" loading={plantGpsQuery.isPending} dataSource={plantGpsQuery.data?.trees ?? []} pagination={false} locale={{ emptyText: 'Chưa có cây nào được lưu.' }} columns={[
          { title: 'Mã cây', dataIndex: 'treeId' },
          { title: 'Hàng · Cột', render: (_, tree) => `${tree.row} · ${tree.col}` },
          { title: 'Tọa độ', render: (_, tree) => `${tree.latitude.toFixed(6)}, ${tree.longitude.toFixed(6)}` },
          { title: 'Độ tin cậy', render: (_, tree) => tree.confidence.toFixed(2) },
          { title: 'Trạng thái', render: (_, tree) => <Tag color={tree.status === 'DETECTED' ? 'success' : 'default'}>{tree.status === 'DETECTED' ? 'Phát hiện' : 'Thiếu'}</Tag> },
          { title: 'Nguồn', dataIndex: 'source' },
        ]} />}
    </section> : null}
    {canDetectDiseases && status !== 'COMPLETED' ? <PlantHealthProcessingPanel key={missionId} token={token} farmId={farmId} missionId={missionId} missionCode={mission.missionCode} surveyOrderId={latest?.surveyOrderId} boundary={farmContextQuery.data?.approvedBoundary?.geometry ?? null} disabled={farmContextQuery.isPending || farmContextQuery.isFetching || farmContextQuery.isError} /> : null}
    {draft || scheduled || inFlight || flightFailed ? <section className="resource-panel">
      <h2>Thao tác khác</h2>
      <Space wrap>
        {draft || scheduled ? <Button danger onClick={() => setAction(cancelAction())}>Hủy nhiệm vụ</Button> : null}
        {scheduled || flightFailed ? <Button onClick={() => setRescheduling(true)}>Lên lịch lại</Button> : null}
        {inFlight ? <Button danger onClick={() => setAction(failFlightAction())}>Báo lỗi chuyến bay</Button> : null}
      </Space>
    </section> : null}
    {rescheduling && version !== undefined ? <RescheduleMissionModal token={token} farmId={farmId} missionId={missionId} currentVersion={version} currentDroneId={mission.droneId}
      close={() => setRescheduling(false)} onRescheduled={async result => { await refreshAfter(result); void message.success('Đã lên lịch lại nhiệm vụ bay.') }} /> : null}
    {!isPlantHealth && pastingPlantGps ? <PlantGpsPasteModal token={token} farmId={farmId} missionId={missionId} close={() => setPastingPlantGps(false)}
      onSaved={async result => { await client.invalidateQueries({ queryKey: ['mission-plant-gps', farmId, missionId] }); void message.success(`Đã lưu ${result.savedCount} cây.`) }} /> : null}
    {action ? <ActionModal action={action} close={() => setAction(null)} /> : null}
  </>
}
