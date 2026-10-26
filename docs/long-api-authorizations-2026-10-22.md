# FE tích hợp Order và giấy tờ khảo sát của Long — 22/10/2026

Đối chiếu commit `9277c45` của Truong Hoang Long, đã merge trong BE `4dd94b1`. Đây là phần tiếp theo của [cập nhật Baseline cùng ngày](./long-api-update-2026-10-22.md).

Phạm vi: FE web, chỉ thay đổi của Long. Không sửa BE/Mobile, không tích hợp Mission, media, lịch sử payment hoặc SePay của Thanh. Không chạy migration, gửi email hay ghi dữ liệu thật trong lúc triển khai.

## Giao diện

- System Admin → **Đơn khảo sát** (`/system/survey-orders`): danh sách toàn hệ thống, trạng thái, phân trang, lọc cùng Farm hoặc Tenant từ từng dòng. Bộ lọc lưu trong URL.
- **Quản lý giấy tờ** (`/system/survey-orders/:orderId/authorizations`): danh sách consent và flight permission, trạng thái, thời điểm xác minh/hết hạn.
- **Xem và quản lý**: tải chi tiết mới nhất từ BE rồi mở thông tin, xem bằng chứng, xác minh/cập nhật hoặc thu hồi. Giấy tờ đã thu hồi không có thao tác xác minh lại, đúng quy tắc BE hiện tại.
- Có lối vào từ menu, dashboard Admin và kết quả phê duyệt yêu cầu thành công.
- Checklist xét duyệt lên `survey-request-review.v6`, sáu điều kiện. Bỏ `eligible-manager-available` khỏi payload; vẫn chọn Manager đủ điều kiện bằng danh sách hồ sơ BE.

## API

| Method | Đường dẫn |
|---|---|
| GET | `/api/system-admin/survey-orders` |
| GET | `/api/system-admin/survey-orders/{orderId}/capture-authorizations` |
| GET | `/api/system-admin/survey-orders/{orderId}/capture-authorizations/{type}` |
| PUT | `/api/system-admin/survey-orders/{orderId}/capture-authorizations/{type}/verify` |
| PUT | `/api/system-admin/survey-orders/{orderId}/capture-authorizations/{type}/revoke` |
| GET | `/api/system-admin/survey-orders/{orderId}/capture-authorizations/{type}/evidence-url` |

FE dùng `{type}` là `consent` hoặc `flight-permission`. Verify dùng multipart mới, revoke dùng JSON. Không fallback sang route JSON legacy nếu upload thất bại.

## Dữ liệu và lỗi

- Verify gửi một PUT gồm `File` hoặc `MockReference`, `IssuedAt`, `ExpiresAt` nếu có và `ExpectedVersion`. File JPG/JPEG/PNG/PDF có dữ liệu, tối đa 10 MB. Người dùng chủ động chọn chế độ giả lập để demo.
- HTTP client nhận FormData, giữ boundary do trình duyệt tạo; các API JSON vẫn giữ hành vi cũ. Lỗi BE trả chuỗi JSON được hiển thị nguyên nội dung, gồm trường hợp MinIO tắt.
- Giờ người dùng nhập chuyển thành UTC. Kiểm tra hạn hiệu lực sau ngày cấp và thời điểm hiện tại; BE vẫn quyết định tính hợp lệ cuối cùng.
- Version lấy từ chi tiết giấy tờ khi mở form, không dùng Order version. Chấp nhận version 0 nếu thực sự do BE trả về, không đoán 1 hoặc tự tăng version.
- Form giữ snapshot đang xem; 401/403/404/409 khóa gửi lại và yêu cầu đóng/tải lại. Mutation không tự retry. Sau thành công tải lại danh sách giấy tờ và đánh dấu danh sách Order cần cập nhật; không dùng response mutation để ghi đè mất các trường chi tiết.
- Liên kết bằng chứng chỉ nhận HTTP/HTTPS còn hạn, khớp Order/type/reference. Bằng chứng mock hoặc tham chiếu không có file không hiện liên kết tải giả.

## Test trên web

1. Đăng nhập System Admin → Yêu cầu khảo sát → mở yêu cầu mới nhất. Phê duyệt phải có đúng sáu ô kiểm tra và vẫn yêu cầu chọn Manager khi nghiệp vụ cần.
2. Mở Đơn khảo sát; đổi trạng thái, phân trang, lọc cùng Farm/Tenant rồi bỏ bộ lọc. Kiểm tra đơn của nhiều Tenant không bị giới hạn vào một tenant đăng nhập.
3. Quản lý giấy tờ → Xem và quản lý → chọn giấy tờ đang chờ xác minh.
4. Chọn tải file, nhập ngày cấp/hạn rồi xác nhận. Với MinIO đang hoạt động, mở lại giấy tờ → Lấy liên kết xem bằng chứng → Mở bằng chứng. File phải đúng giấy tờ đã tải.
5. Trên dữ liệu demo riêng, chọn Giả lập để demo và nhập mã. Sau xác minh, xem bằng chứng phải thông báo giả lập, không có file đính kèm.
6. Thử file sai đuôi, rỗng, trên 10 MB hoặc hạn không hợp lệ: phải báo lỗi và không gửi PUT.
7. Mở cùng giấy tờ ở hai phiên. Cập nhật phiên thứ nhất rồi gửi phiên thứ hai: nếu BE trả 409, form thứ hai khóa xác nhận, giữ mã lỗi/mã tra cứu và yêu cầu tải lại.
8. Thu hồi giấy tờ đã xác minh bằng lý do cụ thể: sau thành công hiện Đã thu hồi và không có nút xác minh lại.

## Kết quả xác minh

- `npm.cmd run typecheck`: đạt.
- `npm.cmd run build`: đạt, production bundle tạo thành công.
- `npm.cmd test`: **105/105 đạt**, không bỏ qua test. Bao gồm kiểm tra multipart, version thực, lỗi quyền/409, liên kết bằng chứng và render giao diện Order/giấy tờ.
- `git diff --check`: đạt.

Test tự động dùng mock HTTP và SSR; chưa thực hiện upload MinIO, xác minh/thu hồi giấy tờ hoặc đăng nhập với database thật. Những lỗi BE đã báo trong lượt kiểm tra vẫn cần xử lý riêng trước khi kết luận toàn bộ flow đạt.
