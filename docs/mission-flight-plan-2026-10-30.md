# Kế hoạch triển khai FE — Nhiệm vụ bay (Prepare → Preflight → Flight → Upload → Finalize → Ghép bản đồ → Nhận diện cây)

Nguồn:
- `BE2-Prepare-to-Upload-Finalize-API.md` (người dùng cung cấp, 30/10/2026) — luồng Prepare→Preflight→Flight→Upload→Finalize (nhiệm vụ 0-10).
- `AgriDrone Docs.md` (UC04, người dùng cung cấp, 31/10/2026) — luồng tiếp theo sau Finalize: Ghép bản đồ trực giao (Metashape/ODM), cắt tiles, nhận diện cây bằng YOLO, tải CSV và đưa cây vào hệ thống chính thức (nhiệm vụ 11-15).

Phạm vi: FE web (`AgriDrone-FE`). Không đổi BE. **FE không gọi trực tiếp service Python (localhost:8000)** — mọi thao tác ghép bản đồ/AI đều qua .NET API. Team không cần cài Metashape hay thư viện Python; khi cần test, BE sẽ cung cấp sẵn ảnh/orthophoto mẫu.

**Đối chiếu 2 tài liệu nguồn với source BE thật (2026-10-31):** Một số shape trong cả hai tài liệu tay không khớp code thực tế (ví dụ field `media` bị ghi nhầm thành `completed`, shape response của `telemetry/normalize` và `telemetry/imports` trong doc UC04 sai hoàn toàn so với contract C# thật, endpoint `plant-gps/stage` không tồn tại). Các nhiệm vụ 8-15 dưới đây đã được viết lại theo đúng contract C# đã đọc trực tiếp từ `AgriDrone-BE/backend/src/AgriDrone.Api/Contracts/Missions/` và các Controller tương ứng, không chép nguyên theo tài liệu tay.

**Quyết định (2026-11-01):** Đã thêm `leaflet` + `react-leaflet` (+ `@types/leaflet`) vào `package.json` theo lựa chọn của người dùng, dùng cho UI bản đồ tương tác ở nhiệm vụ 12-13 (xem mục "Quyết định" cuối tài liệu).

**Ký hiệu trạng thái:** `[ ]` chưa làm · `[~]` đang làm · `[x]` đã xong, đã test.

---

## 0. Nền tảng — API layer cho Missions
**Trạng thái:** [~] Đã làm phần Drone (System Admin) ở `src/features/drones/{types,api,workflow}.ts`. Phần Mission/System Manager (bước 3 trở đi) chưa làm.

- Tạo `src/features/missions/missionApi.ts` + `types.ts` (theo mẫu `src/features/surveys/orderApi.ts`): hàm gọi tất cả endpoint System Manager liệt kê ở Phụ lục A6 của tài liệu nguồn (drones available, missions list/version, prepare, preflight checklist, preflight, start, complete-flight, fail-flight, cancel, reschedule, plant-gps, media upload, telemetry normalize/imports, upload readiness, finalize).
- Thêm type cho Drone (System Admin) riêng ở `src/features/drones/` vì khác phạm vi quyền (SystemAdmin, không phải SystemManager).
- Không có UI ở bước này — chỉ dựng lớp gọi API để các bước sau dùng lại.

**Cách test:** `npm run typecheck` qua; chưa có màn hình nên chưa test tay.

---

## 1. System Admin — Quản lý Drone
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.

- API: `POST /api/system/drones`, `GET /api/system/drones`, `GET /api/system/drones/{droneId}/maintenance-history`, `PUT /api/system/drones/{droneId}`, `PATCH /api/system/drones/{droneId}/status`.
- UI: trang mới `/system/drones` trong `SystemAdminLayout` (mục menu hiện có icon nhưng chưa có route, xem `plannedNavigation`) — danh sách phân trang, tạo Drone (form `code/name/model/manufacturer/capabilities/serialNumber/registrationNumber/registrationDate/registrationExpiryDate/weightKg/notes`), sửa Drone (`expectedVersion`), đổi status/bảo trì, xem lịch sử bảo trì.
- Capabilities chọn từ enum cố định: `BASELINE_MAPPING`, `PLANT_HEALTH`, `HARVEST_READINESS`. Status chọn từ: `Available, InMission, Maintenance, Inactive, Retired`.

**Cách test:**
1. Đăng nhập SystemAdmin → vào `/system/drones`.
2. Tạo 1 Drone với capability `BASELINE_MAPPING` → kiểm tra status trả về `Available` ngay, không cần kích hoạt riêng.
3. Sửa tên/model Drone vừa tạo → đúng `expectedVersion`, kiểm tra version tăng.
4. Đổi status sang `Maintenance` với `nextMaintenanceAt` + `reason` → danh sách cập nhật đúng.
5. Thử tạo Drone trùng `code` → nhận lỗi rõ, không tạo được bản ghi mới.

---

## 2. System Admin — Quản lý Preflight Checklist
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.

- API: `GET /api/system/preflight-checklist`, `POST /api/system/preflight-checklist` (tạo lần đầu), `PATCH /api/system/preflight-checklist/conditions` (thêm/sửa/xóa item).
- UI: trang `/system/preflight-checklist` — xem checklist hiện hành (items + version), thêm điều kiện mới, sửa điều kiện (xóa key cũ + thêm lại bản sửa trong cùng request), xóa điều kiện. Luôn còn tối thiểu 1 item.
- Không có API xóa hẳn version — mỗi thay đổi tạo version mới, giữ version cũ nguyên vẹn (chỉ hiển thị version mới nhất là active).

**Cách test:**
1. Tạo checklist lần đầu (nếu chưa có) với 3 item mẫu.
2. Thêm 1 điều kiện mới → version tăng, item cũ còn nguyên.
3. Sửa 1 điều kiện (xóa key cũ, thêm lại bản sửa cùng lúc) → key không đổi nghĩa hoặc đổi đúng như nhập.
4. Xóa 1 điều kiện, thử xóa đến khi còn 1 item cuối → xác nhận không xóa được item cuối cùng (BE chặn).

---

## 3. System Manager — Chọn Drone khả dụng + Prepare Mission
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.
**Lưu ý kỹ thuật phát hiện khi đọc source BE (khác tài liệu gốc):** response của API `.../missions/prepare` trả `purpose`/`status` dạng PascalCase (`"BaselineMapping"`, `"Scheduled"`...), không phải SCREAMING_SNAKE_CASE như hầu hết API Mission khác — đã xử lý đúng trong `missionWorkflow.ts`, cần nhớ khi làm tiếp các bước 4-10 dùng chung các enum này.

- Tiền đề: SurveyOrder đã đặt cọc/thanh toán và có appointment xác nhận ở BE1 (dùng lại luồng `/survey-payments` đã có).
- API: `GET /api/system-manager/survey-orders`, `GET /api/system-manager/farms/{farmId}/drones/available?startAt&endAt&purpose`, `POST /api/system-manager/survey-orders/{surveyOrderId}/missions/prepare`.
- UI: trong `ManagerOrdersPage`/chi tiết đơn, thêm khu vực "Chuẩn bị nhiệm vụ bay": chọn Drone từ danh sách khả dụng theo khoảng thời gian + purpose, nhập ngày bay (baselineDate/serviceDate theo đúng purpose của order), bấm Prepare → hiện `missionId`, `status`, `version` vừa tạo.
- Dùng `Idempotency-Key` (UUID) khi gọi Prepare.

**Cách test:**
1. Mở 1 order đã `BaselineReady` (hoặc đã đủ điều kiện dịch vụ trả phí) ở Manager → thấy danh sách Drone khả dụng đúng theo purpose/thời gian.
2. Prepare với 1 Drone → Mission mới xuất hiện trong `GET /api/system-manager/farms/{farmId}/missions`.
3. Gọi lại Prepare với cùng Idempotency-Key (giả lập mất kết nối) → không tạo Mission trùng.

---

## 4. System Manager — Preflight checklist (form động)
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.
**Hạn chế đã biết:** BE không có API lấy chi tiết 1 Mission riêng cho System Manager — trang tìm Mission bằng cách phân trang danh sách `GET .../missions`. Tải lại trang sau khi đã hoàn tất preflight (không phải ngay sau submit) chưa hiển thị lại câu trả lời/ghi chú đã lưu vì danh sách đó không trả các trường preflight.

- API: `GET .../missions/{missionId}/preflight/checklist`, `POST .../missions/{missionId}/preflight`.
- UI: màn chi tiết Mission (trang mới `ManagerMissionDetailPage` hoặc mở rộng `ManagerOrderDetailPage`) — render form **động** theo đúng `items` trả về (không hardcode key), mỗi item là switch/checkbox theo `required`, cộng `suitableForFlight` + `notes` + `deviceCompletedAt`.
- Luôn lấy `expectedMissionVersion` mới nhất trước khi gửi (gọi `GET .../version` hoặc dùng version từ lần GET mission gần nhất).
- Giữ nguyên `Idempotency-Key` khi retry.

**Cách test:**
1. Mở Mission vừa Prepare ở bước 3 → thấy đúng checklist hiện hành (đổi checklist ở bước 2 phải phản ánh ngay).
2. Trả lời đủ các item required, `suitableForFlight=true` → submit thành công, version tăng.
3. Thử submit thiếu item required → bị chặn ở FE trước khi gọi API (validate theo `required`).
4. Đổi checklist (bước 2) rồi preflight Mission mới → đúng checklist mới, Mission cũ (đã preflight) không bị ảnh hưởng.

---

## 5. System Manager — Start / Complete flight
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.

- API: `POST .../missions/{missionId}/start`, `POST .../missions/{missionId}/complete-flight`.
- UI: nút "Bắt đầu bay" / "Kết thúc chuyến bay" trên màn chi tiết Mission, chỉ hiện đúng theo status hiện tại (Draft/Scheduled → Start; InFlight → Complete). Luôn gửi `expectedMissionVersion` mới nhất.
- Hiển thị rõ lỗi gate (payment chưa xong với dịch vụ trả phí, checklist chưa đạt...) từ BE, không tự đoán điều kiện ở FE.

**Cách test:**
1. Mission đã preflight `suitableForFlight=true` → Start thành công, status chuyển `InFlight`.
2. Thử Start một Mission dịch vụ trả phí khi order chưa thanh toán xong → nhận lỗi gate rõ ràng.
3. Complete-flight Mission đang `InFlight` → status chuyển đúng trạng thái kết thúc bay (chuẩn bị cho Upload).

---

## 6. System Manager — Fail-flight / Cancel / Reschedule (nhánh thay thế)
**Trạng thái:** [x] Đã code và người dùng đã test tay xong. Đã sửa thêm UI checklist (task 4) cho gọn theo đúng pattern `.workflow-checklist` sẵn có, người dùng xác nhận ổn.

- API: `POST .../fail-flight`, `POST .../cancel`, `POST .../reschedule`.
- UI: trong màn chi tiết Mission, thêm hành động phụ:
  - **Hủy** (chỉ hiện khi Draft/Scheduled): bắt buộc `reason`.
  - **Báo lỗi chuyến bay** (chỉ hiện khi InFlight): form `incidentType` (SIGNAL_LOSS/LOW_BATTERY/INTERRUPTION/FLIGHT_FAILURE), `incidentOutcome`, `recoveryDecision` (ABORT/RESCHEDULE_REQUIRED), `evidenceReference`, giữ Idempotency-Key.
  - **Lên lịch lại**: chỉ hiện khi Mission `FlightFailed` với `recoveryDecision=RESCHEDULE_REQUIRED`; chọn `scheduledDate` mới, `replacementDroneId` tùy chọn. Sau reschedule, bắt buộc preflight lại (checklist cũ hết hiệu lực) — quay lại bước 4.

**Cách test:**
1. Hủy 1 Mission còn Draft với reason → status Cancelled, không dùng API fail-flight được cho case này.
2. Giả lập chuyến bay lỗi: fail-flight với `recoveryDecision=RESCHEDULE_REQUIRED` → Mission chuyển FlightFailed.
3. Reschedule Mission đó → status/ngày mới cập nhật, vào lại Mission thấy checklist yêu cầu làm lại từ đầu (không cho Start thẳng bằng checklist cũ).
4. Thử fail-flight một Mission không ở trạng thái InFlight → bị BE chặn, FE hiển thị lỗi đúng, không tự sửa trạng thái.

---

## 7. System Manager — Lưu GPS cây (tùy chọn theo loại Mission)
**Trạng thái:** [~] Đã code xong trong `ManagerMissionDetailPage`, mục "GPS cây (tùy chọn)": bảng xem danh sách cây hiện có + modal "Dán danh sách cây" (dán JSON, validate đủ theo luật BE trước khi gửi, thay toàn bộ danh sách). 404 (mission không áp dụng GPS cây) hiển thị trạng thái rỗng thay vì lỗi đỏ. Tự test: typecheck ✓, 152/152 test (thêm `tests/mission-plant-gps.test.mjs`, 3 test) ✓, build ✓. Chưa test tay với BE thật.

- API: `POST .../missions/{missionId}/plant-gps`.
- UI: chỉ hiện cho Mission có đếm cây bằng GPS — bảng nhập/hiển thị danh sách cây (`treeId, row, col, latitude, longitude, confidence, status, source`), cho phép nhập tay hoặc import, gửi trước khi finalize. Ghi rõ đây là **thay toàn bộ danh sách**, không phải thêm từng cây.

**Cách test:**
1. Gửi danh sách 3–5 cây mẫu → `savedCount` đúng số lượng.
2. Gửi lại danh sách khác → danh sách cũ bị thay hoàn toàn, không cộng dồn.
3. Thử treeId trùng trong 1 lần gửi → bị chặn rõ ràng.

*(Có thể làm sau cùng nếu luồng ưu tiên không cần đếm cây bằng GPS ngay.)*

**Cập nhật 2026-10-31 (đối chiếu UC04):** API `POST .../plant-gps` ở trên chỉ là bước "lưu nháp" (staging) — danh sách cây lưu kiểu này **chưa** tạo cây thật trong hệ thống. Để đưa vào quy trình nghiệm thu chính thức cần thêm bước **Publish** (`POST /api/system-manager/farms/{farmId}/missions/{missionId}/plant-gps/publish`, có Idempotency-Key, body gồm `surveyOrderId/rowSpacingM/plantSpacingM/gridBearingDeg/candidates`) — xem nhiệm vụ 15 bên dưới. UC04 ghi endpoint này ở prefix `/api/missions/{missionId}/farms/{farmId}/plant-gps/publish` nhưng **sai** — đã xác minh trong `SystemManagerMissionsController.cs`, endpoint thật nằm ở prefix `/api/system-manager/farms/{farmId}/missions/{missionId}/...` giống các API khác của task này. Endpoint `plant-gps/stage` mà UC04 nhắc tới **không tồn tại** trong BE — "staging" chính là API `POST .../plant-gps` đã làm ở nhiệm vụ này.

**2026-11-01:** Đã đổi nhãn UI từ "GPS cây (tùy chọn)" thành "GPS cây (lưu nháp)" + ghi chú trỏ sang bước Publish (nhiệm vụ 15) để không gây hiểu lầm đây là bước độc lập hoàn chỉnh. Không đổi logic API (GET/POST vẫn đúng, không gate theo status vì BE cũng không gate).

---

## 8. System Manager — Upload ảnh (media)
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.

- API: `POST /api/missions/{missionId}/farms/{farmId}/media` (multipart, field `files`, tối đa **20 file/request**, tổng tối đa 5 GiB). File >50 MiB được BE tự xử lý multipart nội bộ, FE không cần tự gọi `upload-sessions`.
- **Response thật đã xác minh từ `UploadMissionMediaItemResponse`/`CompleteMissionMediaUploadSessionResponse`** (khác tài liệu UC04 — field tên `media`, không phải `completed`):
  ```json
  [{ "index": 0, "fileName": "G0174984.JPG", "status": "Completed",
     "media": { "uploadSessionId": "...", "mediaAssetId": "...", "status": "Completed", "mimeType": "image/jpeg", "fileSizeBytes": 2274476, "sha256Checksum": "...", "reusedCompletion": false },
     "errorCode": null, "errorMessage": null }]
  ```
  `status` mỗi file là chuỗi thường `"Completed" | "Failed" | "NotAttempted"`. Xử lý tuần tự: 1 file lỗi → dừng, các file sau đánh dấu `NotAttempted` (không tự thử lại). HTTP 200 nếu tất cả `Completed`, 207 nếu có lỗi.
- UI: khu vực upload ảnh trên màn chi tiết Mission, chỉ bật sau khi flight đã complete/fail xong (`FlightCompleted`/liên quan). Chọn nhiều file theo lô ≤20 (gửi nhiều request nếu quá 20), hiển thị kết quả theo từng file bằng đúng field trên.
- Có thể thêm `GET .../media` (phân trang, tối đa 100) + `GET .../media/{mediaId}/download-url` (link 5 phút) để xem lại ảnh đã upload, hữu ích để Manager kiểm tra trước khi finalize.

**Cách test:**
1. Upload 2–3 ảnh thật (trong 1 request) cho Mission đã complete-flight → từng ảnh có `media` riêng, không lỗi checksum.
2. Thử gửi hơn 20 file trong 1 request → bị chặn validate (MaxLength 20).
3. Thử upload khi Mission chưa complete-flight → bị chặn, FE không cho bấm hoặc hiển thị lỗi BE rõ.
4. Mở lại danh sách media đã upload, lấy download-url, xem ảnh load được.

---

## 9. System Manager — Telemetry (normalize + import)
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.
**Quan trọng:** shape của cả 2 API này trong UC04 (`detectedFormat`, `samplePoints`, `selectedSegments` với `startTime/endTime`...) **không khớp BE thật** — đã xác minh trực tiếp qua `MissionTelemetryNormalizationController`/`MissionTelemetryController` và các contract C#. Dùng đúng shape dưới đây.
**Phát hiện thêm khi đọc `ImportTelemetryCommandValidator`/`ImportTelemetryCommandHandler`:** timestamp mỗi điểm phải là UTC thật (có `Z`, không lệch múi giờ) và **duy nhất** trên toàn bộ các segment đã chọn (không chỉ trong 1 segment); điểm phải nằm trong khoảng `StartedAt`–`EndedAt` **thật** của Mission (ghi nhận lúc Start/Complete-flight ở nhiệm vụ 5), không phải khung giờ đã lên lịch. BE tự sắp xếp lại theo `recordedAt` và đánh lại `sequenceNumber` — FE không cần tự sắp xếp trước khi gửi. `normalize` không trả `altitudeReference` cho từng điểm; FE gửi `null` cho field này khi import (hợp lệ, là optional).

- API: `POST .../telemetry/normalize` (multipart field `File`, ≤20 MiB, chỉ decode — chưa lưu), `POST .../telemetry/imports` (lưu thật, cần `Idempotency-Key`).
- **Response thật của `normalize`:**
  ```json
  { "sourceFileName": "...", "sourceChecksum": "sha256...", "warnings": [...],
    "segments": [{ "segmentIndex": 0, "sourcePointCount": 8120, "rejectedPointCount": 0, "pointCount": 8120,
      "firstRecordedAt": "...", "lastRecordedAt": "...", "fitsPointCountLimit": true, "warnings": [...],
      "points": [{ "sequenceNumber": 1, "recordedAt": "...", "longitude": ..., "latitude": ..., "altitudeM": ..., "headingDeg": ..., "speedMps": ..., "horizontalAccuracyM": ... }] }] }
  ```
  `fitsPointCountLimit` cho biết segment có nằm trong khoảng 2–50.000 điểm hợp lệ để import hay không — dùng để enable/disable nút chọn segment, không tự tính lại ở FE.
- **Request thật của `imports`** (field `expectedMissionVersion`, không phải version theo segment riêng):
  ```json
  { "sourceFileName": "...", "sourceChecksum": "sha256...", "expectedMissionVersion": 1,
    "segments": [{ "segmentIndex": 0, "points": [{ "sequenceNumber": 1, "recordedAt": "...", "longitude": ..., "latitude": ..., "altitudeM": ..., "altitudeReference": "RelativeToTakeoff", "headingDeg": ..., "speedMps": ..., "horizontalAccuracyM": ... }] }] }
  ```
  `altitudeReference` nhận `RelativeToTakeoff | Agl | Msl | Unknown` (PascalCase, không qua bộ chuyển SCREAMING_SNAKE_CASE — cùng kiểu enum lộ ra ngoài như response Prepare ở nhiệm vụ 3).
- **Response thật của `imports`:** `{ telemetryImportId, missionId, pointCount, firstRecordedAt, lastRecordedAt, missionVersion, reusedOperation }`. Mỗi Mission chỉ giữ **một** lần import; gửi lại cùng payload (cùng Idempotency-Key) trả kết quả cũ, payload khác sẽ **thay** import hiện tại (không cộng dồn).
- UI: khu vực riêng — nếu có file Blackbox TXT/BBL, upload để normalize, hiển thị `warnings`, `rejectedPointCount`, cho chọn 1 segment có `fitsPointCountLimit=true` rồi mới Import; nếu đã có dữ liệu điểm sẵn, bỏ qua normalize và nhập trực tiếp vào Import.

**Cách test:**
1. Normalize 1 file BBL mẫu → xem đúng `segments`/`warnings`, chọn 1 segment có `fitsPointCountLimit=true`.
2. Import segment đã chọn → thành công, `missionVersion` tăng.
3. Thử import với 1 điểm (dưới mức tối thiểu 2) → bị chặn ở FE trước khi gọi API.
4. Import lại cùng Idempotency-Key + cùng payload → trả `reusedOperation=true`, không tạo dữ liệu trùng. Đổi payload rồi gửi lại → thay import cũ (không cộng dồn).

---

## 10. System Manager — Upload readiness + Finalize
**Trạng thái:** [~] Đã code xong trong `ManagerMissionDetailPage` (hiện khi Mission `Uploading`): hiện số ảnh/video/điểm telemetry + danh sách blockers tiếng Việt, nút "Hoàn tất upload" chỉ bật khi `canFinalize=true` và hết blockers. **Lưu ý đã xử lý đúng:** response Finalize cũng trả `status` PascalCase thô (như Prepare) — đã chuẩn hóa qua `toScreamingSnakeCase()` trước khi lưu vào state, nếu không các điều kiện `status === 'READY_FOR_PROCESSING'`/postFlight sẽ không khớp nữa sau khi finalize. Tự test: typecheck ✓, 162/162 test (thêm `tests/mission-upload-finalize.test.mjs`, 3 test) ✓, build ✓. Chưa test tay với BE thật.

- API: `GET .../upload/readiness` → `{ missionId, missionVersion, status, canFinalize, rawImageCount, rawVideoCount, telemetryPointCount, hasActiveUploadSessions, blockers: string[] }`. `blockers` là **mã lỗi** (không phải câu mô tả) — map sang tiếng Việt bằng bảng dưới, không hiển thị mã thô cho Manager.
- `POST .../upload/finalize` body `{ expectedMissionVersion }` → `{ missionId, status, mediaCount, telemetryPointCount, missionVersion }`. **`status` ở cả 2 API này là PascalCase thô** (`"Uploading"`, `"ReadyForProcessing"`...) do BE dùng `Status.ToString()` trực tiếp — cùng kiểu lộ casing như response Prepare (nhiệm vụ 3), chuẩn hóa qua `missionStatusLabel()` đã có.
- Bảng mã `blockers` (từ `FinalizeMissionUploadError`): `MissionUpload.StatusNotAllowed` (Mission không ở trạng thái Uploading), `MissionUpload.ActiveSessionsExist` (còn upload session đang xử lý), `MissionUpload.RequiredMediaMissing` (thiếu ảnh/video hợp lệ theo đúng loại Mission), `MissionUpload.TelemetryMissing` (chưa import hoặc <2 điểm), `MissionUpload.TelemetryInconsistent` (số điểm khai báo lệch số điểm đã lưu — liên hệ hỗ trợ), `MissionUpload.FlightRouteMissing` (đường bay chưa hợp lệ).
- UI: nút "Hoàn tất upload" chỉ **bật khi** `canFinalize=true` và `blockers` rỗng; còn blockers thì liệt kê lý do bằng tiếng Việt theo bảng trên.
- Sau finalize, Mission chuyển `ReadyForProcessing` — ghi rõ trên UI đây **chưa phải Completed**; bước tiếp theo (ghép bản đồ, nhận diện cây) là nhiệm vụ 11-15 bên dưới, không còn "ngoài phạm vi" như bản kế hoạch trước.

**Cách test:**
1. Gọi readiness khi còn thiếu telemetry → `canFinalize=false`, `blockers` chứa `MissionUpload.TelemetryMissing`, FE hiện đúng lý do tiếng Việt.
2. Bổ sung đủ (ảnh + ≥2 điểm telemetry) → readiness `canFinalize=true`, `blockers` rỗng.
3. Finalize → Mission chuyển `ReadyForProcessing`; thử finalize lần 2 → bị chặn (`MissionUpload.StatusNotAllowed`), không tạo hiệu ứng phụ.

---

## 11. System Manager — Ghép bản đồ trực giao (Metashape/ODM) + theo dõi tiến độ
**Trạng thái:** [ ]

- API kích hoạt: `POST .../missions/{missionId}/farms/{farmId}/process-metashape` (Metashape, mặc định) hoặc `POST .../process-odm` (OpenDroneMap — phương án mã nguồn mở thay thế, cùng request/response). Body tùy chọn `{ cameraType?, alignAccuracy?, genericPreselection? }` (bỏ trống dùng cấu hình mặc định BE). Response `{ missionId, taskId, status, message }`.
- API poll: `GET .../orthophoto-status` → `{ missionId, taskId, status, progress, processingTimeMs, previewUrl, tifUrl, bounds: {minLat,maxLat,minLon,maxLon}, corners: {northWest,northEast,southEast,southWest mỗi cái {latitude,longitude}}, errorMessage }`. Chỉ xác nhận đúng các giá trị `status` thật (ví dụ `COMPLETED`) khi đọc response lúc test tay — chưa có enum liệt kê sẵn từ source, không đoán trước danh sách đầy đủ.
- UI: trên màn chi tiết Mission (chỉ hiện khi Mission đã `ReadyForProcessing` trở lên), nút "Ghép bản đồ" gọi process-metashape, sau đó tự poll `orthophoto-status` mỗi 5-10 giây cho tới khi có kết quả cuối (thành công hoặc lỗi), dừng poll khi rời trang. Khi xong, hiển thị `previewUrl` làm ảnh nền (dùng `bounds` để overlay đúng vị trí ở nhiệm vụ 12) và cho tải `tifUrl`.
- Không tự chọn `process-odm` thay `process-metashape` trừ khi Manager chọn tường minh (đây là 2 engine riêng, không phải fallback tự động).

**Cách test:** Bấm "Ghép bản đồ" trên Mission đã `ReadyForProcessing` → thấy `taskId` + trạng thái QUEUED, poll tự cập nhật tiến độ, khi xong hiện ảnh preview đúng vị trí và nút tải GeoTIFF.

---

## 12. System Manager — Vẽ ranh giới vườn trên ảnh trực giao + cắt tiles
**Trạng thái:** [ ] — dùng `leaflet`/`react-leaflet` đã thêm (xem mục "Quyết định" cuối tài liệu).

- API: `POST .../missions/{missionId}/farms/{farmId}/tiling-slice`, body `{ tileSize=640, overlap=64, dualScale=true, polygonGeoJson, tifStorageKey?, uploadToMinio? }` (polygon GeoJSON `Polygon`, vòng tọa độ `[lng, lat]`, tự khép kín điểm cuối = điểm đầu). Response `{ missionId, totalTiles, totalTiles640, totalTiles1280, dualScale, tiles: [{tileIndex, tileSize, colOff, rowOff, width, height, fileName, storageKey, url, bounds, corners, affineTransform}] }`.
- UI theo đúng hành vi UC04 mô tả (cần bản đồ tương tác trên `previewUrl` của nhiệm vụ 11):
  - Click lên ảnh để thêm điểm ranh giới (`[lng, lat]`); ≥3 điểm tự khép kín polygon.
  - Nút "Xóa điểm cuối", "Xóa hết", "Khóa viền / Mở khóa vẽ tiếp". Sau khi chạy YOLO (nhiệm vụ 13) tự chuyển sang khóa viền.
  - Danh sách tọa độ đã chấm (`#1: lat, lng`, ...), đếm số điểm, diện tích ước tính.
- Gọi `tiling-slice` sau khi khóa viền, trước khi sang nhiệm vụ 13.

**Cách test:** Khoanh ≥3 điểm trên ảnh, khóa viền, gọi cắt tiles → đúng `totalTiles640`/`totalTiles1280`, các tile hiển thị đúng vị trí trên bản đồ.

---

## 13. System Manager — Nhận diện cây bằng YOLO + chọn cây neo
**Trạng thái:** [ ] — phụ thuộc nhiệm vụ 12 (cùng dùng Leaflet cho phần chọn cây neo trên bản đồ).

- API: `POST .../missions/{missionId}/farms/{farmId}/yolo-detect`, body `{ confidenceThreshold=0.25, rowSpacing=2.8, colSpacing=2.5, anchorLat?, anchorLon?, customAngleDeg?, polygonGeoJson }` (để trống `anchorLat/anchorLon` → BE tự chọn cây góc trên-trái làm neo). Response `{ missionId, modelName, totalTilesScanned, totalRawDetections, totalUniqueTrees, totalMissingTrees, suggestedRowSpacing, suggestedColSpacing, maxRow, maxCol, csvDownloadUrl, activeTrees: [...], missingTrees: [...] }`, mỗi cây `{ id, row, col, lat, lon, confidence, status, source, isAnchor }`.
- UI: form tham số (confidence/rowSpacing/colSpacing — có nút "Dùng gợi ý" điền `suggestedRowSpacing/suggestedColSpacing` sau lần chạy trước); nút "Chọn cây neo" chuyển map sang chế độ chờ click 1 cây (đánh dấu nổi bật, có nút "Hủy" quay về tự động); chạy xong vẽ `activeTrees` (xanh) và `missingTrees` (vị trí nội suy) lên map.
- Không tự gửi `anchorLat/anchorLon` nếu Manager chưa chọn (để BE tự chọn theo mô tả ở trên), tránh suy đoán tọa độ thay người dùng.

**Cách test:** Chạy YOLO không chọn neo → BE tự chọn góc trên-trái; chạy lại với neo chọn tay → `activeTrees` đổi theo đúng gốc neo mới; kiểm tra `totalUniqueTrees`/`totalMissingTrees` khớp số cây vẽ trên map.

---

## 14. System Manager — Tải CSV kết quả cây
**Trạng thái:** [ ]

- API: `GET .../missions/{missionId}/farms/{farmId}/yolo-csv` → file `text/csv`, tên `trees_{missionId}.csv`, cột `tree_id,row,col,latitude,longitude,confidence,status,source`.
- UI: nút "Tải CSV" sau khi đã chạy YOLO (nhiệm vụ 13) — tải trực tiếp file về máy, không cần hiển thị nội dung trong app.

**Cách test:** Bấm tải → file CSV đúng tên, đúng số dòng = `totalUniqueTrees + totalMissingTrees`.

---

## 15. System Manager — Publish danh sách cây vào hệ thống chính thức
**Trạng thái:** [ ]

- API: `POST /api/system-manager/farms/{farmId}/missions/{missionId}/plant-gps/publish` (đã xác minh đúng prefix từ `SystemManagerMissionsController`, khác với path UC04 ghi nhầm) — cần header `Idempotency-Key` (UUID). Body bọc trong `payload`:
  ```json
  { "payload": { "surveyOrderId": "...", "rowSpacingM": 3.0, "plantSpacingM": 2.5, "gridBearingDeg": 0.0,
      "candidates": [{ "treeId": "...", "row": 1, "col": 1, "latitude": ..., "longitude": ..., "confidence": ..., "status": "DETECTED", "source": "YOLO" }] } }
  ```
  Response thành công `{ missionId, messageId, status: "QUEUED" }` — xếp vào Outbox, không tạo Cây thật ngay lập tức (xử lý nền). `candidates` phải khớp các dòng đã lưu nháp qua API `plant-gps` (nhiệm vụ 7) — không tự dựng danh sách khác.
- Trước khi publish: lưu nháp kết quả YOLO (nhiệm vụ 13) vào `plant-gps` (nhiệm vụ 7) bằng `activeTrees`/`missingTrees` (đổi `lat/lon` → `latitude/longitude` cho khớp field của API `plant-gps`).
- UI: nút "Đưa vào hệ thống chính thức" trên cùng màn với kết quả YOLO, bật sau khi đã lưu nháp; sau publish hiển thị trạng thái "Đã xếp hàng xử lý", nhắc Manager dùng `GET /api/system-manager/farms/{farmId}/missions/{missionId}/plant-gps` (nhiệm vụ 7) để xem lại khi cây thật đã được tạo xong (xử lý nền, không có mốc thời gian cố định).

**Cách test:** Lưu nháp danh sách cây → Publish → nhận `status=QUEUED`; gọi lại GET plant-gps sau một lúc để kiểm tra dữ liệu còn khớp (không tự coi QUEUED là đã xong).

---

## 16. Kiểm thử tổng thể end-to-end
**Trạng thái:** [ ]

Chạy lại toàn bộ theo đúng thứ tự trên **một SurveyOrder thật** đã đặt cọc/thanh toán xong, từ bước 0 đến 15, không bỏ bước nào:

1. Tạo Drone (bước 1) → Prepare Mission cho Order (bước 3).
2. Preflight đạt (bước 4) → Start (bước 5) → Complete-flight (bước 5).
3. Upload ảnh (bước 8) + Import telemetry (bước 9).
4. Readiness đạt → Finalize (bước 10).
5. Ghép bản đồ (bước 11) → khoanh ranh giới + cắt tiles (bước 12) → chạy YOLO (bước 13) → tải CSV (bước 14) → lưu nháp GPS cây (bước 7) → Publish (bước 15).
6. Thử lại 1 nhánh lỗi: Prepare Mission khác → Start → Fail-flight (RESCHEDULE_REQUIRED) → Reschedule → Preflight lại → tiếp tục bình thường (bước 6).
7. `npm run build`, `npm test`, `npm run typecheck` đều đạt trước khi coi là xong.

**Ghi chú:** Cập nhật trạng thái `[ ]/[~]/[x]` ở từng mục khi làm đến đó, để theo dõi tiến độ qua các lần làm việc tiếp theo.

---

## Quyết định: dùng Leaflet cho nhiệm vụ 12-13

UC04 mô tả UI bản đồ tương tác thật sự (click thêm điểm ranh giới trên ảnh, overlay tile, kéo-chọn cây neo, marker màu theo trạng thái cây) dựa trên Leaflet.js — có file Python tham khảo `backend/services/metashape-service/map_picker.py` (dòng 300-780) làm mẫu hành vi.

**2026-11-01: Người dùng chọn thêm Leaflet.** Đã cài `leaflet@^1.9.4` + `react-leaflet@^5.0.0` + `@types/leaflet` (dev) vào `AgriDrone-FE/package.json`; `react-leaflet@5` yêu cầu React `^19.0.0`, khớp đúng React 19.2.8 đang dùng trong dự án — đã kiểm tra `node_modules/react-leaflet/package.json` trước khi cài. Nhiệm vụ 12-13 sẽ dùng `L.imageOverlay(previewUrl, bounds)` làm nền ảnh trực giao, chấm điểm trực tiếp lên ảnh, marker tương tác cho cây/neo — đúng theo mô tả UC04, không làm bản nhập tay thay thế.

Các màn ranh giới hiện có (`BoundaryPointFields.tsx`, `FarmBoundaryModals.tsx`) vẫn giữ nguyên nhập tay — không đổi sang Leaflet, vì không thuộc phạm vi UC04 và không có ảnh nền trực giao để overlay.
