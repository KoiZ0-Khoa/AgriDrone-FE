import type { CaptureAttemptStatus, V3CaptureAttempt, V3OrderStatus, V3ServiceKind } from './v3Types'

// Luồng V3 (ContractScope.V3). Không có import lúc chạy để các test biên dịch từng file vẫn nạp được trực tiếp.

// BE SurveyOrderStatus (JSON SCREAMING_SNAKE_CASE): 10 trạng thái V3 + 2 trạng thái kết thúc dùng chung.
export const v3OrderStatusLabels: Record<V3OrderStatus, string> = {
  AWAITING_APPOINTMENT: 'Chờ chốt lịch bay',
  AWAITING_DEPOSIT: 'Chờ thanh toán cọc',
  READY_FOR_CAPTURE: 'Sẵn sàng bay',
  CAPTURING: 'Đang bay',
  AWAITING_CAPTURE_UPLOAD: 'Chờ tải dữ liệu bay',
  AWAITING_INPUT_REVIEW: 'Chờ duyệt dữ liệu đầu vào',
  AWAITING_PROCESSING: 'Chờ xử lý dữ liệu',
  PROCESSING: 'Đang xử lý và duyệt kết quả',
  AWAITING_REFLIGHT_DECISION: 'Chờ quyết định bay lại',
  AWAITING_SETTLEMENT: 'Chờ thanh toán phần còn lại',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}
export const v3OrderStatuses = Object.keys(v3OrderStatusLabels) as V3OrderStatus[]

// Bộ lọc của Owner bind thẳng enum SurveyOrderStatus của BE, nhận tên thành viên enum (PascalCase), khác JSON trả về.
export const v3OrderStatusEnumName = (status: V3OrderStatus) =>
  status.toLowerCase().split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')

// Hướng dẫn từng bước cho Manager, theo trạng thái đơn.
export const v3OrderStageNotices: Partial<Record<V3OrderStatus, { type: 'info' | 'warning'; title: string; description: string }>> = {
  AWAITING_APPOINTMENT: { type: 'info', title: 'Chờ chốt lịch bay', description: 'Đề xuất ngày bay. Owner xác nhận lịch trước khi trả cọc.' },
  AWAITING_DEPOSIT: { type: 'info', title: 'Chờ Owner thanh toán cọc', description: 'Sau khi khoản cọc được xác nhận, đơn chuyển sang bước chuẩn bị lần bay.' },
  READY_FOR_CAPTURE: { type: 'info', title: 'Sẵn sàng chuẩn bị lần bay', description: 'Chọn drone để chuẩn bị lần bay, hoàn tất checklist trước bay rồi bắt đầu bay trong ngày hẹn.' },
  CAPTURING: { type: 'info', title: 'Đang bay', description: 'Kết thúc chuyến bay khi hoàn tất, hoặc báo lỗi nếu có sự cố.' },
  AWAITING_CAPTURE_UPLOAD: { type: 'info', title: 'Chờ tải dữ liệu bay', description: 'Tải ảnh và log bay của lần bay này lên, rồi chốt bộ dữ liệu đầu vào.' },
  AWAITING_INPUT_REVIEW: { type: 'info', title: 'Chờ duyệt dữ liệu đầu vào', description: 'Kiểm tra bộ dữ liệu đã chốt trước khi đưa vào xử lý.' },
  AWAITING_PROCESSING: { type: 'info', title: 'Chờ xử lý dữ liệu', description: 'Dữ liệu đầu vào đã được duyệt. Chạy xử lý ảnh để tạo bản đồ và số trụ.' },
  PROCESSING: { type: 'info', title: 'Đang xử lý và duyệt kết quả', description: 'Hoàn tất xử lý, duyệt kết quả rồi chốt kết quả nội bộ và hóa đơn.' },
  AWAITING_REFLIGHT_DECISION: { type: 'warning', title: 'Chuyến bay lỗi, chờ quyết định bay lại', description: 'Tạo lần bay lại với drone và ngày mới, hoặc chuyển sang hủy đơn.' },
  AWAITING_SETTLEMENT: { type: 'info', title: 'Chờ Owner thanh toán phần còn lại', description: 'Hóa đơn đã chốt. Kết quả chỉ được phát hành cho Owner sau khi đủ tiền.' },
}

