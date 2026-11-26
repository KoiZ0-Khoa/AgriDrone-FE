# Kế hoạch FE — Chuyển web sang luồng V3

Mục tiêu: web **chỉ chạy luồng V3** (`ContractScope.V3`, dịch vụ `MAP` hoặc `COMBO`, đơn đầu tiên hoặc đơn tiếp nối): duyệt yêu cầu → lịch hẹn → cọc → bay → bay lại → xử lý dữ liệu → duyệt kết quả → hóa đơn và thanh toán → hủy đơn và đối soát. Chính sách thương mại V3 để cuối cùng.

**Quyết định 26/11/2026 (người dùng):** không chạy song song. Dữ liệu cũ (Legacy) trong DB sẽ bị bỏ, web chuyển hẳn sang V3. Mỗi giai đoạn **thay** code luồng cũ bằng V3 chứ không rẽ nhánh.

**Trạng thái code (26/11/2026):** FE commit gần nhất `24d3b29` (`main` = `ReviewPlant` = `origin/KhoaNV`), cộng thay đổi local của G6 và G7 chưa commit. Đối chiếu với BE `main` = `dd0ada8`. `npm test` 292/292 ✓, typecheck ✓, build ✓. Chưa test với BE thật.

**Nguồn đối chiếu**
- BE code tại `dd0ada8`: `Controllers/V3/*.cs`, `Contracts/Surveys/V3/*.cs`, `IntegrationContracts/Surveys/ISurveyCaptureExecutionCoordinator.cs`, `Database/Surveys/SurveyCaptureExecutionCoordinator.cs`, `MissionPlantGpsPublisher.cs`.
- BE docs: `AgriDrone-BE/docs/contracts/survey-business-v3.md` (mục 6.1–6.5), `PROJECT_MEMORY.md` của đội BE.

**Ký hiệu:** `[ ]` chưa làm · `[~]` đang làm / làm một phần · `[x]` đã code và tự test · thêm "đã test tay" khi người dùng xác nhận với BE thật.

## Nguyên tắc

- **Chỉ V3.** Không giữ nhánh `if (legacy)`. Code, types, nhãn trạng thái, mã lỗi chỉ phục vụ đơn cũ thì xóa trong giai đoạn thay thế nó (xem "Danh sách gỡ bỏ"). *Hiện còn ngoại lệ:* trang nhiệm vụ đang giữ nhánh cũ sau điều kiện `!v3Capture` (G4, G5) — cần gỡ trước G10.
- **Mỗi lần ghi V3 cần khóa chống gửi trùng.** Coordinator dùng `operationId` (UUID) + `payloadFingerprint` (1–128 ký tự, FE dùng SHA-256 qua `v3OperationFor`); result-review, invoice, đối soát dùng `operationId`; balance-checkout dùng `idempotencyKey`. Gửi lại đúng nội dung thì giữ nguyên khóa để BE trả replay (`isReplay: true`). Nội dung đổi thì tạo khóa mới.
- **Kết quả của coordinator không trả `orderVersion`.** Sau mỗi thao tác tải lại đơn (`getAssignedOrder` / `getOwnerOrder`) và danh sách lần bay.
- **Mã HTTP của V3** (contract 6.3): `400` thiếu/sai trường, `422` lỗi nghiệp vụ, `403` Manager không được phân công hoặc Owner bị thu hồi, `404` không có dữ liệu, `409` dữ liệu cũ hoặc trùng khóa khác nội dung (mã ở `ProblemDetails.extensions.errorCode`). Coordinator trả `409` với mã chữ hoa ở `title` (`client.ts` đọc thành `ApiError.code`). Dịch cả hai loại mã.
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

Đã kiểm lại từng mục trên code BE `dd0ada8` (26/11/2026).

| # | Lỗ hổng | Trạng thái | Ảnh hưởng tới FE |
| --- | --- | --- | --- |
| BE-1 | Không có API trả phần còn lại cho đơn V3 | ✅ Đã sửa (`fc01761`) | G8 dùng `balance-checkouts` |
| BE-2 | Bộ lọc đơn không có trạng thái V3 | ✅ Đã sửa (`fc01761`) | G0 |
| BE-3 | Không có GET danh sách lần bay | ✅ Đã sửa (`fc01761`) | G4, G6 dùng `GET capture-attempts` |
| BE-4 | Chính sách thương mại V3 chỉ có POST, không có GET | ❌ Đã báo BE, sẽ bổ sung sớm | G12 (cuối) |
| **BE-5** | `dd0ada8` đã cho `MissionPlantGpsPublisher` nhận mục đích `Capture`, nhưng publisher, `MappingCandidatesReadyV4Handler` và `FarmBaseMapInternalApprovalOrchestrator` vẫn lọc `survey.capture_attempts.mission_id`. Cột này không tồn tại: `CaptureAttemptConfiguration` bỏ qua `MissionId`; liên kết thực nằm ở `mission.drone_missions.capture_attempt_id` | ❌ Chờ BE sửa truy vấn | G5: chặn gửi GPS cây V3 và duyệt bản đồ V3 |
| BE-6 | Owner GET gắn nhãn `PAID_SERVICE` cho lịch Capture (`TenantOwnerSurveyOrderResponseMapper`). Response lịch hẹn trả trạng thái V3 không gạch dưới (`AWAITINGDEPOSIT`) | ⚠️ Lỗi nhỏ, FE đã né | G2: FE bỏ qua nhãn mục đích và lấy trạng thái từ GET đơn |
| **BE-7** | `GetSurveyPaymentHistoryQueryHandler.MapPurpose` thiếu `PaymentPurpose.OrderDeposit => "ORDER_DEPOSIT"`, ném exception khi lịch sử có khoản cọc V3 | ❌ Chờ BE sửa mapper | G3, G8: FE giữ link phiên vừa tạo khi lịch sử lỗi 5xx và đọc lại đơn |
| **BE-8** | `GET /api/system-manager/survey-orders/{id}/drones/available` vẫn suy mục đích nhiệm vụ từ loại dịch vụ cũ và điều kiện lịch/tiền cũ. API drone theo farm cần `startAt`, `endAt`, mà API đơn của Manager không trả khung giờ lịch | ❌ Chờ BE: trả drone theo lịch Capture đã xác nhận, hoặc thêm khung giờ vào API đơn | G4 (chuẩn bị lần bay), G6 (chọn drone bay lại) |
| **BE-9** | GET lần bay không trả manifest hiện hành. `input-approval` cần `processingJobId` nhưng chưa rõ lấy từ đâu; chốt dữ liệu chưa chuyển nhiệm vụ sang sẵn sàng xử lý | ❌ Chờ BE làm rõ | G5: dừng ở "chờ duyệt dữ liệu đầu vào" |
| **BE-10** | `DetectMissionDiseasesCommandHandler` truy vấn `survey.survey_order_commercial_snapshots` (bảng thật là `survey.order_commercial_snapshots`). Response chưa trả `jobId`, `sourceRevision` mà `combo-analysis/handoffs` cần | ❌ Chờ BE sửa | G5 → G7: chưa nối được COMBO |
| **BE-11** | Ranh giới đơn First: chưa có API để Manager xác nhận phiên bản ranh giới (từ ảnh trực giao) và gắn cùng phiên bản cho đơn và nhiệm vụ | ❌ Chờ BE | G5: thiếu ranh giới khi gửi GPS cho đơn First |

