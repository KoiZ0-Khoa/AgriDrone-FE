# AgriDrone Frontend

Web quản lý AgriDrone dành cho System Admin, Tenant Owner, Tenant Admin và Member được phân công làm Manager/Worker.

## Chạy dự án

Yêu cầu Node.js phiên bản tương thích với Vite 8.

```bash
npm install
copy .env.example .env
npm run dev
```

Web chạy tại `http://localhost:5173`. Backend mặc định được gọi tại `http://localhost:5080`.

## Các lệnh kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

## Phạm vi hiện tại

- Nền React + TypeScript + Vite.
- Design system Ant Design và dashboard responsive.
- Đăng nhập bằng API `POST /api/auth/login`.
- Chọn tenant bằng API `POST /api/auth/select-tenant`.
- Protected route, role/scope và phiên đăng nhập theo tab trình duyệt.
- Kiểm tra trạng thái backend qua `GET /health/live`.

## Quản lý khu vực và lưu trữ

- **Owner → Nông trại → Đã lưu trữ** (`/farms/archived`): danh sách phân trang từ `GET /api/farms/archived`, hiển thị thời điểm lưu trữ.
- **Xem chi tiết** (`/farms/archived/:farmId`): gọi `GET /api/farms/{farmId}/archived`, xem thông tin, tọa độ và dữ liệu ranh giới đã lưu. Cả danh sách và chi tiết chỉ dành cho Owner theo BE.
- **Khôi phục nông trại**: xác nhận rồi gọi `PUT /api/farms/{farmId}/restore` với `{ expectedVersion }` của bản đang xem. Thành công cập nhật cache và mở chi tiết Farm đang sử dụng. Không tự khôi phục Zone đã lưu trữ.
- Xung đột phiên bản yêu cầu đóng hộp xác nhận, tải lại chi tiết và xác nhận lại; không tự thử lại lệnh khôi phục. Trùng mã Farm, thiếu quyền hoặc không còn dữ liệu có thông báo riêng. Mở trực tiếp URL bằng vai trò khác Owner không gửi các yêu cầu này.

- Chi tiết khu vực → Chỉnh sửa: cập nhật tên, diện tích (có thể để trống); giữ nguyên mã và polygon đã lưu. Chưa có trình vẽ/chỉnh sửa ranh giới.
- Chi tiết Farm/Zone → Lưu trữ: chỉ hiển thị cho Owner, cần lý do 1–500 ký tự và xác nhận. Lịch sử được giữ lại; thành công sẽ quay về danh sách tương ứng.
- PUT `/api/farms/{farmId}/zones/{zoneId}`, PUT `/api/farms/{farmId}/zones/{zoneId}/archive`, PUT `/api/farms/{farmId}/archive` đều gửi `expectedVersion` của dữ liệu đã xem.
- Khi gặp `ConcurrentUpdate`, chặn gửi lại đến khi người dùng tải bản mới và kiểm tra. Lỗi còn nhiệm vụ/công việc/khu vực được giải thích riêng.
- Quyền sửa do BE kiểm tra theo Owner hoặc Manager được phân công đúng khu vực. API chi tiết chưa trả quyền hiệu lực cho UI; nút sửa có trên khu vực đọc được và lỗi 403 được hiển thị rõ, không suy diễn Tenant Admin luôn có quyền sửa.

## Tích hợp tài khoản và quản trị

Nhận lời mời: FE gọi `POST /api/auth/invitations/preview` trước khi hiện form. Với `requiresAccountCreation=false`, chỉ hiện xác nhận tham gia và gửi token, không yêu cầu họ tên/mật khẩu. Với `true`, yêu cầu họ tên, mật khẩu mới và xác nhận mật khẩu. Lời mời không hợp lệ sẽ hiển thị lỗi; chấp nhận thành công dẫn tới bước đăng nhập bằng email được mời, không tự tạo phiên đăng nhập.

