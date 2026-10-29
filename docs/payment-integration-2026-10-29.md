# Luồng Owner xác nhận lịch và thanh toán — 29/10/2026

BE đối chiếu: `8737cc4`, `a252f79`, `d23c175`. Phạm vi thay đổi: FE web, giữ nguyên BE, Mobile, homepage và các phần bản đồ nền đã tích hợp.

## Luồng trên web

1. Owner mở **Thanh toán khảo sát** ở menu, hoặc `/survey-payments`.
2. Xem danh sách đơn của tenant hiện tại, phân trang 20 đơn, lọc trạng thái. Chọn **Xem đơn & thanh toán**.
3. Xem lịch Manager đề xuất, bấm **Xác nhận lịch** hoặc **Yêu cầu đổi lịch** và nhập lý do. Đổi lịch không tự chọn một giờ mới: Manager đề xuất lại rồi Owner xác nhận.
4. Sau khi xác nhận, FE đọc lại đơn và version từ BE. Khi trạng thái là `AWAITING_BASELINE_DEPOSIT` hoặc `AWAITING_PAYMENT`, bấm **Thanh toán** và xác nhận khoản tiền. FE không gửi amount/currency cho API ghi.
5. Mở trang checkout BE cung cấp. FE giữ trang đơn ở tab gốc để kiểm tra trạng thái và cập nhật theo IPN đã xử lý ở BE.
6. Giao dịch đang PENDING/PROCESSING được kiểm tra mỗi 10 giây; chỉ hiển thị đã thanh toán khi BE trả PAID/CONFIRMED. Lịch sử được cập nhật và chi tiết đơn được đọc lại để phản ánh tiến độ mới.
7. Số dư bằng 0 vẫn gửi yêu cầu FINAL_BALANCE để BE hoàn tất settlement. Khi BE trả PAID, không mở about:blank và không tạo payment thứ hai.

## API đã nối

| Method | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/api/tenant-owner/survey-orders?pageNumber=1&pageSize=20&status=AwaitingPayment` | Danh sách có phân trang; tenant do BE lấy từ phiên, FE không truyền tenantId |
| GET | `/api/tenant-owner/survey-orders/{orderId}` | Thông tin, tiền và lịch hiện tại |
| POST | `/{orderId}/appointments/{appointmentId}/confirm` dưới tiền tố trên | Xác nhận lịch bằng hai version đang xem |
| POST | `/{orderId}/appointments/{appointmentId}/request-reschedule` | Xin đổi lịch, gửi reason và hai version |
| POST | `/{orderId}/payments` | purpose BASELINE_DEPOSIT/FINAL_BALANCE và expectedOrderVersion |
| GET | `/{orderId}/payments` | Lịch sử và trạng thái giao dịch |

DTO thực dùng `totalAmount`, không phải finalPrice; lịch dùng `startAt`, `endAt`, `status`. Read DTO không có tenantId, dịch vụ hoặc trạng thái cọc riêng; FE không tự dựng các trường này. Query status gửi tên enum PascalCase phù hợp MVC; JSON trả về dùng SCREAMING_SNAKE_CASE.

## Bảo vệ trạng thái và phiên thanh toán

- Chỉ Owner được vào trang; query key chứa tenant hiện tại. Đọc chi tiết thành công trước khi tải lịch sử hoặc mở thao tác.
- Không retry mutation tự động. Modal giữ snapshot người dùng đã xem; đổi lịch, giá, version hoặc appointment trong lúc mở modal sẽ khóa xác nhận.
- Không dùng paymentVersion thay orderVersion và không tự tăng version sau POST. Luôn GET lại.
- Chặn thanh toán trùng khi lịch sử có giao dịch cùng purpose đang PENDING/PROCESSING/PAID/ADJUSTMENT_REQUIRED. Khi mất kết nối sau POST, kiểm tra lại trước khi thử tiếp.
- Giữ phiên checkout còn hiệu lực trong sessionStorage, phân biệt theo tenant + email + orderId, để có thể mở lại sau khi tải lại tab. Chỉ lưu các trường cần thiết; không lưu bearer hoặc clientToken của cổng thanh toán. Đăng xuất xóa các phiên đã lưu.
- Phiên lưu được đối chiếu với GET lịch sử và appointment hiện tại (payment ID, số tiền, tiền tệ, trạng thái và lịch). Không dùng dữ liệu lưu hoặc query string để xác nhận đã thanh toán. URL phải là HTTP(S), không có thông tin đăng nhập và còn hạn.
- Kết thúc/thất bại xóa phiên lưu. Cổng thanh toán và IPN vẫn do BE xử lý.

## Cấu hình SePay quay về FE

FE đã có route `/survey-payments/return`, hiển thị danh sách để chọn đơn kiểm tra kết quả. Route này không tự đánh dấu giao dịch thành công dựa vào URL.

Kiểm tra local ngày 29/10: `SePay:Environment=Production`; SuccessUrl/ErrorUrl/CancelUrl vẫn là `https://localhost:7080/swagger`. BE cần cấu hình cả ba URL quay về `http://localhost:5173/survey-payments/return` khi test web local, hoặc địa chỉ FE triển khai tương ứng. Thay cấu hình cổng thanh toán cần khởi động lại BE; IPN vẫn trỏ endpoint BE đã cấu hình, không trỏ về FE. Lượt này không sửa config BE và không tạo giao dịch thật.

## Giới hạn BE cần lưu ý khi test