## Bảng tiến độ

| # | Giai đoạn | Màn hình chính | Commit | Trạng thái |
| --- | --- | --- | --- | --- |
| G0 | Nền tảng: trạng thái V3, MAP/COMBO, client + mã lỗi | `v3Workflow.ts`, `v3Types.ts`, `v3Api.ts`, `orderWorkflow.ts`, `ownerOrderWorkflow.ts` | `94cb4c7` | [x] chưa test tay |
| G1 | Gửi và duyệt yêu cầu khảo sát V3 | `SurveyIntakePage.tsx`, `RequestsPage.tsx` | `94cb4c7` | [x] chưa test tay |
| G2 | Lịch hẹn Capture (đề xuất, xác nhận/đổi, vắng mặt) | `OrderActionModals.tsx`, `OwnerAppointmentDialog.tsx`, `OwnerPaymentsPage.tsx` | `94cb4c7` | [x] chưa test tay |
| G3 | Cọc V3 (`OrderDeposit`) | `SurveyPaymentPanel.tsx`, `OwnerPaymentsPage.tsx` | `bf4cbb4` | [x] chưa test tay, chờ BE-7 |
| G4 | Chuẩn bị lần bay và bay | `PrepareMissionModal.tsx`, `ManagerMissionDetailPage.tsx`, `V3CaptureFlightActions.tsx` | `bf4cbb4` | [~] bắt đầu/kết thúc/báo lỗi xong; chuẩn bị lần bay chưa nối (BE-8) |
| G5 | Sau bay: tải dữ liệu, chốt và duyệt dữ liệu đầu vào, xử lý MAP/COMBO | `ManagerMissionDetailPage.tsx`, `ManagerBaseMapsPage.tsx` | `24d3b29` | [~] xong tới bước chốt dữ liệu; chờ BE-5, BE-9, BE-10, BE-11 |
| G6 | Bay lại + lịch sử chuyến bay | `ManagerOrdersPage.tsx`, `CaptureAttemptHistory.tsx`, `QualityReflightModal` | chưa commit | [x] chưa test tay; nguồn drone tạm (BE-8) |
| G7 | Duyệt kết quả V3 (result-review, combo-reviews, freeze) | `ManagerResultReviewPage.tsx`, `resultReviewWorkflow.ts` | chưa commit | [x] chưa test tay; chờ G5 để có dữ liệu thật |
| G8 | Hóa đơn V3 + Owner trả phần còn lại | trang mới, `OwnerPaymentsPage.tsx` | — | [ ] |
| G9 | Hủy đơn V3 (Owner yêu cầu, Admin quyết định) | `OwnerPaymentsPage.tsx`, `SystemOrdersPage.tsx` | — | [ ] |
| G9b | Admin đối soát tiền đơn V3 (`funding-reconciliations`) | `SystemOrdersPage.tsx` | — | [ ] |
| G10 | Rà soát cuối: không còn route, type, nhãn, mã lỗi nào của luồng cũ | toàn bộ | — | [ ] |
| G11 | Chờ BE: phát hành kết quả cho Owner, cổng Owner, khiếu nại/hoàn tiền V3 | — | — | chờ BE (A2.4, V3-07, V3-08) |
| G12 | Admin: chính sách thương mại V3 (để cuối, chờ BE-4) | `ServicesPage.tsx`, `PaymentPoliciesPanel.tsx` | — | [ ] |

**Thứ tự làm tiếp:** G8 → G9/G9b. Phần còn lại của G4 và G5 làm theo mục "Việc để sau" ngay bên dưới, khi BE sửa lỗ hổng tương ứng.

## Việc để sau — phần còn lại của G4 và G5

Ghi lại để triển khai khi BE sửa. Mỗi việc ghi rõ đang chờ gì; việc không chờ BE thì làm được bất cứ lúc nào (nên gộp vào G10 nếu chưa làm).

**G4 — Chuẩn bị lần bay và bay**

| # | Việc | Chờ | Ghi chú |
| --- | --- | --- | --- |
| G4-1 | Thêm `prepareCaptureAttempt` vào `v3Api.ts`: `POST api/v3/system-manager/survey-orders/{orderId}/capture-attempts`, body `{ droneId, expectedOrderVersion, operationId, payloadFingerprint, reason? }` → `{ attemptId, attemptIndex, missionId, status, version }` | — | Dùng `v3OperationFor`; lỗi coordinator đã có bản dịch (G0) |
| G4-2 | Đổi `PrepareMissionModal` sang G4-1 khi đơn `READY_FOR_CAPTURE` và chưa có lần bay đang hoạt động; bỏ `prepareMissionSet` / "bộ nhiệm vụ" BASE/HEALTH/READY | **BE-8** (danh sách drone theo lịch Capture) | Tạm thời có thể dùng cách lọc drone của G6 (API drone theo farm + `droneSupportsService`) nếu BE chốt dùng chung |
| G4-3 | Nối `v3ErrorMessage` vào `missionError` (`missionWorkflow.ts`), cập nhật các test nhiệm vụ nạp thêm `v3Workflow` | — | Hiện lỗi V3 trên trang nhiệm vụ vẫn hiện tiếng Anh |
| G4-4 | Gỡ nhánh `!v3Capture` trên `ManagerMissionDetailPage`: nút start / complete-flight / fail-flight / cancel / reschedule kiểu cũ, `RescheduleMissionModal`, `rescheduleMission`, `cancelMission` | — | Sau khi gỡ, trang nhiệm vụ chỉ còn luồng V3 |
| G4-5 | Thay `findMissionsBySurveyOrder` (đoán từ mã `ORD-`) ở `ManagerOrdersPage`, `HealthFindingsTable`, `healthReviewWorkflow` bằng `GET capture-attempts` | — | Trang đơn V3 đã dùng lịch sử lần bay (G6); còn nhánh cũ `!v3Order` |
| G4-6 | Kiểm tay: Manager chuẩn bị → checklist → bắt đầu → kết thúc / báo lỗi với BE thật | BE-8, cờ dev | |

**G5 — Sau bay**

