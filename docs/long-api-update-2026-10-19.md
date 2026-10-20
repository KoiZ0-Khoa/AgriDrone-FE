# FE tích hợp API của Long — 19/10/2026

> Mốc lịch sử. Xem [cập nhật 20/10/2026](./long-api-update-2026-10-20.md) theo BE `8f93bf2`, có API Manager Farm, phiên GPS, ranh giới và cọc Baseline mới. Các thiếu hụt BE bên dưới chỉ đúng tại mốc `902362c`.

BE đối chiếu: `902362c`. Chỉ sửa web FE; giữ nguyên BE và Mobile.

## Màn hình và hợp đồng đã cập nhật

| Màn | API / thay đổi | Hành vi |
|---|---|---|
| `/request-survey` | POST `/api/public/survey-requests` | Bổ sung `tenantCode`, `tenantName` bắt buộc; gửi cùng payload/idempotency key. Đơn vị chỉ được tạo sau phê duyệt. |
| `/survey-requests/new` | Hai POST intake Owner hiện có | Giữ ngữ cảnh tenant từ token; không yêu cầu Owner nhập lại mã/tên đơn vị. |
| `/system/survey-requests` | GET inbox | Dùng tên/mã đơn vị và Farm; không trông chờ applicantName trong inbox đã loại PII. |
| `/system/survey-requests/:requestId` | GET chi tiết, POST start-review/reject/approve | Giữ thông tin liên hệ ở chi tiết. Checklist v5 có bảy câu trả lời bắt buộc, gửi đúng tên JSON có gạch ngang; không gửi ba field cũ hay checklist.version. |
| `/manager/orders` | GET `/api/system-manager/survey-orders` | Danh sách phân trang/lọc trạng thái đơn được giao, layout riêng System Manager. |
| `/manager/orders/:orderId` | GET `/{orderId}/boundary-scope` và danh sách được giao | Hiển thị Farm, trạng thái, phân công/lịch hiện tại, ranh giới và Zone scope. Đối chiếu danh tính/version giữa hai response trước khi mở thao tác. |
| Manager đề xuất lịch | POST `/{orderId}/appointments` | Baseline appointment trước cho Farm chưa có bản đồ. PaidService chỉ khi Order tới trạng thái chờ lịch dịch vụ. Chỉ đề xuất lại khi lịch hiện tại có trạng thái RESCHEDULE_REQUESTED; gửi ID/version thực tế. |
| Manager xác minh ranh giới | POST `/{orderId}/boundary-scope/verify` | Chỉ cho Farm đã có bản đồ, Order PENDING_BOUNDARY_VERIFICATION. Nhập các đỉnh kinh/vĩ độ, tự khép vòng, giữ các interior ring đã lưu; gửi version Order và boundary number đã đọc. |
| `/system/plant-health` | GET `/api/catalog/plant-health`, GET/POST `/api/system-admin/plant-health/guidance`, POST `/{guidanceId}/activate` hoặc `/retire` | Nhãn Plant Health, metadata/giới hạn, toàn bộ lịch sử hướng dẫn có nguồn; tạo draft cho nhãn SUSPECTED_DISEASE, kích hoạt/ngừng theo version. Mã hướng dẫn cho phép chữ/số/gạch dưới/gạch ngang đúng validator mới. |
| `/system/plant-conditions` | Các API condition hiện có | Thêm label kind, datasetVersion, annotationRuleVersion, teamLabelLimitation. Nhãn Plant Health cần đủ metadata; sửa phiên bản giữ metadata. Vẫn khóa thao tác đòi entity version khi API list không trả version. |

## Checklist xét duyệt

FE chỉ hỗ trợ `survey-request-review.v5`; nếu detail trả phiên bản khác thì khóa quyết định và yêu cầu tải lại/cập nhật giao diện. Checklist request gồm:

- `contact-valid`
- `dragon-fruit-farm-confirmed`
- `service-area-supported`
- `candidate-location-sufficient`
- `consent-feasibility`
- `flight-permission-feasibility`
- `eligible-manager-available`
- `notes` (nullable)

Phê duyệt cần cả bảy điều kiện true. Từ chối vẫn gửi đủ các câu trả lời, có thể false. Khả thi xin giấy phép/văn bản đồng ý không phải xác nhận giấy tờ đã được verify.

