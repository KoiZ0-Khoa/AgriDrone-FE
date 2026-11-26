# Kế hoạch FE — Chuyển web sang luồng V3

Mục tiêu: web **chỉ chạy luồng V3** (`ContractScope.V3`, dịch vụ `MAP` hoặc `COMBO`, đơn đầu tiên hoặc đơn tiếp nối): duyệt yêu cầu → lịch hẹn → cọc → bay → bay lại → xử lý dữ liệu → duyệt kết quả → hóa đơn và thanh toán → hủy đơn và đối soát. Chính sách thương mại V3 để cuối cùng.

**Quyết định 26/11/2026 (người dùng):** không chạy song song. Dữ liệu cũ (Legacy) trong DB sẽ bị bỏ, web chuyển hẳn sang V3. Mỗi giai đoạn **thay** code luồng cũ bằng V3 chứ không rẽ nhánh.

**Nguồn đối chiếu**
- BE code: `Controllers/V3/*.cs`, `Contracts/Surveys/V3/*.cs`, `IntegrationContracts/Surveys/ISurveyCaptureExecutionCoordinator.cs`, `Database/Surveys/SurveyCaptureExecutionCoordinator.cs`, `MissionPlantGpsPublisher.cs`.
- BE docs: `AgriDrone-BE/docs/contracts/survey-business-v3.md` (mục 6.1–6.5), `PROJECT_MEMORY.md` của đội BE (bản 26/11/2026, checkpoint `25585db`).

**Ký hiệu:** `[ ]` chưa làm · `[~]` đang làm · `[x]` đã code và tự test · thêm "đã test tay" khi người dùng xác nhận với BE thật.

## Nguyên tắc

- **Chỉ V3.** Không giữ nhánh `if (legacy)`. Code, types, nhãn trạng thái, mã lỗi chỉ phục vụ đơn cũ thì xóa ngay trong giai đoạn thay thế nó (xem "Danh sách gỡ bỏ").
- **Mỗi lần ghi V3 cần khóa chống gửi trùng.** Coordinator dùng `operationId` (UUID) + `payloadFingerprint` (1–128 ký tự); result-review, invoice, đối soát dùng `operationId`; balance-checkout dùng `idempotencyKey`. Gửi lại đúng nội dung thì giữ nguyên khóa để BE trả replay (`isReplay: true`). Nội dung đổi thì tạo khóa mới. Dùng lại `operationFor()` trong `features/surveys/workflow.ts`.
- **Kết quả của coordinator không trả `orderVersion`.** Sau mỗi thao tác tải lại đơn (`getAssignedOrder` / `getOwnerOrder`) và danh sách lần bay.
- **Mã HTTP của V3** (contract 6.3): `400` thiếu/sai trường, `422` lỗi nghiệp vụ, `403` Manager không được phân công hoặc Owner bị thu hồi, `404` không có dữ liệu, `409` dữ liệu cũ hoặc trùng khóa khác nội dung (mã ở `ProblemDetails.extensions.errorCode`). Lỗi coordinator là mã chữ hoa (`COMMERCIAL_NOT_READY`…), lỗi khác dạng `Module.Code`. Dịch cả hai.
- **Dữ liệu test:** sau khi bỏ dữ liệu cũ, đơn test phải tạo mới qua luồng V3 (gửi yêu cầu V3 → Admin duyệt V3). Môi trường dev của BE đang tắt `SurveyPayments:Enabled` và `PublicIntakeEnabled` (fail-closed tới V3-10), nên gửi yêu cầu công khai, trả cọc, trả phần còn lại ở local sẽ bị `400`. Tự test bằng API giả lập; test tay cần đội BE bật cờ ở local.
- Tự test từng task (typecheck, test, build, trình duyệt với API giả lập) trước khi giao người dùng test tay.

## Vòng đời đơn V3 và giai đoạn xử lý

| Trạng thái đơn | Ý nghĩa | Giai đoạn FE |
| --- | --- | --- |
| `AWAITING_APPOINTMENT` | Chờ chốt lịch bay | G2 |
| `AWAITING_DEPOSIT` | Chờ Owner trả cọc | G3 |
| `READY_FOR_CAPTURE` | Sẵn sàng chuẩn bị lần bay | G4 |
| `CAPTURING` | Đang bay | G4 |
| `AWAITING_REFLIGHT_DECISION` | Bay lỗi, chờ quyết định bay lại | G6 (hoặc G9 nếu hủy) |
| `AWAITING_CAPTURE_UPLOAD` | Chờ tải dữ liệu bay | G5 |
| `AWAITING_INPUT_REVIEW` | Chờ duyệt dữ liệu đầu vào | G5 |
| `AWAITING_PROCESSING` / `PROCESSING` | Đang xử lý ảnh, AI | G5 → G7 |
| (vẫn `PROCESSING`) | Duyệt kết quả, chốt kết quả nội bộ | G7 |
| `AWAITING_SETTLEMENT` | Đã chốt hóa đơn, chờ thanh toán | G8 |
| `COMPLETED` | Đã phát hành kết quả cho Owner | G11 (chờ BE) |
| `CANCELLED` | Đã hủy | G9 |

Lần bay (`CaptureAttemptStatus`): `PLANNED`, `PREFLIGHT_READY`, `IN_FLIGHT`, `AWAITING_UPLOAD`, `UPLOADED`, `PROCESSING` (đang hoạt động — tối đa 1 lần mỗi đơn) và `ACCEPTED`, `REFLIGHT_REQUIRED`, `FLIGHT_FAILED`, `CANCELLED` (đã kết thúc).

## Lỗ hổng BE