| # | Việc | Chờ | Ghi chú |
| --- | --- | --- | --- |
| G5-1 | Duyệt dữ liệu đầu vào: nút "Duyệt dữ liệu" → `POST .../capture-attempts/{attemptId}/input-approval` với `manifestId`, `manifestFingerprint`, `processingJobId`, `notes?` | **BE-9** (GET lần bay trả manifest hiện hành; nguồn `processingJobId`; chuyển nhiệm vụ sang sẵn sàng xử lý) | Hiện FE dừng ở "chờ duyệt dữ liệu đầu vào" |
| G5-2 | Gửi GPS cây V3 (`plant-gps/publish`) sau YOLO, kèm phiên bản ranh giới gắn với đơn và nhiệm vụ | **BE-5**, **BE-11** | Đơn First cần BE-11 để có ranh giới |
| G5-3 | Duyệt bản đồ nháp V3 qua `approve-internal` (`ManagerBaseMapsPage`) — kiểm lại khi BE-5 xong | **BE-5** | FE đã nối route, BE còn lỗi truy vấn |
| G5-4 | Xác nhận ranh giới từ ảnh trực giao cho đơn First (thay `OrthophotoCornersModal` / `BoundaryVerificationModal` cũ nếu BE dùng API mới) | **BE-11** | Sau đó gỡ màn ranh giới cũ trong "Danh sách gỡ bỏ" |
| G5-5 | COMBO: `disease-detect` → `POST api/v3/farms/{farmId}/missions/{missionId}/combo-analysis/handoffs` với `jobId`, `sourceRevision` từ response nhận diện | **BE-10** | Dịch `DetectDiseases.IncompleteImageCoverage`, `DetectDiseases.ZeroInferenceCoverage`; gỡ `plant-health/publish` |
| G5-6 | Gỡ nút reset / finalize upload kiểu cũ (đang chỉ ẩn với nhiệm vụ V3) | — | Gộp với G4-4 |
| G5-7 | Kiểm tay với PostgreSQL, MinIO và dịch vụ ghép ảnh thật: upload → nhập Blackbox → chốt → duyệt → ghép ảnh → YOLO → gửi GPS | BE-5, BE-9, BE-11 | |

## Danh sách gỡ bỏ (luồng cũ)

"Đã xác nhận" là BE chặn đơn V3 hoặc chỉ dùng trạng thái của luồng cũ; "kiểm khi làm" là cần đọc lại handler BE trước khi xóa.

| Phần trên web | Route BE | Căn cứ | Gỡ ở | Đã gỡ |
| --- | --- | --- | --- | --- |
| Nhãn + thông báo trạng thái cũ, `baselineStageNotices` | — | Đơn V3 không vào các trạng thái này | G0 | ✅ `94cb4c7` |
| Gửi yêu cầu kiểu cũ: `submitPublicRequest`, `submitNewFarmRequest`, `submitExistingFarmRequest`, `getPublicServices` | `api/public/survey-requests`, `tenant-owner/survey-requests/new-farm`, `tenant-owner/farms/{id}/survey-requests` | Đã có bản V3 | G1 | ✅ `94cb4c7` |
| Admin duyệt kiểu cũ | `system-admin/survey-requests/{id}/approve` | Thay bằng route V3 | G1 | ✅ `94cb4c7` |
| Đề xuất lịch `BASELINE_MAPPING` / `PAID_SERVICE`; Owner xác nhận/đổi lịch kiểu cũ | `system-manager/.../appointments`, `tenant-owner/.../appointments/{id}/confirm|request-reschedule` | Đã xác nhận: BE từ chối mục đích khác `Capture` với đơn V3 | G2 | ✅ `94cb4c7` |
| Trả cọc `BASELINE_DEPOSIT`, trả phần còn lại `FINAL_BALANCE` (POST), logic cọc cũ trong `ownerOrderWorkflow.ts` | `tenant-owner/.../payments` (POST) | Đã xác nhận: đơn V3 chỉ nhận `OrderDeposit` | G3 | ✅ `bf4cbb4` (GET lịch sử vẫn dùng, xem BE-7) |
| Xác nhận số trụ và giá (`PricingConfirmationModal`, `confirmOrderPricing`) | `.../pole-count/confirm` | Đã xác nhận: chỉ nhận `Legacy` | G3 | ✅ `bf4cbb4` |
| Ghi xác minh ranh giới theo đơn (`verifyOrderBoundary`, `BoundaryVerificationModal`) | `POST .../boundary-scope/verify` | Điều kiện trạng thái của luồng cũ. GET `boundary-scope` vẫn đọc được đơn V3 nên giữ | G4 | ❌ |
| Thu thập ranh giới GNSS (`BoundaryCapturePanel`…), duyệt route bay bản đồ nền, đánh dấu 4 góc ảnh trực giao (`OrthophotoCornersModal`) | `.../boundary-capture-sessions*`, `.../baseline-route-plans/*`, `.../farm-boundary/mark-orthophoto-corners` | Kiểm khi làm; phụ thuộc BE-11 (ranh giới First) | G4 / G5 | ❌ |
| Chuẩn bị bộ nhiệm vụ kiểu cũ (`PrepareMissionModal` → `prepareMissionSet`, `getAvailableDronesForOrder`) | `system-manager/survey-orders/{id}/missions/prepare`, `.../drones/available` | Thay bằng `POST capture-attempts`; chờ BE-8 | G4 | ❌ còn dùng |
| start / complete-flight / fail-flight / cancel / reschedule kiểu cũ, `RescheduleMissionModal` | `.../missions/{id}/start|complete-flight|fail-flight|cancel|reschedule` | Thay bằng coordinator V3 | G4, G6 | ❌ đã ẩn với nhiệm vụ V3 (`!v3Capture`), code còn |
| Đoán đơn từ mã nhiệm vụ `ORD-…` (`findMissionsBySurveyOrder`, `surveyOrderIdFromMissionCode`) | — | Nối qua `GET capture-attempts` | G4 / G6 | ❌ còn dùng ở `ManagerOrdersPage`, `HealthFindingsTable`, `healthReviewWorkflow` |
| Reset upload, finalize upload kiểu cũ | `api/missions/{id}/farms/{id}/upload/reset|finalize` | Đã xác nhận: chặn nhiệm vụ V3 | G5 | ❌ đã ẩn với nhiệm vụ V3, code còn |
| Chuyển kết quả sức khỏe kiểu cũ | `.../missions/{id}/plant-health/publish` | Thay bằng `combo-analysis/handoffs` (chờ BE-10) | G5 | ❌ |
| Bản nháp bản đồ nền theo farm (`baseMapApi`) | `system-manager/farms/{id}/base-map-drafts*` | `24d3b29` đổi duyệt sang `approve-internal` và giữ trang | G5 / G7 | giữ, đã cập nhật |
| Duyệt kết quả sức khỏe theo đơn (`ManagerHealthReviewPage`, `HealthReleasePanel`, `healthReviewApi`) | `system-manager/survey-orders/{id}/health-results/*`… | Đã xác nhận: `PlantHealthReviewService` chỉ nhận `Legacy` | G10 | ❌ không còn liên kết với đơn V3 (G7) |
| Duyệt sức khỏe theo farm (`plantHealthReviewApi`) | `system-manager/farms/{id}/plant-health*` | Kiểm khi làm | G7 | ❌ |
| Hoàn tiền chất lượng (`qualityRefundApi`, `AdminQualityRefundPage`, `OwnerQualityRefundPanel`, `ManagerQualityRefundPanel`, `QualityRefundCaseCard`, `RefundPlantMap`) | `.../quality-refunds*` | Luồng cũ; khiếu nại V3 là V3-08 | G9 (làm lại ở G11) | ❌ |
| Dịch vụ, giá, cọc, giảm giá combo kiểu cũ (`ServicesPage`, `PaymentPoliciesPanel`) | `system-admin/survey-services*`, `survey-deposit`, `survey-combo-discount` | Thay bằng `commercial-policies` | G12 | ❌ |
| 5 mã lỗi BE đã bỏ (`MissionPlanning.BaselineWindowRequired`, `ServiceWindowRequired`, `ServiceWindowNotAllowed`, `BaselineWindowNotAllowed`, `ScheduleOutsideAppointment`) và mã lỗi chỉ của các route trên | — | — | G10 | ❌ |

