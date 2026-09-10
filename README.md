# AgriDrone Frontend

Web quản lý AgriDrone dành cho System Admin, Tenant Owner, Tenant Admin và Manager.

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

- Chi tiết khu vực → Chỉnh sửa: cập nhật tên, diện tích (có thể để trống); giữ nguyên mã và polygon đã lưu. Chưa có trình vẽ/chỉnh sửa ranh giới.
- Chi tiết Farm/Zone → Lưu trữ: chỉ hiển thị cho Owner, cần lý do 1–500 ký tự và xác nhận. Lịch sử được giữ lại; thành công sẽ quay về danh sách tương ứng.
- PUT `/api/farms/{farmId}/zones/{zoneId}`, PUT `/api/farms/{farmId}/zones/{zoneId}/archive`, PUT `/api/farms/{farmId}/archive` đều gửi `expectedVersion` của dữ liệu đã xem.
- Khi gặp `ConcurrentUpdate`, chặn gửi lại đến khi người dùng tải bản mới và kiểm tra. Lỗi còn nhiệm vụ/công việc/khu vực được giải thích riêng.
- Quyền sửa do BE kiểm tra theo Owner hoặc Manager được phân công đúng khu vực. API chi tiết chưa trả quyền hiệu lực cho UI; nút sửa có trên khu vực đọc được và lỗi 403 được hiển thị rõ, không suy diễn Tenant Admin luôn có quyền sửa.
