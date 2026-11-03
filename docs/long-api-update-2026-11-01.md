# Cập nhật FE theo BE của Long — 01/11/2026

Áp dụng thay đổi từ `173adfb` và `0f553ca`, đối chiếu BE tại `6f172ef`.

- Manager nhận phân công khi `status=ACTIVE` và `availability=AVAILABLE`. Không còn trường, bộ lọc hoặc API cập nhật chứng chỉ bay.
- Phê duyệt/từ chối dùng checklist `survey-request-review.v7`: thông tin liên hệ, nông trại thanh long, khu vực hỗ trợ và vị trí đủ để xét duyệt sơ bộ. Cả bốn mục phải được xác nhận để phê duyệt; khi từ chối có thể ghi nhận mục không đạt. Version đơn và khóa chống gửi trùng vẫn được giữ.
- Bỏ giao diện và các lệnh gọi `capture-authorizations` đã bị BE xóa. Liên kết giấy tờ cũ chuyển về danh sách đơn khảo sát.
- Manager mở **Duyệt bản đồ nền** để tự lấy bản nháp mới nhất bằng `GET /api/system-manager/farms/{farmId}/base-map-drafts`. Khi mở từ đơn khảo sát, gửi thêm `surveyOrderId` để lấy đúng đơn. Không nhập mã nháp thủ công.
- Bản nháp dùng `candidates` trực tiếp cùng thông số lưới ở cấp bản đồ, thay cho `zones[].candidates`. Duyệt riêng, duyệt hàng loạt, kiểm tra và phát hành dùng cấu trúc mới. Chỉ phát hành sau khi kiểm tra hợp lệ và hết điểm chưa duyệt.
- Chưa có bản nháp: hiển thị thông báo chờ kết quả xử lý và nút tải lại. Lỗi quyền/kết nối vẫn hiển thị đúng lỗi.

## Kiểm tra trên web

1. System Admin → System Manager: kiểm tra hồ sơ chỉ còn trạng thái và khả năng nhận việc. Manager Active + Available phải xuất hiện khi phân công Farm và phê duyệt yêu cầu.
2. Yêu cầu khảo sát → bắt đầu xét duyệt → phê duyệt: có đúng bốn mục checklist. Chọn Manager, nhập lý do, xác nhận; kiểm tra lỗi version vẫn yêu cầu tải lại.
3. Đơn khảo sát: không còn nút quản lý giấy tờ. Mở bookmark giấy tờ cũ phải về danh sách đơn, không gọi API đã xóa.
4. Manager → Farm → Duyệt bản đồ nền: tự mở bản nháp mới nhất. Mở từ đơn khảo sát phải lấy đúng bản nháp của đơn đó, kể cả Farm có nhiều đơn.
5. Duyệt một điểm, duyệt hàng loạt, tải lại; kiểm tra số điểm và quyết định được giữ. Nút phát hành chỉ bật sau khi không còn điểm chưa duyệt và kiểm tra từ BE hợp lệ.
6. Farm chưa có bản nháp hiển thị trạng thái chờ; lỗi 403 phải hiển thị lỗi quyền, không báo danh sách trống.

Không sửa BE hoặc tích hợp thêm các API xử lý chuyến bay/AI của Thanh và Chính trong cập nhật này. Chưa kiểm thử với dữ liệu BE đang chạy; kiểm thử tự động dùng phản hồi giả lập theo hợp đồng BE.

## Kết quả kiểm tra

- Build FE thành công, gồm kiểm tra TypeScript.
- 142 kiểm thử đạt: 141 đạt trong lần chạy toàn bộ; kiểm thử proxy nội bộ được chạy riêng thành công ngoài môi trường giới hạn kết nối sau lỗi `fetch failed`.
- Kiểm tra bao gồm cấu trúc bản đồ phẳng, tìm bản nháp theo Farm/đơn, kết quả sai Farm/đơn, trạng thái chưa có bản nháp, lỗi quyền, duyệt hàng loạt, điều kiện phát hành, checklist v7 và Manager không có trường chứng chỉ.
