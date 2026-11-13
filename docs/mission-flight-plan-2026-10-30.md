# Kế hoạch triển khai FE — Nhiệm vụ bay (Prepare → Preflight → Flight → Upload → Finalize → Ghép bản đồ → Nhận diện cây)

Nguồn:
- `BE2-Prepare-to-Upload-Finalize-API.md` (người dùng cung cấp, 30/10/2026) — luồng Prepare→Preflight→Flight→Upload→Finalize (nhiệm vụ 0-10).
- `AgriDrone Docs.md` (UC04, người dùng cung cấp, 31/10/2026) — luồng tiếp theo sau Finalize: Ghép bản đồ trực giao (Metashape/ODM), cắt tiles, nhận diện cây bằng YOLO, tải CSV và đưa cây vào hệ thống chính thức (nhiệm vụ 11-15).
- `AgriDrone Docs (1).md` (người dùng cung cấp, 06/11/2026) — bản cập nhật của UC04, phần Pha 1-6 giữ nguyên; bổ sung luồng mới "Bản đồ sức khỏe cây + Duyệt bệnh" (UC-28/29/30a/b/c, nhiệm vụ 17-20), vận hành downstream của bước Publish (nhiệm vụ 15).

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
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.

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
**Trạng thái:** [~] Đã code xong trong `ManagerMissionDetailPage`: chọn engine (Metashape/ODM), nút "Ghép bản đồ" chỉ hiện khi Mission ở `ReadyForProcessing`/`AwaitingReview`/`ProcessingFailed` (đúng gate thật từ `ProcessMetashapeCommandHandler`, không phải "≥ ReadyForProcessing" như ghi trước đó); khi `Processing` tự poll `orthophoto-status` mỗi 7s tới khi `COMPLETED`/`ERROR`, hiện ảnh preview + nút tải GeoTIFF khi xong. Tự test: typecheck ✓, 161/161 test (thêm `tests/mission-orthophoto.test.mjs`, 4 test) ✓, build ✓. Chưa test tay với BE thật.
**Phát hiện quan trọng khi đọc `ProcessMetashapeCommandHandler`/`GetMissionOrthophotoStatusQueryHandler`:**
- Yêu cầu Mission đã có ảnh gốc (`RawImage`) upload trước — lỗi `ProcessMetashape.NoImages` nếu chưa có.
- `status` của `orthophoto-status` là **chuỗi riêng từ service xử lý ảnh** (`NOT_STARTED`/`COMPLETED`/`ERROR` xác nhận được, các trạng thái đang chạy khác do service Python trả, không liệt kê hết được từ source) — **không phải trạng thái Mission**, không chuẩn hóa qua `toScreamingSnakeCase`/`missionStatusLabel`, có bảng nhãn riêng (`orthophotoStatusLabel`).
- `GET orthophoto-status` có side effect thật: tự lưu media đã ghép vào DB và chuyển Mission sang `AwaitingReview` khi phát hiện hoàn tất — poll lặp lại là an toàn và cần thiết, không chỉ để hiển thị.
- Lỗi `ProcessMetashape.AlreadyProcessing`/`InvalidStatus` đã có sẵn thông báo tiếng Việt từ BE — không viết đè bản dịch, chỉ dùng fallback `error.message`.

**2026-11-06 — lỗ hổng điều hướng chặn test tay (người dùng báo "không tìm thấy màn hình"):** Trang Đơn khảo sát (`ManagerOrderDetailPage.tsx`) chỉ hiện nút "Chuẩn bị nhiệm vụ bay" — **link duy nhất** tới màn chi tiết Mission (nơi có nhiệm vụ 11-16) — khi `missionPurposeFor()` trả về giá trị, tức chỉ ở đúng lúc đơn `BASELINE_READY`/`READY_FOR_PAID_SERVICE`. Qua khỏi bước đó (ví dụ đang `BASELINE_IN_PROGRESS` = "Đang bay bản đồ"), nút biến mất và không còn cách nào quay lại màn Mission — chặn test mọi nhiệm vụ 11-16, với **mọi** đơn, không riêng 1 lần. Đã sửa: thêm `findMissionsBySurveyOrder()` trong `missionApi.ts`, tra theo `missionCode` (tất định từ `surveyOrderId` — xem `PrepareMissionSetCommandHandler.BuildMissionCode`: `ORD-{surveyOrderId:N}-{BASE|HEALTH|READY}`), phân trang danh sách Mission của farm (cùng kiểu bounded 25 trang như `findMissionById`) — chỉ đọc, không gọi API tạo/sửa gì. `ManagerOrderDetailPage` giờ luôn hiện link "Nhiệm vụ bay: ... →" theo mã Mission + trạng thái, không phụ thuộc trạng thái đơn. Tự test: typecheck ✓, 179/179 test (thêm 2 test trong `tests/mission-preflight.test.mjs`) ✓, build ✓.

