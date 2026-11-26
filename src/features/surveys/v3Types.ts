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
  startedAt: string | null
  endedAt: string | null
  history: V3CaptureAttemptHistory[]
}
