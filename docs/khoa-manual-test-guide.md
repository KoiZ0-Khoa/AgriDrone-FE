# Hướng dẫn test thủ công phần Khoa trên WEB

Đối chiếu giao diện và source ngày 12/11/2026. Đây là checklist để chạy với BE thật, **chưa phải báo cáo các bước dưới đây đều đã pass**. Bằng chứng test trước đó xem [báo cáo tích hợp](./khoa-api-integration-2026-11-11.md).

Phạm vi: các bước chuẩn bị đơn cần thiết, bản đồ nền và biến động trụ, Mission PlantHealth, detect bệnh và gửi kết quả sơ bộ. Không bao gồm kiểm duyệt/phát hành bệnh của Phú hoặc các policy MAP/COMBO chưa có contract BE.

## 0. Chuẩn bị

- Mở ba phiên trình duyệt độc lập cho System Admin, System Manager và Owner. Không đăng nhập ba role trong cùng một tab rồi nhầm đơn vị đang chọn.
- Dùng tài khoản được cấp role thật từ BE. Nam chỉ là Manager của Farm nào đã được phân công; tên tài khoản không tự quyết định quyền.
- Bật BE, PostgreSQL đang dùng, RabbitMQ, Redis và MinIO đúng cấu hình local hiện tại. Không tạo database/volume mới chỉ để chạy checklist này.
- Chạy FE từ `D:\FPTU\P9\Project\AgriDrone-FE` bằng `npm.cmd run dev`; mở `http://localhost:5173`.
- BE mặc định có HTTP `http://localhost:5080`; kiểm tra `/health/live` trả thành công. FE development proxy phải trỏ đúng BE đang chạy.
- Với thanh toán local: BE đang chạy, tunnel/webhook IPN còn hoạt động, cấu hình IPN khớp. Chỉ khi BE xác nhận giao dịch thì FE mới được hiện Đã thanh toán. Trang thành công của SePay không thay thế IPN.
- Với bay bệnh: cần ảnh gốc chuyến bay dịch vụ và telemetry hợp lệ, AI service có disease detection, model/provenance/evidence phù hợp trên BE. Ảnh trực giao map có sẵn không thay thế bộ ảnh bay bệnh.
- Không cài/chạy Metashape hoặc bấm Ghép bản đồ trong checklist này. Dùng bản đồ nền/bản nháp đã được tạo từ kết quả có sẵn.
- Tách dữ liệu: dùng Farm test riêng để thêm/dời/loại bỏ trụ; dùng đơn khác cho luồng giá/thanh toán. Ghi lại Farm, đơn và role trước mỗi lượt.

## 1. Chuẩn bị dịch vụ, Manager và đơn khảo sát

Nếu đã có đơn test được phân công đúng Manager thì chuyển đến bước hiện tại của đơn; không tạo lại chỉ để đi đủ từng màn.

| Mã | Vai trò và thao tác | Kết quả cần thấy |
| --- | --- | --- |
| PRE-01 | Admin → Dịch vụ & đơn giá → chọn Plant Health; kiểm tra dịch vụ đang dùng được và có giá hiệu lực | Owner/khách chọn được dịch vụ, giá lấy từ BE |
| PRE-02 | Admin → System Manager → xem hồ sơ người được giao | Hồ sơ hoạt động, sẵn sàng, chứng chỉ đủ điều kiện và chưa hết hạn |
| PRE-03 | Khách gửi đăng ký mới hoặc Owner → Đăng ký khảo sát → chọn Farm hiện có, Plant Health; nhập địa chỉ, diện tích, tọa độ và thời gian tương lai | Yêu cầu được gửi, không bị làm tròn sai tọa độ thập phân; xuất hiện ở inbox Admin |
| PRE-04 | Admin → Yêu cầu khảo sát → Xem yêu cầu → Bắt đầu xét duyệt → Phê duyệt yêu cầu; chọn Manager đủ điều kiện, hoàn thành checklist, nhập lý do | Tạo đơn, đúng Farm/Manager; Owner mới nhận và chấp nhận lời mời nếu áp dụng |
| PRE-05 | Manager → Đơn khảo sát được giao → Xem công việc | Có đúng đơn vừa được giao. Manager khác không có phân công không đọc được dữ liệu đơn |

Nếu approve bị 409, lưu errorCode/traceId, tải lại dữ liệu và kiểm tra lại. Không sửa expectedVersion thủ công hoặc tạo đơn trùng để che lỗi.

## 2. Lịch bản đồ nền và tiền cọc — khi đơn yêu cầu bản đồ nền