**2026-11-06:** Đã thử thêm giới hạn 20 file/đợt vào hàm chia đợt upload (nhiệm vụ 8) dựa trên `[MaxLength(20)]` đọc được từ source lúc đó — **người dùng xác nhận BE đã bỏ giới hạn này**, đã hoàn tác, giữ nguyên hàm chia đợt chỉ theo dung lượng (5 GiB) như trước. Không sửa lại nữa trừ khi có xác nhận mới từ BE.

**2026-11-07 — người dùng báo "có ảnh ở nhiệm vụ 11 nhưng không thấy màn vẽ ranh giới (nhiệm vụ 12)":** Đọc `GetMissionOrthophotoStatusQueryHandler.BuildCompletedResultAsync` + `MetashapeService.cs` xác nhận: `status: "COMPLETED"` và `previewUrl` có thể hợp lệ trong khi `bounds` vẫn `null` — handler parse `bounds`/`corners` từ JSON metadata lưu kèm ảnh preview, bọc trong `try/catch` **nuốt lỗi âm thầm** nếu parse thất bại (chỉ log warning, vẫn trả `Result.Success`); và gốc rễ sâu hơn, `MetashapeService.cs:168` chỉ parse `bounds` khi JSON từ **chính service Python Metashape/ODM** có field `bounds` dạng object — nếu service đó không tính được tọa độ georeference thật (thường do ảnh gốc thiếu GPS/telemetry hợp lệ để Metashape định vị), nó trả về thiếu `bounds` dù ghép ảnh (pixel) vẫn thành công. Đây **không phải lỗi FE** — mục "Vẽ ranh giới" (nhiệm vụ 12) đúng là phải cần `bounds` thật để overlay bản đồ đúng vị trí địa lý; hiện bằng `bounds` giả sẽ làm sai toàn bộ tọa độ polygon gửi đi ở `tiling-slice` sau đó. Đã sửa FE: thêm cảnh báo vàng rõ ràng ngay dưới ảnh preview khi `status=COMPLETED` nhưng thiếu `bounds`, thay vì để mục nhiệm vụ 12 biến mất âm thầm không rõ lý do. Việc ảnh gốc/telemetry của Mission test này thiếu dữ liệu GPS cần kiểm tra lại ở nhiệm vụ 8-9 (upload ảnh/import telemetry) hoặc hỏi đội BE về log xử lý ảnh (service Python) của Mission cụ thể. Tự test: typecheck ✓, 181/181 test ✓, build ✓.

- API kích hoạt: `POST .../missions/{missionId}/farms/{farmId}/process-metashape` (Metashape, mặc định) hoặc `POST .../process-odm` (OpenDroneMap — phương án mã nguồn mở thay thế, cùng request/response). Body tùy chọn `{ cameraType?, alignAccuracy?, genericPreselection? }` (bỏ trống dùng cấu hình mặc định BE). Response `{ missionId, taskId, status, message }`.
- API poll: `GET .../orthophoto-status` → `{ missionId, taskId, status, progress, processingTimeMs, previewUrl, tifUrl, bounds: {minLat,maxLat,minLon,maxLon}, corners: {northWest,northEast,southEast,southWest mỗi cái {latitude,longitude}}, errorMessage }`. Chỉ xác nhận đúng các giá trị `status` thật (ví dụ `COMPLETED`) khi đọc response lúc test tay — chưa có enum liệt kê sẵn từ source, không đoán trước danh sách đầy đủ.
- UI: trên màn chi tiết Mission (chỉ hiện khi Mission đã `ReadyForProcessing` trở lên), nút "Ghép bản đồ" gọi process-metashape, sau đó tự poll `orthophoto-status` mỗi 5-10 giây cho tới khi có kết quả cuối (thành công hoặc lỗi), dừng poll khi rời trang. Khi xong, hiển thị `previewUrl` làm ảnh nền (dùng `bounds` để overlay đúng vị trí ở nhiệm vụ 12) và cho tải `tifUrl`.
- Không tự chọn `process-odm` thay `process-metashape` trừ khi Manager chọn tường minh (đây là 2 engine riêng, không phải fallback tự động).

**Cách test:** Bấm "Ghép bản đồ" trên Mission đã `ReadyForProcessing` → thấy `taskId` + trạng thái QUEUED, poll tự cập nhật tiến độ, khi xong hiện ảnh preview đúng vị trí và nút tải GeoTIFF.