// BE CaptureAttemptStatus. Nhóm "đang hoạt động" khớp filter của index uq_capture_attempts_active_order: mỗi đơn tối đa một lần.
export const captureAttemptStatusLabels: Record<CaptureAttemptStatus, string> = {
  PLANNED: 'Đã chuẩn bị',
  PREFLIGHT_READY: 'Đã kiểm tra trước bay',
  IN_FLIGHT: 'Đang bay',
  AWAITING_UPLOAD: 'Chờ tải dữ liệu',
  UPLOADED: 'Đã tải dữ liệu',
  PROCESSING: 'Đang xử lý',
  ACCEPTED: 'Đã chấp nhận',
  REFLIGHT_REQUIRED: 'Cần bay lại',
  FLIGHT_FAILED: 'Bay lỗi',
  CANCELLED: 'Đã hủy',
}
export const activeCaptureAttemptStatuses: readonly CaptureAttemptStatus[] = ['PLANNED', 'PREFLIGHT_READY', 'IN_FLIGHT', 'AWAITING_UPLOAD', 'UPLOADED', 'PROCESSING']
export const isActiveCaptureAttempt = (attempt: Pick<V3CaptureAttempt, 'status'>) => activeCaptureAttemptStatuses.includes(attempt.status)
// Lần bay đang hoạt động (nếu có); BE bảo đảm không quá một, nhưng vẫn lấy lần mới nhất cho chắc.
export function activeCaptureAttempt(attempts: readonly V3CaptureAttempt[]): V3CaptureAttempt | null {
  return attempts.filter(isActiveCaptureAttempt).sort((a, b) => b.attemptIndex - a.attemptIndex)[0] ?? null
}
export const latestCaptureAttempt = (attempts: readonly V3CaptureAttempt[]) =>
  [...attempts].sort((a, b) => b.attemptIndex - a.attemptIndex)[0] ?? null

// Dịch vụ V3: MAP = chỉ bản đồ và số trụ; COMBO = bản đồ + sàng lọc bệnh. Lấy từ surveyServiceCode của đơn.
export function v3ServiceKind(serviceCode: string | null | undefined): V3ServiceKind | null {
  const code = serviceCode?.trim().toUpperCase()
  return code === 'MAP' || code === 'COMBO' ? code : null
}
export const v3ServiceLabels: Record<V3ServiceKind, string> = { MAP: 'Bản đồ và đếm trụ', COMBO: 'Bản đồ và sàng lọc bệnh' }
export const screensDisease = (kind: V3ServiceKind | null) => kind === 'COMBO'

// G6 — lịch sử chuyến bay. Tên thao tác là hằng số CaptureAttemptAction của BE (PascalCase).
export const captureAttemptActionLabels: Record<string, string> = {
  CreateInitial: 'Chuẩn bị lần bay',
  CreateSuccessor: 'Tạo lần bay lại',
  MarkPreflightReady: 'Hoàn tất kiểm tra trước bay',
  InvalidatePreflight: 'Kiểm tra trước bay hết hiệu lực',
  StartFlight: 'Bắt đầu bay',
  RecordFlightCompleted: 'Kết thúc chuyến bay',
  RecordFlightFailed: 'Báo lỗi chuyến bay',
  MarkUploaded: 'Chốt bộ dữ liệu',
  ReopenUpload: 'Mở lại bộ dữ liệu đầu vào',
  StartProcessing: 'Bắt đầu xử lý',
  AcceptProcessing: 'Chấp nhận kết quả',
  RequireReflight: 'Yêu cầu bay lại',
  Cancel: 'Hủy lần bay',
}
// Lần bay có thể làm "cha" cho lần bay lại: BE (CaptureAttempt.CreateSuccessor) chỉ nhận FLIGHT_FAILED hoặc REFLIGHT_REQUIRED.
const reflightParentStatuses: readonly CaptureAttemptStatus[] = ['FLIGHT_FAILED', 'REFLIGHT_REQUIRED']
// Lần bay để bay lại: lần mới nhất của đơn, đang ở trạng thái cho phép, và đơn không còn lần bay nào đang hoạt động.
export function reflightParentAttempt(attempts: readonly V3CaptureAttempt[]): V3CaptureAttempt | null {
  if (activeCaptureAttempt(attempts)) return null
  const latest = latestCaptureAttempt(attempts)
  return latest && reflightParentStatuses.includes(latest.status) && Number.isSafeInteger(latest.version) && latest.version > 0 ? latest : null
}
export const canCreateQualityReflight = (orderStatus: string, attempts: readonly V3CaptureAttempt[]) =>
  orderStatus === 'AWAITING_REFLIGHT_DECISION' && reflightParentAttempt(attempts) !== null