1. Manager mở đơn → **Đề xuất lịch khảo sát bản đồ**. Chọn khoảng thời gian tương lai, đúng điều kiện của BE.
2. Owner → **Thanh toán khảo sát** → mở đúng Farm/đơn → kiểm tra lịch.
3. Test đổi lịch trước: Owner bấm **Yêu cầu đổi lịch**, nhập lý do. Manager tải lại đơn: cần có **Owner yêu cầu đổi lịch khảo sát** và **Đề xuất lịch mới**.
4. Manager đề xuất lại; Owner bấm **Xác nhận lịch**.
5. Owner thanh toán **Cọc bản đồ nền** theo số tiền BE trả. Quay lại FE, bấm **Kiểm tra trạng thái** hoặc chờ cập nhật.
6. Đạt khi lịch được xác nhận, lịch sử giao dịch là **Đã thanh toán**, trạng thái đơn chuyển bước theo BE. Pending/Đang xử lý chưa được tính là pass.

Đơn không cần bản đồ nền mới thì bỏ đoạn cọc/bay nền này và làm bước xác minh ranh giới khi FE yêu cầu. Không tự tạo cọc nếu BE không yêu cầu.

## 3. Duyệt và phát hành bản đồ nền có sẵn

1. Dùng Mission/kết quả bản đồ có sẵn đã được gắn đúng Farm và đơn, có ranh giới và danh sách candidate. Nếu chưa có draft thì cần luồng xử lý/import phía BE; FE không thể tự phát sinh từ một ảnh bất kỳ.
2. Manager → **Đơn khảo sát được giao → Xem công việc → Duyệt bản đồ nền**; hoặc **Nông trại phụ trách → Chi tiết → Mở bản đồ nháp**.
3. Nếu bước ranh giới yêu cầu **Đánh dấu 4 góc trên ảnh trực giao**, thực hiện xác minh từ ảnh thật trước; không bịa tọa độ để vượt kiểm tra.
4. Kiểm tra Farm, ảnh, ranh giới, tổng điểm và các điểm chưa duyệt. Thử duyệt một điểm, chỉnh điểm sai và loại bỏ điểm không hợp lệ. Chỉ duyệt hàng loạt sau khi đã đối chiếu dữ liệu.
5. Bấm **Kiểm tra bản đồ**. Xử lý hết lỗi chặn và điểm chưa duyệt.
6. Bấm **Phát hành bản đồ nền → Xác nhận phát hành**.

Đạt: BE trả Published, bản đồ chính thức có đúng trụ được duyệt, đơn chuyển sang bước xác nhận số trụ/giá nếu flow yêu cầu. Không coi QUEUED ở bước xử lý ảnh/GPS là Published.

## 4. Test đủ nhóm UI bản đồ và trụ mới

Manager: **Nông trại phụ trách → Chi tiết → Bản đồ và trụ cây**. Owner: **Nông trại → Chi tiết → Bản đồ và trụ cây**.

MAP-05 đến MAP-09 dùng bản **Published** trên Farm test riêng. Nếu thao tác trên Draft, thay đổi mới nằm ở candidate; cây chính thức chỉ cập nhật khi phát hành.

| Mã | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| MAP-01 | Mở danh sách, tải lại, mở từng phiên bản | Đúng Farm, phiên bản, trạng thái, số trụ và thời điểm; không dùng UUID dài làm tên hiển thị |
| MAP-02 | Manager bật/tắt Hiện bản nháp; Owner mở cùng mục | Manager có tùy chọn, Owner không có và không xem được Draft bằng URL trực tiếp |
| MAP-03 | Mở chi tiết phiên bản | Leaflet hiển thị đúng ranh giới và trụ; ảnh không lệch do đổi lat/lon; chưa tải ảnh phải có thông báo |
| MAP-04 | Bấm một trụ trên bản đồ hoặc nút Lịch sử trụ | Drawer hiện đúng hàng/cột, vị trí và timeline của trụ đã chọn |
| MAP-05 | Manager → Thêm trụ trên ảnh → bấm vị trí → kéo ghim nếu cần → Tiếp tục xác nhận → nhập hàng/cột và lý do | Chưa lưu thì không gửi API; lưu xong xuất hiện trụ, dữ liệu tải lại; kiểm tra manualChanges và lifecycle do BE trả |
| MAP-06 | Bấm trụ vừa thêm trên ảnh → Dời trên ảnh → kéo ghim/bấm điểm mới → Tiếp tục xác nhận → nhập lý do | Đúng trụ được đổi, lịch sử có vị trí trước/sau; tải lại trang vẫn giữ thay đổi |
| MAP-07 | Bấm trụ test trên ảnh → Loại bỏ trụ → nhập lý do → Xác nhận loại bỏ trụ | Hủy không gửi API; lưu thì BE ghi nhận loại bỏ, lịch sử còn tra cứu được |
| MAP-08 | Bỏ trống lý do, nhập hàng/cột sai, nhập điểm ngoài ranh giới hoặc trong vùng lỗ của polygon | FE chặn dữ liệu sai; không gửi mutation cho vị trí ngoài phạm vi, sửa được input để thử lại |
| MAP-09 | Bấm Lưu/Xác nhận nhanh hai lần | Một thao tác ghi; không nhân đôi trụ hoặc lịch sử |
| MAP-10 | Owner mở bản đồ Published và Manager mở Superseded | Không có nút Điều chỉnh trụ; backend cũng phải từ chối mutation trái quyền/trạng thái |
| MAP-11 | Tab So sánh → chọn hai bản đã phát hành khác nhau | Hiện số trụ trước/sau, chênh lệch, các nhóm biến động, tọa độ/đường nối; đối chiếu với dữ liệu hai bản |
| MAP-12 | So sánh khi chỉ có một phiên bản hoặc chọn cùng phiên bản | Có thông báo cần hai phiên bản khác nhau; không gọi compare vô nghĩa |
| MAP-13 | Tab Thống kê | Số trụ, chênh lệch, mật độ khớp BE; thiếu diện tích phải hiện chưa xác định, không bịa mật độ |
| MAP-14 | Owner đọc phiên bản còn khóa thanh toán | Có hướng dẫn thanh toán; không hiện dữ liệu bị BE khóa; sau BE xác nhận đủ tiền thì thử lại |
| MAP-15 | Mở bằng Manager khác/Owner tenant khác, tải lại trang, dùng nút Back; thử 1440px và 390px | Không lẫn cache/tài khoản, không hiện dữ liệu Farm khác; bảng cuộn riêng, modal nhập và nút xác nhận dùng được |