---

## 12. System Manager — Vẽ ranh giới vườn trên ảnh trực giao + cắt tiles
**Trạng thái:** [~] Đã code xong: [BoundaryTilingPanel.tsx](AgriDrone-FE/src/features/missions/BoundaryTilingPanel.tsx) mới dùng `react-leaflet` (`MapContainer` + `ImageOverlay` phủ `previewUrl`/`bounds` từ nhiệm vụ 11, `CircleMarker`/`Polygon`/`Polyline` vẽ điểm/viền — không dùng `Marker` mặc định nên tránh được lỗi icon asset quen thuộc của Leaflet khi bundler). Đủ 3 nút theo đúng mô tả UC04 (Xóa điểm cuối/Xóa hết/Khóa viền), danh sách tọa độ `#n: lat, lng`, diện tích ước tính (công thức phẳng quanh vĩ độ trung tâm, đủ dùng cho quy mô 1 vườn, không phải tính geodesic chính xác). Chỉ hiện khi `orthophoto-status` đã `COMPLETED` và có `previewUrl`/`bounds`. Tự test: typecheck ✓, 164/164 test (thêm `tests/mission-tiling.test.mjs`, 3 test) ✓, build ✓ (chunk `ManagerMissionDetailPage` ~181 kB gzip 54 kB do thêm Leaflet, vẫn lazy-load riêng không ảnh hưởng trang khác). Chưa test tay với BE thật.
**Phát hiện khi đọc `SliceMissionTilesCommandHandler`:** API `tiling-slice` **không gate theo trạng thái Mission** (chỉ cần quyền farm + Mission tồn tại) và tự tìm file TIF đã lưu từ nhiệm vụ 11 nếu không truyền `tifStorageKey` — FE không cần tự quản lý storage key.

- API: `POST .../missions/{missionId}/farms/{farmId}/tiling-slice`, body `{ tileSize=640, overlap=64, dualScale=true, polygonGeoJson, tifStorageKey?, uploadToMinio? }` (polygon GeoJSON `Polygon`, vòng tọa độ `[lng, lat]`, tự khép kín điểm cuối = điểm đầu). Response `{ missionId, totalTiles, totalTiles640, totalTiles1280, dualScale, tiles: [{tileIndex, tileSize, colOff, rowOff, width, height, fileName, storageKey, url, bounds, corners, affineTransform}] }`.
- UI theo đúng hành vi UC04 mô tả (cần bản đồ tương tác trên `previewUrl` của nhiệm vụ 11):
  - Click lên ảnh để thêm điểm ranh giới (`[lng, lat]`); ≥3 điểm tự khép kín polygon.
  - Nút "Xóa điểm cuối", "Xóa hết", "Khóa viền / Mở khóa vẽ tiếp". Sau khi chạy YOLO (nhiệm vụ 13) tự chuyển sang khóa viền.
  - Danh sách tọa độ đã chấm (`#1: lat, lng`, ...), đếm số điểm, diện tích ước tính.
- Gọi `tiling-slice` sau khi khóa viền, trước khi sang nhiệm vụ 13.

**Cách test:** Khoanh ≥3 điểm trên ảnh, khóa viền, gọi cắt tiles → đúng `totalTiles640`/`totalTiles1280`, các tile hiển thị đúng vị trí trên bản đồ.

---

## 13. System Manager — Nhận diện cây bằng YOLO + chọn cây neo
**Trạng thái:** [x] Đã code và người dùng đã test tay xong.

- API: `POST .../missions/{missionId}/farms/{farmId}/yolo-detect`, body `{ confidenceThreshold=0.25, rowSpacing=2.8, colSpacing=2.5, anchorLat?, anchorLon?, customAngleDeg?, polygonGeoJson }` (để trống `anchorLat/anchorLon` → BE tự chọn cây góc trên-trái làm neo). Response `{ missionId, modelName, totalTilesScanned, totalRawDetections, totalUniqueTrees, totalMissingTrees, suggestedRowSpacing, suggestedColSpacing, maxRow, maxCol, csvDownloadUrl, activeTrees: [...], missingTrees: [...] }`, mỗi cây `{ id, row, col, lat, lon, confidence, status, source, isAnchor }`.
- UI: form tham số (confidence/rowSpacing/colSpacing — có nút "Dùng gợi ý" điền `suggestedRowSpacing/suggestedColSpacing` sau lần chạy trước); nút "Chọn cây neo" chuyển map sang chế độ chờ click 1 cây (đánh dấu nổi bật, có nút "Hủy" quay về tự động); chạy xong vẽ `activeTrees` (xanh) và `missingTrees` (vị trí nội suy) lên map.
- Không tự gửi `anchorLat/anchorLon` nếu Manager chưa chọn (để BE tự chọn theo mô tả ở trên), tránh suy đoán tọa độ thay người dùng.

