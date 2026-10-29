# Duyệt và phát hành bản đồ nền — cập nhật Long 27–28/10/2026

Phạm vi: FE web theo BE `f424355` và `3277597`, HEAD kiểm tra `6194b81`. Không sửa BE, Mobile, phần telemetry/plant GPS của Thanh hoặc homepage. Giữ nguyên thay đổi thanh toán đang có trong working tree.

## Đường vào

System Manager → Nông trại phụ trách → Xem chi tiết → **Duyệt bản đồ nền → Mở bản đồ nháp**. Chi tiết đơn cần baseline cũng có link **Duyệt bản đồ nền**.

- `/manager/farms/:farmId/base-map-drafts`: mở bằng mã bản đồ nháp hợp lệ.
- `/manager/farms/:farmId/base-map-drafts/:draftId`: xem kết quả, duyệt, kiểm tra và phát hành.
- Chỉ Manager được vào trang; phải có Farm trong GET danh sách phân công trước khi tải bản nháp. BE tiếp tục kiểm tra phân công ở mỗi endpoint.

## 5 API đã nối

Tiền tố `/api/system-manager/farms/{farmId}/base-map-drafts/{draftId}`:

| Method | Đường dẫn tiếp | Giao diện |
|---|---|---|
| GET | (không thêm) | Thống kê, TreeId, candidateId, khu vực, tọa độ gốc/hiệu chỉnh, hàng/cột, độ tin cậy, quyết định và ghi chú |
| POST | `/candidates/{candidateId}/review` | Ghép cây cũ, sửa vị trí, tạo cây mới, thay thế cây hoặc loại bỏ điểm |
| POST | `/candidates/review-batch` | Chọn nhiều điểm và tạo mới/ghép cây theo mã riêng từng điểm/loại bỏ; tối đa 500 điểm mỗi lượt trên UI |
| POST | `/validate` | Đọc số trụ có thể công bố và danh sách lỗi/cảnh báo từ BE; mở lại điểm có lỗi để xử lý |
| POST | `/publish` | Modal xác nhận số trụ và tác động, phát hành rồi làm mới Farm/đơn liên quan |

Sửa vị trí cần đủ tọa độ mới và mã cây chính thức. Ghép/thay thế cần mã cây chính thức; không dùng TreeId thay plantId. Không tự tạo ID cây ở FE. Duyệt hàng loạt giữ tọa độ/hàng/cột đã hiệu chỉnh và mã cây riêng cho từng điểm.

Chỉ cho phát hành bản Draft có batch đang PendingReview/ReviewInProgress, không còn Pending, số trụ có thể công bố > 0, không có lỗi Error và kết quả validate đúng snapshot hiện tại. Sửa điểm, mở form duyệt, tải lại hoặc lỗi publish sẽ xóa kết quả validate. Không retry mutation và không tự tăng version. Sau lỗi ghi, tải lại trước khi thao tác tiếp. Published/Superseded chỉ đọc.

## Giới hạn BE hiện tại

1. Chưa có GET danh sách bản nháp, cũng chưa trả draftId trong operational-context/Farm hoặc danh sách đơn. Vì vậy trang mở bằng **draftId thực được BE cung cấp** sau khi nhận kết quả mapping. Không dùng ID bản đồ Published hoặc ID Farm thay draftId, không gọi GET collection giả định. Cần Long bổ sung danh sách hoặc draftId vào response hiện có để tự chọn hoàn toàn trên web.
2. Chưa có read API danh sách cây chính thức cho lựa chọn plantId trong luồng này. Form dùng ID đã đề xuất/đã sửa hoặc mã cây chính thức do BE cung cấp. Không mô phỏng danh sách cây.
3. GET draft và review/publish không có concurrency token/expectedVersion. FE chỉ phát hiện thay đổi đã đọc lại qua fingerprint và chặn phát hành nếu validate cũ; không thể bảo đảm ngăn ghi đè đồng thời giữa nhiều Manager. Publish vẫn chạy validator ở BE. Nếu cần chống cập nhật đồng thời, BE phải bổ sung token cho draft/batch/candidate và validate/publish.
4. GET draft trả evidenceMediaAssetIds nhưng không có liên kết ảnh trong hợp đồng này. Giao diện hiện kiểm tra dạng bảng tọa độ; chưa phải trình duyệt ảnh trực giao hoặc bản đồ ảnh.
5. Trước khi test thật cần áp dụng 3 migration Step6, có boundary/đơn baseline phù hợp và dữ liệu mapping đã đến BE. Không chạy migration hoặc gửi dữ liệu giả trong lần tích hợp FE này.

## Test thủ công

1. Manager mở Farm được giao, mở bản nháp bằng draftId thật. Farm không được phân công phải bị chặn.
2. Kiểm tra TreeId, số điểm chưa duyệt, tọa độ và khu vực; lọc theo khu vực/quyết định, tìm TreeId.
3. Duyệt từng điểm với 5 quyết định. Thử thiếu mã cây, thiếu một tọa độ, hàng/cột không hợp lệ: form phải chặn. Tạo mới không được tái sử dụng plantId cũ.
4. Chọn nhiều điểm, duyệt hàng loạt. Ghép cây phải dùng mã riêng của mỗi điểm; điểm thiếu mã cần xử lý riêng. Đổi bộ lọc sẽ bỏ chọn.
5. Bấm Kiểm tra khi còn Pending hoặc điểm trùng/ngoài boundary: xem lỗi BE, nút phát hành khóa. Xử lý lỗi và validate lại.
6. Validate hợp lệ, mở modal phát hành, xác nhận. Kiểm tra thông báo, số trụ, bản đồ trở thành chỉ đọc, Farm/đơn được cập nhật.
7. Tải lại hoặc sửa điểm sau validate: kết quả cũ không được dùng để publish. Lỗi 401/403/404/409 phải hiện thông tin từ BE, không tự gửi lại.

Kiểm thử tự động dùng fetch mock và SSR fixture, không thay thế E2E với PostgreSQL/RabbitMQ/MinIO hoặc phát hành bản đồ thật.

## Kết quả xác minh

- `npm run build` (gồm TypeScript): đạt.
- 8 test trong `base-map.test.mjs`, `base-map-ui.test.mjs`, `survey-ui.test.mjs`: đạt. Kiểm tra 5 route, payload quyết định/target plant theo từng điểm, chặn dữ liệu sai, conflict không tự retry, validate cũ không được publish, quyền/assignment và trạng thái Published chỉ đọc.
- `git diff --check`: đạt. BE không có thay đổi trong working tree.
- Chưa thao tác duyệt/phát hành trên database thật; chưa kiểm tra ảnh trực giao trên trình duyệt hoặc hành vi nhiều Manager cập nhật đồng thời.
