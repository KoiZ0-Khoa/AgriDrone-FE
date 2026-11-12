# Tích hợp phần Khoa — 11/11/2026

Phạm vi theo tài liệu người dùng: bản đồ nền/biến động trụ (8 thao tác) và Plant Health giai đoạn 1 (detect + publish Mission). Phần review/phê duyệt/phát hành bệnh được tài liệu giao cho Phú; không bổ sung các màn đó ở đợt này. Homepage và Mobile không nằm trong phạm vi thay đổi.

Mốc đối chiếu ban đầu: FE `f201e19`, BE `b56e085`. Contract lấy từ controller và DTO thực tế của BE, không chép nguyên payload mẫu trong tài liệu.

## Tiến độ

- [x] Đợt 1: danh sách/chi tiết bản đồ, trụ và lifecycle; thêm đường vào từ chi tiết Farm của Manager và tenant.
- [x] Đợt 2: so sánh hai phiên bản bằng bảng và bản đồ Leaflet; thống kê số trụ, chênh lệch và mật độ.
- [x] Đợt 3: thêm/loại bỏ/dời trụ trên bản đồ Published hoặc Draft; kiểm tra điểm nằm trong ranh giới, lý do và hàng/cột; làm mới các dữ liệu liên quan sau thao tác. Superseded chỉ xem.
- [x] Đợt 4: detect bệnh và publish kết quả sơ bộ từ Mission dịch vụ, chống gửi trùng bằng Idempotency-Key. Chỉ hiện thao tác sau khi hoàn tất upload; không hiện các bước ghép bản đồ/GPS nháp của chuyến bay bản đồ nền trong luồng bệnh.

Các dấu hoàn tất trên chỉ nói về tích hợp FE và kiểm tra phía FE; không đồng nghĩa đã chạy toàn bộ với AI/RabbitMQ/MinIO/BE thật.

## API và đường vào giao diện

| Nhóm | API .NET |
| --- | --- |
| Danh sách bản đồ | `GET /api/farms/{farmId}/base-maps?includeDraft=false` |
| Chi tiết và manualChanges | `GET /api/farms/{farmId}/base-maps/{versionId}` |
| So sánh | `GET /api/farms/{farmId}/base-maps/compare?fromVersionId=...&toVersionId=...` |
| Thống kê | `GET /api/farms/{farmId}/base-maps/analytics` |
| Vòng đời trụ | `GET /api/farms/{farmId}/plants/{plantId}/lifecycle` |
| Thêm/loại bỏ/dời trụ | `POST /api/system-manager/farms/{farmId}/base-map-drafts/{versionId}/candidates/{candidateId}/review` với `CreateNew`/`Reject`/`Relocate` |
| Nhận diện bệnh | `POST /api/missions/{missionId}/farms/{farmId}/disease-detect` |
| Chuyển kết quả bệnh sơ bộ | `POST /api/system-manager/farms/{farmId}/missions/{missionId}/plant-health/publish`, không có body; bắt buộc `Idempotency-Key` |

- Manager: **Nông trại phụ trách → Chi tiết → Bản đồ và trụ cây** (`/manager/farms/{farmId}/base-maps`). Chọn phiên bản để xem bản đồ, mở lịch sử từng trụ hoặc điều chỉnh thực địa.
- Owner: **Nông trại → Chi tiết → Bản đồ và trụ cây** (`/farms/{farmId}/base-maps`). Chỉ xem; không có form chỉnh sửa. Các API vẫn quyết định quyền truy cập và trạng thái khóa thanh toán.
- Manager: **Đơn khảo sát được giao → Mission dịch vụ → hoàn tất upload → Nhận diện bệnh và gửi kết quả sơ bộ**. Kết quả `QUEUED` được hiển thị là chờ kiểm duyệt, không phải đã phát hành bệnh hoặc đã hoàn thành đơn.

## Quy tắc tích hợp