**Giữ lại** (V3 vẫn dùng): đăng nhập / refresh token, nông trại và khu vực, drone, checklist trước bay (`preflight`), upload media / telemetry, readiness, Metashape, cắt tiles, YOLO, `plant-gps` (lưu nháp), `disease-detect`, `yolo-recalculate-grid`, `GET boundary-scope`, `GET tenant-owner/.../payments`, bản nháp bản đồ nền (`approve-internal`), quản lý Manager và tenant, báo cáo doanh thu V3.

---

## G0. Nền tảng — [x] chưa test tay (`94cb4c7`)

- `v3Types.ts`, `v3Workflow.ts` (không có import lúc chạy): nhãn 12 trạng thái đơn và 10 trạng thái lần bay, hướng dẫn từng bước cho Manager (`v3OrderStageNotices`), tên enum cho bộ lọc Owner, `activeCaptureAttempt` / `latestCaptureAttempt`, `v3ServiceKind` / `screensDisease`, `v3OperationFor`, `v3ErrorMessages` (mã coordinator + `CaptureAttempts.*`, `Order.NotFound`, `Cancellation.RetentionExceedsAllowedCap`, `ACTIVE_CAPTURE_IN_FLIGHT`).
- `v3Api.ts`: tập trung mọi route `api/v3/...`; mỗi giai đoạn thêm route của mình.
- `client.ts`: đọc mã lỗi coordinator từ `title` khi không có `errorCode`.
- `orderWorkflow.ts` / `ownerOrderWorkflow.ts`: nhãn, hướng dẫn và bộ lọc (Manager, Admin, Owner) chỉ còn trạng thái V3.
- `workflow.ts`: `workflowError` dịch mã V3. **`missionError` chưa nối** `v3ErrorMessage` (chuyển sang G4).
- Tự test: `v3-foundation.test.mjs`; trình duyệt với API giả lập (nhãn, bộ lọc gửi `status=READY_FOR_CAPTURE`, cảnh báo đơn chờ bay lại).

## G1. Gửi và duyệt yêu cầu khảo sát V3 — [x] chưa test tay (`94cb4c7`)

- `getSurveyIntakeCatalogue` chỉ đọc `GET api/v3/catalog/survey-services`; danh mục đóng → không có dịch vụ, không quay về danh mục cũ. Form gửi chỉ dùng `api/v3/public/survey-requests` và `api/v3/tenant-owner/survey-requests`; giới hạn theo contract V3 (địa chỉ 500, số trụ 1.000.000, ghi chú 2.000, diện tích 0,01–10.000 ha).
- Admin phê duyệt qua `POST api/v3/system-admin/survey-requests/{id}/approve` (cùng body, `Idempotency-Key`, response với route cũ). `start-review` / `reject` giữ route chung (V3 chưa có route riêng, BE không chặn theo scope). Thông báo sau duyệt theo V3 (mã đơn, bước hiện tại, lời mời Owner nếu có).
- Tự test: `surveys.test.mjs`, `survey-ui.test.mjs`; trình duyệt với API giả lập (phê duyệt gửi đúng route V3, trang đăng ký chỉ có MAP/COMBO).

## G2. Lịch hẹn Capture — [x] chưa test tay (`94cb4c7`)

| Ai | Route V3 | Body |
| --- | --- | --- |
| Manager đề xuất | `POST api/v3/system-manager/survey-orders/{orderId}/capture-appointments` | `{ scheduledDate, expectedOrderVersion, expectedCurrentAppointmentId?, expectedCurrentAppointmentVersion? }` (không có `purpose`) |
| Owner xác nhận | `POST api/v3/tenant-owner/survey-orders/{orderId}/capture-appointments/{appointmentId}/confirm` | `{ expectedOrderVersion, expectedAppointmentVersion }` |
| Owner xin đổi lịch | `POST .../capture-appointments/{appointmentId}/request-reschedule` | `{ reason (1–1000), expectedOrderVersion, expectedAppointmentVersion }` |
| Manager báo vắng mặt | `POST api/v3/system-manager/survey-orders/{orderId}/capture-appointments/no-show` | `{ appointmentId, expectedOrderVersion, expectedAppointmentVersion, occurredAt (UTC), reason, evidenceReference, operationId, payloadFingerprint }` → `{ noShowId, occurrenceIndex, disposition (FreeReschedule / AdminReviewRequired), orderStatus, appointmentStatus }` |

- Manager đề xuất khi đơn `AWAITING_APPOINTMENT` và chưa có lịch, hoặc lịch `RESCHEDULE_REQUESTED`. Ngày từ hôm nay (giờ Việt Nam). Báo vắng mặt khi đơn `READY_FOR_CAPTURE` và lịch `CONFIRMED` (`NoShowModal`).
- Owner xác nhận lịch `PROPOSED` khi đơn `AWAITING_APPOINTMENT`; xin đổi lịch khi lịch `PROPOSED`/`CONFIRMED` và đơn còn `AWAITING_APPOINTMENT`/`AWAITING_DEPOSIT`/`READY_FOR_CAPTURE`. Bỏ qua nhãn `purpose` (BE-6).
- Đã gỡ `proposeAppointment`, `confirmOwnerAppointment`, `requestOwnerReschedule`, `AppointmentBody`, logic lịch bay bệnh.
- Tự test: test logic + API + render (`survey-orders`, `owner-orders`, `survey-ui`, `survey-payments-ui`). Trình duyệt với API giả lập mới kiểm luồng **đề xuất lịch**; báo vắng mặt và Owner xác nhận chỉ kiểm bằng test.

## G3. Cọc V3 — [x] chưa test tay, chờ BE-7 (`bf4cbb4`)

