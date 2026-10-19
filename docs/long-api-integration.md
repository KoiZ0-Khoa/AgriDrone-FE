# Đối chiếu FE với BE của Long — mốc 16–17/10/2026

> Đây là tài liệu mốc cũ. Trạng thái tích hợp hiện tại theo BE `902362c`, checklist v5 và API Manager Order nằm trong [cập nhật ngày 19/10/2026](./long-api-update-2026-10-19.md). Không dùng các ghi chú lỗi validation/phê duyệt cũ bên dưới để kết luận về BE mới.

Mốc BE: `0ce91b6`, kiểm tra ngày 16/10/2026. Phạm vi lần cập nhật này là web; không sửa BE hoặc Mobile.

## Các màn đã tích hợp

| Màn hình | API | Hành vi |
|---|---|---|
| `/request-survey` | GET `/api/public/survey-services`, POST `/api/public/survey-requests` | Khách mới chọn dịch vụ, nhập thông tin liên hệ/vị trí nông trại, nhận mã yêu cầu. Chưa tạo tài khoản ngay. |
| `/survey-requests/new` | POST `/api/tenant-owner/survey-requests/new-farm`, POST `/api/tenant-owner/farms/{farmId}/survey-requests` | Owner gửi yêu cầu cho nông trại mới hoặc hiện có. |
| `/system/survey-services` | GET `/api/system-admin/survey-services`, PUT `/{serviceId}`, GET/POST `/{serviceId}/prices`, POST `/{serviceId}/activate`, `/experimental`, `/retire` | Danh mục, chỉnh mô tả, giá theo trụ VND, lịch sử giá và trạng thái. Không cho kích hoạt lại dịch vụ RETIRED. |
| `/system/managers` | GET/POST `/api/system/managers`, GET `/{profileId}`, POST `/invitations`, PUT `/{profileId}/activate`, `/suspend`, `/availability`, `/qualification` | Mời Manager hoặc tạo hồ sơ cho tài khoản có sẵn; quản lý trạng thái, nhận việc và chứng chỉ. |
| `/system/managers` → Phân công nông trại | PUT `/api/system/farms/{farmId}/primary-manager` | Phân công lần đầu cho Farm hiện có bằng Farm ID, Manager đủ điều kiện và lý do. Gửi `expectedCurrentAssignmentVersion: null`; không thay thế Manager đã được phân công. |
| `/system/survey-requests` và `/:requestId` | GET inbox/chi tiết, POST `/{requestId}/start-review`, `/reject`, `/approve` | Phân trang, lọc, xem lịch sử, checklist v3, chọn Manager đủ điều kiện và duyệt/từ chối. |
| `/accept-system-manager-invitation` | POST `/api/auth/system-manager-invitations/preview`, `/accept` | Giữ phần lời mời đã triển khai: chỉ tạo tài khoản khi BE yêu cầu. |
| `/manager` | GET `/api/system-manager/farms` | System Manager đăng nhập được và xem danh sách nông trại được phân công trong layout riêng. Chưa có màn vận hành Order/Mission. |
| `/manager/farms/:farmId` | GET `/api/farms/{farmId}`, PUT `/api/farms/{farmId}` | Đã thêm màn chi tiết và form sửa tên, địa chỉ, diện tích, tọa độ tâm. Giữ nguyên boundary và dùng version đã đọc. BE hiện chặn GET cho phiên Manager không có tenant, nên form khóa lưu và báo rõ lỗi quyền đọc. |

POST intake và approve giữ `Idempotency-Key` khi thử lại cùng payload; sửa payload tạo key mới. Version gửi lên lấy từ dữ liệu người dùng đã xem, không tự tăng hoặc tự gửi lại khi có 409. Chỉ có Plant Health được mở thao tác bán dịch vụ.

## Các phần giao diện cũ đã sửa

- `/register` chuyển đến đăng ký khảo sát vì BE không còn endpoint tự đăng ký `/api/auth/register`.
- Nút tạo Farm trực tiếp chuyển sang gửi yêu cầu nông trại mới. BE chặn `farms.create-direct` mặc định bằng legacy gate.
- Owner/Tenant Admin không còn thấy nút sửa/lưu trữ Farm, tạo/sửa/lưu trữ Zone: BE hiện yêu cầu System Manager phụ trách cho các thao tác đó.
- Bỏ nút khôi phục Farm và chuyển Owner trực tiếp vì BE đánh dấu legacy và chặn mặc định. Vẫn giữ xem danh sách/chi tiết Farm đã lưu trữ.
- Các màn thành viên, phân công, Farm/Zone và quản trị đơn vị nhận đúng enum chữ hoa mới; vẫn đọc được định dạng cũ.
- Dashboard Admin ưu tiên yêu cầu chờ duyệt, System Manager và dịch vụ Plant Health.

## Các API chưa nối UI và lý do

| Nhóm | Trạng thái |
|---|---|
| Capture authorization verify/revoke | Request record của BE dùng validation attribute trên property thay vì constructor parameter; MVC validator ném InvalidOperationException. Chưa có GET trả trạng thái/version authorization để FE tải dữ liệu. |
| Manager xác minh boundary/scope, xác nhận số trụ, đề xuất lịch/readiness | Chưa triển khai UI. Hiện thiếu inbox/list Order cho Manager để chọn công việc; một số request record của BE còn cùng kiểu validation attribute cần kiểm tra. |
| Owner xác nhận lịch, xin đổi lịch và thanh toán | Chưa triển khai UI. BE chưa có API đọc danh sách/chi tiết Order, lịch hẹn và payment cho Owner để lấy ID/version authoritative. |
| Admin điều chỉnh giá đơn, đối soát payment | Chưa triển khai UI; cần API đọc các Order/adjustment/payment tương ứng trước khi thiết kế luồng thao tác. |
| Phân công lại/kết thúc primary Manager của Farm | Chưa triển khai UI. BE có PUT nhưng chưa có GET cho Admin đọc assignment/version hiện tại. Chọn Manager trong phê duyệt yêu cầu mới đã tích hợp. |
| Xuất bản bản đồ nền, kết quả sức khỏe cây, lịch sử/follow-up | BE chưa hoàn tất theo kế hoạch; không mô phỏng kết quả trên FE. |