**Cách test:** Chạy YOLO không chọn neo → BE tự chọn góc trên-trái; chạy lại với neo chọn tay → `activeTrees` đổi theo đúng gốc neo mới; kiểm tra `totalUniqueTrees`/`totalMissingTrees` khớp số cây vẽ trên map.

---

## 14. System Manager — Tải CSV kết quả cây
**Trạng thái:** [~] Đã code xong: nút "Tải CSV kết quả cây" hiện sau khi đã chạy YOLO (nhiệm vụ 13). API này trả **file stream thật, không phải JSON** (`Results.File(...)` bên BE) nên không dùng được `apiRequest` sẵn có — đã thêm `apiRequestFile()` dùng chung trong `src/api/client.ts` (đọc `Content-Disposition` lấy tên file, cùng cách parse lỗi ProblemDetails như `apiRequest`), tạo blob URL và click `<a download>` ẩn để trình duyệt lưu file, không mở tab mới. Tự test: typecheck ✓, 171/171 test (thêm `tests/mission-yolo-csv.test.mjs`, 4 test) ✓, build ✓. Chưa test tay với BE thật.
**Phát hiện khi đọc `DownloadMissionTreesCsvQueryHandler`:** lỗi `DownloadCsv.NotFound` khi chưa chạy YOLO lần nào — đã map rõ ràng, và UI cũng tự ẩn nút khi chưa có `yoloResult` nên trường hợp này hiếm khi xảy ra qua UI.

- API: `GET .../missions/{missionId}/farms/{farmId}/yolo-csv` → file `text/csv`, tên `trees_{missionId}.csv`, cột `tree_id,row,col,latitude,longitude,confidence,status,source`.
- UI: nút "Tải CSV" sau khi đã chạy YOLO (nhiệm vụ 13) — tải trực tiếp file về máy, không cần hiển thị nội dung trong app.

**Cách test:** Bấm tải → file CSV đúng tên, đúng số dòng = `totalUniqueTrees + totalMissingTrees`.

---

## 15. System Manager — Publish danh sách cây vào hệ thống chính thức
**Trạng thái:** [~] Đã code xong trong `ManagerMissionDetailPage`, mục YOLO (nhiệm vụ 13), ngay dưới nút "Tải CSV": bấm 1 nút "Đưa vào hệ thống chính thức" sẽ tự **lưu nháp lại** (`replaceMissionPlantGps`, nhiệm vụ 7) từ `yoloResult.activeTrees/missingTrees` hiện tại rồi gọi publish ngay với **cùng** mảng cây vừa gửi (không đọc lại từ GET) — tránh lệch dữ liệu vì BE so khớp từng field tuyệt đối giữa `candidates` và dòng đã lưu (`MissionPlantGpsPublisher`). Form nhập `rowSpacingM`/`plantSpacingM`/`gridBearingDeg` (mặc định đúng theo default của BE record: 3.0 / 2.5 / 0.0). Tự test: typecheck ✓, 183/183 test (thêm `tests/mission-plant-gps-publish.test.mjs`, 6 test) ✓, build ✓. Chưa test tay với BE thật.

**Phát hiện khi đọc `MissionPlantGpsPublisher.PublishAsync`:**
- Endpoint này **chỉ áp dụng cho Mission có `purpose = BaselineMapping`** — nếu khác, BE trả 409 Conflict "Payload survey order does not match a baseline mapping mission." UI đã thêm cảnh báo vàng khi `latest.purpose` đã biết và khác Baseline Mapping, nhưng không chặn cứng (để lỗi 409 thật từ BE là nguồn đúng).
- Response lỗi (404/409/400) **không có `errorCode`** như các endpoint khác trong Mission module (Conflict trả `{errors: [string]}` thô, ValidationProblem trả `{errors: {payload: [string]}}` chuẩn ASP.NET, NotFound trả body rỗng) — không thể map theo `error.code` như `missionError()` thường làm. Đã thêm `publishPlantGpsError()` riêng trong `missionWorkflow.ts`, khớp theo đúng câu tiếng Anh cố định (6 câu đã liệt kê hết từ source) rồi mới fallback `missionError()`.
- **Lỗ hổng dữ liệu cũ vẫn còn:** `surveyOrderId` chỉ có trong `latest` (state cục bộ, chỉ được set sau 1 mutation Mission trả `MissionDetail` đầy đủ trong phiên hiện tại) — System Manager chưa có API GET 1 mission đầy đủ, nên nếu tải lại trang đúng lúc đang ở bước YOLO/Publish, `latest` sẽ `null` và nút Publish báo lỗi rõ ràng yêu cầu publish trong cùng phiên hoặc bổ sung API BE (không tự chế giải pháp vá tạm).