MAP-11 cần **hai phiên bản thật** từ hai đợt mapping. Điều chỉnh thực địa trên bản Published không tự tạo phiên bản mapping thứ hai. Chưa có dữ liệu thì ghi BLOCKED DATA, không đánh pass.

Owner chưa xem được ảnh vì BE trả link localhost MinIO không ký thì ghi riêng lỗi preview; các điểm/ranh giới vẫn phải phản ánh đúng quyền được BE cho phép. Không mở public bucket để né lỗi.

## 5. Xác nhận số trụ/giá, lịch dịch vụ và khoản còn lại

1. Manager mở đúng đơn đã có bản đồ Published → **Xác nhận số trụ và giá**.
2. Đối chiếu số trụ của bản đồ và giá hiệu lực, nhập bằng chứng/tham chiếu mà form yêu cầu, xác nhận. Không tự nhập tổng tiền khác công thức BE.
3. Kiểm tra kết quả trả số trụ, đơn giá, tổng tiền và trạng thái; Owner mở lại đơn cần thấy cùng số tiền.
4. Khi đơn ở `AWAITING_PAID_APPOINTMENT`, Manager bấm **Đề xuất lịch dịch vụ**.
5. Owner mở đơn → **Xác nhận lịch**. Có thể test yêu cầu đổi lịch trước khi tạo giao dịch thanh toán còn hiệu lực.
6. Owner thanh toán **Thanh toán còn lại** theo BE, kiểm tra IPN và lịch sử giao dịch.
7. Đạt khi BE trả `READY_FOR_PAID_SERVICE` cho dịch vụ Plant Health; đây là điều kiện FE hiện nút chuẩn bị bay bệnh. Không đổi trạng thái local để ép hiện nút.

Không cố định tiền cọc/giá/discount theo ví dụ tài liệu; dùng snapshot của đơn thật. Nếu tiền đã chuyển nhưng FE còn Đang xử lý, lưu mã giao dịch và kiểm tra IPN/BE; chưa được đi tiếp như đơn đã paid.

## 6. Bay dịch vụ PlantHealth

1. Manager → **Đơn khảo sát được giao → Xem công việc**.
2. Đơn phải có `surveyServiceCode = PLANT_HEALTH` và `READY_FOR_PAID_SERVICE`. Bấm **Chuẩn bị nhiệm vụ bay · Sức khỏe cây trồng**.
3. Chọn ngày bay **nằm trong lịch dịch vụ Owner đã xác nhận**, chọn Drone khả dụng → **Chuẩn bị nhiệm vụ** → **Xem chi tiết**. Không có Drone thì kiểm tra ngày, năng lực và lịch Drone trên BE.
4. Hoàn thành checklist trước bay, đánh giá điều kiện thực tế, bấm **Hoàn tất checklist**. Checklist không phù hợp phải chặn bước bắt đầu bay theo quy tắc BE.
5. Bấm **Bắt đầu bay** → kiểm tra `IN_FLIGHT`. Đây là ghi nhận workflow; web không tự điều khiển drone cất cánh.
6. Sau khi chuyến bay thực tế kết thúc, bấm **Kết thúc chuyến bay** → `FLIGHT_COMPLETED`.
7. **Upload ảnh/video → Chọn tệp → Tải lên**; kiểm tra số file thành công và thử Xem/tải media.
8. **Decode & Import Telemetry**: chọn log tương ứng chuyến bay, Giải mã, chọn đoạn bay phù hợp, Import telemetry đã chọn. Không dùng log/ảnh của Mission khác.
9. Ở **Hoàn tất upload**, kiểm tra readiness. Nếu có blocker, xử lý theo lý do BE trả; chỉ finalize khi đủ điều kiện.
10. Đạt khi Mission ở `READY_FOR_PROCESSING`, FE hiện phần nhận diện bệnh. Mission bệnh không được hiện thao tác Ghép bản đồ/GPS cây nháp của baseline.