- Manager phải có Farm trong danh sách được phân công. Tenant dùng API Farm để kiểm tra Farm thuộc tenant đang đăng nhập. Cache tách theo role/tenant/tài khoản; không dùng JWT làm query key.
- Các request nghiệp vụ gọi .NET API. Không cài hoặc chạy Metashape. Không thay đổi DB/map/thanh toán để làm màn hình có dữ liệu giả.
- Owner nhận `*.PaymentRequired` HTTP 409 thì hiển thị trạng thái khóa và đường sang đơn thanh toán, không giả lập kết quả hoặc tự mở khóa.
- Các phản hồi phải khớp Farm/version/plant được yêu cầu trước khi hiển thị. Giữ thứ tự GeoJSON `[longitude, latitude]`.
- Chưa có API policy deposit/Combo trong checkout BE tại mốc trên; không dựng endpoint hoặc hardcode cọc 500.000đ/giảm 20% trên FE. Các trạng thái First MAP/COMBO trong tài liệu cũng chưa khớp domain hiện có.

## Khác biệt BE/tài liệu cần lưu ý

- DTO lifecycle thực tế dùng `timeline`, `currentLocation`, `changeType`, `createdAt`; comparison dùng `fromVersionId`/`toVersionId`, `oldPosition`/`newPosition`.
- BE mới đã có `manualChanges` và nhánh chỉnh Published trong handler review. Response review vẫn là `CandidateReviewResponse`, không phải object `status/plantId` của ví dụ tài liệu.
- Endpoint review tìm `candidateId` trong batch; sửa/xóa cây bằng `plantId` bất kỳ như ví dụ tài liệu chưa được handler chấp nhận. FE phải dùng candidate thật; cây thêm mới dùng GUID mới với `CreateNew`.
- Cập nhật 12/11: API danh sách/chi tiết bản đồ trên BE trả `previewUrl` được ký MinIO trong 15 phút sau khi kiểm tra quyền Farm. Chi tiết dùng bounds của ảnh đã lưu, thay vì ước lượng từ trụ. Owner đọc ảnh trực tiếp từ response hiện có; bấm Tải lại để lấy link mới khi cần. Manager vẫn giữ fallback orthophoto-status hiện có. Bucket vẫn private, Owner không được xem draft hoặc sửa trụ. Đã kiểm chứng handler với Owner thật và ảnh Tam Vu local (HTTP 206), không chạy tạo map.
- Response detect bệnh thực tế trả `totalImagesScanned`, `totalDetections`, `diseaseSummary`, `detections`; không có `jobId`/`status` như ví dụ tài liệu. FE không gọi trực tiếp URL CSV/ảnh của Python.
- Chưa có API đọc trạng thái lần detect/handoff để phục hồi bước này sau khi tải lại trang. FE giữ kết quả detect trong phiên màn hình; không tự dựng trạng thái đã gửi khi chưa có phản hồi thành công.

## Cần test tiếp với BE và hạ tầng thật

1. Farm được phân công có bản đồ Published, một bản cũ và candidate thật. Kiểm tra ảnh ký, tọa độ và lịch sử từ dữ liệu thật.
2. Thử CreateNew/Relocate/Reject trên dữ liệu test; đối chiếu `plants`, `manualChanges` và lifecycle sau khi lưu. Handler BE hiện không nhận expectedVersion và có nhiều bước ghi; cần xác nhận tính nhất quán khi có lỗi/concurrent edit ở phía BE.
3. Mission PlantHealth gắn đúng đơn, snapshot bản đồ và ranh giới, ảnh upload đã hoàn tất. AI service phải hỗ trợ disease detection, có provenance/classification/evidence phù hợp. Service test chỉ phục vụ map/YOLO không thay thế được bước này.
4. Kiểm tra outbox/RabbitMQ nhận handoff, sau đó phần kiểm duyệt bệnh của Phú. Không dùng trạng thái `QUEUED` để mở thanh toán hoặc hoàn thành đơn.
5. Owner chưa thanh toán bị khóa, thanh toán đủ và BE xác nhận rồi mới đọc được dữ liệu. Không đánh dấu paid thủ công trong FE.