**Cách test:** Chạy YOLO xong → bấm "Đưa vào hệ thống chính thức" → nhận `status=QUEUED` + `messageId`; gọi lại GET plant-gps (mục "GPS cây lưu nháp") sau một lúc để kiểm tra dữ liệu còn khớp (không tự coi QUEUED là đã xong — Cây thật được tạo nền, không có mốc thời gian cố định).

---

## 16. Kiểm thử tổng thể end-to-end
**Trạng thái:** [~] Mục 7 (tự động) đã chạy lại sau khi làm nhiệm vụ 15, trên toàn bộ codebase tích lũy từ nhiệm vụ 0-15: `npm run typecheck` ✓, `npm test` 183/183 ✓, `npm run build` ✓. Mục 1-6 (click tay toàn luồng với 1 SurveyOrder thật, có Drone/tài khoản thật) **chưa làm** — ngoài khả năng của tôi (không có quyền BE/tài khoản thật để thao tác tay), cần người dùng tự thực hiện.

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

## 17. System Manager — Bản đồ sức khỏe cây (tổng quan nông trại)
**Trạng thái:** [ ] — nguồn: `AgriDrone Docs (1).md` (người dùng cung cấp, 2026-11-06), mục "Lấy Bản Đồ Nền & Trạng Thái Sức Khỏe Cây Trồng" — **mới hoàn toàn**, không trùng với `PlantHealthPage.tsx`/`plantHealthApi.ts` hiện có (đó là danh mục nhãn/hướng dẫn cấp hệ thống, khác luồng này). Đã xác minh đủ 7 API của mục 17-20 từ `FarmPlantHealthController.cs`/`PlantHealthReviewController.cs` và các Command/Query Handler thật trong `Application/Features/PlantHealth/` + `Processing/GetFarmPlantHealthMap/`.

- API: `GET /api/farms/{farmId}/plant-health-map?tenantId={tenantId}` — **không yêu cầu đăng nhập** (`[AllowAnonymous]` trong source, khác với doc ghi "cần Bearer token"); gửi token kèm theo vẫn an toàn, không bắt buộc. Response thật **nhiều hơn** mẫu trong doc, có thêm `boundaryGeoJson` và `zones` (danh sách vùng bệnh đầy đủ, dùng cho nhiệm vụ 20):
  ```json
  { "farmId", "tenantId", "boundaryGeoJson": "...",
    "baseMap": { "sourceMissionId", "status", "previewUrl", "bounds", "gridBearingDeg", "plantSpacingM", "rowSpacingM" } | null,
    "summary": { "totalPlants", "normalPlants", "healthyFruitPlants", "diseasePlants", "diseaseBreakdown": {"<tên bệnh>": n} },
    "plants": [{ "id", "plantCode", "row", "col", "lat", "lon", "lifecycleStatus", "healthStatus", "observations": [{ "id", "missionId", "className", "classNameVi", "confidence", "gpsDistanceM", "imageName", "cropImageUrl", "annotatedImageUrl", "detectionId" }] }],
    "zones": [{ "id", "zoneKey", "status", "alertType", "diseaseName", "diseaseNameVi", "totalTrees", "centerLat", "centerLon", "radiusMeters", "geometryGeoJson", "diseaseBreakdown", "trees": [{ "plantId", "plantCode", "row", "col", "lat", "lon" }] }] }
  ```
  `healthStatus` chỉ có đúng 3 giá trị xác nhận từ source: `NORMAL` (xanh), `HEALTHY_FRUIT` (có trái khỏe), `DISEASE` (đỏ). Zone `status`: `PROPOSED | REVIEWED | REJECTED` (xác nhận qua các handler ở nhiệm vụ 20). `alertType` đọc thẳng từ dữ liệu, chưa liệt kê hết giá trị — không đoán, hiển thị nguyên văn nếu chưa có nhãn.
