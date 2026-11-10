# Xác nhận số trụ, giá và MinIO — 10/11/2026

Đối chiếu FE `98af3d1` và BE `bb45bc0`. FE mới có bản đồ sức khỏe cây (`f998ace`) và cắt ảnh bản đồ (`ed9a11a`). Bản hiện tại không còn tích hợp xác nhận số trụ/giá, nên cập nhật này bổ sung lại trên code vừa merge.

## Giao diện xác nhận

System Manager → Đơn khảo sát được giao → Xem công việc → **Xác nhận số trụ và giá**. Nút hiện khi đơn và phạm vi cùng phiên bản, trạng thái `AWAITING_PRICING`.

Biểu mẫu tải lại ngữ cảnh Farm để lấy bản đồ hiện hành, kiểm tra đúng Farm, tenant, nguồn bản đồ và ranh giới đã duyệt. Manager nhập bằng chứng/ghi chú 1–1.000 ký tự. FE gọi:

```http
POST /api/system-manager/survey-orders/{orderId}/pole-count/confirm
```

Chỉ gửi `expectedFarmBaseMapVersionId`, `expectedOrderVersion`, `evidenceReference`. BE đếm trụ và chốt giá; FE hiển thị số trụ, đơn giá, tổng tiền từ response rồi tải lại bước đề xuất lịch dịch vụ. Không tự thử lại khi có xung đột.

## MinIO local đã thiết lập

- API: `http://localhost:9000`; console: `http://localhost:9001`.
- Bucket riêng tư: `agridrone-media`. Thông tin đăng nhập lấy từ `ObjectStorage:AccessKey`/`SecretKey` trong cấu hình Development của BE, không ghi khóa vào tài liệu.
- Image có sẵn: `minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1`.
- Volume: `agridrone-local_minio_data`. Chỉ MinIO được khởi động; không chạy NodeODM/Metashape/AI.
- Script khởi động lại tại `D:\FPTU\P9\Project\tmp\minio-local-20261110\start-minio.ps1`; script dùng Compose gốc với override image local. Docker Desktop cần chạy trước.

Trong bucket có thư mục `fixtures/baseline-demo/` với `orthophoto.tif`, `map_preview.jpg` và `metadata.json`, lấy từ hai ảnh mẫu và metadata đã có trong `AgriDrone-BE/scratch`. Đây chỉ là object mẫu để kiểm tra lưu trữ; chưa gắn với Farm/Mission/Order và không phải bản đồ đã được phát hành trong DB. Không thực thi các file SQL trong scratch.

## Kiểm tra Khoa.rar

Đã liệt kê archive người dùng cung cấp: 326 file JPEG trong `Dataset`, không có GeoTIFF, metadata hoặc kết quả nhận diện trụ. Chưa giải nén/upload cả bộ ảnh 1,7 GB vì không có thao tác ghép map được cho phép.

Chỉ đưa ảnh gốc vào MinIO không tạo `FarmBaseMapVersion` đã phát hành hoặc danh sách trụ chính thức. Để xác nhận giá trên đơn thật vẫn cần bản đồ được phát hành, ranh giới/phạm vi được duyệt, trụ ACTIVE thuộc bản đồ và đơn giá đang hiệu lực. Không giả số trụ hoặc tự chuyển trạng thái đơn để bỏ qua các điều kiện này.

## Map đã ghép được gửi bổ sung

Archive `11-09-2026-20-55-13_files_list.zip` đúng là kết quả ghép sẵn: `orthophoto.tif` (621.542.278 byte), `map_preview.jpg` (1.612.891 byte) và `metadata.json`. GeoTIFF là BigTIFF WGS84/EPSG:4326, 13.766 × 24.350 pixel; kích thước và tọa độ khớp metadata. Không chạy lại ghép ảnh hoặc AI.

Đã giải nén vào thư mục tạm ngoài Git và nạp nguyên ba file vào `agridrone-media/imports/khoa-ready-map-20261110/`. Đọc ảnh qua link ký MinIO trả HTTP 200, SHA256 khớp ảnh gốc; GeoTIFF đọc range 16 byte trả HTTP 206. Truy cập ảnh không có chữ ký trả HTTP 403, bucket vẫn riêng tư.

Metadata của archive thuộc Mission/Tenant của DB khác; Mission đó không tồn tại trong DB local. Đơn Tam Vu ban đầu `4c1a06d4…5f968` chưa có cọc. Theo yêu cầu tiếp theo của người dùng, đã chuyển sang đơn Tam Vu **đã được xác nhận cọc thật** bên dưới; không sửa đơn chưa cọc.

## Đã gắn map vào đơn đã cọc