Luồng MAP/COMBO, policy cọc động và discount của tài liệu payment vẫn chờ contract BE tương ứng; đây là công việc riêng, chưa thể kết luận toàn bộ tài liệu payment đã được hỗ trợ.

## Kiểm chứng

- `npm.cmd test`: **199/199 passed** (gồm 8 test mới về bản đồ, geometry, quyền khóa thanh toán, manual payload và health detect/publish). Test proxy cần quyền kết nối HTTP loopback; đã chạy lại thành công ngoài sandbox.
- `npm.cmd run build`: thành công, bao gồm TypeScript.
- Edge headless với API fixture: danh sách, chi tiết, so sánh, thống kê, lifecycle, mở form điều chỉnh; loại bỏ trụ gửi đúng candidate/payload, chống click đôi và tải lại dữ liệu; bản cũ/Owner không có nút sửa; 409 PaymentRequired không lộ dữ liệu và có link thanh toán.
- Edge headless với API fixture: Mission bệnh không gọi ghép bản đồ hoặc GPS nháp; 0 phát hiện vẫn handoff được; detect/publish chống click đôi; `QUEUED` hiện chờ kiểm duyệt.
- Kiểm tra trực quan ở 1440px và 390px; màn chi tiết không tràn ngang toàn trang, bảng có vùng cuộn riêng.
- Ảnh QA và harness thử nghiệm chỉ nằm trong `node_modules/.cache`, không đưa vào commit.
- **Chưa test end-to-end với BE/DB/AI/payment thật; không sửa BE/DB hoặc chạy tạo map trong đợt này.**

## Bổ sung 12/11/2026 — chỉnh trụ trực tiếp trên ảnh

- Manager trên Draft/Published: **Thêm trụ trên ảnh → bấm vị trí → kéo ghim nếu cần → Tiếp tục xác nhận → nhập hàng/cột, lý do → Lưu điều chỉnh**.
- Bấm trụ có sẵn: **Dời trên ảnh** để kéo ghim/bấm điểm mới, hoặc **Loại bỏ trụ** để mở xác nhận. Vị trí trên ảnh chỉ là lựa chọn tạm; API được gọi khi lưu trong form. Hủy không gửi mutation.
- Form xác nhận thao tác trên ảnh hiển thị trụ được chọn, vị trí trước/sau và các thông tin cần xác nhận. Nút **Điều chỉnh trụ** vẫn mở form nhập tọa độ thủ công.
- Chỉ chọn điểm trong cả bounds của ảnh và polygon Farm, loại trừ vùng lỗ. Ghim bị kéo ra ngoài phải trở về vị trí hợp lệ trước đó. Ảnh chưa tải/lỗi thì khóa thao tác trực quan.
- Ghép về candidate theo plant reference duy nhất; legacy CreateNew chưa có reference chỉ ghép khi grid và vị trí trong 0,5m cùng khớp duy nhất. Không dùng plantId làm candidateId. Không ghép được/khớp nhiều điểm thì khóa lưu và báo rõ.
- Owner/Superseded vẫn chỉ xem; không bổ sung endpoint hoặc sửa BE cho tương tác này.
- Kiểm chứng: 201/201 test FE qua; build thành công; browser fixture kiểm tra add/drag/relocate/reject, hủy không ghi, click đôi, payload/candidate chính xác, thiếu candidate, 409, quyền và bố cục 390px. Screenshot/harness chỉ ở `node_modules/.cache`.
- Đối chiếu candidate bằng dữ liệu local chỉ đọc: 70/70 trụ đang hoạt động tại thời điểm kiểm tra ghép được duy nhất với candidate. Không gọi API ghi hoặc sửa các trụ thật để chạy UI test.

## Bổ sung 12/11/2026 — Drone test và màn registry

