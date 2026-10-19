# Báo cáo kiểm thử FE — 17/10/2026

> Báo cáo này giữ kết quả của mốc 17/10. Kết quả tích hợp BE mới, checklist v5 và 79 test nằm ở [báo cáo ngày 19/10/2026](./test-report-2026-10-19.md).

## Phạm vi

Kiểm thử những phần độc lập với phê duyệt Survey Request. Không sửa BE, không thay đổi giá/hồ sơ/quyền truy cập đang dùng, không gửi email, không thanh toán hoặc tạo yêu cầu khảo sát hợp lệ trên database thật.

## Kiểm tra tự động

Lệnh `node --test --test-reporter=spec tests/*.test.mjs`: **67 đạt / 67**, không lỗi hoặc bỏ qua (chạy lại sau khi thêm màn chi tiết Farm cho Manager).

Lệnh `npm.cmd run build`: **thành công**, bao gồm TypeScript và bundle production.

Các nhóm đã kiểm tra:

- Đăng nhập nhiều tenant: gửi đúng selection token, xử lý token hết hạn và thông báo 401 đúng ngữ cảnh.
- Role và điều hướng Owner/System Admin/System Manager.
- Phân trang, lọc danh sách Manager và điều kiện chứng chỉ/khả năng nhận việc.
- Request cập nhật Manager dùng đúng route, method, enum và version.
- Phân công Farm thủ công: dùng profile ID, gửi `expectedCurrentAssignmentVersion: null`, giữ response ID/version của BE; conflict không tự thử version khác. Kiểm tra lỗi Farm không tồn tại, Manager không đủ điều kiện và thiếu quyền; trang Admin có nút mở biểu mẫu.
- Farm của Manager: link chi tiết trong ô Farm, đọc bằng bearer Manager có cancellation, form điền dữ liệu cũ và giữ nguyên boundary/version khi sửa diện tích/tọa độ. Fixture kiểm tra khóa chỉnh sửa khi không được phân công, GET bị từ chối, thiếu version/geometry, khác tenant hoặc Farm ngừng hoạt động.
- Danh mục dịch vụ, giá VND/trụ, lịch sử giá và thay đổi trạng thái.
- Inbox/chi tiết yêu cầu, checklist v3, payload bắt đầu review, duyệt/từ chối.
- Intake cho khách mới và hai loại Owner; kiểm tra tọa độ, diện tích, số trụ và khoảng thời gian.
- Giữ Idempotency-Key cho cùng payload khi thử lại; không tự gửi lại khi bị conflict.
- Hiển thị riêng lỗi Farm chưa đủ thông tin, giữ lý do các lỗi conflict khác.
- Render màn hình với fixture theo hợp đồng BE cho các vai trò.
- Proxy development chuyển nguyên cookie, body và Idempotency-Key qua HTTP server giả lập.
- Các hợp đồng quản lý Farm, thành viên và lời mời đã có từ trước.

Các bài dùng fetch mock hoặc fixture **không chứng minh endpoint tương ứng đang hoạt động trên BE thật**. Một số hợp đồng legacy vẫn còn bài test nhưng UI đã tạm ngừng hoặc BE hiện không còn cung cấp route.

## Kiểm tra trực tiếp qua FE proxy và BE local

| Kiểm tra | Kết quả thực tế |
|---|---|
| FE `http://localhost:5173/` | 200 |
| BE `http://localhost:5080/health/live` | 200 |
| `/health/live` qua FE proxy | 200 |
| GET `/api/public/survey-services` qua FE proxy | 200; có một dịch vụ Plant Health và giá VND |
| API danh mục Admin khi chưa đăng nhập | 401 |
| API danh sách System Manager khi chưa đăng nhập | 401 |
| Đăng nhập tài khoản đã được người dùng cung cấp | 200, yêu cầu chọn đơn vị |
| Chọn đơn vị | 200, tạo phiên Owner |
| Owner GET danh sách Farm | 200; một Farm được trả về |
| Owner gọi API danh mục Admin | 403, đúng giới hạn quyền |
| POST public intake với body rỗng | 400, trả lỗi trường bắt buộc; không tạo yêu cầu hợp lệ |
| Preview lời mời Manager bằng token thử không hợp lệ | 422, `SystemManagerInvitation.InvalidOrExpired` |

Không ghi mật khẩu, access token hoặc selection token vào báo cáo.

## Khác biệt và giới hạn

- Public catalogue trên tiến trình BE đang chạy trả `serviceType` dạng số `0`; contract TypeScript hiện khai báo string. Form hiện tại dùng ID/tên dịch vụ nên các bước đọc trên chưa bị chặn, nhưng cần BE xác nhận thống nhất định dạng enum.
- Kết nối HTTPS trực tiếp từ Node tới cổng 7080 không được Node tin cậy do chứng chỉ tự ký. Kiểm tra qua FE proxy và HTTP 5080 vẫn thành công. Không thay đổi cấu hình xác thực chứng chỉ trên hệ thống.
- Công cụ trình duyệt không có browser khả dụng trong lượt kiểm thử này; chưa kiểm tra click/nhập liệu tương tác end-to-end. Kiểm tra UI tự động hiện là render fixture.
- Không có phiên Admin/Manager thật để kiểm tra đầy đủ danh sách riêng tư và các thao tác ghi. Những nhóm này mới được kiểm tra bằng mock/fixture, không tính là end-to-end đạt.
- Phê duyệt vẫn là điểm chặn BE đã chẩn đoán trước: EF theo dõi review mới là Modified thay vì Added; chưa sửa hoặc thực hiện lại phê duyệt lên database thật.
- Chưa kiểm tra gửi email thật, nhận lời mời thật, thanh toán, lưu trữ, đổi mật khẩu hoặc các bước Order/Mission phụ thuộc phê duyệt.
- Phân công thủ công mới được kiểm tra bằng mock/fixture và build, chưa ghi phân công lên database thật. Form nhập UUID Farm từ URL vì chưa có API danh sách Farm cho Admin; chỉ hỗ trợ phân công lần đầu, không đổi/kết thúc phân công hiện có.
- Màn chi tiết/chỉnh sửa Farm cho Manager đã thêm, nhưng còn chặn bởi BE: GET chi tiết dùng quyền TenantMember/tenant context, còn Manager không có tenant. GET danh sách được giao không trả tọa độ, boundary, version. FE khóa lưu và hiển thị lỗi đọc; cần Long bổ sung quyền/API đọc cho Manager trước khi test chỉnh sửa thật. Không sửa BE hoặc dùng token Owner để vượt qua.

## Kết luận

Build và test tự động FE đều đạt. Đăng nhập/chọn đơn vị Owner, đọc Farm, đọc catalogue công khai, kiểm tra dữ liệu đầu vào cơ bản và giới hạn quyền API đã xác minh trên BE đang chạy. Chưa thể đánh dấu toàn bộ luồng nghiệp vụ là hoàn tất hoặc đã kiểm thử end-to-end.