| # | Lỗ hổng | Trạng thái | Ảnh hưởng tới FE |
| --- | --- | --- | --- |
| BE-1 | Không có API trả phần còn lại cho đơn V3 | ✅ Đã sửa (`fc01761`) | G8 dùng `balance-checkouts` |
| BE-2 | Bộ lọc đơn không có trạng thái V3 | ✅ Đã sửa (`fc01761`) | G0 |
| BE-3 | Không có GET danh sách lần bay | ✅ Đã sửa (`fc01761`) | G4, G6 dùng `GET capture-attempts` |
| BE-4 | Chính sách thương mại V3 chỉ có POST, không có GET | ❌ Đã báo BE, sẽ bổ sung sớm | G12 (cuối) |
| **BE-5** | Publish GPS và duyệt bản đồ V3 còn truy vấn `survey.capture_attempts.mission_id`. Liên kết thực tế nằm ở `mission.drone_missions.capture_attempt_id` | Chờ BE điều chỉnh và kiểm thử | G5 |
| BE-6 | Owner GET gắn nhãn `PAID_SERVICE` cho lịch Capture. Response đổi lịch có thể trả `AWAITINGDEPOSIT` | FE dùng trạng thái từ GET đơn và bỏ qua nhãn mục đích trên lịch V3 | G2 |
| **BE-7** | `GET /api/tenant-owner/survey-orders/{id}/payments` đọc cả khoản cọc V3, nhưng `GetSurveyPaymentHistoryQueryHandler.MapPurpose` thiếu `PaymentPurpose.OrderDeposit => "ORDER_DEPOSIT"`. Handler ném exception khi gặp khoản cọc V3 | Cần sửa mapper và test lịch sử có cọc V3 | G3 và lịch sử thanh toán G8. FE giữ URL phiên vừa tạo khi lịch sử trả 5xx và đọc lại đơn để cập nhật trạng thái |
| **BE-8** | `GET /api/system-manager/survey-orders/{id}/drones/available` đọc lịch và điều kiện tiền của luồng cũ. API drone theo farm cần `startAt`, `endAt`. API đơn của Manager chỉ có ID, phiên bản và trạng thái lịch | Cần danh sách drone theo lịch Capture đã xác nhận, hoặc bổ sung khung giờ lịch vào API Manager | Chặn chọn drone để chuẩn bị lần bay đầu ở G4 |
| **BE-9** | GET lần bay thiếu manifest hiện hành. `input-approval` yêu cầu `processingJobId`, và chốt dữ liệu chưa chuyển nhiệm vụ sang sẵn sàng xử lý | Chờ BE cung cấp thông tin manifest, nguồn ID job và quy định chuyển trạng thái sau duyệt | G5 |
| **BE-10** | `disease-detect` thiếu `jobId` và `sourceRevision` mà `combo-analysis/handoffs` yêu cầu. Truy vấn COMBO còn dùng tên bảng `survey.survey_order_commercial_snapshots` | Chờ BE sửa truy vấn và trả thông tin lần nhận diện đã lưu | G5 → G7 |

## Bảng tiến độ

| # | Giai đoạn | Màn hình chính | Trạng thái |
| --- | --- | --- | --- |
| G0 | Nền tảng: trạng thái V3, MAP/COMBO, client + mã lỗi; gỡ phần chung của luồng cũ | `orderWorkflow.ts`, `ownerOrderWorkflow.ts`, `v3Api.ts` (mới) | [x] chưa test tay |
| G1 | Gửi và duyệt yêu cầu khảo sát V3 | `SurveyIntakePage.tsx`, `RequestsPage.tsx` | [x] chưa test tay |
| G2 | Lịch hẹn Capture (Manager đề xuất, Owner xác nhận/đổi, báo vắng mặt) | `OrderActionModals.tsx`, `OwnerAppointmentDialog.tsx` | [x] API được giả lập trong test, còn kiểm thử với BE thật |
| G3 | Cọc V3 (`OrderDeposit`) | `SurveyPaymentPanel.tsx`, `OwnerPaymentsPage.tsx` | [x] FE, chờ BE-7 và kiểm thử thanh toán |
| G4 | Chuẩn bị lần bay và bay (prepare → checklist → start → complete / fail) | `PrepareMissionModal.tsx`, `ManagerMissionDetailPage.tsx` | [ ] Đã nối danh sách và thao tác bay, chuẩn bị lần bay chờ BE-8 |
| G5 | Sau bay: tải dữ liệu, chốt và duyệt dữ liệu đầu vào, xử lý MAP/COMBO | `ManagerMissionDetailPage.tsx`, `ManagerBaseMapsPage.tsx` | [ ] FE đã nối upload, telemetry và chốt theo API hiện tại. Chờ BE-5, BE-9, BE-10 và ranh giới First |
| G6 | Bay lại + lịch sử chuyến bay | `ManagerMissionDetailPage.tsx`, modal mới | [ ] |
| G7 | Duyệt kết quả V3 (result-review, combo-reviews, freeze) | trang mới thay `ManagerHealthReviewPage` | [ ] |
| G8 | Hóa đơn V3 + Owner trả phần còn lại | trang mới, `OwnerPaymentsPage.tsx` | [ ] |
| G9 | Hủy đơn V3 (Owner yêu cầu, Admin quyết định) | `OwnerPaymentsPage.tsx`, `SystemOrdersPage.tsx` | [ ] |
| G9b | Admin đối soát tiền đơn V3 (`funding-reconciliations`) | `SystemOrdersPage.tsx` | [ ] |
| G10 | Rà soát cuối: không còn route, type, nhãn, mã lỗi nào của luồng cũ | toàn bộ | [ ] |
| G11 | Chờ BE: phát hành kết quả cho Owner, cổng Owner, khiếu nại/hoàn tiền V3 | — | chờ BE (A2.4, V3-07, V3-08) |
| G12 | Admin: chính sách thương mại V3 (để cuối, chờ BE-4) | `ServicesPage.tsx`, `PaymentPoliciesPanel.tsx` | [ ] |

G0 → G4 là đường tối thiểu để một đơn V3 bay được. G5 → G9b nối tiếp theo vòng đời. G12 làm sau cùng khi BE có GET.

## Danh sách gỡ bỏ (luồng cũ)

Gỡ trong giai đoạn ghi ở cột cuối. "Đã xác nhận" là BE chặn đơn V3 hoặc chỉ dùng trạng thái của luồng cũ; "kiểm khi làm" là cần đọc lại handler BE trước khi xóa.