- Sửa lỗi trắng `/system/drones` khi BE trả `specifications: {}` hoặc null. Danh sách hiện “Chưa khai báo năng lực”; form sửa dùng danh sách năng lực rỗng. Không tự cấp năng lực hoặc đổi trạng thái cho dữ liệu thiếu.
- `TEST-DRONE-CAPABILITIES`: `tests/drone-capabilities.test.mjs` kiểm tra dữ liệu legacy/thiếu/sai kiểu, giá trị chữ thường đã lưu, loại trùng và năng lực không hỗ trợ. Typecheck và build đã qua.
- `TEST-DRONE-REGISTRY-UI`: Edge headless với response registry local được ghi lại, API UI chỉ giả lập đọc và chặn mọi mutation: trang hiển thị cả drone mới và placeholder `{}`, mở form sửa placeholder và form tạo thành công, không có React exception. Harness/ảnh ở `node_modules/.cache/drone-page-*`, không commit.
- Theo yêu cầu tạo dữ liệu đủ điều kiện test, đã dùng API System Admin local đăng ký **Drone test bay bệnh** (`DR-TEST-HEALTH-20261112`), status AVAILABLE, năng lực PLANT_HEALTH/BASELINE_MAPPING, đăng ký mô phỏng 01/11/2026–30/11/2027. Notes ghi rõ LOCAL TEST FIXTURE. API Manager xác nhận drone xuất hiện trong danh sách khả dụng cho Tam Vu 2 / PlantHealth / 12/11/2026. Không tạo nhiệm vụ hoặc xác nhận chuyến bay trong bước này.
- Drone placeholder nhập map giữ nguyên INACTIVE; map và thanh toán không thay đổi. Không sửa code/điều kiện lọc BE. Dữ liệu và bằng chứng API nằm trong `D:/FPTU/P9/Project/tmp/drone-health-test-20261112/`. Drone test có thể được thanh lý qua luồng quản trị khi không còn dùng.
- Kết quả cuối: typecheck/build thành công; toàn bộ **203/203 test FE qua** khi cho phép test proxy dùng loopback. UI registry, form sửa dữ liệu legacy và form tạo đã kiểm chứng bằng Edge headless. Không ghi token/khóa cấu hình vào evidence; API setup chỉ đăng ký drone test mới, không gọi prepare/start/end mission.

### Phục hồi nhiệm vụ map test và chuẩn bị bay bệnh

- Sau bước registry trên, thao tác prepare của Tam Vu 2 gặp `MissionPlanning.ExistingMissionSetRequiresRecovery`: nhiệm vụ map nhập sẵn thiếu `scheduled_at`/`scheduled_end_at`, trong khi BE yêu cầu nhiệm vụ không còn Draft phải có lịch dự kiến.
- Đã bổ sung riêng lịch dự kiến của fixture từ đúng appointment BASELINE_MAPPING đã được Owner xác nhận. Snapshot trước/sau kiểm chứng order, appointments, map và payments không đổi. Giữ nguyên bộ kiểm tra BE; không sửa dữ liệu thành chuyến bay thực tế.
- Sau phục hồi, API Manager prepare trả HTTP 200 và tạo nhiệm vụ PlantHealth ở trạng thái Scheduled, dùng drone test và map đã phát hành của Tam Vu 2. Không gọi start/end flight. Đã kiểm tra DB còn nguyên cọc 5.000 và khoản còn lại 59.000 PAID do IPN trước đó.
- FE đổi wrapper chứa danh sách nhiệm vụ từ `p` thành `div` để tránh lỗi DOM nesting; PrepareMissionModal dùng props Ant Design `mask.closable` và Alert `title`. Build thành công và 6 test `mission-prepare.test.mjs` qua sau các thay đổi này.
- Evidence phục hồi: `D:/FPTU/P9/Project/tmp/tam-vu2-mission-recovery-20261112/`. Response prepare: `D:/FPTU/P9/Project/tmp/drone-health-test-20261112/prepare-service-response.json`. Đây là test luồng tiếp sau dữ liệu import sẵn, không phải kiểm chứng E2E chuyến bay vật lý.
