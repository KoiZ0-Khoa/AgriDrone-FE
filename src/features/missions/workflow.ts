import type { Values } from '../../management/actions'

export const droneStatusLabels: Record<string, string> = {
  Available: 'Sẵn sàng', InMission: 'Đang bay', Maintenance: 'Bảo trì', Inactive: 'Ngừng hoạt động', Retired: 'Đã loại biên',
}
export const missionStatusLabels: Record<string, string> = {
  Draft: 'Bản nháp', Scheduled: 'Đã lên lịch', InFlight: 'Đang bay', FlightCompleted: 'Đã hoàn tất chuyến bay',
  Uploading: 'Đang tải dữ liệu lên', ReadyForProcessing: 'Sẵn sàng xử lý', Processing: 'Đang xử lý',
  AwaitingReview: 'Chờ duyệt kết quả', Completed: 'Hoàn tất', Cancelled: 'Đã hủy',
  FlightFailed: 'Chuyến bay thất bại', UploadFailed: 'Tải lên thất bại', ProcessingFailed: 'Xử lý thất bại',
}
export const missionPurposeLabels: Record<string, string> = {
  BaselineMapping: 'Bản đồ nền', PlantHealth: 'Sức khỏe cây', HarvestReadiness: 'Độ sẵn sàng thu hoạch',
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