- UI: trang mới (ví dụ `/manager/farms/:farmId/plant-health`), dùng lại `react-leaflet` như nhiệm vụ 12: `ImageOverlay` ảnh nền từ `baseMap.previewUrl`/`bounds`, `CircleMarker` cho từng cây tô màu theo `healthStatus` (xanh/vàng/đỏ), click cây mở Drawer xem `observations` kèm `cropImageUrl`/`annotatedImageUrl`. Panel tổng quan hiển thị `summary` + `diseaseBreakdown`. Vẽ `zones` bằng `L.geoJSON(JSON.parse(zone.geometryGeoJson))` (theo đúng khuyến nghị FE Checklist của doc — **không** vẽ `L.circle` cứng dù có `centerLat/centerLon/radiusMeters`, vì khi đã Reshape (nhiệm vụ 20) hình dạng thật từ PostGIS mới đúng).
- Sau bất kỳ API ghi nào ở nhiệm vụ 18-20 thành công, chỉ cần gọi lại GET này để làm mới toàn bộ bản đồ (đúng theo "Lưu Ý Chung" của doc) — không tự suy luận lại màu/trạng thái ở FE.

**Cách test:** Mở trang với 1 farm đã publish base map (qua nhiệm vụ 15) → thấy đúng số cây theo `summary`, màu cây khớp `healthStatus`, click cây ra đúng ảnh crop.

---

> **13/11/2026:** Nhiệm vụ 18–20 được chia nhỏ và theo dõi tại [`plant-health-review-phase2-2026-11-13.md`](./plant-health-review-phase2-2026-11-13.md) (task A1–A8). Cập nhật tiến độ ở tài liệu đó, không cập nhật ở đây.

## 18. System Manager — Duyệt vết bệnh/trái trên cây (UC-28)
**Trạng thái:** [ ]

- API: `PUT /api/system-manager/farms/{farmId}/plant-health/observations/{observationId}/review`, body `{ decision: "CONFIRMED" | "REJECTED", reason, correctedConditionCode? }` → `{ observationId, newStatus, resolvedPlantId, reason }`. `decision` chỉ nhận đúng 2 giá trị này (BE tự uppercase, nhưng FE nên gửi đúng hoa để rõ ràng); sai giá trị khác bị từ chối.
- Hiệu ứng nghiệp vụ đã xác nhận từ handler: `CONFIRMED` → cây chuyển health level `MODERATE` (trừ khi lớp AI nhận là "Healthy..." thì giữ `HEALTHY`); `REJECTED` → nếu cây không còn vết `CONFIRMED`/`MATCHED` nào khác thì tự hoàn `HEALTHY`. `correctedConditionCode` chỉ áp dụng khi `decision=CONFIRMED`.
- Lỗi: `ReviewObservation.FarmAccessDenied`, `ReviewObservation.InvalidDecision`, `ReviewObservation.NotFound`. Gọi lại với cùng `decision` đã áp dụng trả kết quả idempotent (không lỗi).
- UI: trong Drawer chi tiết cây (nhiệm vụ 17) hoặc màn riêng liệt kê observation theo trạng thái, mỗi observation có ảnh crop + 2 nút Xác nhận/Bác bỏ, bắt buộc nhập lý do.

**Cách test:** Confirm 1 vết bệnh trên cây đang `NORMAL` → cây chuyển `DISEASE` (gọi lại nhiệm vụ 17 để thấy); Reject vết đó → cây hoàn `NORMAL` nếu không còn vết nào khác.

---

## 19. System Manager — Xử lý vết lệch tọa độ (UC-29)
**Trạng thái:** [ ]

- API xem danh sách: `GET /api/system-manager/farms/{farmId}/plant-health/flagged-observations` → `{ farmId, count, items: [{ observationId, missionId, detectedLat, detectedLon, gpsDistanceMeters, detectionConfidence, matchingParametersJson, suggestedPlantId }] }` — chỉ gồm observation đang `PENDING` (lệch >2.5m so với trụ gần nhất, chưa khớp cây nào).
- API xử lý: `POST .../plant-health/observations/{observationId}/resolve-flag`, body `{ action: "SNAP" | "CREATE_NEW_PLANT" | "DISMISS", targetPlantId?, newPlantCode?, zoneId?, reason }`.
  - `SNAP` bắt buộc `targetPlantId` (phải là cây `ACTIVE` trong farm) — lỗi `ResolveFlagged.TargetPlantRequired`/`TargetPlantNotFound`.
  - `CREATE_NEW_PLANT` tạo cây mới tại đúng tọa độ phát hiện; BE tự kiểm tra điểm có nằm trong ranh giới farm đã duyệt không (`ResolveFlagged.OutsideBoundary` nếu ngoài — FE không tự validate thay, chỉ hiển thị lỗi), và mã cây trùng bị chặn (`ResolveFlagged.PlantCodeExists`); để trống `newPlantCode` BE tự sinh mã.
  - `DISMISS` chỉ cần `reason`.
  - Chỉ xử lý được observation đang `PENDING`, gọi lại khi đã xử lý nhận lỗi `ResolveFlagged.NotPending`.