## 7. Nhận diện bệnh và gửi sang kiểm duyệt

1. Tại Mission PlantHealth đã finalize, mở **Nhận diện bệnh và gửi kết quả sơ bộ**.
2. Lượt đầu giữ mặc định: ngưỡng 0.25, ghép trụ 2.5m, bán kính nhóm 5m, tối thiểu 3 cây.
3. Bấm **Chạy nhận diện bệnh** một lần. Network phải gọi POST `/api/missions/{missionId}/farms/{farmId}/disease-detect` tới .NET, không gọi Python trực tiếp.
4. Kiểm tra số ảnh quét, số phát hiện, nhãn nghi ngờ, độ tin cậy, tọa độ và ảnh nguồn. Đối chiếu một vài ảnh thật. Zero detection là kết quả hợp lệ khi detector thành công; không tự thêm bệnh để có số liệu.
5. Bấm **Gửi kết quả sơ bộ sang đơn khảo sát**. Network phải gọi POST `/api/system-manager/farms/{farmId}/missions/{missionId}/plant-health/publish`, không body, có Idempotency-Key.
6. Đạt khi BE chấp nhận và FE hiện **Đã gửi kết quả sơ bộ, chờ kiểm duyệt**. Kiểm tra thêm outbox/RabbitMQ ở BE để xác nhận consumer nhận xử lý; HTTP QUEUED chưa chứng minh consumer đã xử lý xong.

Test thêm: bấm nhanh hai lần chỉ tạo một detect/publish; input sai không gửi; lỗi detect không hiện nút gửi giả; lỗi publish không hiện thành công. Sau timeout phải đối chiếu BE trước khi tạo lượt mới. FE chưa có API đọc lại job/handoff để phục hồi kết quả sau reload; test giới hạn này riêng.

Các lỗi cần gửi đúng bên BE/AI:

- `DetectDiseases.InvalidPurpose`: Mission không phải PlantHealth gắn với đơn.
- `DetectDiseases.CaptureMapRequired`: Mission thiếu/sai snapshot bản đồ Published hoặc ranh giới đã duyệt.
- `DetectDiseases.ProvenanceRequired`: thiếu model registry, metadata hoặc bằng chứng đầu ra cần cho publish.
- Service local chỉ hỗ trợ map/YOLO, không có disease detection: chưa thể chạy end-to-end bệnh.

## 8. Điểm kết thúc và những phần chưa tính pass

- Phần Khoa trong đợt này kết thúc tại **gửi kết quả bệnh sơ bộ, chờ kiểm duyệt**.
- Kiểm duyệt/phê duyệt/phát hành bệnh và hoàn thành đơn sau đó thuộc luồng tiếp theo của Phú; chưa tích hợp trong đợt này. Không kỳ vọng đơn tự Completed sau detect/publish.
- Luồng MAP/COMBO mới, cọc động và giảm giá còn chờ contract BE; không đánh pass theo tài liệu mẫu.
- Chưa đủ hai bản đồ thì test comparison bị BLOCKED DATA; chưa có AI/provenance thì health bị BLOCKED ENV/BE. Tách các trạng thái này khỏi FAIL UI.

## 9. Ghi kết quả

Mỗi case ghi: mã case, role/email, Farm/đơn/Mission/phiên bản đang test, thao tác, expected, actual, PASS/FAIL/BLOCKED, ảnh màn hình nếu cần. Khi có lỗi API: F12 → Network → Preserve log → Fetch/XHR → làm lại một lần → ghi method/path/status và Response errorCode/traceId. Không chia sẻ token, secret key hoặc mật khẩu.

Kết quả trước đợt hướng dẫn: test tự động FE 199/199 và build thành công; smoke UI dùng API fixture. Các lượt BE/DB/AI/payment thật theo tài liệu này cần ghi bằng chứng mới, không kế thừa kết quả mock thành pass E2E.
