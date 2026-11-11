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
- `previewUrl` trên API đọc bản đồ vẫn là URL localhost:9000 không ký. Với Manager, FE có thể đọc orthophoto-status qua .NET để lấy link ký của ảnh có sẵn. Owner vẫn cần BE trả link ảnh hợp lệ cho bucket private; FE không công khai bucket để né lỗi.
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