- UI: danh sách/markers màu tím nét đứt kèm `gpsDistanceMeters` (theo đúng mô tả doc), mở từng điểm cho chọn 1 trong 3 hành động; `SNAP` cần chọn cây đích (từ danh sách `plants` đã có ở nhiệm vụ 17, ví dụ các cây gần nhất).

**Cách test:** Với 1 observation PENDING mẫu: thử SNAP vào 1 cây có sẵn → cây đó chuyển `DISEASE`; thử DISMISS 1 observation khác → biến mất khỏi danh sách flagged; thử CREATE_NEW_PLANT với tọa độ ngoài ranh giới farm → nhận đúng lỗi `OutsideBoundary`, không tạo cây.

---

## 20. System Manager — Quản lý vùng bệnh: Gộp / Chỉnh viền / Thành viên (UC-30a/b/c)
**Trạng thái:** [ ]

**Luật bất biến chung (đã xác nhận từ cả 3 handler):** cả 3 thao tác dưới đây chỉ áp dụng được khi vùng đang ở trạng thái `PROPOSED` — lỗi `*.InvalidStatus` nếu không. Sau khi Chỉnh viền hoặc Thêm/bớt thành viên thành công, vùng tự chuyển sang `REVIEWED` và **khóa vĩnh viễn** với cả 3 API này (kể cả Gộp) — đúng "Khóa bất biến sau duyệt" trong FE Checklist của doc.

- **Gộp vùng (20a):** `POST .../plant-health/disease-zones/merge`, body `{ zoneIds: Guid[] (≥2), mergedGeometry: GeoJSON Polygon }` → `{ mergedZoneId, totalTrees, mergedZoneCount }`. Yêu cầu tất cả `zoneIds` đang `PROPOSED` và cùng farm; vùng mới kế thừa toàn bộ cây thành viên (khử trùng), các vùng nguồn chuyển `REJECTED` (giữ lịch sử, không xóa cứng). Lỗi: `MergeZones.MinimumZones`, `ZoneNotFound`, `InvalidStatus`, `EmptyMembership`.
- **Chỉnh viền (20b):** `PUT .../plant-health/disease-zones/{zoneId}/boundary`, body `{ newGeometry: GeoJSON Polygon }` → `{ zoneId, geometryGeoJson, totalEnclosedTrees }`. BE tự cắt polygon theo đúng ranh giới farm (PostGIS `ST_Intersection`) và tính lại chính xác số cây nằm trong bằng `ST_Contains` — FE không tự đếm cây, chỉ hiển thị `totalEnclosedTrees` trả về.
- **Thêm/bớt thành viên (20c):** `PATCH .../plant-health/disease-zones/{zoneId}/memberships`, body `{ addPlantIds: Guid[], removePlantIds: Guid[] }` → `{ zoneId, totalEnclosedTrees, addedCount, removedCount }`. Cây thêm vào phải `ACTIVE` trong đúng farm (lỗi `PlantNotFound` nếu không); không gửi gì (cả 2 mảng rỗng) thì không đổi gì và vùng giữ nguyên `PROPOSED`.
- UI (20b cần vẽ/chỉnh polygon trên bản đồ): **tái dùng đúng cách tương tác đã làm ở nhiệm vụ 12** (danh sách điểm + Xóa điểm cuối/Xóa hết, không cần thêm thư viện vẽ-kéo-điểm như `leaflet-draw`) — nạp sẵn các điểm từ `zone.geometryGeoJson` hiện có, cho sửa rồi gửi `newGeometry`. 20a/20c là thao tác chọn (zone list, plant list), không cần vẽ.

**Cách test:** Tạo 2 vùng PROPOSED mẫu (qua pipeline AI hoặc dữ liệu test) → Gộp lại → đúng `mergedZoneCount=2`; Chỉnh viền 1 vùng PROPOSED khác → `totalEnclosedTrees` đổi đúng theo polygon mới, vùng chuyển `REVIEWED`; thử Gộp lại vùng vừa Chỉnh viền → bị chặn `InvalidStatus` (đã khóa).

---

