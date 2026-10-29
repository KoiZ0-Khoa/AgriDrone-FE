# FE cập nhật commit của Long — 22/10/2026

> Phần Order Admin, quản lý giấy tờ và checklist v6 theo commit Long `9277c45` được cập nhật tiếp tại [tài liệu tích hợp giấy tờ](./long-api-authorizations-2026-10-22.md). Kết quả 96 test dưới đây là mốc trước phần cập nhật tiếp đó.

BE đối chiếu: `0cd18cd` của Truong Hoang Long, ngày 21/10/2026. Mốc FE trước đó là `2612640`, tích hợp BE `8f93bf2`.

Phạm vi: chỉ cập nhật FE theo thay đổi trong commit của Long. Không sửa BE/Mobile, không triển khai luồng Mission, Drone, upload hoặc AI của Thanh. Không chạy migration hoặc ghi dữ liệu vào database thật.

## Các phần đã cập nhật

| Phần | Hành vi FE |
|---|---|
| Đơn Baseline ở `BASELINE_READY` | Hiển thị bước chuẩn bị bay khảo sát, ranh giới được xác lập từ ảnh trực giao sau chuyến bay. Không yêu cầu có phiên GNSS trước đó, không báo thiếu GPS là lỗi. |
| Tiến độ Baseline | Phân biệt chờ cọc, chuẩn bị bay, đang khảo sát/xử lý ảnh và chờ duyệt ranh giới. Hiển thị theo snapshot Order nhất quán, không tự chuyển trạng thái hoặc tự kết luận đủ điều kiện cất cánh. |
| Luồng GNSS/route cũ | Bỏ các biểu mẫu mở/sync/finalize/abort phiên và duyệt route khỏi giao diện. Các hàm transport legacy còn được giữ tương thích, nhưng không được gọi bởi luồng chính. Bỏ lời gọi tìm drone từng dùng cho phiên GPS. |
| Dữ liệu GNSS cũ | Chỉ tải lịch sử khi Order có `boundaryCaptureSessionId`. Kiểm tra session ID, Order ID, Farm ID trước khi hiển thị. Không yêu cầu version lịch sử bằng Order version hiện tại vì Order có thể đã đi tiếp. |
| Đơn ở `AWAITING_BOUNDARY_CAPTURE` cũ | Thông báo quy trình cũ và yêu cầu quản trị kiểm tra cách tiếp tục; không đoán trạng thái mới hoặc tạo thêm phiên. |
| Ranh giới orthophoto | Chỉ nhận trạng thái BE hỗ trợ: `AWAITING_BASELINE_REVIEW` hoặc `PENDING_BOUNDARY_VERIFICATION`. Luồng Baseline hiển thị nút khi đang chờ duyệt. Bốn tọa độ WGS84 riêng biệt được gửi theo thứ tự `1–4` cùng expectedOrderVersion thực. |
| Giới hạn diện tích | Biểu mẫu thông báo khoảng 0,01–5.000 ha. BE là nơi kiểm tra hình học và diện tích; FE không tự tính diện tích để ghi đè kết quả BE. |
| Phản hồi thanh toán | Nhận `appointmentId`; ưu tiên trường mới, fallback `paidServiceAppointmentId` để đọc phản hồi cũ. Giữ nguyên số tiền, trạng thái và version do BE trả về. |
| Số dư bằng 0 | Khi BE trả `amount = 0`, `paymentStatus = CONFIRMED`, lớp API FE trả `redirectUrl = null` thay cho `about:blank`. Không mở trang thanh toán, không tạo payment thứ hai và không coi paymentVersion 0/Guid.Empty của settlement là lỗi. |
| Lọc trạng thái và purpose | Gửi `AWAITING_BASELINE_DEPOSIT` đúng wire token. Giữ lỗi 400 khi purpose sai; không tự đổi sang FinalBalance hoặc tự gửi lại. |

## Những phần chưa phải màn hình hoàn chỉnh

- **Owner xác nhận lịch/thanh toán:** mới cập nhật lớp API. Chưa có read API cho Owner chọn đơn, lịch và payment/version thực nên chưa dựng màn từ dữ liệu nhập tay hoặc token Manager.
- **Ảnh trực giao:** vẫn là biểu mẫu nhập bốn tọa độ WGS84 đối chiếu từ ảnh đã xử lý; chưa phải viewer chuyển tọa độ pixel thành địa lý.
- **Farm centerPoint:** API Farm operational-context hiện vẫn thiếu centerPoint. Sửa thông tin chung giữ nguyên điều kiện khóa để không làm mất tọa độ.
- **Mission/Drone/AI:** không tích hợp hoặc sửa trong lượt này. FE chỉ thể hiện trạng thái Order được BE trả về; không có nút cất cánh hay tự tạo sự kiện hoàn tất ảnh.

## Kiểm tra trên web

1. System Manager → Đơn khảo sát được giao → lọc **Chờ thanh toán cọc bản đồ nền**. Kiểm tra đơn hiển thị đúng, không có biểu mẫu GPS/route cũ.
2. Mở đơn `BASELINE_READY` chưa có ranh giới/phiên GPS: phải thấy thông tin chuẩn bị bay, không thấy cảnh báo thiếu phiên thu thập.
3. Mở đơn `BASELINE_IN_PROGRESS`: hiển thị chờ xử lý ảnh, chưa có nút đánh dấu ranh giới.
4. Mở đơn `AWAITING_BASELINE_REVIEW`: có nút **Đánh dấu 4 góc trên ảnh trực giao**. Nhập đúng tọa độ và bằng chứng; phiên bản cũ hoặc hình học không hợp lệ phải giữ lỗi BE, không tự ghi lại bằng version mới.
5. Với Order có GNSS cũ: chỉ xem lịch sử, không có nút bắt đầu/đồng bộ/hủy/duyệt route. Nếu dữ liệu không khớp Farm/Order thì không hiển thị điểm.

## Phạm vi xác minh

- `npm.cmd run typecheck`: đạt.
- `npm.cmd run build`: đạt, bao gồm TypeScript và production bundle.
- Toàn bộ test FE: **96/96 đạt**, không bỏ qua.
- `git diff --check`: đạt.

Test tự động dùng mock fetch và SSR với snapshot BE, không phải E2E với database, ảnh hoặc thanh toán thật. Các bài kiểm tra tập trung vào trạng thái Baseline, lịch sử chỉ đọc, thời điểm cho phép đánh dấu ranh giới, appointmentId, settlement 0 và lỗi purpose. Các test transport legacy chỉ xác nhận tương thích hợp đồng cũ; không có nút gọi API ghi legacy trong giao diện hiện tại.