- `initiateDepositCheckout` → `POST api/v3/tenant-owner/survey-orders/{orderId}/deposit-checkouts`, body `{ expectedOrderVersion }`. Response 201: `surveyPaymentId`, `surveyOrderId`, `appointmentId`, `amount` (số còn phải nộp theo nghĩa vụ cọc), `currency`, `paymentStatus`, `redirectUrl`, `expiresAt`, phiên bản. FE hiện số tiền trước khi mở cổng thanh toán.
- `ownerOrderWorkflow.ts`: chỉ còn `canInitiateOwnerDeposit` / `ownerDepositBody`; nhãn thanh toán `ORDER_DEPOSIT`, `FINAL_BALANCE`.
- FE xác nhận thanh toán bằng trạng thái đơn/giao dịch từ BE. Khôi phục link sau khi tải lại trang cần lịch sử khớp phiên đã lưu; khi lịch sử lỗi (BE-7) FE giữ link của phiên vừa tạo và đọc lại đơn.
- Đã gỡ trả cọc/phần còn lại kiểu cũ và `PricingConfirmationModal`. Trả phần còn lại V3 làm ở G8.
- Còn lại: hoàn tiền/chargeback cọc trước khi bay có thể đưa đơn về `AWAITING_DEPOSIT` — kiểm khi test tay.

## G4. Chuẩn bị lần bay và bay — [~] (`bf4cbb4`)

| Bước | Route | Trạng thái FE |
| --- | --- | --- |
| Chuẩn bị | `POST api/v3/system-manager/survey-orders/{orderId}/capture-attempts`, body `{ droneId, expectedOrderVersion, operationId, payloadFingerprint, reason? }` → `{ attemptId, attemptIndex, missionId, status, version }` | ❌ **chưa có trong `v3Api.ts`**; `PrepareMissionModal` vẫn gọi `prepareMissionSet` kiểu cũ. Chờ BE-8 để có danh sách drone |
| Checklist | giữ `GET/POST system-manager/farms/{farmId}/missions/{missionId}/preflight[/checklist]` | ✅ dùng chung |
| Bắt đầu bay | `POST .../capture-attempts/{attemptId}/start` | ✅ `V3CaptureFlightActions` |
| Kết thúc bay | `POST .../capture-attempts/{attemptId}/complete-flight` (`endedAt`, `flightCompletedReceipt`) | ✅ `V3CaptureFlightActions` |
| Báo lỗi | `POST .../capture-attempts/{attemptId}/fail-flight` (`failedAt`, `failureReason`, `failureIncidentEvidence`) | ✅ `V3CaptureFlightActions` |

- Trang nhiệm vụ nhận nhiệm vụ V3 qua `purpose === CAPTURE` hoặc mã `V3CAP-` / `V3R{n}-` (`v3Capture`), tìm lần bay qua `GET capture-attempts` theo `missionId`, có bước riêng cho V3.
- Coordinator sao chép `FarmBoundaryVersionId` từ đơn khi tạo nhiệm vụ.
- **Còn lại:** xem "Việc để sau" (G4-1 … G4-6).

## G5. Sau bay — [~] xong tới bước chốt dữ liệu (`24d3b29`)

1. **Tải dữ liệu** qua API media và telemetry hiện có; BE tính SHA-256 khi nhận tệp. FE cho upload/nhập Blackbox khi đơn `AWAITING_CAPTURE_UPLOAD` và lần bay `AWAITING_UPLOAD`. Nút reset/finalize cũ ẩn với nhiệm vụ V3. ✅
2. **Chốt dữ liệu đầu vào** qua `POST .../capture-attempts/{attemptId}/input-manifest/freeze` (`missionId`, phiên bản đơn/lần bay, khóa thao tác). FE kiểm readiness (ảnh, phiên upload đang mở), xác nhận trước khi chốt, hiện số tệp và dung lượng; sau khi tải lại đọc trạng thái từ GET lần bay. ✅
3. **Duyệt dữ liệu đầu vào** (`POST .../input-approval`: `manifestId`, `manifestFingerprint`, `processingJobId`): FE chỉ hiện trạng thái chờ duyệt. ❌ chờ BE-9.
4. **Xử lý theo dịch vụ:**
   - MAP và phần bản đồ của COMBO: ghép ảnh, cắt tiles, YOLO, tải CSV dùng API hiện có. Gửi GPS V3 chờ BE-5 và BE-11. ❌
   - Duyệt bản đồ nháp (`ManagerBaseMapsPage`) gọi `POST .../base-map-drafts/{id}/approve-internal`. Với bản đồ V3 phụ thuộc BE-5. ⚠️
   - COMBO: `disease-detect` → `POST api/v3/farms/{farmId}/missions/{missionId}/combo-analysis/handoffs` chờ BE-10. ❌
- Chưa kiểm thử với PostgreSQL và dịch vụ ghép ảnh thật.
- **Còn lại:** xem "Việc để sau" (G5-1 … G5-7).

## G6. Bay lại + lịch sử chuyến bay — [x] chưa test tay (chưa commit)

**Contract BE (`dd0ada8`):** `POST api/v3/system-manager/survey-orders/{orderId}/capture-attempts/{parentAttemptId}/quality-reflights`, body `{ droneId, scheduledDate, expectedOrderVersion, expectedParentAttemptVersion, reason (1–500), technicalQualityEvidence (1–500), operationId, payloadFingerprint }` → `{ success, successorAttemptId, successorAttemptIndex, newMissionId, status, version }`. Điều kiện coordinator: đơn `AWAITING_REFLIGHT_DECISION`, lần bay cha `FLIGHT_FAILED` hoặc `REFLIGHT_REQUIRED`, phiên bản khớp, khoản cọc còn đủ, drone hoạt động trong ngày và có đủ khả năng của dịch vụ (MAP: `BASELINE_MAPPING`; COMBO: thêm `PLANT_HEALTH`). BE hủy/thay lịch cũ, tạo lịch Capture mới ở trạng thái **chờ Owner xác nhận**, tạo lần bay mới (`PLANNED`) và nhiệm vụ mới `V3R{n}-{orderId:N}` đã lên lịch; đơn về `AWAITING_APPOINTMENT`. Không cần bước "chuẩn bị lần bay" (G4-1) cho lần bay lại.

**Đã làm (26/11/2026):**
- `v3Types.ts`: `QualityReflightBody`, `QualityReflightResult`. `v3Api.ts`: `createQualityReflight`.
- `v3Workflow.ts`: `captureAttemptActionLabels` (12 thao tác `CaptureAttemptAction` của BE), `reflightParentAttempt` (lần mới nhất, `FLIGHT_FAILED`/`REFLIGHT_REQUIRED`, không có lần đang hoạt động), `canCreateQualityReflight`, `droneSupportsService`.
- `orderWorkflow.ts`: `qualityReflightBody` — kiểm dữ liệu đơn khớp, ngày từ hôm nay (giờ Việt Nam), drone, lý do và bằng chứng 1–500 ký tự; gửi đúng phiên bản đơn và lần bay cha đang hiển thị.
- `CaptureAttemptHistory.tsx` (mới): mục **Lịch sử chuyến bay** trên trang đơn V3 — mỗi lần bay (mới nhất trên cùng) có trạng thái, nhãn "Đang hoạt động", "Bay lại từ lần N", giờ bắt đầu/kết thúc, liên kết nhiệm vụ qua `missionId`, và dòng thời gian thao tác (tên thao tác, thời điểm, trạng thái trước → sau, lý do). Thay danh sách một dòng của `bf4cbb4`.
- `QualityReflightModal` (`OrderActionModals.tsx`): ngày bay lại, drone, lý do, bằng chứng kỹ thuật; khóa thao tác qua `v3OperationFor`. Sau khi tạo: thông báo kèm liên kết nhiệm vụ mới, tải lại đơn và lịch sử.
- `ManagerOrdersPage.tsx`: nút **Bay lại** khi dữ liệu đơn khớp và `canCreateQualityReflight`.
- **Nguồn drone tạm thời (BE-8):** `GET /api/system-manager/farms/{farmId}/drones/available?startAt&endAt&purpose=BaselineMapping` cho đúng ngày đã chọn (cả ngày giờ Việt Nam), rồi lọc trên FE bằng `droneSupportsService`. Coordinator vẫn kiểm lại drone khi tạo. Cần BE xác nhận nguồn này trước khi nghiệm thu.

