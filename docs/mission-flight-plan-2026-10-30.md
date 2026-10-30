# Kế hoạch triển khai FE — Nhiệm vụ bay (Prepare → Preflight → Flight → Upload → Finalize)

Nguồn: `BE2-Prepare-to-Upload-Finalize-API.md` (người dùng cung cấp, 30/10/2026). Phạm vi: FE web (`AgriDrone-FE`). Không đổi BE.

Tài liệu này chia luồng thành các nhiệm vụ nhỏ, làm và test lần lượt theo đúng thứ tự (mỗi bước phụ thuộc bước trước). Mỗi nhiệm vụ có: mục tiêu, API dùng, việc cần làm trên FE, cách test tay với BE thật, và trạng thái.

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
**Trạng thái:** [~] Đã code xong trong `ManagerMissionDetailPage`, mục "Thao tác khác": Hủy (Draft/Scheduled), Báo lỗi chuyến bay (InFlight, dùng Idempotency-Key ổn định theo action), Lên lịch lại (Scheduled/FlightFailed, modal riêng chọn ngày + drone thay thế tùy chọn). Lưu ý đã xác minh từ source: API reschedule dùng field `expectedVersion` (không phải `expectedMissionVersion` như các API mission khác) — đã xử lý đúng. Tự test: typecheck ✓, 149/149 test (thêm 2 test) ✓, build ✓. Chưa test tay với BE thật.

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
**Trạng thái:** [ ]

- API: `POST .../missions/{missionId}/plant-gps`.
- UI: chỉ hiện cho Mission có đếm cây bằng GPS — bảng nhập/hiển thị danh sách cây (`treeId, row, col, latitude, longitude, confidence, status, source`), cho phép nhập tay hoặc import, gửi trước khi finalize. Ghi rõ đây là **thay toàn bộ danh sách**, không phải thêm từng cây.

**Cách test:**
1. Gửi danh sách 3–5 cây mẫu → `savedCount` đúng số lượng.
2. Gửi lại danh sách khác → danh sách cũ bị thay hoàn toàn, không cộng dồn.
3. Thử treeId trùng trong 1 lần gửi → bị chặn rõ ràng.

*(Có thể làm sau cùng nếu luồng ưu tiên không cần đếm cây bằng GPS ngay.)*

---

## 8. System Manager — Upload ảnh (media)
**Trạng thái:** [ ]

- API: `POST /api/missions/{missionId}/farms/{farmId}/media` (multipart, 1 API tổng hợp — không tự gọi upload-session).
- UI: khu vực upload ảnh trên màn chi tiết Mission, chỉ bật sau khi flight đã complete/fail xong. Cho chọn nhiều file, hiển thị tiến trình + kết quả theo từng file. Nhắc giới hạn 50 MiB/file xử lý nội bộ, tổng tối đa 5 GiB/request.
- Có thể thêm `GET .../media` + `GET .../media/{mediaId}/download-url` để xem lại ảnh đã upload (Phụ lục A5), hữu ích để Manager kiểm tra trước khi finalize.

**Cách test:**
1. Upload 2–3 ảnh thật cho Mission đã complete-flight → từng ảnh có kết quả riêng, không lỗi checksum.
2. Thử upload khi Mission chưa complete-flight → bị chặn, FE không cho bấm hoặc hiển thị lỗi BE rõ.
3. Mở lại danh sách media đã upload, lấy download-url, xem ảnh load được.

---

## 9. System Manager — Telemetry (normalize + import)
**Trạng thái:** [ ]

- API: `POST .../telemetry/normalize` (multipart, chỉ decode), `POST .../telemetry/imports` (lưu thật).
- UI: khu vực riêng — nếu có file Blackbox TXT/BBL, upload để normalize, hiển thị `Warnings`, `RejectedPointCount`, cho chọn 1 segment hợp lệ (2–50.000 điểm) rồi mới Import; nếu đã có file log dạng điểm sẵn (ví dụ CSV đã parse), bỏ qua normalize và nhập trực tiếp vào Import.
- Import cần `sourceFileName`, `sourceChecksum`, `expectedMissionVersion`, `segmentIndex`, `points` (tối thiểu 2). Giữ Idempotency-Key khi retry cùng payload.

**Cách test:**
1. Normalize 1 file BBL mẫu → xem đúng Segments/Warnings, chọn 1 segment hợp lý.
2. Import segment đã chọn → thành công, version Mission tăng.
3. Thử import với 1 điểm (dưới mức tối thiểu 2) → bị chặn ở FE trước khi gọi API.
4. Thử import lại cùng Idempotency-Key (giả lập retry) → không tạo dữ liệu trùng.

---

## 10. System Manager — Upload readiness + Finalize
**Trạng thái:** [ ]

- API: `GET .../upload/readiness`, `POST .../upload/finalize`.
- UI: nút "Hoàn tất upload" chỉ **bật khi** `canFinalize=true` và `blockers` rỗng; nếu còn blockers, hiển thị danh sách lý do (thiếu media hợp lệ, telemetry chưa đủ điểm, còn upload session hoạt động...) để Manager biết cần bổ sung gì trước khi thử lại.
- Sau finalize, Mission chuyển `ReadyForProcessing` — ghi rõ trên UI đây **chưa phải Completed** (còn chờ xử lý AI/orthophoto ở bước khác, ngoài phạm vi tài liệu này).

**Cách test:**
1. Gọi readiness khi còn thiếu telemetry → `canFinalize=false`, blockers nêu đúng lý do thiếu.
2. Bổ sung đủ (ảnh + ≥2 điểm telemetry) → readiness `canFinalize=true`.
3. Finalize → Mission chuyển `ReadyForProcessing`; thử finalize lần 2 → bị chặn (đã finalize rồi), không tạo hiệu ứng phụ.

---

## 11. Kiểm thử tổng thể end-to-end
**Trạng thái:** [ ]

Chạy lại toàn bộ theo đúng thứ tự trên **một SurveyOrder thật** đã đặt cọc/thanh toán xong, từ bước 0 đến 10, không bỏ bước nào:

1. Tạo Drone (bước 1) → Prepare Mission cho Order (bước 3).
2. Preflight đạt (bước 4) → Start (bước 5) → Complete-flight (bước 5).
3. (Tùy chọn) Nhập GPS cây (bước 7).
4. Upload ảnh (bước 8) + Import telemetry (bước 9).
5. Readiness đạt → Finalize (bước 10).
6. Thử lại 1 nhánh lỗi: Prepare Mission khác → Start → Fail-flight (RESCHEDULE_REQUIRED) → Reschedule → Preflight lại → tiếp tục bình thường (bước 6).
7. `npm run build`, `npm test`, `npm run typecheck` đều đạt trước khi coi là xong.

**Ghi chú:** Cập nhật trạng thái `[ ]/[~]/[x]` ở từng mục khi làm đến đó, để theo dõi tiến độ qua các lần làm việc tiếp theo.