| Phần trên web | Route BE | Căn cứ | Gỡ ở |
| --- | --- | --- | --- |
| Nhãn + thông báo trạng thái cũ (`AWAITING_BASELINE_*`, `PENDING_BOUNDARY_VERIFICATION`, `AWAITING_BOUNDARY_CAPTURE`, `BASELINE_*`, `AWAITING_PRICING`, `AWAITING_PAID_APPOINTMENT`, `AWAITING_PAYMENT`, `READY_FOR_PAID_SERVICE`, `IN_PROGRESS`, `PENDING_REVIEW`), `baselineStageNotices` | — | Đơn V3 không vào các trạng thái này | G0 |
| Gửi yêu cầu kiểu cũ: `submitPublicRequest`, `submitNewFarmRequest`, `submitExistingFarmRequest` | `api/public/survey-requests`, `tenant-owner/survey-requests/new-farm`, `tenant-owner/farms/{id}/survey-requests` | Đã có bản V3 trên web | G1 |
| Admin duyệt kiểu cũ | `system-admin/survey-requests/{id}/approve` | Thay bằng route V3 | G1 |
| Đề xuất lịch với `purpose` `BASELINE_MAPPING` / `PAID_SERVICE`; Owner xác nhận/đổi lịch kiểu cũ | `system-manager/.../appointments`, `tenant-owner/.../appointments/{id}/confirm|request-reschedule` | Đã xác nhận: BE từ chối mục đích khác `Capture` với đơn V3 | G2 |
| Trả cọc `BASELINE_DEPOSIT`, trả phần còn lại `FINAL_BALANCE` | `tenant-owner/.../payments` (POST) | Đã xác nhận: đơn V3 chỉ nhận `OrderDeposit` | G3 (lịch sử GET kiểm khi làm) |
| Xác nhận số trụ và giá (`PricingConfirmationModal`) | `.../pole-count/confirm` | Đã xác nhận: chỉ nhận `Legacy` | G3 |
| Ghi xác minh ranh giới theo đơn (`verifyOrderBoundary`) | `POST .../boundary-scope/verify` | Điều kiện trạng thái của luồng cũ. GET `boundary-scope` vẫn đọc được trạng thái, phiên bản và phạm vi đơn V3 | G4 |
| Thu thập ranh giới GNSS (`BoundaryCapturePanel`, `startCapture`, `syncCapture`, `finalizeCapture`, `abortCapture`), duyệt route bay bản đồ nền, đánh dấu 4 góc ảnh trực giao | `.../boundary-capture-sessions*`, `.../baseline-route-plans/*`, `.../farm-boundary/mark-orthophoto-corners` | Kiểm khi làm (luồng bản đồ nền cũ) | G4 / G5 |
| Chuẩn bị bộ nhiệm vụ kiểu cũ (`prepareMissionSet`), start / complete-flight / fail-flight / cancel / reschedule kiểu cũ, `RescheduleMissionModal` | `system-manager/survey-orders/{id}/missions/prepare`, `.../missions/{id}/start|complete-flight|fail-flight|cancel|reschedule` | Thay bằng coordinator V3 | G4, G6 |
| Đoán đơn từ mã nhiệm vụ `ORD-{order}-{BASE|HEALTH|READY}` (`findMissionsBySurveyOrder`, `surveyOrderIdFromMissionCode`) | — | Mã V3 là `V3CAP-{order:N}` / `V3R{n}-{order:N}`; nối qua `GET capture-attempts` | G4 |
| Reset upload | `api/missions/{id}/farms/{id}/upload/reset` | Đã xác nhận: chặn nhiệm vụ V3 | G5 |
| Chuyển kết quả sức khỏe kiểu cũ | `.../missions/{id}/plant-health/publish` | Thay bằng `combo-analysis/handoffs` | G5 |
| Bản nháp bản đồ nền theo farm (`baseMapApi`) | `system-manager/farms/{id}/base-map-drafts*` | Kiểm khi làm | G5 / G7 |
| Duyệt kết quả sức khỏe theo đơn (`ManagerHealthReviewPage`, `HealthReleasePanel`, `healthReviewApi`) | `system-manager/survey-orders/{id}/health-results/*`, `health-findings/*`, `disease-zones/*` | Đã xác nhận: `PlantHealthReviewService` chỉ nhận `Legacy` | G7 |
| Duyệt sức khỏe theo farm (`plantHealthReviewApi`) | `system-manager/farms/{id}/plant-health*` | Kiểm khi làm (đã bị chặn với dữ liệu V4 từ 16/11) | G7 |
| Hoàn tiền chất lượng (Owner báo, Manager xác minh, Admin quyết định) | `.../quality-refunds*` | Luồng cũ; khiếu nại V3 là V3-08, BE chưa làm | G9 (gỡ; làm lại ở G11 khi BE có) |
| Dịch vụ, giá, cọc, giảm giá combo kiểu cũ (`ServicesPage`, `PaymentPoliciesPanel`) | `system-admin/survey-services*`, `survey-deposit`, `survey-combo-discount` | Thay bằng `commercial-policies` | G12 |
| 5 mã lỗi BE đã bỏ (`MissionPlanning.BaselineWindowRequired`, `ServiceWindowRequired`, `ServiceWindowNotAllowed`, `BaselineWindowNotAllowed`, `ScheduleOutsideAppointment`) và mã lỗi chỉ của các route trên | — | — | cùng giai đoạn với route đó, rà lại ở G10 |

**Giữ lại** (không phải luồng cũ, V3 vẫn dùng): đăng nhập / refresh token, nông trại và khu vực, drone, checklist trước bay (`preflight`), upload media / telemetry / finalize, Metashape, YOLO, `plant-gps` (lưu nháp), `disease-detect`, `yolo-recalculate-grid`, quản lý Manager và tenant, báo cáo doanh thu V3.

---

## G0. Nền tảng — [x] chưa test tay

**Đã làm (26/11/2026):**
- `src/features/surveys/v3Types.ts` (mới): `V3OrderStatus`, `V3ServiceKind`, `CaptureAttemptStatus`, `V3CaptureAttempt`, `V3CaptureAttemptHistory`.
- `src/features/surveys/v3Workflow.ts` (mới, không có import lúc chạy): nhãn 12 trạng thái đơn và 10 trạng thái lần bay, hướng dẫn từng bước cho Manager (`v3OrderStageNotices`), `v3OrderStatusEnumName` (tên enum cho bộ lọc Owner), `activeCaptureAttempt` / `latestCaptureAttempt`, `v3ServiceKind` / `screensDisease`, `v3OperationFor` (giữ `operationId` + `payloadFingerprint` SHA-256 khi gửi lại cùng nội dung), `v3ErrorMessages` (43 mã coordinator + `CaptureAttempts.*`, `Order.NotFound`, `Cancellation.RetentionExceedsAllowedCap`, `ACTIVE_CAPTURE_IN_FLIGHT`).
- `src/features/surveys/v3Api.ts` (mới): `getCaptureAttempts`. Các route V3 khác thêm vào file này ở giai đoạn dùng tới.
- `src/api/client.ts`: lỗi coordinator (409, mã chữ hoa ở `title`, không có `errorCode`) được đọc thành `ApiError.code`; title thường như "Conflict" không bị nhận nhầm.
- `orderWorkflow.ts`: `orderStatusLabels` chỉ còn trạng thái V3 (bộ lọc Manager/Admin lấy từ đây); `baselineStageNotices` → `orderStageNotices` theo trạng thái V3. `ManagerOrdersPage` hiện hướng dẫn cho mọi đơn (không còn chỉ đơn cần bản đồ nền).
- `ownerOrderWorkflow.ts`: bộ lọc Owner chỉ nhận trạng thái V3, gửi tên enum (`AwaitingReflightDecision`…).
- `workflow.ts`: `workflowError` dịch thêm mã V3. **`missionError` để G4** (các file test nhiệm vụ đổi ở G4 nên nối lúc đó).
- Chưa làm trong G0: thêm `ACTIVE_CAPTURE_IN_FLIGHT` vào `FarmManagerAssignmentModal` — web không gọi route kết thúc phân công (`PUT .../primary-manager/end`), nên chỉ thêm bản dịch chung.

