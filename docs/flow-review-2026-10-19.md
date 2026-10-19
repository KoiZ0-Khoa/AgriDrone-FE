# Đối chiếu flow người dùng gửi — 19/10/2026

BE đối chiếu: `902362c`. Đây là kiểm tra tài liệu so với code, không phải bằng chứng đã chạy toàn luồng trên HTTP/database thật.

## Kết luận kiểm thử

FE đã có 79 bài test đạt và build thành công. Các bài dùng mock/fixture, chưa thực hiện live onboarding, email, phê duyệt, lịch, GPS, quyền bay hoặc cất cánh. Bài test BE trước đó có 601 unit và 90 architecture đạt; cũng không thay thế test nghiệp vụ trên database thật.

## Những chỗ cần sửa trong flow

| Trong tài liệu gửi | Hợp đồng/code hiện tại |
|---|---|
| POST `/api/system-admin/plant-health/conditions` | POST `/api/system/plant-conditions`. Body cần `conditionType`, ví dụ `DISEASE`; nếu là nhãn Plant Health, dùng `plantHealthLabelKind: SUSPECTED_DISEASE` và đủ `datasetVersion`, `annotationRuleVersion`, `teamLabelLimitation`. |
| Activate guidance gửi `effectiveFrom` | POST `/api/system-admin/plant-health/guidance/{id}/activate` gửi `expectedVersion` lấy từ response guidance. Hiệu lực được đặt khi tạo draft. |
| GET `/api/catalog/services` | GET `/api/public/survey-services`. Dịch vụ cần đang cung cấp và có giá theo trụ hiện hành. Chuẩn bị dịch vụ/giá trước intake. |
| POST `/{requestId}/review` | POST `/api/system-admin/survey-requests/{requestId}/start-review`. Lấy version từ GET chi tiết; dùng version mới trả về cho bước sau. |
| Approve gửi `managerEmail`, `idempotencyKey` trong body và checklist V1/items | Gửi `selectedSystemManagerProfileId`; `Idempotency-Key` là header. Checklist là bảy boolean có tên JSON bên dưới, cộng notes. FE hỗ trợ checklist v5 trả từ GET detail. |
| expectedVersion/OrderVersion/AppointmentVersion/SessionVersion mặc định 0 hoặc cộng 1 | Luôn lấy đúng version từ response mới nhất. Nhiều validator bắt buộc lớn hơn 0. Không giả định version là số thứ tự nghiệp vụ. |
| Appointment response có `id`, `version` | Tên field là `appointmentId`, `appointmentVersion`, `orderVersion`, `appointmentStatus`, `orderStatus`. |
| Đề xuất lại lịch gửi `previousAppointmentId`, `expectedPreviousAppointmentVersion` | Request nhận `expectedCurrentAppointmentId`, `expectedCurrentAppointmentVersion`. PreviousAppointmentId là thông tin lịch sử được BE quản lý. |
| Manager có thể gọi trực tiếp propose để thay lịch đã xác nhận | Handler từ chối nếu current appointment chưa là `RESCHEDULE_REQUESTED`. Chưa hỗ trợ kịch bản Manager chủ động thay confirmed appointment như tài liệu mô tả. |
| Finalize capture tự sang `BASELINE_READY`, có thể cất cánh | Finalize ghi ranh giới nhưng Order vẫn `AWAITING_BOUNDARY_CAPTURE`. `ApproveBaselineRoute` mới chuyển sang `BASELINE_READY`; cần route phù hợp boundary/session/safety inset. Sau đó vẫn phải qua readiness và preflight/Mission trước cất cánh. |

Checklist gửi dưới thuộc tính `checklist`:

```json
{
  "contact-valid": true,
  "dragon-fruit-farm-confirmed": true,
  "service-area-supported": true,
  "candidate-location-sufficient": true,
  "consent-feasibility": true,
  "flight-permission-feasibility": true,
  "eligible-manager-available": true,
  "notes": null
}
```

Approve cần version request đã đọc và Manager profile ID thực từ danh sách Manager đủ điều kiện. Không dùng ID/email mẫu trong tài liệu để chạy thật.

## Các bước nghiệp vụ bị thiếu trong tài liệu

- Chuẩn bị System Manager có tài khoản hoạt động, profile hoạt động/sẵn sàng và chứng chỉ chưa hết hạn trước approval.
- Chuẩn bị dịch vụ Plant Health và giá đang hiệu lực; GET catalogue không tự tạo giá.
- Ngoài checklist khả thi, hai authorization `WRITTEN_DATA_USE_CONSENT` và `FLIGHT_PERMISSION` phải được verify hợp lệ trước khi mở phiên đo ranh giới. BE có PUT verify nhưng thiếu read model/version cho UI hoàn chỉnh.
- Start capture chỉ thành công trong khung giờ baseline appointment đã CONFIRMED. Ví dụ hẹn ngày 25/10 không thể dùng để start vào ngày 19/10; đồng hồ server được kiểm tra.
- Sau finalize còn tạo/duyệt route plan phù hợp và kiểm tra readiness/Mission/preflight. Đã có command/handler nghiệp vụ duyệt route, nhưng chưa thấy API controller công khai gọi command đó; cần nối seam BE2 để kiểm thử HTTP xuyên suốt.
- Chấp nhận lời mời theo kết quả invitation preview: người đã có tài khoản không cần đăng ký lại. Không giả định mọi người nhận đều cần tạo user mới.

Baseline không đòi thanh toán, nhưng không có nghĩa được bỏ các điều kiện giấy phép, lịch, drone, route và preflight.

## Mức hỗ trợ FE theo flow này

| Nhóm | FE | Test thật |
|---|---|---|
| Condition/nhãn, guidance draft/lịch sử/activate/retire | Có giao diện, đã cập nhật metadata | Chưa |
| Public catalogue/intake và tenant code/name | Có | Chưa gửi intake hợp lệ trong lượt tích hợp |
| Admin review/approve/reject v5 | Có | Chưa phê duyệt thật sau merge |
| Invitation preview/accept/login | Có; từng kiểm tra live login Owner ở mốc trước | Chưa kiểm thử live invitation sinh ra từ flow mới |
| Manager Order list/detail/propose/repropose | Có; repropose chỉ khi RESCHEDULE_REQUESTED | Chưa |
| Owner confirm/request-reschedule | Chưa có UI vì thiếu Order/appointment read model | Chưa |
| Boundary capture start/sync/finalize/route/readiness | Chưa có UI xuyên suốt | Chưa |

Không thể đánh dấu full flow đã đạt. Cần thống nhất bản hướng dẫn đúng hợp đồng và xử lý các điểm thiếu đọc dữ liệu/route handoff trước khi test xuyên suốt bằng web.