// Drone cho lần bay lại phải có đủ khả năng của dịch vụ đã chốt (coordinator kiểm MapsPoles → BASELINE_MAPPING,
// ScreensDisease → PLANT_HEALTH). MAP cần bản đồ; COMBO cần cả bản đồ lẫn sàng lọc bệnh.
export function droneSupportsService(capabilities: readonly string[] | null | undefined, kind: V3ServiceKind | null) {
  if (!kind) return false
  const values = new Set((capabilities ?? []).map(value => value.toUpperCase()))
  return values.has('BASELINE_MAPPING') && (kind === 'MAP' || values.has('PLANT_HEALTH'))
}

// Khóa chống gửi trùng cho thao tác ghi của coordinator V3: cùng nội dung thì giữ nguyên operationId và payloadFingerprint
// (BE trả replay), nội dung đổi thì tạo khóa mới. Fingerprint = SHA-256 hex của JSON gửi đi (64 ký tự, BE cho tối đa 128).
export type V3Operation = { payload: string; operationId: string; payloadFingerprint: string }
export async function v3OperationFor(previous: V3Operation | null, body: unknown): Promise<V3Operation> {
  const payload = JSON.stringify(body)
  if (previous?.payload === payload) return previous
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  const payloadFingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return { payload, operationId: crypto.randomUUID(), payloadFingerprint }
}