**Tự test:** `tests/v3-foundation.test.mjs` 8 test ✓ (nhãn khớp đúng enum BE và không còn trạng thái cũ, tên enum lọc Owner, lần bay đang hoạt động, MAP/COMBO, khóa thao tác, đọc mã lỗi từ `title`, dịch lỗi, route `GET capture-attempts`). Sửa 6 test cũ (nạp thêm `v3Workflow`; `survey-ui` và `owner-orders` đổi kỳ vọng từ trạng thái cũ sang V3). `npm test` 296/296 ✓, typecheck ✓, build ✓. Trình duyệt với API giả lập: danh sách đơn Manager hiện nhãn V3; ô lọc chỉ có trạng thái V3, chọn "Sẵn sàng bay" gửi `status=READY_FOR_CAPTURE`; trang đơn `AWAITING_REFLIGHT_DECISION` hiện cảnh báo "Chuyến bay lỗi, chờ quyết định bay lại".

**Kế hoạch ban đầu:**

- **Nhãn trạng thái**: 10 trạng thái đơn V3 + `COMPLETED`/`CANCELLED`, và 10 trạng thái lần bay (bảng trên) → `orderStatusLabels`, bản của Owner, kèm thông báo hướng dẫn từng bước. Xóa nhãn và thông báo của trạng thái cũ.
- **Dịch vụ V3**: `MAP` (chỉ bản đồ, sức khỏe "không đánh giá") và `COMBO` (bản đồ + sàng lọc bệnh); đơn đầu tiên hoặc đơn tiếp nối (ghim bản đồ nền đã phát hành). Lấy từ `surveyServiceCode` của đơn. Trang nhiệm vụ (mục đích `Capture`) rẽ nhánh theo MAP/COMBO thay vì theo `purpose` cũ (`BaselineMapping` / `PlantHealth` / `HarvestReadiness`).
- **`features/surveys/v3Api.ts` + `v3Types.ts`** (mới): gom toàn bộ route `api/v3/...`.
- **Bộ lọc trạng thái** ở `ManagerOrdersPage` và `SystemOrdersPage`: chỉ trạng thái V3 + `COMPLETED`/`CANCELLED`.
- **Dịch mã lỗi** (`v3Errors.ts`):
  - Coordinator: `COMMERCIAL_NOT_READY`, `ACTIVE_ATTEMPT_EXISTS`, `DRONE_REQUIRED`, `DRONE_NOT_READY`, `DRONE_CAPABILITY_MISMATCH`, `FOLLOW_UP_BASELINE_NOT_PINNED`, `CAPTURE_VERSION_CONFLICT`, `OPERATION_CONFLICT`, `PREFLIGHT_OR_DRONE_NOT_READY`, `REFLIGHT_VERSION_CONFLICT`, `APPOINTMENT_WINDOW_INVALID`, `DEPOSIT_NOT_SATISFIED`, `MANAGER_FORBIDDEN` (đọc lại đủ danh sách khi làm).
  - Khác: `CaptureAttempts.ManagerForbidden`, `Order.NotFound`, `ACTIVE_CAPTURE_IN_FLIGHT` (không thu hồi phân công farm khi đang có lần bay — thêm vào `FarmManagerAssignmentModal`).

## G1. Gửi và duyệt yêu cầu khảo sát V3 — [x] chưa test tay

**Đã làm (26/11/2026):**
- Phát hiện khi làm: trang đăng ký vẫn chạy hai luồng — dùng danh mục V3 nếu `isBookable`, ngược lại quay về danh mục cũ (`/api/public/survey-services`) và 3 route gửi cũ.
- `api.ts`: `getSurveyIntakeCatalogue` chỉ đọc `GET api/v3/catalog/survey-services`; danh mục đóng (`isBookable = false`) → `{ services: [] }` (trang hiện "Chưa có dịch vụ nhận yêu cầu"); lỗi kể cả 404 được báo ra. Xóa `getPublicServices`, `submitPublicRequest`, `submitNewFarmRequest`, `submitExistingFarmRequest`. `approveRequest` gọi `POST api/v3/system-admin/survey-requests/{id}/approve` (BE dùng cùng body, header `Idempotency-Key`, command và response với route cũ).
- Nhận duyệt (`start-review`) và từ chối (`reject`): giữ route chung — V3 chưa có route riêng và handler BE không chặn theo scope.
- `types.ts`: bỏ `SurveyIntakeCatalogue.version`, `PublicService`, `RequestReceipt`; `Approval` thêm `ownerInvitationId`.
- `SurveyIntakePage.tsx`: bỏ nhánh `v3`; giới hạn cố định theo contract V3 (địa chỉ 500, số trụ 1.000.000, ghi chú 2.000, diện tích 0,01–10.000 ha).
- `RequestsPage.tsx`: thông báo sau phê duyệt theo V3 — mã đơn, bước hiện tại (nhãn trạng thái V3), giá/cọc/chính sách đã chốt, Manager sẽ đề xuất lịch bay, và lời mời Owner nếu có `ownerInvitationId`.

**Tự test:** `surveys.test.mjs` sửa 6 test (approve đi route V3; không còn hàm gửi cũ; danh mục không quay về danh mục cũ kể cả khi đóng hoặc 404; lỗi nghiệp vụ đi qua route gửi V3). `survey-ui.test.mjs`: fixture danh mục V3, kiểm giới hạn 500/2000 và trạng thái "Chưa có dịch vụ nhận yêu cầu". `npm test` 295/295 ✓ (gộp 2 test cũ thành 1), typecheck ✓, build ✓. Trình duyệt với API giả lập: Admin phê duyệt yêu cầu → 1 request `POST /api/v3/system-admin/survey-requests/req-1/approve` có `Idempotency-Key`, body đủ checklist/lý do/version; thông báo "Đơn SO-V3-0001 đang ở bước "Chờ chốt lịch bay"…". Trang đăng ký công khai: chỉ có 2 dịch vụ MAP/COMBO, địa chỉ tối đa 500 ký tự. Trạng thái danh mục đóng chỉ kiểm bằng test render (trình duyệt giữ cache danh mục).

**Kế hoạch ban đầu:**