- Order: `542260e6-b94e-46eb-8f4a-511d7c0505d7`, mã `SO-01a17d91fc96732abaff93fb21b78d89`.
- Farm: `d3577732-b7bb-421b-b533-6d65c683eb2b` (Tam Vu).
- Cọc: 10.000 VND, `PAID`, xác nhận lúc 10:52:38 ngày 29/10/2026. Đã so sánh nguyên bản ghi thanh toán trước/sau, không thay đổi.
- Mission test nhập map: `42849fa5-b7ef-43a4-a012-e053be64645a`, mã theo quy ước FE `ORD-542260e6b94e46eb8f4a511d7c0505d7-BASE`.
- DB chưa có Drone/Mission trước import. Tạo một Drone placeholder **INACTIVE**, ghi rõ không phải Drone/chuyến bay thực; không đặt giờ bay hoặc giả telemetry/preflight. Mission là `AWAITING_REVIEW` / `REVIEW_REQUIRED`; Order chuyển từ `BASELINE_READY` sang `BASELINE_IN_PROGRESS` cho dữ liệu test nhập sẵn. Đây là setup fixture local được người dùng yêu cầu, không phải kiểm thử đầy đủ chuyến bay.
- Hai MediaAsset JPG/TIFF và MissionMedia trỏ đến `minio://agridrone-media/tenants/{tenantId}/media/{missionId}/...`. Metadata local giữ source IDs riêng, remap target IDs; file nguồn trong `imports/` vẫn nguyên vẹn. Không lưu URL ký hết hạn vào DB.
- Không tạo danh sách trụ giả, không duyệt/phát hành bản đồ hoặc chốt giá hộ người dùng. Archive chưa có danh sách GPS trụ.

Sao lưu, manifest, script kiểm chứng/hoàn tác nằm ngoài Git tại `D:\FPTU\P9\Project\tmp\paid-map-import-20261110`. Script hoàn tác từ chối nếu người dùng đã tạo GPS/bản đồ hoặc đơn đã chuyển bước. Chưa chạy hoàn tác.

## Cách test tiếp trên FE

Đăng nhập System Manager đang phụ trách (Nam), mở:

`http://localhost:5173/manager/farms/d3577732-b7bb-421b-b533-6d65c683eb2b/missions/42849fa5-b7ef-43a4-a012-e053be64645a`

1. Ảnh trực giao có sẵn được đọc bằng API orthophoto-status. Không bấm chạy lại ghép ảnh.
2. Vẽ ranh giới trên phần vườn có ảnh, khóa viền và cắt tiles.
3. Chạy YOLO, kiểm tra cây thật/điểm khuyết, sửa điểm nếu cần; lưu nháp GPS và đưa vào hệ thống chính thức. Với Farm chưa có ranh giới, chọn đồng bộ ranh giới từ viền đã vẽ.
4. Sau khi handoff xử lý xong, vào **Duyệt bản đồ nền**, duyệt điểm, kiểm tra và phát hành bản đồ.
5. Quay lại đơn Tam Vu → **Xác nhận số trụ và giá**. Nhập ghi chú/bằng chứng và xác nhận; BE tự đếm inventory và dùng đơn giá hiện hành. Đơn có giá 15.000 VND/trụ hiệu lực tại thời điểm setup, có thể được Admin đổi sau đó.
6. Kiểm tra số trụ, đơn giá, tổng tiền và chuyển sang bước đề xuất lịch dịch vụ.

### Nút đề xuất lịch dịch vụ sau khi chốt giá

API danh sách Manager chọn lịch đang hoạt động mới nhất của cả hai purpose, còn API tạo lịch kiểm tra riêng theo purpose. FE chuẩn hóa trường hợp đơn `AWAITING_PAID_APPOINTMENT`, có baseline và lịch cũ `CONFIRMED` thành chưa có lịch dịch vụ; lần đề xuất đầu gửi `PAID_SERVICE` với expected appointment ID/version đều null. Đây là lịch baseline cũ vì xác nhận lịch dịch vụ sẽ chuyển đơn sang `AWAITING_PAYMENT`. Lịch `PROPOSED` vẫn chặn gửi trùng; `RESCHEDULE_REQUESTED` vẫn gửi đúng ID/version lịch dịch vụ. Không sửa BE hoặc lịch lịch sử trong DB.

MinIO/RabbitMQ/Redis local đã bật. Service Python riêng ở `http://127.0.0.1:8000` chỉ cho cắt map sẵn và YOLO; middleware chặn các endpoint dựng map/Metashape/ODM bằng HTTP 403. Môi trường Python nằm trong thư mục tạm, không thay package Python hệ thống. Khởi động lại bằng `tmp/paid-map-import-20261110/start-ready-map-service.ps1` từ workspace; script từ chối khi cổng đã có service. BE/FE cần chạy như bình thường, BE dùng `Metashape:Endpoint` trỏ `http://localhost:8000`.

## Kết quả kiểm tra

- Build và TypeScript đạt; 189/189 test đạt.
- 5 tình huống trình duyệt với API giả lập đạt: thành công/chống bấm lặp, 409 khóa thử lại, thiếu bản đồ, thiếu giá và tái sử dụng bản đồ của đơn trước.
- MinIO healthy, health HTTP 200; upload và liệt kê đủ ba object mẫu thành công.
- Kiểm tra import đạt: đúng Order/Farm/Tenant/Mission, đủ hai liên kết ảnh; signed JPG GET HTTP 200 và SHA256 khớp nguồn; TIFF range GET HTTP 206; toàn bộ bản ghi cọc không đổi.
- Service ready-map health đạt; best.pt tải được; endpoint dựng map bị khóa HTTP 403. Kiểm tra cắt ảnh và YOLO thật trên một tile độc lập đạt HTTP 200 (1 tile, 1 điểm cây); không ghi kết quả mẫu vào DB của đơn. Không chạy dựng lại bản đồ.
- Chưa thực hiện duyệt/phát hành bản đồ và xác nhận giá trên Order thật: các bước này được để lại cho người dùng test. Kiểm thử mẫu AI không tự trở thành inventory chính thức.
