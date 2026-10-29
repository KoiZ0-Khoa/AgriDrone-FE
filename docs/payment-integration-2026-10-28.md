# Thanh toán khảo sát trên web — 28/10/2026

> Mốc cũ. API Owner đọc đơn/lịch hẹn đã được BE bổ sung và FE đã tích hợp ngày 29/10/2026. Xem [luồng thanh toán hiện tại](./payment-integration-2026-10-29.md); các điểm chặn read API bên dưới chỉ mô tả thời điểm 28/10.

Phạm vi: chỉ FE theo xác nhận của người dùng. Không thay BE, không chạy migration, không gửi email hay thanh toán thật.

## Đã tích hợp

- Menu **Thanh toán khảo sát** dành riêng Owner: `/survey-payments`.
- Trang từng đơn: `/survey-payments/:orderId`, gọi GET `/api/tenant-owner/survey-orders/{orderId}/payments` với token Owner.
- Xem cọc/số tiền còn lại, số tiền thực tế, trạng thái, thời điểm, mã giao dịch và sự kiện từ BE. Nếu lịch sử chưa tải được, hiển thị lỗi thay vì kết luận chưa có giao dịch.
- Tự kiểm tra mỗi 10 giây khi có giao dịch PENDING/PROCESSING và có nút kiểm tra thủ công. Trạng thái thành công chỉ lấy từ BE, không lấy từ query string/URL trả về của cổng thanh toán.
- Manager mở **Đơn khảo sát được giao → Xem công việc → Sao chép liên kết thanh toán** để cung cấp liên kết lịch sử cho Owner. Liên kết chỉ chứa ID đơn, không chứa token, số tiền hay version. BE kiểm tra quyền Owner của đơn khi đọc.
- Chuẩn bị `SurveyPaymentPanel` nhận snapshot đơn từ BE: xác nhận số tiền trước khi tạo phiên, khóa gửi trùng, không retry mutation, xử lý conflict, mở HTTP(S) checkout và chặn liên kết hết hạn. Lớp API tạo thanh toán gửi purpose + expectedOrderVersion, không gửi số tiền.
- Sửa trường hợp số dư bằng 0: nhận `PAID` đúng theo BE hiện tại, giữ tương thích `CONFIRMED`, không mở `about:blank`.

## Điểm chặn BE còn nguyên

`TenantOwnerSurveyOrdersController` hiện chỉ có POST xác nhận/đổi lịch, POST tạo payment và GET lịch sử payment. Chưa có:

1. GET danh sách đơn thuộc tenant của Owner.
2. GET chi tiết đơn trả orderVersion, trạng thái, số tiền cọc, giá chính thức/số dư và lịch hẹn hiện tại (ID, purpose, thời gian, trạng thái, version).

GET lịch sử payment không trả orderVersion hoặc lịch hẹn, không thể dùng paymentVersion thay thế. Vì vậy trang Owner hiện truyền `order=null` vào panel: **chỉ lịch sử hoạt động; tạo thanh toán mới và xác nhận/đổi lịch chưa được mở**. Không gọi endpoint giả định, không nhập version thủ công, không dùng token Manager/Admin để đọc thay Owner.

Trang `/survey-payments` chưa thể liệt kê đơn. Người dùng truy cập lịch sử từng đơn qua liên kết Manager chia sẻ. Chưa lưu checkout URL/client token vào localStorage/sessionStorage. Không coi việc chuyển về success URL là bằng chứng đã trả tiền.

## API BE cần có để nối phần còn lại

- Danh sách đơn có phân trang và kiểm tra Owner + tenant từ phiên đăng nhập.
- Chi tiết đơn, gồm tiền tệ, depositAmount, finalPrice, remainingAmount, orderVersion và currentAppointment (appointmentId, purpose, proposedStartAt, proposedEndAt, appointmentStatus, appointmentVersion).
- Khả năng lấy lại phiên checkout còn hiệu lực nếu cần tiếp tục sau khi tải lại trang (GET lịch sử hiện không có redirectUrl/expiresAt).

Đường dẫn read API cần do BE xác nhận. Sau khi có, nối snapshot vào panel và triển khai xác nhận/đổi lịch trước khi mở thanh toán. Trường hợp checkout đã có sẵn trong lần thao tác sẽ hiển thị liên kết theo phản hồi BE; không tự dựng QR hoặc nội dung chuyển khoản.

Cấu hình local hiện tại: cả `SePay:SuccessUrl`, `ErrorUrl`, `CancelUrl` đều có đường dẫn `/swagger`. Khi mở thanh toán thực tế, BE cần cấu hình URL quay về web phù hợp; FE vẫn phải đọc trạng thái từ BE sau khi quay về. Lượt này chỉ đọc các đường dẫn và không sửa cấu hình BE.

## Test thủ công

1. Đăng nhập Manager, vào chi tiết đơn, sao chép liên kết.
2. Mở liên kết ở phiên Owner đúng đơn vị: xem số tiền/trạng thái từ lịch sử BE. Đơn chưa có giao dịch phải hiện “Chưa có giao dịch”.
3. Owner khác đơn vị nhận lỗi quyền từ BE; Member/Tenant Admin không được mở giao diện thanh toán.
4. Giao dịch PENDING/PROCESSING tự cập nhật; PAID hiển thị “Đã thanh toán”. URL có `status=success` không tự thay đổi trạng thái.
5. Khi BE lỗi/mất kết nối, hiển thị lỗi và cho kiểm tra lại; không hiển thị trạng thái thành công giả.
6. Tạo thanh toán mới và xác nhận lịch vẫn bị chặn cho đến khi có read API. Chưa kiểm thử SePay thật.

## Kết quả kiểm tra

- Production build và TypeScript: đạt.
- 23 test trong `survey-payments`, `survey-payments-ui`, `survey-operations`, `survey-ui`: đạt. Bao gồm GET lịch sử đúng token/cancellation, conflict không tự retry, số dư 0 trạng thái PAID, liên kết checkout sai/hết hạn, quyền Owner và URL trả về không tự đánh dấu thành công.
- UI được kiểm tra bằng SSR với fixture đúng cấu trúc phản hồi BE, không phải thao tác trình duyệt E2E. Chưa gọi tạo thanh toán thật, chưa chuyển tiền hoặc kiểm thử IPN SePay.