- Gửi yêu cầu: web đã dùng `api/v3/public/survey-requests` và `api/v3/tenant-owner/survey-requests`. Xóa 3 hàm gửi kiểu cũ và nơi còn gọi chúng (kiểm `SurveyIntakePage` và trang yêu cầu của Owner cho farm đã có).
- Admin duyệt: `POST api/v3/system-admin/survey-requests/{requestId}/approve`, header `Idempotency-Key`, body `ApproveSurveyRequest` (`selectedSystemManagerProfileId`, `reason`, `checklist`, `expectedVersion`). Khi duyệt, BE ghim giá/cọc/claim/chính sách hủy vào đơn; đổi chính sách sau đó không ảnh hưởng đơn này.
- Các bước start-review / reject của Admin: kiểm khi làm xem route cũ có còn dùng chung cho V3 không (V3 chưa có route riêng).

## G2. Lịch hẹn Capture — [x] Kiểm thử với API giả lập

| Ai | Route V3 | Body |
| --- | --- | --- |
| Manager đề xuất | `POST api/v3/system-manager/survey-orders/{orderId}/capture-appointments` | `{ scheduledDate, expectedOrderVersion, expectedCurrentAppointmentId?, expectedCurrentAppointmentVersion? }` (không có `purpose`) |
| Owner xác nhận | `POST api/v3/tenant-owner/survey-orders/{orderId}/capture-appointments/{appointmentId}/confirm` | `{ expectedOrderVersion, expectedAppointmentVersion }` |
| Owner xin đổi lịch | `POST .../capture-appointments/{appointmentId}/request-reschedule` | `{ reason (1–1000), expectedOrderVersion, expectedAppointmentVersion }` |
| Manager báo vắng mặt | `POST api/v3/system-manager/survey-orders/{orderId}/capture-appointments/no-show` | `{ appointmentId, expectedOrderVersion, expectedAppointmentVersion, occurredAt, reason, evidenceReference, operationId, payloadFingerprint }` → `{ noShowId, occurrenceIndex, disposition, orderStatus, appointmentStatus }` |

- `OrderActionModals.tsx`: bỏ ô chọn mục đích, gọi route V3. `OwnerAppointmentDialog.tsx`: gọi route V3. Types `purpose: 'BASELINE_MAPPING' | 'PAID_SERVICE'` đổi thành `'CAPTURE'`.
- Báo vắng mặt: FE hiện nút khi đơn sẵn sàng bay và lịch đã xác nhận. BE kiểm thời điểm ghi nhận từ giờ bắt đầu lịch đến hiện tại. Hiện `disposition`: trong hạn mức miễn phí thì được đổi lịch, vượt hạn mức thì chờ Admin xem xét.

## G3. Cọc V3 — [x] FE, chờ BE-7

- `POST api/v3/tenant-owner/survey-orders/{orderId}/deposit-checkouts`, body `{ expectedOrderVersion }`. Response 201 trả `surveyPaymentId`, `surveyOrderId`, `appointmentId`, `amount`, `currency`, `paymentStatus`, `redirectUrl`, `expiresAt` và phiên bản. `amount` là số tiền còn phải nộp theo nghĩa vụ cọc. FE hiển thị số tiền này trước khi mở cổng thanh toán.
- Lịch sử thanh toán (`GET tenant-owner/.../payments`): kiểm có trả thanh toán V3 không. Nhãn `ORDER_DEPOSIT`, `FINAL_BALANCE`; trạng thái `ADJUSTMENT_REQUIRED` (tiền về lệch, chờ Admin đối soát), `INVALIDATED`. Xóa nhãn `BASELINE_DEPOSIT`.
- Hoàn tiền/chargeback cọc trước khi bay có thể đưa đơn từ `READY_FOR_CAPTURE` về `AWAITING_DEPOSIT` → trang Owner phải hiện lại nút trả cọc.
- Xóa `PricingConfirmationModal` và `confirmOrderPricing` (số trụ V3 lấy từ kết quả bay, G7–G8). Xóa logic cọc/phần còn lại kiểu cũ trong `ownerOrderWorkflow.ts` (`paymentPurposeForOrder`, `depositRefundedAfterInvoice`, `paymentRequiresAppointment`…).
- FE dùng trạng thái đơn hoặc giao dịch từ BE để xác nhận thanh toán. Khôi phục đường dẫn sau khi tải lại trang cần lịch sử khớp với phiên đã lưu. BE-7 có thể chặn khôi phục trong lúc chờ sửa mapper.

## G4. Chuẩn bị lần bay và bay — [ ]

Coordinator V3 tạo nhiệm vụ mã `V3CAP-{orderId:N}` (mục đích `Capture`) gắn với lần bay.

| Bước | Route | Body | Kết quả |
| --- | --- | --- | --- |
| Chuẩn bị | `POST api/v3/system-manager/survey-orders/{orderId}/capture-attempts` | `{ droneId, expectedOrderVersion, operationId, payloadFingerprint, reason? }` | `{ attemptId, attemptIndex, missionId, status, version }` |
| Checklist | **giữ** `GET/POST system-manager/farms/{farmId}/missions/{missionId}/preflight[/checklist]` | như hiện tại | Start V3 đòi nhiệm vụ đã có preflight phù hợp |
| Bắt đầu bay | `POST .../capture-attempts/{attemptId}/start` | `{ missionId, expectedOrderVersion, expectedAttemptVersion, operationId, payloadFingerprint }` | `{ attemptId, status, version, startedAt }` |
| Kết thúc bay | `POST .../capture-attempts/{attemptId}/complete-flight` | `{ expectedOrderVersion, expectedAttemptVersion, endedAt, flightCompletedReceipt (1–500), operationId, payloadFingerprint }` | `{ attemptId, status, version, endedAt }` |
| Báo lỗi | `POST .../capture-attempts/{attemptId}/fail-flight` | `{ expectedOrderVersion, expectedAttemptVersion, failedAt, failureReason, failureIncidentEvidence, operationId, payloadFingerprint }` | `{ attemptId, status, version }`; đơn → `AWAITING_REFLIGHT_DECISION`, drone → bảo trì |