- GET lịch sử chưa trả checkout URL/hạn phiên. FE chỉ mở lại được phiên còn lưu trong tab/phiên trình duyệt hiện tại. Nếu mất phiên hoặc checkout đã hết hạn mà BE vẫn giữ PENDING/PROCESSING, cần BE đối soát/kết thúc giao dịch hoặc bổ sung API resume/cancel; FE không tự tạo thêm một payment để vượt khóa.
- BE hiện chặn đổi lịch PAID_SERVICE nếu đơn có bất kỳ giao dịch PENDING/PROCESSING/PAID/ADJUSTMENT_REQUIRED, kể cả cọc đã PAID. FE tuân thủ điều kiện này và hướng dẫn liên hệ hỗ trợ; không tự thay đổi nghiệp vụ ở BE.
- Đơn Farm đã lưu trữ không nằm trong GET danh sách/chi tiết mới, theo truy vấn BE hiện tại.

## Test thủ công

1. Owner đúng tenant: mở danh sách và chuyển trang/lọc; không thấy đơn tenant khác. Owner khác tenant mở link đơn nhận 404/403 từ BE. Member/Admin/Manager không có quyền vào màn Owner.
2. Đơn có lịch PROPOSED: kiểm tra giờ hiển thị theo local, xác nhận và kiểm tra trạng thái/version đọc lại. Thử xin đổi lịch với lý do, chờ Manager đề xuất lại.
3. Chốt lịch baseline → thanh toán cọc. Sau khi BE xác nhận PAID, đơn phải chuyển BASELINE_READY; không tự xác nhận bằng nút FE.
4. Đơn dịch vụ có giá và lịch đã xác nhận → thanh toán remainingAmount. Kiểm tra cọc đã trả không bị thu lại; số dư 0 không mở trang checkout.
5. Tải lại tab khi checkout đang xử lý: chỉ mở lại phiên lưu nếu khớp lịch sử BE. Không tạo payment thứ hai.
6. Thử 409, 401/403, mất kết nối và phiên hết hạn. Không tự gửi lại POST hoặc giả lập kết quả thành công.
7. Quay về `/survey-payments/return?status=success`: vẫn chỉ đọc BE, không tự chuyển PAID.

Kiểm thử tự động dùng mock transport và SSR fixture, có kịch bản GET đơn → xác nhận → GET version mới → POST payment → chờ GET lịch sử PAID. Chưa phải E2E với tài khoản và SePay thực tế.

## Kết quả xác minh

- `npm run build`: đạt, gồm TypeScript và production bundle.
- `npm test`: 126/126 test đạt. Kiểm tra cả Owner read/paging, version khi xác nhận/đổi lịch, thanh toán cọc/còn lại/số dư 0, không tạo trùng, phục hồi checkout có đối chiếu BE, phân quyền và hồi quy các màn cũ.
- `git diff --check`: đạt; BE không bị sửa.
- Không tạo payment thật, không chuyển tiền, không thử IPN Production. Muốn xác nhận hoạt động thực tế cần chạy checklist trên môi trường thanh toán phù hợp sau khi BE đổi URL quay về web.

## Khắc phục lỗi khi chuyển sang thanh toán — 29/10

- Console người dùng báo 404 từ `/tenants/current/users?...pageSize=100` và `/api/farms/{farmId}/members?...status=ACTIVE`. Hai request thuộc các panel thành viên/phân công cũ ở chi tiết Farm; BE hiện không còn các endpoint này. Đã bỏ mount hai panel và thêm link Owner mở danh sách đơn/thanh toán. Không thay API thanh toán bằng endpoint cũ.
- GET chi tiết Farm dùng AbortSignal và không tự retry; sửa Drawer chi tiết Zone từ `width` sang `size` theo Ant Design 6.
- Khi kiểm tra kết nối, FE 5173 chạy nhưng BE không có tiến trình AgriDrone.Api hoặc listener 5080/7080; request Owner qua proxy trả 502. FE hiện thông báo máy chủ chưa kết nối được. Cần chạy lại BE trước khi test thật.
- Build và 22 test liên quan đạt. Test kiểm tra trang Farm/Owner payment không đăng ký query `farm-members` hoặc `assignable-users`. Công cụ UI không khởi động được trong lượt này; chưa xác minh trực tiếp bằng trình duyệt đang đăng nhập.

## Hai màn tenant còn gọi API cũ

- `/my-farms` trước đây gọi GET `/api/users/me/farm-assignments`; `/team` gọi GET `/tenants/current/users`. Cả hai route đều không có trong BE hiện tại và không có API tenant tương đương để thay trực tiếp. Không thay bằng API System Manager hoặc danh sách người dùng toàn hệ thống.
- Owner/Tenant Admin mở link `/my-farms` cũ được chuyển về `/farms`, nơi có API được BE hỗ trợ. Sidebar của hai role không còn mục phân công trùng lặp.
- Member ở `/my-farms`, `/farms` hoặc `/zones` chưa chọn Farm sẽ thấy thông báo phân công chưa sẵn sàng, không gọi route cũ và không báo giả “không có phân công”.
- Sidebar Thành viên được đánh dấu chưa hỗ trợ. Link `/team` cũ vẫn có màn giải thích, đã bỏ request danh sách và các nút mời/đổi vai trò/kích hoạt dùng endpoint không còn tồn tại.
- Các hàm transport legacy vẫn giữ để tương thích code cũ và đã ghi chú không dùng trong UI hiện hành. Cần BE khôi phục/xác nhận hợp đồng tenant member/assignment trước khi mở lại các màn này.
- Xác minh sau thay đổi: production build đạt, toàn bộ 128/128 test FE đạt; test hồi quy xác nhận các màn và sidebar không đăng ký query endpoint đã bỏ. BE không bị sửa.
