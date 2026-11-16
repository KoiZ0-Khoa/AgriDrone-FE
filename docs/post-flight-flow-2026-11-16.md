# Luồng khảo sát và thanh toán sau bay

Cập nhật ngày 16/11/2026, đối chiếu BE `3bb3f68` và tài liệu
`PAYMENT_WORKFLOW_MAP_AND_COMBO_GUIDE (2).md` ngày 16/11/2026.

FE sử dụng một luồng: **cọc → bay → duyệt kết quả → chốt số trụ và giá → thanh toán còn lại → mở kết quả**.
Các hướng dẫn ngày 13/11 về chốt giá và thanh toán trước chuyến bay dịch vụ không còn áp dụng cho đơn mới.

## Phạm vi

- Dùng pipeline Plant Health/Combo hiện có với đơn mới được BE bật thanh toán sau bay.
- Hỗ trợ khảo sát lần đầu và khảo sát lại trên Farm đã có bản đồ.
- Không chuyển đổi đơn cũ bằng cách sửa cờ, giá, chứng từ hoặc trạng thái trong database. Tạo đơn mới để test flow này.
- MAP/COMBO thuộc `ContractScope.V3` vẫn chưa có runtime capture/funding/release hoàn chỉnh trong BE. FE không chuyển những đơn đó sang pipeline Plant Health để chạy thanh toán.

## 1. System Admin chuẩn bị giá và nhân sự

Vào **Dịch vụ & đơn giá → Đặt đơn giá**:

- Nhập giá bản đồ nền và giá khảo sát sức khỏe, mỗi giá là số nguyên VND dương.
- FE gửi `mappingPricePerPole`, `plantHealthPricePerPole` và `amountPerPole` bằng tổng hai giá, kèm `expectedServiceVersion` đang đọc.
- Giá được lưu vào đơn khi Admin duyệt yêu cầu; chỉnh bảng giá sau đó không thay giá của đơn đã duyệt.
- Cấu hình cọc lớn hơn 0, kể cả đơn khảo sát lại. Mức cọc 0 không cho duyệt đơn mới.
- Cấu hình giảm giá Combo từ 0 đến dưới 100%, tối đa hai chữ số thập phân. BE lưu mức giảm của đơn tại approval.
- Kiểm tra Manager đủ điều kiện và drone/preflight theo quy trình vận hành.

## 2. Owner gửi yêu cầu, Admin duyệt

Owner gửi yêu cầu cho Farm mới hoặc Farm hiện có. Admin review, chọn Manager và duyệt.
Sau approval, kiểm tra đơn trong **Đơn khảo sát & thanh toán** và **Đơn khảo sát được giao**.

## 3. Khảo sát lần đầu: bản đồ nền

1. Manager đề xuất lịch bản đồ nền; Owner xác nhận.
2. Owner trả cọc. Lịch sử phải được BE xác nhận `PAID`; quay về từ cổng thanh toán không tự xác nhận tiền.
3. Manager chuẩn bị nhiệm vụ, hoàn tất preflight, bay và upload/xử lý ảnh.
4. Manager xác minh ranh giới, duyệt và phát hành bản đồ nội bộ.
5. BE mới chuyển đơn sang `AWAITING_PAID_APPOINTMENT`; **chưa chốt hóa đơn Combo**. Manager tiếp tục lên lịch bay bệnh trên cùng đơn. Đơn test trước bản cập nhật có thể còn `AWAITING_PRICING` với `serviceReviewedAt=null`; BE vẫn hỗ trợ lên lịch ở bước này.

Việc tạo lại map không nằm trong thay đổi FE này. Khi test bằng map đã chuẩn bị sẵn, dùng quy trình import có kiểm soát của project.

## 4. Khảo sát lại

1. Tạo đơn mới trên Farm đã có bản đồ được BE chấp nhận.
2. Manager xác minh boundary/scope dựa trên bản đồ hiện có; đơn chuyển sang chờ lịch dịch vụ.
3. Manager lưu lịch bay bệnh, BE xác nhận lịch dưới tên Manager. Owner không cần xác nhận.
4. Owner có thể trả cọc trước hoặc sau khi lên lịch. Nếu chưa trả, đơn ở `AWAITING_BASELINE_DEPOSIT` và có thể thanh toán với lịch `PAID_SERVICE`; không yêu cầu lịch bản đồ nền hoặc ngày bay còn trong tương lai. Đủ cọc và lịch thì BE đưa đơn sang `READY_FOR_PAID_SERVICE`.

## 5. Lịch dịch vụ và chuyến bay bệnh