| Luồng review | Phạm vi |
| --- | --- |
| Chi tiết Farm → Chỉnh sửa nông trại | Owner/Tenant Admin sửa tên, địa chỉ, diện tích, tọa độ tâm; giữ nguyên mã và polygon, gửi `expectedVersion` và xử lý xung đột. |
| Tài khoản (`/account`) | Sửa họ tên/số điện thoại, đổi mật khẩu và đăng nhập lại. |
| Thành viên đơn vị (`/team`) | Owner/Tenant Admin xem danh sách phân trang và mời Member. Owner mời Tenant Admin, đổi vai trò, kích hoạt/ngừng quyền truy cập, chuyển quyền sở hữu. |
| Chi tiết Farm → Thành viên nông trại | Danh sách phân trang, lọc Manager/Worker và đang phân công/đã thu hồi. Thu hồi có xác nhận, lý do tùy chọn và `expectedVersion`; không xóa tài khoản hoặc membership đơn vị. |
| Chi tiết Farm → Phân công thành viên | Owner/Admin giao Member làm Manager/Worker, chọn tất cả hoặc các Zone đang hoạt động. Chỉ Owner được giao Tenant Admin và chỉ vai trò Manager. Có thể cập nhật/cấp lại phân công đã thu hồi. |
| Nông trại được giao (`/my-farms`) | Dùng `GET /api/users/me/farm-assignments`, phân trang/lọc vai trò, xem Farm và Zone được giao. Với Member, mục Nông trại cũng mở danh sách này. |
| Quản trị hệ thống (`/system`) | System Admin xem/tạo/bật/tắt tenant, mời Owner, xem người dùng và bật/tắt membership theo đơn vị. |
| Chấp nhận lời mời (`/accept-invitation?token=...` hoặc `/invitation`) | Nhận token từ liên kết email hoặc nhập mã; hỗ trợ người đã có tài khoản và tài khoản mới. |

API danh sách thành viên trả trạng thái **người dùng**, chưa trả trạng thái **membership**. Màn hình không dùng trạng thái người dùng để suy đoán quyền truy cập đơn vị; Owner có hai thao tác kích hoạt/ngừng riêng. BE vẫn kiểm tra quyền và điều kiện nghiệp vụ. Sau khi chuyển Owner, người chuyển phải đăng nhập lại để cập nhật vai trò.

Review luồng mới: **Thành viên đơn vị → Mời thành viên → người nhận chấp nhận lời mời → Chi tiết Farm → Phân công thành viên → đăng nhập tài khoản người nhận → Nông trại được giao**. Thu hồi trong chi tiết Farm: Tenant Admin chỉ thu hồi phân công của Member; phân công của Tenant Admin/Owner cần Owner. Lỗi phiên bản yêu cầu tải lại và xác nhận lại, không tự ghi đè. Sau thay đổi từ tài khoản khác, người nhận dùng Tải lại để cập nhật danh sách.

Gửi lời mời cần luồng outbox/RabbitMQ và SMTP của BE hoạt động. Kết quả tạo lời mời thành công chưa xác nhận email đã đến hộp thư. Liên kết email dùng `Identity:TenantInvitations:AcceptUrl` hiện có của BE; đường dẫn `/accept-invitation` đã được hỗ trợ trên web. Đợt tích hợp này không thay đổi BE.

**Chưa tích hợp Drone/Mission:** BE có một số API tạo/cập nhật/chi tiết, nhưng chưa có danh sách toàn bộ drone, danh sách mission và danh sách bản đồ đã xác nhận để chọn cho nhiệm vụ kiểm tra sức khỏe. Chưa đủ để xây dựng luồng quản lý đầy đủ; giao diện không yêu cầu người dùng tự nhập ID thay cho các danh sách còn thiếu.

Tests trong `tests/management.test.mjs` kiểm tra module thật với HTTP giả lập: đường dẫn, payload, phân trang, lời mời, quyền quản trị và xung đột phiên bản. Build/typecheck và các tests này không thay thế kiểm thử đăng nhập, email và thao tác nghiệp vụ với BE thật.