**Tự test:** `tests/v3-reflight.test.mjs` 6 test ✓ (chọn lần bay cha, lọc drone theo dịch vụ, thân yêu cầu và các trường hợp từ chối, route + dịch lỗi coordinator, đủ nhãn thao tác). `survey-ui.test.mjs`: lịch sử, nút Bay lại chỉ hiện đúng trạng thái, "Bay lại từ lần 1". `npm test` 285/285 ✓, typecheck ✓, build ✓. Trình duyệt với API giả lập: lịch sử hiện đủ 4 bước của lần bay lỗi; danh sách drone gọi đúng khung ngày 30/11 (giờ Việt Nam) và chỉ còn drone COMBO; tạo bay lại gửi 1 request đúng route, phiên bản đơn 12 / lần bay cha 6, fingerprint 64 ký tự; sau đó hiện thông báo, mất nút Bay lại, lịch sử có "Lần bay 2 · Bay lại từ lần 1".

**Còn lại:** test tay với BE thật; xác nhận nguồn drone (BE-8). Việc thay `findMissionsBySurveyOrder` và gỡ `RescheduleMissionModal` chuyển sang G4-4, G4-5.

## G7. Duyệt kết quả V3 — [x] chưa test tay (chưa commit)

**Contract BE (`dd0ada8`) đã đọc:**
- `GET .../result-review` → `V3SurveyResultReviewApiResponse`: phiên bản đơn, `serviceCode`, `screensDisease`, lần bay, số trụ đã xác minh + snapshot/fingerprint/revision, kết quả đã chốt (nếu có), `comboPendingBatch` (phát hiện, ngoại lệ ranh giới, vùng bệnh kèm thành viên và hướng dẫn đề cử, `blockingReasons` dạng `"SourceType:SourceId:ReasonCode"`), `currentComboReview` (tóm tắt + quyết định lần trước), `expectedFreezeTokens`.
- `POST .../result-review/combo-reviews` (`RecordV3ComboReviewRequest`): `operationId`, phiên bản đơn, `expectedBatchId` / `SourceRevision` / `BatchFingerprint`, `expectedPreviousReviewId`, `outcome` (`Approved` / `Rejected`), `reviewReason` (1–500), quyết định cho **mọi** phát hiện (`Accept` / `Exclude`), vùng (`Approve` / `Reject` / `Adjust`), mục chặn (`Resolved` / `AcceptedWithJustification` / `Excluded` / `Corrected` / `Unresolved`), `confirmNoDiseaseObserved`, `negativeResultConfirmationEvidence`.
- Quy tắc BE: loại phát hiện, từ chối vùng, xử lý mục chặn cần lý do **và** ảnh bằng chứng thuộc lô; duyệt vùng có hướng dẫn đề cử phải chọn một; thành viên vùng được duyệt phải được chấp nhận; mục chặn `Excluded` thì phát hiện liên quan phải bị loại; `Approved` khi còn mục chặn chưa xử lý bị từ chối; `Approved` mà không chấp nhận phát hiện nào cần xác nhận không ghi nhận nghi bệnh (+ bằng chứng khi lô có phát hiện, + BE kiểm phủ ảnh).
- `POST .../result-review/freeze` (`FreezeV3InternalResultRequest`): `operationId`, token từ `expectedFreezeTokens`, `reviewDecision` (`Approved` / `ApprovedWithObservations`), `freezeReason` (1–500). MAP không được gửi token COMBO.

**Đã làm (26/11/2026):**
- `v3Types.ts`: types cho review, lô COMBO, quyết định, tóm tắt, token chốt, body/response duyệt và chốt. `v3Api.ts`: `getResultReview`, `recordComboReview`, `freezeResultReview`.
- `resultReviewWorkflow.ts` (mới, không import lúc chạy): nhãn quyết định; `parseBlockingReason` / `blockerItems`; `initialComboReviewDraft` (nạp lại lần duyệt trước nếu có; mặc định chấp nhận phát hiện, duyệt vùng, chọn sẵn hướng dẫn khi chỉ có một, mục chặn "Chưa xử lý"); `comboReviewProblems` (kiểm trước theo đúng quy tắc BE ở trên); `comboReviewBody` (tự đính kèm ảnh bằng chứng của chính mục — mục chặn tìm theo SourceId, không thấy thì dùng ảnh của lô); `freezeBlocker`, `defaultFreezeDecision`, `freezeResultBody`; `isStaleReviewError`.
- `v3Workflow.ts`: thêm bản dịch mã lỗi duyệt/chốt (`ComboReview.*`, `ComboBatch.*`, `CountSnapshot.*`, `FreezeResult.*`, `SurveyOrder.VersionConflict`, `Operation.Conflict`…).
- `ManagerResultReviewPage.tsx` (mới), route `/manager/orders/:orderId/result-review`: tóm tắt (số trụ đã xác minh, phiên bản, trạng thái lần bay, đã chốt hay chưa); với COMBO có bảng phát hiện / vùng bệnh / mục chặn, kết luận, lý do, xác nhận âm tính, danh sách việc còn thiếu, nút **Gửi kết quả duyệt**; mục **Chốt kết quả nội bộ** (kết luận + lý do) chỉ mở khi đủ điều kiện. Lỗi 409 → nút "Tải lại dữ liệu duyệt" (đọc lại GET, bỏ khóa thao tác cũ).
- `ManagerOrdersPage.tsx`: đơn V3 ở `PROCESSING` có liên kết "Duyệt và chốt kết quả →"; `AWAITING_SETTLEMENT` / `COMPLETED` có "Xem kết quả đã chốt →". Liên kết trang duyệt sức khỏe cũ chỉ còn cho đơn không phải V3.