## Chạy và kiểm thử

1. Chạy BE đã áp dụng migration phù hợp; bật cấu hình gửi mail nếu kiểm thử nhận lời mời thật.
2. Chạy FE bằng `npm run dev`. Cần khởi động lại Vite sau thay đổi cấu hình proxy. Vite lấy target từ `VITE_API_BASE_URL` trong `.env` và proxy API về BE. Các request từ trình duyệt đi cùng origin FE để giữ cookie phiên intake khi local FE HTTP nhưng BE HTTPS. Chỉ proxy phát triển cho phép chứng chỉ tự ký.
3. Mở `/request-survey`, gửi một yêu cầu thử. Kiểm tra nhận mã yêu cầu, không phải thông báo tạo tài khoản thành công.
4. Admin mở System Manager: mời hoặc tạo hồ sơ, kích hoạt, cập nhật chứng chỉ chưa hết hạn và đặt sẵn sàng nhận việc.
5. Admin mở dịch vụ: cập nhật giá VND/trụ và trạng thái. Giá lịch sử nằm trong drawer riêng.
6. Admin mở yêu cầu: bắt đầu xét duyệt, mở chi tiết, xác nhận đủ ba checklist, chọn Manager và phê duyệt. Kiểm tra mã Order được BE trả về và email Owner nếu là khách mới.
7. Kiểm tra từ chối yêu cầu bằng lý do cụ thể; kiểm tra 409 không tự gửi lại với version mới.
8. Owner đăng nhập và gửi hai loại yêu cầu trong mục Đăng ký khảo sát. System Manager phải được đưa đến `/manager`, không vào layout tenant.

Build production không dùng proxy Vite. Khi deploy cần cấu hình API/reverse proxy cùng site phù hợp với cookie `SameSite=Lax` của BE; `VITE_API_BASE_URL` là cấu hình build cho API thật.

### Kiểm thử phân công thủ công (17/10/2026)

1. Với Owner, mở chi tiết Farm đang hoạt động và sao chép UUID sau `/farms/` trong URL (không dùng mã Farm như `TAN AN`). BE chưa có API danh sách Farm cho Admin, nên form hiện nhập Farm ID.
2. Với System Admin, mở **System Manager → Phân công nông trại**, dán Farm ID, chọn Manager hoạt động/sẵn sàng/có chứng chỉ chưa hết hạn, nhập lý do rồi xác nhận.
3. Chỉ khi BE trả thành công mới hiện thông báo đã phân công. Đăng nhập Manager, mở **Nông trại phụ trách → Tải lại** để kiểm tra Farm.
4. Nếu Farm đã có primary Manager, BE trả conflict; form giữ lỗi và không đoán version/gửi lại để thay thế người hiện tại. Đây là chức năng phân công lần đầu, không phải phân công lại.
5. Kiểm tra Farm ID sai/đã lưu trữ, Manager không còn đủ điều kiện và lỗi quyền. Mã lỗi và mã tra cứu được giữ lại khi BE cung cấp.

Thao tác này không tạo hoặc phê duyệt Survey Request/Survey Order.

### Chi tiết và chỉnh sửa Farm cho Manager (17/10/2026)

- Manager mở **Nông trại phụ trách**, bấm cả ô Farm để vào `/manager/farms/:farmId`.
- FE kiểm tra Farm nằm trong danh sách được phân công trước khi đọc chi tiết. GET dùng chính token Manager, không lấy token Owner hoặc giả tenant header.
- Khi đọc được dữ liệu đầy đủ, nút **Chỉnh sửa nông trại** mở form có sẵn tên, địa chỉ, diện tích ha, kinh độ và vĩ độ. PUT giữ boundary, dùng `expectedVersion` của Farm, không dùng version phân công. Thành công tải lại dữ liệu; conflict không tự gửi lại version mới.
- Nếu thiếu version, thiếu dữ liệu vị trí/ranh giới, không khớp Farm/tenant hoặc Farm ngừng hoạt động, không cho sửa. Không hiển thị tọa độ mặc định khi GET bị từ chối.
- **Điểm chặn BE còn nguyên:** `FarmController.GetFarmById` yêu cầu `TenantMember`; handler còn yêu cầu tenant context và kiểm tra quyền tenant/Farm. Phiên System Manager hoạt động toàn hệ thống không đọc được qua luồng này, trong khi PUT yêu cầu System Manager được phân công. Danh sách `/api/system-manager/farms` không có centerPoint, boundary hoặc version. Cần Long mở quyền đọc theo primary-manager assignment hoặc cung cấp endpoint chi tiết Manager trả các trường đó. Hiện FE dùng GET có thật, chưa tự đặt endpoint mới.
- Kiểm thử form/chuyển trang bằng mock/fixture không xác nhận đã sửa thành công trên BE đang chạy. Chưa thực hiện PUT trên database thật.

Các test FE kiểm tra hợp đồng request bằng fetch mock, role/điều hướng, điều kiện Manager, checklist, validation intake và chống gửi trùng. Chưa thay thế kiểm thử end-to-end trên database và dịch vụ mail/payment thật.
