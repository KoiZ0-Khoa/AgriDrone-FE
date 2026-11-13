# Thanh toán FE theo BE sau merge main — 13/11/2026

Đối chiếu BE `fda57ec`, gồm chính sách thanh toán của `998339e`. Chỉ thay đổi FE;
không sửa BE, migration, dữ liệu đơn hoặc giao dịch thật.

## Chức năng

- System Admin → **Dịch vụ & đơn giá → Chính sách thanh toán**: đọc/cập nhật tiền
  cọc, giảm giá Combo và xem lịch sử từng chính sách.
- Cọc là số nguyên VND từ 0 trở lên. Giảm giá từ 0 đến dưới 100%, tối đa 2 chữ số
  thập phân; chấp nhận dấu phẩy hoặc chấm. Lưu dùng `versionNumber` vừa đọc làm
  `expectedVersion`, kể cả mức mặc định phiên bản 0; không tự tăng hoặc retry 409.
- Owner có thể thanh toán cọc cho đơn khảo sát lại ở các bước xác minh ranh giới,
  chờ giá, chờ lịch dịch vụ hoặc chờ thanh toán. Khoản cọc này không cần lịch hẹn.
  Cọc bản đồ nền ở `AWAITING_BASELINE_DEPOSIT` vẫn cần lịch bản đồ đã xác nhận.
- Các trạng thái lịch sử đang hiệu lực chặn tạo trùng cùng khoản thanh toán.
  Cọc đã trả được đối chiếu theo purpose, số tiền và tiền tệ trước khi hiển thị
  khoản còn lại. Không đổi tên enum API `BASELINE_DEPOSIT`; nhãn UI là **Cọc khảo sát**.
- Nếu đơn còn `AWAITING_PAYMENT` nhưng đã có đúng một giao dịch khoản còn lại
  `PAID` khớp số tiền/tiền tệ, Owner có nút **Đồng bộ trạng thái đơn**. Thao tác
  gọi API tạo thanh toán hiện hữu với purpose/version; BE phục hồi trạng thái từ
  giao dịch đã trả. FE không mở checkout hoặc tự đánh dấu đơn đã thanh toán.
- Số dư 0 vẫn dùng xác nhận từ BE. Mọi response `PAID` bỏ redirect, kể cả
  `about:blank` và trường hợp số tiền lớn hơn 0. Phiên cọc không có lịch được khôi
  phục sau reload chỉ khi khớp giao dịch đang xử lý của đúng đơn/số tiền/tiền tệ.

## API chính sách đã tích hợp

| Prefix | Đọc hiện tại | Lịch sử | Cập nhật |
| --- | --- | --- | --- |
| `/api/system-admin/survey-deposit` | `GET /current` | `GET /versions` | `POST /versions` với `amountVnd`, `expectedVersion` |
| `/api/system-admin/survey-combo-discount` | `GET /current` | `GET /versions` | `POST /versions` với `discountPercentage`, `expectedVersion` |

Owner tiếp tục dùng `GET /api/tenant-owner/survey-orders/{id}`, `GET/POST
/api/tenant-owner/survey-orders/{id}/payments`. Không gửi số tiền tự nhập lên
API tạo thanh toán. Khi cần lịch hẹn, vẫn kiểm tra đúng purpose, confirmed và
chưa hết hạn theo hợp đồng BE; không bỏ qua điều kiện này để đồng bộ đơn cũ.

## Test tay

1. Admin mở Dịch vụ & đơn giá: thấy tiền cọc và giảm giá hiện hành, lịch sử; cập
   nhật cọc 0 và 5.000, giảm giá 20,25. Nhập -1, cọc 1,5 hoặc giảm giá 100/99,999
   phải bị chặn. Dùng hai tab sửa cùng phiên bản: tab cũ phải thấy lỗi xung đột,
   đóng và tải lại trước khi lưu; không tự ghi đè. Chính sách mới áp dụng cho đơn
   tạo sau đó, không đổi số tiền của đơn cũ.
2. Owner mở đơn khảo sát lại có cọc 5.000 chưa thanh toán và chưa có lịch: hiện
   Cọc khảo sát 5.000, có nút Thanh toán; không yêu cầu xác nhận lịch trước khoản
   cọc này. Sau tạo phiên, reload: chỉ mở lại link khi khớp lịch sử BE. Không thể
   tạo thêm phiên khi giao dịch còn xử lý hoặc cần đối soát.
3. BE xác nhận cọc xong: tải lại, không thu cọc lần nữa. Khoản còn lại chỉ thanh
   toán khi có lịch dịch vụ đã xác nhận và hợp lệ.
4. Với giao dịch khoản còn lại `PAID` nhưng đơn vẫn chờ thanh toán, còn lịch hợp
   lệ: bấm Đồng bộ trạng thái đơn → xác nhận. Đạt khi BE trả PAID, đơn chuyển bước,
   không mở thêm trang trả tiền. Sai số tiền/tiền tệ hoặc đang Processing thì
   không có nút đồng bộ; không tự sửa giao dịch trong DB để vượt điều kiện.
5. Khoản còn lại bằng 0: bấm Hoàn tất số dư 0, đợi BE xác nhận. Không mở
   `about:blank`, không tự thêm bản ghi vào lịch sử thanh toán.

## Xác minh và giới hạn

- `npm run build`: thành công, gồm TypeScript và Vite.
- `npm test`: 210/210 qua. Có test guard/API cho cọc, chống trùng, đồng bộ PAID,
  phiên cọc không có lịch, giá trị/phiên bản chính sách và conflict không retry;
  test render React cho màn Owner và Admin, không phải thao tác trình duyệt thật.
- Chưa kiểm thử giao dịch SePay thật hoặc toàn luồng HTTP với PostgreSQL local.
  Kiểm tra BE trước đó cho thấy database đang tắt; cần khởi động DB và dùng schema
  phù hợp trước khi test tay. Không áp dụng migration trong thay đổi FE này.
- API Owner hiện chưa trả `requiresBaselineMapping`/`depositPaymentStatus`, nên FE
  dùng trạng thái đơn và lịch sử BE để đề xuất khoản cọc; BE vẫn quyết định điều
  kiện hợp lệ cuối cùng. Khi lịch sử lỗi/chưa tải, không cho gửi thanh toán.