// Mã lỗi V3. Coordinator trả 409 với mã chữ hoa ở `title` (client.ts đọc thành ApiError.code); các route V3 khác trả `Module.Code`.
export const v3ErrorMessages: Record<string, string> = {
  // Chuẩn bị lần bay
  COMMERCIAL_NOT_READY: 'Đơn chưa có lịch bay đã xác nhận hoặc chưa đủ tiền cọc. Kiểm tra lịch hẹn và thanh toán cọc.',
  COMMERCIAL_SNAPSHOT_MISSING: 'Đơn thiếu thông tin giá và chính sách đã chốt lúc duyệt. Liên hệ quản trị hệ thống.',
  ACTIVE_ATTEMPT_EXISTS: 'Đơn đang có một lần bay chưa kết thúc. Tải lại để tiếp tục lần bay đó.',
  ORDER_NOT_READY: 'Đơn chưa ở bước cho phép thao tác này. Tải lại để kiểm tra trạng thái.',
  DRONE_REQUIRED: 'Chọn drone cho lần bay.',
  DRONE_NOT_READY: 'Drone đã chọn không hoạt động được trong khung giờ hẹn (đang bảo trì, hết hạn đăng ký hoặc trùng lịch). Chọn drone khác.',
  DRONE_CAPABILITY_MISMATCH: 'Drone đã chọn không đủ khả năng cho dịch vụ của đơn (bản đồ hoặc sàng lọc bệnh). Chọn drone khác.',
  FOLLOW_UP_BASELINE_NOT_PINNED: 'Đơn khảo sát tiếp nối chưa gắn với bản đồ nền đã phát hành. Liên hệ quản trị hệ thống.',
  CAPTURE_PREPARE_CONFLICT: 'Không thể chuẩn bị lần bay do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  // Bay
  CAPTURE_GATE_CLOSED: 'Ngoài khung giờ hẹn hoặc khoản cọc không còn hợp lệ. Kiểm tra lịch hẹn và thanh toán.',
  PREFLIGHT_OR_DRONE_NOT_READY: 'Cần hoàn tất checklist trước bay với kết quả phù hợp, và drone phải còn hoạt động.',
  CAPTURE_START_CONFLICT: 'Không thể bắt đầu bay do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  CAPTURE_END_CONFLICT: 'Không thể kết thúc chuyến bay do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  CAPTURE_FAILURE_CONFLICT: 'Không thể ghi nhận chuyến bay lỗi do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  FUTURE_FLIGHT_EVIDENCE: 'Thời điểm kết thúc hoặc gặp lỗi không được ở tương lai.',
  CAPTURE_IN_FLIGHT: 'Lần bay đang diễn ra. Kết thúc chuyến bay an toàn trước khi hủy đơn.',
  CAPTURE_GRAPH_NOT_FOUND: 'Không tìm thấy lần bay hoặc nhiệm vụ gắn với đơn này. Tải lại để kiểm tra.',
  CAPTURE_VERSION_CONFLICT: 'Lần bay hoặc đơn vừa được cập nhật. Tải lại và thử lại.',
  // Dữ liệu đầu vào
  CAPTURE_UPLOAD_VERSION_CONFLICT: 'Dữ liệu tải lên vừa thay đổi. Tải lại và thử lại.',
  CAPTURE_MEDIA_INCOMPLETE: 'Bộ dữ liệu chưa đầy đủ: còn ảnh chưa tải xong hoặc thiếu mã kiểm tra SHA-256.',
  CAPTURE_MEDIA_OBJECT_MISMATCH: 'Có tệp trên kho lưu trữ không khớp dung lượng hoặc mã kiểm tra đã ghi. Tải lại tệp đó.',
  CAPTURE_MANIFEST_CONFLICT: 'Bộ dữ liệu đầu vào đã được chốt với nội dung khác. Tải lại để kiểm tra.',
  CAPTURE_MANIFEST_STATE_CONFLICT: 'Bộ dữ liệu đầu vào không còn ở trạng thái cho phép thao tác này. Tải lại để kiểm tra.',
  CAPTURE_TELEMETRY_REQUIRED: 'Cần nhập telemetry Blackbox hợp lệ trong thời gian chuyến bay trước khi chốt.',
  CAPTURE_TELEMETRY_NOT_FROZEN: 'Bộ dữ liệu đang chờ duyệt chưa có telemetry hợp lệ. Mở lại, nhập telemetry và chốt lại.',
  CAPTURE_PROCESSING_JOB_MISMATCH: 'Mã xử lý không khớp với bộ dữ liệu đã chốt. Tải lại để kiểm tra.',
  CAPTURE_MANIFEST_REOPEN_CONFLICT: 'Không thể mở lại bộ dữ liệu. Tải lại để kiểm tra trạng thái.',
  CAPTURE_MISSION_STATE_CONFLICT: 'Nhiệm vụ đã qua bước cho phép mở lại bộ dữ liệu.',
  CAPTURE_JOB_STATE_CONFLICT: 'Job xử lý đã chuyển bước. Tải lại để kiểm tra trạng thái.',
  CAPTURE_INPUT_CONFLICT: 'Không thể duyệt dữ liệu đầu vào do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  INPUT_VERSION_CONFLICT: 'Bộ dữ liệu đầu vào hoặc lần bay đã thay đổi. Tải lại và thử lại.',
  INPUT_APPROVAL_NOT_FOUND: 'Bằng chứng duyệt dữ liệu đầu vào không thuộc đơn này.',
  // Lịch hẹn, vắng mặt, bay lại
  APPOINTMENT_VERSION_CONFLICT: 'Lịch hẹn vừa được cập nhật. Tải lại và thử lại.',
  APPOINTMENT_WINDOW_INVALID: 'Cần chọn khung giờ hẹn hợp lệ trong tương lai.',
  NO_SHOW_TIME_INVALID: 'Thời điểm báo vắng mặt không hợp lệ so với lịch hẹn.',
  NO_SHOW_CONFLICT: 'Không thể ghi nhận vắng mặt do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  DEPOSIT_NOT_SATISFIED: 'Khoản cọc ban đầu không còn đủ để bay lại. Kiểm tra thanh toán của đơn.',
  REFLIGHT_VERSION_CONFLICT: 'Lần bay trước hoặc đơn vừa được cập nhật. Tải lại và thử lại.',
  REFLIGHT_CONFLICT: 'Không thể tạo lần bay lại do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  // Hủy đơn, tiền
  ORDER_NOT_FOUND: 'Không tìm thấy đơn khảo sát.',
  OWNER_FORBIDDEN: 'Chỉ chủ đơn vị đang hoạt động mới được hủy đơn trước khi bay.',
  ADMIN_DECISION_REQUIRED: 'Đơn đã bay nên cần System Admin quyết định hủy dựa trên bằng chứng.',
  CANCELLATION_VERSION_CONFLICT: 'Đơn đã kết thúc hoặc vừa được cập nhật. Tải lại và kiểm tra.',
  CANCELLATION_CONFLICT: 'Không thể hủy đơn do dữ liệu vừa thay đổi. Tải lại và thử lại.',
  PINNED_POLICY_NOT_FOUND: 'Không tìm thấy chính sách hủy đã chốt cho đơn. Liên hệ quản trị hệ thống.',
  INVALID_RETENTION_AMOUNT: 'Số tiền giữ lại phải là số VND nguyên, không âm.',
  'Cancellation.RetentionExceedsAllowedCap': 'Số tiền giữ lại vượt mức cho phép của chính sách hủy.',
  REFUND_RECONCILIATION_HOLD: 'Tiền của đơn đang chờ System Admin đối soát nên chưa thể tiếp tục.',
  // Chung
  MANAGER_FORBIDDEN: 'Bạn không còn là Manager được phân công cho đơn này.',
  OPERATION_CONFLICT: 'Mã gửi này đã được dùng với nội dung khác. Tải lại và thử lại.',
  'CaptureAttempts.ManagerForbidden': 'Bạn không còn là Manager được phân công cho nông trại của đơn này.',
  'CaptureAttempts.Unauthorized': 'Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.',
  'CaptureAttempts.ConcurrencyConflict': 'Dữ liệu lần bay đang được cập nhật. Thử lại sau ít giây.',
  'Order.NotFound': 'Không tìm thấy đơn khảo sát V3 trong phạm vi được phân công.',
  // G7 — duyệt kết quả
  'SurveyResultReview.ManagerForbidden': 'Bạn không còn là Manager được phân công cho đơn này.',
  'SurveyResultReview.ConcurrencyConflict': 'Kết quả đang được cập nhật. Tải lại và thử lại.',
  'SurveyOrder.VersionConflict': 'Đơn vừa được cập nhật. Tải lại dữ liệu duyệt và kiểm tra trước khi gửi lại.',
  'SurveyOrder.StatusInvalid': 'Đơn không còn ở bước duyệt kết quả.',
  'Operation.Conflict': 'Mã gửi này đã được dùng với nội dung khác. Tải lại và thử lại.',
  'CaptureAttempt.NoActiveAttempt': 'Đơn không còn lần bay đang xử lý.',
  'CountSnapshot.Missing': 'Chưa có số trụ đã xác minh. Cần hoàn tất bước gửi GPS cây và duyệt bản đồ trước.',
  'CountSnapshot.NotFound': 'Chưa có số trụ đã xác minh. Cần hoàn tất bước gửi GPS cây và duyệt bản đồ trước.',
  'CountSnapshot.Stale': 'Số trụ đã được cập nhật. Tải lại dữ liệu duyệt trước khi chốt.',
  'CountSnapshot.FingerprintMismatch': 'Số trụ đã được cập nhật. Tải lại dữ liệu duyệt trước khi chốt.',
  'ComboBatch.Stale': 'Kết quả phân tích COMBO đã có bản mới. Tải lại để duyệt bản mới.',
  'ComboBatch.FingerprintMismatch': 'Kết quả phân tích COMBO đã thay đổi. Tải lại để duyệt bản mới.',
  'ComboBatch.NotFound': 'Chưa có kết quả phân tích COMBO để duyệt.',
  'ComboReview.Stale': 'Lần duyệt trước đã thay đổi. Tải lại dữ liệu duyệt.',
  'ComboReview.ExpectedPreviousMismatch': 'Đã có lần duyệt mới hơn. Tải lại dữ liệu duyệt.',
  'ComboReview.IncompleteFindings': 'Cần quyết định cho tất cả phát hiện.',
  'ComboReview.IncompleteZones': 'Cần quyết định cho tất cả vùng bệnh.',
  'ComboReview.IncompleteBlockers': 'Cần xử lý tất cả mục chặn.',
  'ComboReview.UnresolvedBlockers': 'Còn mục chặn chưa xử lý nên chưa duyệt được kết quả.',
  'ComboReview.ExclusionReasonRequired': 'Nhập lý do cho mỗi phát hiện bị loại.',
  'ComboReview.ZoneReasonRequired': 'Nhập lý do cho mỗi vùng bị từ chối.',
  'ComboReview.BlockerReasonRequired': 'Nhập giải trình cho mỗi mục chặn đã xử lý.',
  'ComboReview.EvidenceRequired': 'Thiếu ảnh bằng chứng cho quyết định loại / từ chối / xử lý mục chặn.',
  'ComboReview.GuidanceSelectionRequired': 'Chọn hướng dẫn xử lý cho mỗi vùng được duyệt.',
  'ComboReview.ZoneMemberNotAccepted': 'Vùng được duyệt có phát hiện đã bị loại.',
  'ComboReview.OutOfBoundaryCannotAccept': 'Phát hiện nằm ngoài ranh giới nông trại không được chấp nhận.',
  'ComboReview.InvalidBlockerExclusion': 'Mục chặn được loại thì phát hiện liên quan cũng phải bị loại.',
  'ComboReview.NegativeConfirmationRequired': 'Cần xác nhận "Không ghi nhận nghi bệnh" khi không chấp nhận phát hiện nào.',
  'ComboReview.NegativeEvidenceRequired': 'Nhập bằng chứng cho kết luận không ghi nhận nghi bệnh.',
  'ComboReview.InsufficientCoverageProof': 'Ảnh đầu vào chưa được phân tích đủ nên chưa thể kết luận không có nghi bệnh.',
  'ComboReview.NotApproved': 'Lần duyệt COMBO gần nhất chưa được duyệt.',
  'ComboReview.Missing': 'Cần duyệt kết quả COMBO trước khi chốt.',
  'ComboJob.IncompleteCoverage': 'Lần phân tích chưa phủ hết ảnh đầu vào.',
  'FreezeResult.AlreadyFrozen': 'Kết quả đã được chốt nội bộ.',
  'FreezeResult.ComboTokensRequired': 'Thiếu thông tin lần duyệt COMBO. Tải lại dữ liệu duyệt.',
  'FreezeResult.ComboTokensInvalidForMap': 'Đơn MAP không có phần duyệt COMBO.',
  'FreezeResult.NegativeConfirmationRequired': 'Cần xác nhận kết luận không ghi nhận nghi bệnh trước khi chốt.',
  ACTIVE_CAPTURE_IN_FLIGHT:'Không thể kết thúc phân công khi nông trại đang có lần bay chưa hạ cánh.',
}
export const v3ErrorMessage = (code: string | undefined) => code ? v3ErrorMessages[code] : undefined