Manager vào **Đơn khảo sát được giao → Xem công việc → Lên lịch bay bệnh**.
Thống nhất ngày với Owner trước khi lưu. BE trả lịch `CONFIRMED`; Owner chỉ xem lịch. Khi đủ cọc và điều kiện vận hành, Manager chuẩn bị Mission `PlantHealth` riêng, dùng map Baseline đã phát hành.
Ngày được gửi nguyên dạng `scheduledDate` theo giờ Việt Nam. Ngày đã qua bị chặn; nếu chọn hôm nay, BE điều chỉnh giờ bắt đầu thành hiện tại + 5 phút khi còn đủ thời gian trong ngày.

BE trả thêm `serviceReviewedAt` ở:

`GET /api/system-manager/survey-orders/{orderId}/boundary-scope`

| Trạng thái | serviceReviewedAt | Thao tác FE |
| --- | --- | --- |
| AWAITING_PRICING trước review từ bản BE trước | null | Lên lịch bay bệnh |
| AWAITING_PAID_APPOINTMENT | null | Lên lịch bay bệnh |
| AWAITING_PRICING sau review bệnh | Có thời điểm hợp lệ | Xác nhận số trụ và giá |
| AWAITING_PRICING nhưng response thiếu trường | Không có field | Báo cần cập nhật BE, không đoán bước tiếp theo |

API danh sách Manager trả `currentAppointmentPurpose`. FE giữ nguyên lịch BE trả; không xóa ID/version của lịch đã xác nhận dựa trên trạng thái đơn. Thiếu mục đích lịch hoặc mục đích không khớp thì chặn gửi và yêu cầu tải lại.

- Chưa có lịch dịch vụ: gửi null ID/version.
- Lịch dịch vụ cũ `PROPOSED`: hiện **Chốt lịch bay bệnh**, gửi đúng ID/version để Manager tiếp nhận và chốt lịch. BE có thể giữ ID khi cùng khung giờ hoặc tạo revision mới khi đổi khung giờ.
- Lịch `CONFIRMED`: không tạo thêm. Lịch bản đồ nền vẫn cần Owner xác nhận, lịch bệnh chỉ hiển thị để Owner xem; không có nút xác nhận/đổi lịch ở màn Owner.
- Sau mỗi thao tác, FE tải lại đơn/scope, dùng trạng thái và version do BE trả. Lưu lịch bệnh không tự xác nhận cọc hoặc bỏ kiểm tra preflight.

## 6. Duyệt kết quả và chốt hóa đơn

Upload/AI nhận diện xong chưa đủ để thu tiền cuối. Manager phải review, approve và publish kết quả nội bộ bằng luồng kiểm duyệt của hệ thống.
Sau đó BE ghi `ServiceReviewedAt`, đưa đơn về `AWAITING_PRICING`.

Manager xác nhận số trụ và giá. Request chỉ gồm version đơn, version bản đồ và bằng chứng; không tự nhập count hoặc số tiền.

Hóa đơn từ BE gồm:

- Số trụ bản đồ, đơn giá bản đồ, thành tiền bản đồ.
- Số trụ trong phạm vi khảo sát sức khỏe, đơn giá và thành tiền sức khỏe.
- Giảm giá Combo, tổng sau giảm, cọc và khoản còn lại.

Số trụ Health gồm cả trụ khỏe và nghi bệnh trong phạm vi, không phải số findings bệnh.
FE hiển thị dữ liệu BE đã chốt; không nhân một số trụ với giá gộp để tính lại tổng.

## 7. Owner thanh toán cuối và nhận kết quả

1. Sau chốt giá, đơn ở `AWAITING_PAYMENT`.
2. Owner thanh toán khoản còn lại trong **Đơn khảo sát & thanh toán**.
3. Không yêu cầu lịch bay còn trong tương lai: chuyến bay đã diễn ra trước bước này.
4. Giao dịch đang xử lý được giữ lại, không tạo thêm khi hết hạn hoặc chỉ vì reload trang.
5. BE xác nhận callback/IPN hoặc Admin đối soát. Owner bấm kiểm tra trạng thái hoặc chờ trang cập nhật.
6. Nếu số dư bằng 0, vẫn bấm **Hoàn tất số dư 0**. Không mở `about:blank` hoặc tạo checkout thu thêm.
7. BE hoàn tất đơn và mở kết quả. Review nội bộ trước thanh toán không đồng nghĩa Owner đã được xem kết quả.

## Kiểm tra hồi quy

- Sau bản đồ lần đầu: chỉ có nút lịch dịch vụ, chưa có nút chốt giá.
- Sau review bệnh: có nút chốt giá, không còn nút đề xuất lịch.
- Owner vẫn xác nhận lịch Baseline; lịch bệnh đã xác nhận chỉ có thông tin để xem, không có nút Owner xác nhận/đổi lịch.
- Manager chốt lại được lịch bệnh `PROPOSED` từ code cũ bằng đúng ID/version; lịch `CONFIRMED` không hiện nút tạo trùng.
- Follow-up trả được cọc trước lịch và sau khi Manager đã lưu lịch, không bị yêu cầu lịch Baseline hoặc ngày bay còn hạn.
- Owner trả tiền cuối khi lịch đã qua hoặc API không trả lịch hiện tại.
- Hai count khác nhau vẫn hiển thị đúng hóa đơn từ BE; giảm giá và cọc không bị trừ hai lần.
- PROCESSING/PAID không tạo checkout trùng; trả về từ cổng không tự đánh dấu thành công.
- Khi số dư 0, BE tất toán và FE không điều hướng sang cổng.
- Sau tất toán, kiểm tra đơn `COMPLETED` và Owner đọc được kết quả thật từ API.

