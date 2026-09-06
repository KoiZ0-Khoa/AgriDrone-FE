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
npm run build
```

## Phạm vi hiện tại

- Nền React + TypeScript + Vite.
- Design system Ant Design và dashboard responsive.
- Đăng nhập bằng API `POST /api/auth/login`.
- Chọn tenant bằng API `POST /api/auth/select-tenant`.
- Protected route, role/scope và phiên đăng nhập theo tab trình duyệt.
- Kiểm tra trạng thái backend qua `GET /health/live`.