## 21. System Manager — Reset upload
**Trạng thái:** [~] Nguồn: commit BE `d9fb0a5` ("resetupload", 06/11/2026) — tính năng mới hoàn toàn, không thuộc 2 tài liệu nguồn ban đầu, phát hiện khi đọc `git log` theo yêu cầu người dùng. Đã code xong trong `ManagerMissionDetailPage`: section "Reset upload" mới, hiện cùng lúc với (không lồng trong) mục "Hoàn tất upload" (nhiệm vụ 10) và "Ghép bản đồ trực giao" (nhiệm vụ 11) khi Mission ở `Uploading`/`UploadFailed`/`ReadyForProcessing`/`ProcessingFailed` — dùng `ActionModal`/`Action` có sẵn (cùng pattern với "Hủy nhiệm vụ bay"/"Báo lỗi chuyến bay"), xác nhận trước khi xóa (destructive), có lựa chọn "Xóa luôn dữ liệu telemetry?". Tự test: typecheck ✓, 181/181 test (thêm 2 test trong `tests/mission-upload-finalize.test.mjs`) ✓, build ✓. Chưa test tay với BE thật.

- API: `POST /api/missions/{missionId}/farms/{farmId}/upload/reset`, body `{ expectedMissionVersion?: number, resetTelemetry?: boolean }` (cả 2 optional, FE luôn gửi cả 2 — `expectedMissionVersion` theo đúng convention optimistic concurrency chung của dự án dù BE cho phép bỏ trống) → `{ missionId, status, deletedMediaCount, telemetryReset, missionVersion }`. `status` trả về là PascalCase thô (`enum.ToString()`, giống Prepare/Finalize) — đã chuẩn hóa qua `toScreamingSnakeCase()` trước khi lưu vào `latest.status`.
- Chỉ áp dụng khi Mission đang `Uploading`/`UploadFailed`/`ReadyForProcessing`/`ProcessingFailed`. Xóa toàn bộ file ảnh/video trên MinIO + record `MissionMedia`/`MediaAssets`/`MediaUploadSessions`, đưa Mission **về lại `Uploading`**. Nếu `resetTelemetry=true`: xóa luôn toàn bộ điểm + lần import telemetry đã lưu, xóa `FlightRoute`.
- **Phát hiện phụ:** `UPLOAD_FAILED` trước đây không được bất kỳ section nào trong `ManagerMissionDetailPage` xử lý (không nằm trong mảng trạng thái `postFlight`, cũng không nằm trong `canStartOrthophoto`) — Mission rơi vào trạng thái này sẽ chỉ thấy cảnh báo chung "không ở bước có thao tác trong phạm vi đã triển khai". Section Reset upload mới cho `UPLOAD_FAILED` một nơi để thao tác tiếp; đã cập nhật điều kiện cảnh báo chung để không hiện trùng khi `canResetUpload` đúng.
- Lỗi mới: `MissionUpload.CannotResetInCurrentStatus`, `MissionUpload.MissionNotOrderBound` (2 mã còn lại — `FarmAccessDenied`, `ConcurrentUpdate` — đã có sẵn bản dịch từ trước, dùng lại).

**Cách test:** Ở Mission đang `Uploading`/`ReadyForProcessing`/`ProcessingFailed` → bấm "Reset upload" → xác nhận → Mission quay về `Uploading`, danh sách media/readiness rỗng lại; thử lại lần 2 ngay sau Finalize mà chưa upload ảnh mới → readiness báo thiếu ảnh như upload lần đầu.

---

## Quyết định: dùng Leaflet cho nhiệm vụ 12-13

UC04 mô tả UI bản đồ tương tác thật sự (click thêm điểm ranh giới trên ảnh, overlay tile, kéo-chọn cây neo, marker màu theo trạng thái cây) dựa trên Leaflet.js — có file Python tham khảo `backend/services/metashape-service/map_picker.py` (dòng 300-780) làm mẫu hành vi.

**2026-11-01: Người dùng chọn thêm Leaflet.** Đã cài `leaflet@^1.9.4` + `react-leaflet@^5.0.0` + `@types/leaflet` (dev) vào `AgriDrone-FE/package.json`; `react-leaflet@5` yêu cầu React `^19.0.0`, khớp đúng React 19.2.8 đang dùng trong dự án — đã kiểm tra `node_modules/react-leaflet/package.json` trước khi cài. Nhiệm vụ 12-13 sẽ dùng `L.imageOverlay(previewUrl, bounds)` làm nền ảnh trực giao, chấm điểm trực tiếp lên ảnh, marker tương tác cho cây/neo — đúng theo mô tả UC04, không làm bản nhập tay thay thế.

Các màn ranh giới hiện có (`BoundaryPointFields.tsx`, `FarmBoundaryModals.tsx`) vẫn giữ nguyên nhập tay — không đổi sang Leaflet, vì không thuộc phạm vi UC04 và không có ảnh nền trực giao để overlay.