## Giới hạn cần kiểm thử với BE thật

- Test logic và SSR không thay thế việc kiểm thử trình duyệt, PostgreSQL, AI, MinIO và IPN SePay thật.
- Migration BE `20261116090000_AllowManagerScheduledPlantHealthAppointments` phải được áp dụng trước khi dùng lịch Manager chốt. Lần cập nhật FE này không chạy migration, không sửa BE hoặc dữ liệu.
- BE vẫn chặn tạo trùng lịch dịch vụ đã `CONFIRMED`. Nếu cần đổi thời gian, liên hệ Manager/người phụ trách BE theo quy trình được hỗ trợ; FE không tự sửa DB hoặc hủy lịch.
- Phần UI kiểm duyệt kết quả bệnh phải có đủ thao tác của luồng review; AI chạy xong không được thay bằng bằng chứng duyệt giả.
- Thay đổi này không chạy migration, sửa dữ liệu đơn cũ hoặc giao dịch thật.

## Kết quả kiểm tra của lần cập nhật này

- FE: `npm.cmd run build` đạt, gồm TypeScript và Vite. `npm.cmd test` đạt 217/217 test logic, API mock và SSR sau cập nhật lịch Manager chốt.
- Bao phủ First Combo sau phát hành map, Follow-up trả cọc trước/sau lịch bệnh, tiếp nhận lịch `PROPOSED` cũ bằng đúng version, chặn tạo trùng lịch đã xác nhận, mục đích lịch bị thiếu, ngày theo giờ Việt Nam, giữ xác nhận lịch Baseline và hóa đơn sau review.
- Test proxy dùng hai HTTP server giả lập trên localhost; lần chạy cuối được phép kết nối loopback. Không gọi thanh toán hoặc thay đổi đơn thật trong test.
- Đối chiếu BE commit `3bb3f68`: đã có `serviceReviewedAt`, `currentAppointmentPurpose`, chọn lịch theo purpose và Manager chốt lịch Plant Health. BE working tree không bị thay đổi bởi lần cập nhật FE này.
- Không có cấu hình lint riêng trong package FE; chưa đo coverage.
- `git diff --check` đạt. Chưa thực hiện E2E trên trình duyệt với database, AI, MinIO và thanh toán thật. Chưa commit hoặc push thay đổi.

## Kiểm tra Development và test tiếp

Đã chỉ đọc database lấy từ cấu hình Development ngày 16/11: chưa có migration `20261116090000_AllowManagerScheduledPlantHealthAppointments`. Đơn CAMAU 2 `fd95d9e9-4a39-42da-b72b-c39fb494c5ec` còn `AWAITING_PRICING`, có 74 trụ, `serviceReviewedAt=null`; lịch Baseline `CONFIRMED`, lịch `PAID_SERVICE` vẫn `PROPOSED`. Không sửa dữ liệu hoặc áp dụng migration trong tác vụ này.

1. Nhờ người phụ trách BE áp dụng migration lịch Manager chốt vào đúng DB Development, rồi chạy lại API có commit mới. Không dùng thay đổi trạng thái DB để thay bước này.
2. Manager mở đơn CAMAU 2 và tải lại. Kiểm tra API trả `currentAppointmentPurpose=PAID_SERVICE` và đúng ID/version lịch đang `PROPOSED`.
3. Bấm **Chốt lịch bay bệnh**, chọn ngày còn hiệu lực theo giờ Việt Nam, lưu một lần. BE trả `CONFIRMED`; với cọc đã PAID, đơn sang `READY_FOR_PAID_SERVICE`.
4. Owner tải lại đơn: thấy ngày bay bệnh và thông báo Manager đã chốt, không có nút xác nhận/đổi lịch dịch vụ.
5. Manager chuẩn bị Mission PlantHealth trên cùng đơn; tiếp tục các bước drone/preflight, bay, upload, AI và review. Sau review mới chốt số trụ/giá rồi Owner thanh toán còn lại.
6. Với Follow-up mới chưa cọc: kiểm tra trả cọc được khi chưa có lịch ở bước xác minh/chờ lịch, hoặc khi đã có lịch bệnh `CONFIRMED` và đơn chờ cọc. Lịch Baseline của First Combo vẫn cần Owner xác nhận trước khi trả cọc ở bước tương ứng.