**Tự test:** `tests/v3-result-review.test.mjs` 6 test ✓ (tách mục chặn, bản nháp mặc định và nạp lại, thân yêu cầu COMBO đủ quyết định + token + ảnh, các trường hợp từ chối, chốt MAP/COMBO, route + nhận diện 409). `tests/v3-result-review-ui.test.mjs` ✓ (MAP, COMBO chưa có lô, COMBO có lô, đã chốt). `npm test` 292/292 ✓, typecheck ✓, build ✓. Trình duyệt với API giả lập (COMBO, 2 phát hiện, 1 vùng có 2 hướng dẫn, 1 mục chặn): trang liệt kê đúng việc còn thiếu; sau khi loại 1 phát hiện, chọn hướng dẫn, xử lý mục chặn và nhập lý do → 1 request `combo-reviews` đúng token lô và ảnh bằng chứng; mục chốt mở với kết luận mặc định "Duyệt, có ghi nhận nghi bệnh" → 1 request `freeze` đúng token số trụ + lần duyệt; trang chuyển sang "Đã chốt kết quả nội bộ".

**Còn lại / giới hạn:**
- Test tay với BE thật — phụ thuộc G5 (BE-5 để có số trụ, BE-10 để có lô COMBO). Trước đó GET có thể trả `CountSnapshot.Missing` (đã có bản dịch).
- Chưa hỗ trợ `Adjust` vùng (sửa hình dạng / thành viên) — trang hướng dẫn từ chối kèm lý do. Chưa có màn chọn từng ảnh bằng chứng (FE tự đính kèm ảnh của mục).
- Trang duyệt sức khỏe cũ (`ManagerHealthReviewPage`, `HealthReleasePanel`, `healthReviewApi`…) chưa xóa: gỡ ở G10.

**Kế hoạch ban đầu:**

Trang mới cho Manager thay `ManagerHealthReviewPage` (trang cũ bị BE chặn với đơn V3); xóa trang cũ cùng `HealthReleasePanel`, `healthReviewApi` nếu không dùng lại được. Có thể làm với dữ liệu giả lập trong lúc G5 chờ BE.

- `GET .../result-review` → số trụ đã xác minh, `countSnapshotFingerprint`, lần bay đang hoạt động; COMBO thêm lô phát hiện đang chờ, tóm tắt review, `expectedFreezeTokens`. Sau khi chốt vẫn đọc được (`currentApprovedResultRevisionId`, `currentApprovedResultFingerprint`, `orderVersion`).
- **MAP**: hiện số trụ đã xác minh → chốt.
- **COMBO**: `POST .../result-review/combo-reviews` — quyết định cho **tất cả** phát hiện, vùng bệnh và mục chặn `(sourceType, sourceId, reasonCode)`. `201` bản mới, `200` replay.
- **Chốt kết quả nội bộ**: `POST .../result-review/freeze` (ID và fingerprint lấy từ response BE). Lần bay → `ACCEPTED`, đơn vẫn `PROCESSING`. Chốt nội bộ khác với phát hành cho Owner (G11).
- **Lỗi 409** (`SurveyOrder.VersionConflict`, `CountSnapshot.Stale`, `ComboReview.Stale`, `Operation.Conflict`) → tải lại `GET result-review` để người dùng xác nhận đúng phiên bản.

## G8. Hóa đơn V3 + trả phần còn lại — [ ]

**Manager**
- `GET .../invoice` → token hóa đơn/kết quả/số trụ, chi tiết tiền, checkout đang mở, `hasOpenReconciliation`, `reconciliationReasons[]`, `orderConfirmedNetCash`, `orderAvailableRefundCap`. `409 Invoice.NotFinalized` → quay về G7; `409 InvoiceFinalization.RefundReconciliationHold` → chờ Admin đối soát (G9b).
- `POST .../invoice/finalize`, body `{ operationId, expectedOrderVersion, expectedApprovedResultRevisionId, expectedApprovedResultFingerprint, expectedCountSnapshotId, expectedCountFingerprint, finalizationReason }` (+ `zeroPoleReasonCode`, `zeroPoleEvidenceReference` khi 0 trụ) → đơn `PROCESSING` → `AWAITING_SETTLEMENT`.
- `POST .../invoice/corrections` (trước khi phát hành): token hiện hành + `itemCorrections[]` + `replacementComboReview` khi COMBO bị ảnh hưởng. Lỗi `InvoiceCorrection.ProfileProvenanceMismatch`, `InvoiceCorrection.ComboReviewInvalidatedByCountChange`. 409 → tải lại `GET invoice`.

**Owner**
- `GET api/v3/tenant-owner/survey-orders/{orderId}/invoice` → `{ orderId, orderNumber, orderStatus, invoiceRevisionNumber, verifiedBillablePoleCount, pricePerPole, currency, totalAmount, dueAmount, finalizedAt, checkoutToken }`. `404 Invoice.NotFound` khi chưa chốt. Dùng lại `SurveyInvoiceLines.tsx`.
- **Trả phần còn lại**: `POST .../balance-checkouts`, body `{ checkoutToken, idempotencyKey }`. Đọc lại hóa đơn ngay trước khi trả để lấy `checkoutToken` (hết hạn nhanh). Giữ nguyên `idempotencyKey` khi thử lại cùng giao dịch; tạo key mới sau lỗi dứt khoát của cổng thanh toán. Lỗi `400` (tắt thanh toán / lỗi cổng), `409` (`Checkout.ZeroBalanceDue`, `Checkout.OpenCheckoutMismatch`, `Checkout.PaidBalanceInsufficientForNewDue`, `Checkout.UncertainProviderOutcome`…), `422` (token sai/hết hạn).
- Lịch sử thanh toán còn phụ thuộc BE-7.

## G9. Hủy đơn V3 — [ ]

- Owner: `POST api/v3/tenant-owner/survey-orders/{orderId}/cancellation`, body `{ expectedOrderVersion, reasonCode, reasonDescription, operationId, payloadFingerprint }`. Owner chỉ tự hủy được trước khi bay.
- Admin: `POST api/v3/system-admin/survey-orders/{orderId}/cancellation-decisions`, body `{ requesterId, decisionKind, requestedRetentionAmount, inputApprovalEvidenceId?, reasonCode, reasonDescription, expectedOrderVersion, operationId, payloadFingerprint }`. `decisionKind`: `CUSTOMER_BEFORE_CAPTURE`, `CUSTOMER_AFTER_ACCEPTABLE_CAPTURE` (cần bằng chứng `inputApprovalEvidenceId`), `OPERATIONAL_POSTPONEMENT`, `SERVICE_FAILURE` (hoàn 100%).
- Mã lỗi: `ORDER_NOT_FOUND`, `OWNER_FORBIDDEN`, `ADMIN_DECISION_REQUIRED`, `REFUND_RECONCILIATION_HOLD`, `INVALID_RETENTION_AMOUNT`, `Cancellation.RetentionExceedsAllowedCap` (đã có bản dịch từ G0).
- Gỡ UI hoàn tiền chất lượng cũ; khiếu nại V3 làm lại ở G11.
- **Cần xác nhận với BE trước khi làm màn Admin:** danh sách `reasonCode` hợp lệ, API đọc danh sách yêu cầu hủy đang chờ.

