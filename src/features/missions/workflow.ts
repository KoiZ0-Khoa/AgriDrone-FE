import type { Values } from '../../management/actions'

export const droneStatusLabels: Record<string, string> = {
  AVAILABLE: 'Sẵn sàng', IN_MISSION: 'Đang bay', MAINTENANCE: 'Bảo trì', INACTIVE: 'Ngừng hoạt động', RETIRED: 'Đã loại biên',
}
export const missionStatusLabels: Record<string, string> = {
  DRAFT: 'Bản nháp', SCHEDULED: 'Đã lên lịch', IN_FLIGHT: 'Đang bay', FLIGHT_COMPLETED: 'Đã hoàn tất chuyến bay',
  UPLOADING: 'Đang tải dữ liệu lên', READY_FOR_PROCESSING: 'Sẵn sàng xử lý', PROCESSING: 'Đang xử lý',
  AWAITING_REVIEW: 'Chờ duyệt kết quả', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  FLIGHT_FAILED: 'Chuyến bay thất bại', UPLOAD_FAILED: 'Tải lên thất bại', PROCESSING_FAILED: 'Xử lý thất bại',
}
export const missionPurposeLabels: Record<string, string> = {
  BASELINE_MAPPING: 'Bản đồ nền', PLANT_HEALTH: 'Sức khỏe cây', HARVEST_READINESS: 'Độ sẵn sàng thu hoạch',
}
export const incidentTypeOptions = [
  { value: 'SIGNAL_LOSS', label: 'Mất tín hiệu điều khiển' },
  { value: 'LOW_BATTERY', label: 'Hết pin' },
  { value: 'INTERRUPTION', label: 'Bị gián đoạn' },
  { value: 'FLIGHT_FAILURE', label: 'Lỗi bay' },
]
export const recoveryDecisionOptions = [
  { value: 'ABORT', label: 'Dừng, không bay lại' },
  { value: 'RESCHEDULE_REQUIRED', label: 'Cần đổi lịch bay lại' },
]
export const droneStatusOptions = Object.entries(droneStatusLabels).map(([value, label]) => ({ value, label }))
export const processingStatusLabels: Record<string, string> = {
  NOT_UPLOADED: 'Chưa upload', UPLOADED: 'Đã upload', QUEUED: 'Chờ xử lý', PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất', FAILED: 'Lỗi xử lý', REVIEW_REQUIRED: 'Cần duyệt kết quả',
}

// Converts an enum string of either casing to canonical UPPER_SNAKE_CASE. Idempotent: already
// UPPER_SNAKE_CASE input passes through unchanged. See the PreparedMission comment in types.ts
// for why this is needed.
export function normalizeEnumCode(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
}

// Keep the key for a retry of the same payload; edited submissions are separate operations.
export function operationFor(previous: { payload: string; key: string } | null, body: unknown) {
  const payload = JSON.stringify(body)
  return previous?.payload === payload ? previous : { payload, key: crypto.randomUUID() }
}

export function parseSpecifications(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error('Thông số kỹ thuật phải là JSON hợp lệ, ví dụ { "capabilities": ["BASELINE_MAPPING"] }.')
  }
}

export function optionalDecimal(raw: string, label: string, min = 0): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  const value = Number(normalized)
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(value) || value < min) {
    throw new Error(`${label} không hợp lệ.`)
  }
  return value
}

export function droneBody(v: Values) {
  return {
    name: (v.name ?? '').trim(),
    model: (v.model ?? '').trim() || null,
    manufacturer: (v.manufacturer ?? '').trim() || null,
    specifications: parseSpecifications(v.specifications ?? ''),
    serialNumber: (v.serialNumber ?? '').trim() || null,
    registrationNumber: (v.registrationNumber ?? '').trim() || null,
    registrationDate: (v.registrationDate ?? '').trim() || null,
    registrationExpiryDate: (v.registrationExpiryDate ?? '').trim() || null,
    weightKg: optionalDecimal(v.weightKg ?? '', 'Trọng lượng'),
    notes: (v.notes ?? '').trim() || null,
  }
}