- **Đọc lần bay**: `GET api/v3/system-manager/survey-orders/{orderId}/capture-attempts` → mảng sắp theo `attemptIndex`: `{ captureAttemptId, attemptIndex, status, version, missionId, parentAttemptId, parentMissionId, startedAt, endedAt, history[] }`. `[]` khi chưa có lần bay; `403 CaptureAttempts.ManagerForbidden` khi không được phân công. Lần bay đang hoạt động là lần có trạng thái thuộc nhóm "đang hoạt động". Nhiệm vụ nối với lần bay qua `missionId` (bỏ cách đoán từ mã `ORD-`). Tải lại sau mỗi thao tác.
- `PrepareMissionModal.tsx`: gọi `capture-attempts` (một nhiệm vụ cho mỗi lần bay, không còn "bộ nhiệm vụ" BASE/HEALTH/READY). Danh sách drone: kiểm `GET survey-orders/{id}/drones/available` có nhận đơn V3; coordinator tự kiểm drone theo khả năng MAP/COMBO.
- `ManagerMissionDetailPage.tsx`: thay nút cũ bằng nút V3. Form kết thúc bay thêm ô "Biên nhận hoàn tất bay". Form báo lỗi chỉ có lý do và bằng chứng (bỏ loại sự cố, quyết định khắc phục). Bỏ "Hủy nhiệm vụ" (hủy đi qua G9) và "Lên lịch lại" (bay lại đi qua G6).
- Nối `v3ErrorMessage` (từ G0) vào `missionError` trong `missionWorkflow.ts`, và cập nhật các test nhiệm vụ nạp thêm `v3Workflow`.
- BE tự kiểm lại mọi điều kiện lúc bấm Bắt đầu (phân công, drone, lịch, checklist) — không tin kết quả kiểm tra trước đó, nên phải xử lý lỗi ngay cả khi màn hình đang báo "sẵn sàng".
- Ranh giới farm: kiểm khi làm V3 lấy ranh giới từ đâu (đơn đầu tiên chưa có bản đồ nền) trước khi gỡ các màn hình xác minh / thu thập ranh giới cũ.
- Đã nối danh sách lần bay và các nút bắt đầu, kết thúc, báo lỗi cho nhiệm vụ V3 đã liên kết với đơn. BE kiểm tra phiên bản đơn/lần bay và điều kiện checklist. Bước chọn drone để chuẩn bị nhiệm vụ mới còn chờ BE-8. Coordinator hiện sao chép `FarmBoundaryVersionId` từ đơn khi tạo nhiệm vụ.

## G5. Sau bay — [ ] Đã nối FE đến bước chốt dữ liệu

Thứ tự dự kiến (xác nhận lại khi làm):
1. **Tải dữ liệu** qua API media và telemetry hiện có. BE tính SHA-256 lúc nhận tệp. FE cho upload/import khi đơn và lần bay còn chờ dữ liệu. Nút reset và finalize cũ được ẩn cho nhiệm vụ V3.
2. **Chốt dữ liệu đầu vào** qua `POST .../capture-attempts/{attemptId}/input-manifest/freeze` với `{ missionId, expectedOrderVersion, expectedAttemptVersion, operationId, payloadFingerprint }`. FE dùng API readiness để kiểm tra ảnh và phiên upload đang mở. Sau khi chốt, FE hiển thị số tệp và dung lượng từ phản hồi. Sau khi tải lại, FE đọc trạng thái lần bay từ GET. Telemetry được nhập qua API riêng trước khi chốt.
3. **Duyệt dữ liệu đầu vào**: FE hiển thị trạng thái chờ duyệt. `POST .../input-approval` yêu cầu `manifestId`, `manifestFingerprint` và `processingJobId`. Chờ BE-9 để nối thao tác duyệt.
4. **Xử lý theo dịch vụ**:
   - **MAP và phần bản đồ của COMBO**: dùng API ghép ảnh, cắt tiles và YOLO khi nhiệm vụ đủ điều kiện. FE cho tải CSV kết quả. Gửi GPS V3 còn chờ BE-5 và phiên bản ranh giới gắn với đơn và nhiệm vụ. Đơn First cần BE cung cấp thao tác xác nhận ranh giới từ ảnh trực giao.
   - **Duyệt bản đồ nháp** gọi API đang có `POST .../approve-internal`. Duyệt bản đồ V3 còn phụ thuộc BE-5.
   - **COMBO**: chờ BE-10 để nối `disease-detect` với `POST api/v3/farms/{farmId}/missions/{missionId}/combo-analysis/handoffs`.

## G6. Bay lại + lịch sử chuyến bay — [ ]

- Khi đơn ở `AWAITING_REFLIGHT_DECISION`: nút "Bay lại" → `POST .../capture-attempts/{parentAttemptId}/quality-reflights`, body `{ droneId, scheduledDate, expectedOrderVersion, expectedParentAttemptVersion, reason, technicalQualityEvidence, operationId, payloadFingerprint }` → `{ successorAttemptId, successorAttemptIndex, newMissionId, status, version }`. Không thu thêm cọc.
- BE tạo lần bay mới (`attemptIndex + 1`) và nhiệm vụ mới `V3R{n}-{orderId:N}`; đơn quay về chờ lịch hẹn → đi lại G2 → G4 với nhiệm vụ mới. Ảnh của các lần bay không trộn với nhau. Nhiệm vụ cũ giữ nguyên `FLIGHT_FAILED`.
- **Lịch sử chuyến bay** từ `GET .../capture-attempts`: mỗi lần bay hiện số thứ tự, trạng thái, giờ bay, lần bay cha, dòng thời gian `history[]` (`transitionSequence`, `action`, `fromStatus`, `toStatus`, `reason`, `createdAt`) và liên kết tới trang nhiệm vụ của lần đó.
- Xóa `RescheduleMissionModal` và `rescheduleMission`.

## G7. Duyệt kết quả V3 — [ ]

Trang mới thay `ManagerHealthReviewPage` (trang cũ bị BE chặn với đơn V3); xóa trang cũ cùng `HealthReleasePanel`, `healthReviewApi`, các bảng phát hiện/ngoại lệ/vùng bệnh nếu không dùng lại được.

- `GET .../result-review` → số trụ đã xác minh, `countSnapshotFingerprint`, lần bay đang hoạt động, với COMBO thêm lô phát hiện đang chờ, tóm tắt review, `expectedFreezeTokens`. Sau khi chốt vẫn đọc được (`currentApprovedResultRevisionId`, `currentApprovedResultFingerprint`, `orderVersion`).
- **COMBO**: `POST .../result-review/combo-reviews` — quyết định cho **tất cả** phát hiện, vùng bệnh (polygon hợp lệ, nằm trong ranh giới farm, có hướng dẫn hiệu lực) và mục chặn `(sourceType, sourceId, reasonCode)`, không được thiếu. `201` bản mới, `200` replay. Từ chối thì đơn vẫn ở `PROCESSING`. Có thể dùng lại một phần UI bảng/bản đồ của trang cũ.
- **Chốt kết quả nội bộ**: `POST .../result-review/freeze`. MAP: kết quả "không đánh giá sức khỏe". COMBO: "có nghi bệnh" hoặc "không phát hiện" (cần xác nhận phủ ảnh đầy đủ). Lần bay chuyển `ACCEPTED`, đơn vẫn `PROCESSING`. Chưa hiện cho Owner.
- **Lỗi 409** (`SurveyOrder.VersionConflict`, `CountSnapshot.Stale`, `ComboReview.Stale`, `Operation.Conflict`) → tải lại `GET result-review` rồi cho làm lại.