## G9b. Admin đối soát tiền đơn V3 — [ ]

- `POST api/v3/system-admin/survey-orders/{orderId}/funding-reconciliations`, body `{ operationId, dispositionKind, expectedOrderVersion, amount, currency, reason (1–2000), evidenceReference (1–1000), surveyPaymentId?, fundingReceiptId?, targetInvoiceRevisionId?, providerReference?, providerTransactionId?, expectedPaymentVersion? }`.
- `dispositionKind`: `KEEP_EXCLUDED`, `ALLOCATE_TO_CURRENT_INVOICE` (cần `providerTransactionId` đã xác minh và đúng hóa đơn hiện hành), `ROUTE_TO_REFUND` (giữ hạn mức hoàn; chuyển tiền thuộc V3-08). Mỗi khoản tiền về chỉ có một quyết định cuối.
- **Cần xác nhận với BE trước khi làm:** API danh sách khoản chờ đối soát và nguồn `surveyPaymentId` / `fundingReceiptId`.

## G10. Rà soát cuối — [ ]

Tìm trong `src/` và `tests/`: không còn route nào trong "Danh sách gỡ bỏ" (kể cả nhánh `!v3Capture`), không còn trạng thái / purpose / payment purpose / mã lỗi của luồng cũ, không còn test cho các phần đã xóa. Chạy lại typecheck, test, build.

## G11. Chờ BE — phát hành kết quả, cổng Owner, khiếu nại

Theo `PROJECT_MEMORY.md` của BE, các phần sau **chưa có ở BE**:
- **A2.4 (V3-06)**: phát hành kết quả khi đủ tiền, thông báo Owner, cửa sổ khiếu nại, đơn → `COMPLETED`.
- **V3-07**: cổng Owner xem kết quả, ảnh, so sánh lịch sử.
- **V3-08**: khiếu nại, thực hiện hoàn tiền, điều chỉnh sau phát hành.
- Trước khi phát hành, Owner không thấy dữ liệu V3 (bản đồ, cây, bản đồ sức khỏe trả `404`) — đúng thiết kế.

## G12. Admin: chính sách thương mại V3 — [ ] (để cuối, chờ BE-4)

- 8 route `POST api/v3/system-admin/commercial-policies/`: `services`, `revisions`, `prices`, `deposit-policies`, `claim-policies`, `cancellation-policies`, `bundle-versions`, `activations`. Thay `ServicesPage` (phần giá) và `PaymentPoliciesPanel`; xóa route cũ `survey-services`, `survey-deposit`, `survey-combo-discount`.
- Đội BE sẽ bổ sung GET; khi có, làm cả phần xem lẫn form đăng. Trước đó dữ liệu V3 lấy từ seeder `SurveyServiceV3Seeder`.

## Không cần làm

- **Refresh token (RT-06 của BE)**: FE đã có (`X-AgriDrone-Session: 1`, cookie, 401 → refresh rồi gửi lại, 409 `RefreshConflict` → thử lại). Chỉ cần kiểm cookie trên domain thật khi deploy.
- **`yolo-recalculate-grid`**: body BE khớp `RecalculateTreeGridOptions`.
- **Báo cáo doanh thu**: FE đã dùng route V3.

## Nhật ký

- 26/11/2026 — Lập kế hoạch sau khi rà soát route FE và BE. Người dùng chọn chuyển sang V3, để các lỗ hổng BE xử lý cuối.
- 26/11/2026 — Cập nhật theo BE `fc01761`: BE-1/2/3 đã sửa; bỏ cache `localStorage`; thêm G9b, trường đối soát ở hóa đơn Manager, mã lỗi hủy mới.
- 26/11/2026 — Đối chiếu với `PROJECT_MEMORY.md` và `docs/contracts/survey-business-v3.md` của BE: chính sách thương mại xuống cuối (G12); thêm bảng vòng đời đơn; phát hiện BE-5; G7 làm trang mới; trả phần còn lại sang G8; thêm G11.
- 26/11/2026 — Người dùng quyết định **không chạy song song**: dữ liệu cũ bị bỏ, web chỉ chạy V3. Thêm "Danh sách gỡ bỏ"; G10 thành rà soát cuối.
- 26/11/2026 — G0, G1, G2 (lịch hẹn Capture, báo vắng mặt) xong, tự test với API giả lập; ghi BE-6. Commit `94cb4c7` ("V3 changes").
- 26/11/2026 — `bf4cbb4` ("Wire V3 flights and deposit checkout"): đối chiếu BE `dd0ada8`; nối checkout cọc V3, gỡ checkout và xác nhận giá kiểu cũ; nối danh sách lần bay và bắt đầu / kết thúc / báo lỗi (`V3CaptureFlightActions`). Ghi BE-7, BE-8; cập nhật BE-5.
- 26/11/2026 — `24d3b29` ("Add V3 capture freeze and map approval"): G5 tới bước chốt dữ liệu (upload, nhập Blackbox, `input-manifest/freeze`), duyệt bản nháp bản đồ đổi sang `approve-internal`. Ghi BE-9, BE-10 và vướng mắc ranh giới First.
- 26/11/2026 — Rà lại sau bàn giao: `main` = `ReviewPlant` = `KhoaNV` = `24d3b29`, không còn thay đổi local (G5 đã nằm trong commit). 279/279 test, typecheck, build ✓. Kiểm lại BE-5, 7, 8, 9, 10 trên BE `dd0ada8`: đều còn. Sửa trạng thái: G2 → `[x]`, G4 và G5 → `[~]`; ghi rõ `prepareCaptureAttempt` chưa có trong `v3Api.ts`, `missionError` chưa dịch mã V3, trang nhiệm vụ còn nhánh `!v3Capture`. Đặt số BE-11 cho vướng mắc ranh giới First. Thêm cột "Đã gỡ" và cột commit; sắp nhật ký theo thời gian; thứ tự làm tiếp G6 → G7 → G8 → G9/G9b.
- 26/11/2026 — Xong G6 (chưa commit): lịch sử chuyến bay trên trang đơn V3, form Bay lại (`quality-reflights`), nguồn drone tạm qua API drone theo farm + lọc theo dịch vụ (chờ BE-8). 285/285 test, typecheck, build ✓; tự test trình duyệt với API giả lập. Thêm mục "Việc để sau" liệt kê G4-1 … G4-6 và G5-1 … G5-7 kèm lỗ hổng BE đang chờ. Làm tiếp: G7.
- 26/11/2026 — Xong G7 (chưa commit): trang duyệt kết quả V3 `/manager/orders/:orderId/result-review` — MAP xem số trụ và chốt; COMBO duyệt phát hiện / vùng / mục chặn rồi chốt; lỗi 409 tải lại dữ liệu duyệt. 292/292 test, typecheck, build ✓; tự test trình duyệt với API giả lập (luồng COMBO đầy đủ). Chưa hỗ trợ Adjust vùng; trang duyệt sức khỏe cũ gỡ ở G10. Làm tiếp: G8.