## Chống ghi đè và xử lý lỗi

- Form giữ snapshot người dùng đã xem, không tự đổi expectedVersion khi query nền tải lại.
- Khi POST/PUT bị conflict không thử version khác hoặc tự gửi lại.
- Lịch nhập giờ địa phương được đổi UTC khi gửi; từ chối thời gian quá khứ, thiếu hoặc kết thúc trước bắt đầu.
- Nút thao tác không mở nếu context Order và boundary-scope khác ID/tenant/Farm/version/trạng thái hoặc thiếu version hợp lệ.
- Lỗi nghiệp vụ như hướng dẫn trùng khoảng hiệu lực giữ lý do BE, mã lỗi và traceId; không coi mọi HTTP 409 là lỗi version.
- Master data chỉ thể hiện nhận định sơ bộ; không thêm severity hoặc tự tuyên bố chẩn đoán.

## Những phần chưa thể coi là hoàn tất

1. **Manager sửa Farm:** UI đã có từ 17/10 nhưng GET `/api/farms/{farmId}` vẫn đòi tenant membership/context. Không lấy token Owner, giả tenant header hoặc đoán Farm version để vượt qua. Cần Long mở quyền đọc theo phân công Manager.
2. **Thu thập ranh giới GPS và đường bay:** BE có các POST tạo/sync/finalize/abort session, nhưng chưa có GET phục hồi session/version cùng đầy đủ thời gian lịch hiện tại. Chưa nối phiên hiện trường trên web. Không dùng direct polygon verify để thay thế nhánh Farm chưa có bản đồ.
3. **Số trụ/giá/readiness:** boundary-scope GET chưa trả current map ID và toàn bộ pricing/mission context cần cho màn thao tác. Chưa làm form nhập ID/version kỹ thuật bằng tay; cần read model phù hợp trước khi nối xác nhận số trụ và readiness.
4. **Owner xác nhận lịch/thanh toán và Admin giấy phép/adjustment/settlement/extra-flight:** có API ghi, nhưng còn thiếu các API đọc để chọn đối tượng và lấy trạng thái/version. Chưa nối UI bằng dữ liệu giả.
5. **Bản đồ nền/kết quả:** luồng xuất bản bản đồ nền nghiệp vụ và các bước kết quả phía sau vẫn cần BE/BE2 hoàn thiện. Việc pipeline ảnh/GPS có thêm code không chứng minh full flow publication đã xong.

Các lỗi review ID generation và validation attribute cũ đã được sửa ở BE mới. Chưa thực hiện phê duyệt thật hoặc migration lên database trong lượt cập nhật FE này.

## Cách thử trên web

1. Khách mới mở `/request-survey`: chọn dịch vụ, nhập tên/mã đơn vị, thông tin liên hệ và Farm; gửi yêu cầu. Kiểm tra payload có hai trường đơn vị.
2. System Admin mở yêu cầu: xem tên/mã đơn vị trong inbox, thông tin liên hệ trong chi tiết; bắt đầu xét duyệt và xác nhận bảy điều kiện. Dùng Manager đủ điều kiện. Thử reject riêng trên yêu cầu thử khác.
3. Nam/System Manager mở **Đơn khảo sát được giao**: lọc trạng thái, mở đơn. Farm chưa có bản đồ phải đề xuất lịch baseline trước; chờ Owner xác nhận. Với Farm đã có bản đồ ở trạng thái phù hợp, thử form các đỉnh ranh giới và giữ đúng version.
4. Admin mở **Nhãn & hướng dẫn**: đọc metadata/giới hạn, xem lịch sử, tạo bản nháp có nguồn, mở bản nháp và kích hoạt sau khi kiểm tra. Các thao tác ghi cần dữ liệu test được cho phép và cấu hình BE hoạt động.
5. Kiểm tra conflict bằng dữ liệu bị thay đổi: form báo lỗi, không báo thành công hoặc tự lấy version mới để ghi đè.

Chạy `npm.cmd run build` và `node --test --test-reporter=spec tests/*.test.mjs`. Test mock/fixture không thay thế kiểm thử HTTP/DB, mail, thanh toán hoặc duyệt thật.