## G8. Hóa đơn V3 + trả phần còn lại — [ ]

**Manager**
- `GET .../invoice` → token hóa đơn/kết quả/số trụ, chi tiết tiền, các checkout đang mở, `hasOpenReconciliation`, `reconciliationReasons[]`, `orderConfirmedNetCash`, `orderAvailableRefundCap`. `409 Invoice.NotFinalized` → quay về G7 để chốt; `409 InvoiceFinalization.RefundReconciliationHold` → báo đang chờ Admin đối soát (G9b).
- `POST .../invoice/finalize`, body `{ operationId, expectedOrderVersion, expectedApprovedResultRevisionId, expectedApprovedResultFingerprint, expectedCountSnapshotId, expectedCountFingerprint, finalizationReason }` (+ `zeroPoleReasonCode` và `zeroPoleEvidenceReference` khi 0 trụ) → đơn `PROCESSING` → `AWAITING_SETTLEMENT`, trả `totalAmount`, `validAllocatedDepositNet`, `confirmedNetReceipts`, `dueAmount`, `overpaymentAmount`.
- `POST .../invoice/corrections` (trước khi phát hành): đúng token hiện hành + `itemCorrections[]` (`mappingCandidateId`, `isAccepted`, `exclusionReason`, `expectedPlantProfileId`) + `replacementComboReview` khi COMBO bị ảnh hưởng. Số trụ phải đổi. Checkout đang mở bị vô hiệu (`invalidatedCheckoutPaymentIds`). Lỗi: `InvoiceCorrection.ProfileProvenanceMismatch`, `InvoiceCorrection.ComboReviewInvalidatedByCountChange`. 409 → tải lại `GET invoice`.

**Owner**
- `GET api/v3/tenant-owner/survey-orders/{orderId}/invoice` → `{ orderId, orderNumber, orderStatus, invoiceRevisionNumber, verifiedBillablePoleCount, pricePerPole, currency, totalAmount, dueAmount, finalizedAt, checkoutToken }`. `404 Invoice.NotFound` khi chưa chốt; `403` khi Owner bị thu hồi. Dùng lại `SurveyInvoiceLines.tsx`.
- **Trả phần còn lại**: `POST api/v3/tenant-owner/survey-orders/{orderId}/balance-checkouts`, body `{ checkoutToken, idempotencyKey }` → `{ paymentId, amount, provider, paymentStatus, redirectUrl, clientToken, expiresAt, orderVersion, isReplay, … }` (201 lần đầu, 200 replay).
  - `checkoutToken` chỉ có khi đơn `AWAITING_SETTLEMENT`, hết hạn nhanh → luôn lấy lại hóa đơn ngay trước khi bấm trả.
  - Giữ nguyên `idempotencyKey` khi thử lại cùng lần trả (kể cả khi token được làm mới); tạo key mới sau khi cổng thanh toán báo lỗi dứt khoát.
  - Lỗi: `400` thanh toán đang tắt hoặc lỗi cổng; `409` đang giữ đối soát / dữ liệu cũ / không còn nợ / đã có checkout đang mở (`Checkout.ZeroBalanceDue`, `Checkout.OpenCheckoutMismatch`, `Checkout.PaidBalanceInsufficientForNewDue`, `Checkout.UncertainProviderOutcome`…); `422` token sai hoặc hết hạn → lấy lại hóa đơn.
  - Có thể trả nhiều lần khi hóa đơn được điều chỉnh tăng; mỗi đơn chỉ một checkout đang mở.

## G9. Hủy đơn V3 — [ ]

- Owner: `POST api/v3/tenant-owner/survey-orders/{orderId}/cancellation`, body `{ expectedOrderVersion, reasonCode, reasonDescription, operationId, payloadFingerprint }`. Owner chỉ tự hủy được trước khi bay.
- Admin: `POST api/v3/system-admin/survey-orders/{orderId}/cancellation-decisions`, body `{ requesterId, decisionKind, requestedRetentionAmount, inputApprovalEvidenceId?, reasonCode, reasonDescription, expectedOrderVersion, operationId, payloadFingerprint }`.
  - `decisionKind`: `CUSTOMER_BEFORE_CAPTURE`, `CUSTOMER_AFTER_ACCEPTABLE_CAPTURE` (cần Admin + bằng chứng kỹ thuật `inputApprovalEvidenceId`), `OPERATIONAL_POSTPONEMENT`, `SERVICE_FAILURE` (hoàn 100%).
- Mã lỗi: `ORDER_NOT_FOUND`, `OWNER_FORBIDDEN`, `ADMIN_DECISION_REQUIRED`, `REFUND_RECONCILIATION_HOLD` (tiền đang chờ đối soát → G9b), `INVALID_RETENTION_AMOUNT` (số VND nguyên ≥ 0), `RetentionExceedsAllowedCap`.
- Gỡ toàn bộ UI hoàn tiền chất lượng cũ (`qualityRefundApi`, `AdminQualityRefundPage`, `OwnerQualityRefundPanel`, `ManagerQualityRefundPanel`, `QualityRefundCaseCard`, `RefundPlantMap`); khiếu nại V3 làm lại ở G11.
- Cần xác định khi làm: danh sách `reasonCode` hợp lệ, và Admin biết có yêu cầu hủy đang chờ bằng cách nào (thiếu API đọc thì ghi thành lỗ hổng BE mới).

## G9b. Admin đối soát tiền đơn V3 — [ ]

- `POST api/v3/system-admin/survey-orders/{orderId}/funding-reconciliations`, body `{ operationId, dispositionKind, expectedOrderVersion, amount, currency, reason (1–2000), evidenceReference (1–1000), surveyPaymentId?, fundingReceiptId?, targetInvoiceRevisionId?, providerReference?, providerTransactionId?, expectedPaymentVersion? }` → `{ decisionId, dispositionKind, paymentStatus, orderStatus, orderVersion, hasOpenReconciliation, confirmedNetReceipts, orderConfirmedNetCash, availableRefundCap, isReplay, … }`.
- `dispositionKind`:
  - `KEEP_EXCLUDED`: giữ ngoài, vẫn còn treo đối soát.
  - `ALLOCATE_TO_CURRENT_INVOICE`: cộng vào hóa đơn hiện tại. Bắt buộc có mã giao dịch ngân hàng (`providerTransactionId`) đã xác minh và đúng bản hóa đơn hiện hành.
  - `ROUTE_TO_REFUND`: chuyển sang hoàn tiền (giữ hạn mức hoàn, chưa chuyển tiền — phần chuyển tiền thuộc V3-08).
