# Kiểm thử FE tích hợp API Long — 19/10/2026

BE đối chiếu: `902362c`. Không sửa BE, Mobile, cấu hình, database hoặc tài khoản thật.

## Kết quả

- `npm.cmd run build`: đạt, gồm TypeScript và bundle production.
- `node --test --test-reporter=spec tests/*.test.mjs`: **79/79 đạt**, 0 lỗi, 0 bỏ qua.
- `git diff --check`: không có lỗi khoảng trắng.

## Các trường hợp kiểm tra mới/cập nhật

1. Public intake có đủ mã/tên đơn vị, phân biệt lỗi mã đơn vị đã được giữ chỗ. Owner intake không gửi thêm ngữ cảnh tenant từ form.
2. Checklist v5 tạo đúng bảy key JSON có gạch ngang và notes; bỏ field v3/version cũ. Thiếu hoặc false bất kỳ điều kiện nào sẽ chặn approval; reject được ghi nhận câu trả lời false. Không chấp nhận version checklist lạ.
3. Inbox hiển thị đơn vị, không hiển thị tên liên hệ kể cả fixture vô tình có field đó.
4. Manager Order list gửi đúng bearer, filter, page và AbortSignal. Tìm context Order qua các trang được giao; không tạo endpoint chi tiết giả.
5. Đề xuất lịch đúng trạng thái, giữ Order/appointment ID và version, chuyển UTC, chặn lịch quá khứ/đảo chiều, không ghi đè lịch đang hoạt động.
6. Order context và boundary-scope khác danh tính, version, trạng thái hoặc baseline flag thì không cho thao tác.
7. Farm chưa có bản đồ chỉ mở lịch baseline, không mở direct polygon verification. Farm đã có bản đồ ở trạng thái phù hợp mở xác minh ranh giới.
8. Ranh giới giữ thứ tự longitude/latitude, tự khép vòng và giữ interior rings; từ chối tọa độ sai, thiếu hoặc trùng hết các đỉnh.
9. API lịch và ranh giới gửi version đã đọc, giữ lỗi server; không tự thử version khác khi conflict.
10. Plant Health catalogue/guidance history dùng đúng endpoint và cancellation. Tạo draft, activate/retire gửi body/version đúng hợp đồng.
11. Create/version condition giữ label kind, dataset/rule/limitation và entity version. Giao diện khóa sửa nếu API list không có version.
12. Render fixture các màn public/Admin/Owner/Manager, gồm màn Order list/detail và Plant Health mới.

## Giới hạn

- Test hợp đồng dùng fetch mock; UI dùng React SSR với fixture. Không đồng nghĩa HTTP/DB E2E hoặc thao tác chuột/bàn phím đã đạt.
- Kiểm tra Computer Use trả không có browser/app kết nối; chưa thực hiện kiểm thử tương tác trên trình duyệt.
- Không gửi public intake hợp lệ, duyệt/từ chối thật, phân công thật, đề xuất lịch thật hoặc thay đổi guidance/master data thật. Không gửi email hay thanh toán.
- Chưa chạy migration hoặc khởi động lại BE. Khi test thủ công cần tiến trình BE đúng bản mới và schema tương ứng.
- GET Farm cho Manager còn chặn bởi quyền tenant của BE. Các nhóm GPS/route, publication, số trụ/giá, permission/payment/adjustment và Owner Order read chưa hoàn tất trên web.

Danh sách màn, API và các điểm chặn cụ thể nằm trong [tài liệu tích hợp ngày 19/10](./long-api-update-2026-10-19.md).