- Mỗi khoản tiền về chỉ có một quyết định cuối. Khoản tiền về thiếu mã giao dịch không được tính là đã nhận cho tới khi Admin bổ sung mã.
- Cần xác định khi làm: danh sách đơn cần đối soát và nguồn `surveyPaymentId` / `fundingReceiptId` (thiếu API thì ghi lỗ hổng BE mới).

## G10. Rà soát cuối — [ ]

Tìm trong `src/` và `tests/`: không còn route nào trong "Danh sách gỡ bỏ", không còn trạng thái / purpose / payment purpose / mã lỗi của luồng cũ, không còn test cho các phần đã xóa. Chạy lại typecheck, test, build.

## G11. Chờ BE — phát hành kết quả, cổng Owner, khiếu nại — chờ BE

Theo `PROJECT_MEMORY.md` của BE, các phần sau **chưa có ở BE**, FE chưa làm được:
- **A2.4 (V3-06, đang làm)**: phát hành kết quả khi đủ tiền, thông báo cho Owner, mở cửa sổ khiếu nại, đơn → `COMPLETED`.
- **V3-07**: cổng Owner xem kết quả, ảnh, so sánh lịch sử.
- **V3-08**: khiếu nại, thực hiện hoàn tiền, điều chỉnh sau phát hành.
- Trước khi phát hành, Owner không thấy dữ liệu V3: bản đồ, cây, bản đồ sức khỏe trả `404` (`Plant.NotFound`…) — đúng thiết kế, không phải lỗi FE.

## G12. Admin: chính sách thương mại V3 — [ ] (để cuối, chờ BE-4)

- 8 route `POST api/v3/system-admin/commercial-policies/`: `services`, `revisions`, `prices`, `deposit-policies`, `claim-policies`, `cancellation-policies`, `bundle-versions`, `activations`. Thay `ServicesPage` (phần giá) và `PaymentPoliciesPanel` (cọc, giảm giá combo); xóa route cũ `survey-services`, `survey-deposit`, `survey-combo-discount`.
- Đội BE đã nhận BE-4 và sẽ bổ sung GET. Khi có, làm cả phần xem lẫn form đăng; đọc lại contract lúc đó.
- Trước G12, Admin chưa cấu hình được chính sách V3 trên web (dữ liệu V3 có sẵn từ seeder `SurveyServiceV3Seeder`).

## Không cần làm

- **Refresh token (RT-06 của BE)**: FE đã có — `X-AgriDrone-Session: 1`, cookie (`credentials: 'include'`), 401 → refresh một lần rồi gửi lại, 409 `RefreshConflict` → thử lại (`authApi.ts`, `AuthContext.tsx`, `api/client.ts`). Chỉ cần kiểm cookie trên domain thật khi deploy.
- **`yolo-recalculate-grid`** (`41f9d0c`): body BE khớp `RecalculateTreeGridOptions` hiện có.
- **Báo cáo doanh thu**: FE đã dùng route V3; BE còn nối thêm dữ liệu (V3-09), không đổi contract.

## Nhật ký
- 26/11/2026 — Đối chiếu BE `dd0ada8`, nối checkout trả cọc V3, gỡ checkout và xác nhận giá kiểu cũ. Nối danh sách lần bay và các API bắt đầu, kết thúc và báo lỗi. Ghi BE-7 và BE-8, cập nhật BE-5 theo truy vấn hiện tại. Build đạt và 278 test FE đạt với dữ liệu giả lập. Còn kiểm tra trên môi trường có BE thật.
- 26/11/2026 — Lập kế hoạch sau khi rà soát route FE và BE. Người dùng chọn chuyển sang V3, để các lỗ hổng BE xử lý cuối (đã báo đội BE). Chưa sửa code.
- 26/11/2026 — Cập nhật theo BE commit `fc01761`: BE-1/2/3 đã sửa; bỏ cache `localStorage`; thêm G9b (đối soát tiền), trường đối soát ở hóa đơn Manager, mã lỗi hủy mới. `41f9d0c`, `a463c5a` không ảnh hưởng FE.
- 26/11/2026 — Đối chiếu với `PROJECT_MEMORY.md` và `docs/contracts/survey-business-v3.md` của BE: chính sách thương mại xuống cuối (G12); thêm bảng vòng đời đơn; phát hiện BE-5; G7 làm trang mới; trả phần còn lại sang G8; thêm chi tiết MAP/COMBO, hủy, đối soát; thêm G11; ghi chú cờ thanh toán ở local; RT-06 đã có ở FE.
- 26/11/2026 — G2 gần xong: Manager đề xuất lịch qua `POST api/v3/.../capture-appointments` (không có purpose; chỉ khi đơn `AWAITING_APPOINTMENT` và chưa có lịch hoặc lịch `RESCHEDULE_REQUESTED`), báo vắng mặt (`NoShowModal`, khi đơn `READY_FOR_CAPTURE` + lịch `CONFIRMED`), Owner xác nhận/đổi lịch qua route V3 (`v3Api.ts`). Gỡ `proposeAppointment`, `confirmOwnerAppointment`, `requestOwnerReschedule`, `AppointmentBody`, logic lịch bay bệnh. `npm test` 293/293 ✓, build ✓. Trình duyệt (API giả lập): đề xuất lịch gửi đúng route/body, hiện "Đã đề xuất lịch bay, chờ Owner xác nhận". **Còn lại:** tự test trình duyệt cho báo vắng mặt và Owner xác nhận (đã có test render/API), cập nhật mục G2 + bảng tiến độ. **BE-6 (mới, cần báo BE):** `TenantOwnerSurveyOrderResponseMapper` trả lịch CAPTURE là `PAID_SERVICE`; `SurveyAppointmentResponseMapper.MapOrderStatus` trả trạng thái V3 không có gạch dưới (`AWAITINGDEPOSIT`). FE đã né cả hai.
- 26/11/2026 — Xong G1 (295/295 test, build ✓, tự test trình duyệt với API giả lập). Chưa commit, chưa test tay.
- 26/11/2026 — Xong G0 (296/296 test, build ✓, tự test trình duyệt với API giả lập). Chưa commit, chưa test tay.
- 26/11/2026 — Người dùng quyết định **không chạy song song**: dữ liệu cũ bị bỏ, web chỉ chạy V3. Bỏ `isV3Order()` và nguyên tắc hai luồng; thêm "Danh sách gỡ bỏ" (gỡ trong từng giai đoạn); G10 đổi thành rà soát cuối; G1 gồm cả gỡ form gửi yêu cầu cũ; G9 gỡ hoàn tiền chất lượng cũ.
