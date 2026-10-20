# FE tích hợp API Long — 20/10/2026

BE đối chiếu: `8f93bf2`. Chỉ cập nhật web FE; không sửa BE, Mobile, tài khoản thật hoặc database.

## Đã tích hợp trên giao diện

| Màn hình | Tích hợp | Điều kiện |
|---|---|---|
| `/manager/farms/:farmId` | GET `/api/system-manager/farms/{farmId}/operational-context` | Kiểm tra phân công, Farm ID và tenant ID. Không gọi GET Farm dành cho tenant để thay thế. |
| Chi tiết Farm | Hiển thị tên, địa chỉ, diện tích, trạng thái, ranh giới đã duyệt, Zones và phiên bản bản đồ đã công bố | Giá trị thiếu được hiển thị là thiếu dữ liệu, không tự suy ra tọa độ tâm. |
| Cập nhật ranh giới Farm | POST `.../boundary/verify` | Chỉ Farm có ranh giới đã duyệt. Gửi đúng Farm version và boundary version number; giữ các interior ring. Farm chưa có ranh giới đi qua khảo sát Baseline. |
| Ngoại lệ ranh giới | POST `.../boundary-exceptions/classify`, GET `.../boundary-exceptions?state=...`, POST `.../{exceptionId}/review` | Kiểm tra điểm thủ công, lọc trạng thái, chấp nhận/loại/sửa tọa độ với lý do, bằng chứng và version đã đọc. |
| `/manager/orders/:orderId` | GET phiên GPS mới và POST start/sync/finalize/abort hiện có | Tiếp tục phiên đã lưu, xem các điểm, nạp JSON GNSS gốc từ drone của phiên. Không tự tạo vị trí, sai số, thời gian đo hoặc dùng vị trí trình duyệt thay GNSS drone. |
| Duyệt đường bay Baseline | POST `.../baseline-route-plans/{routePlanId}/approve` | Phiên đã finalized, ranh giới khớp, dùng Order version hiện hành. Mã/phiên bản kế hoạch được đối chiếu và nhập từ công cụ lập đường bay; chưa có danh sách kế hoạch công khai để FE tự chọn. Không đoán route version. |
| Ranh giới trên ảnh trực giao | POST `.../farm-boundary/mark-orthophoto-corners` | Ở bước `AWAITING_BASELINE_REVIEW`. Nhập đúng bốn tọa độ WGS84 riêng biệt theo thứ tự quanh Farm, cùng tham chiếu ảnh và Order version. Chưa phải công cụ nhấp pixel/vẽ trực tiếp trên ảnh. |
| Trạng thái đơn | Bổ sung `AWAITING_BASELINE_DEPOSIT` | Hiển thị chờ Owner thanh toán cọc; Manager không thanh toán thay Owner. |
| Sửa Farm hiện có | PUT `/api/farms/{farmId}` bỏ `boundary` khỏi JSON gửi đi | Tên, địa chỉ, diện tích, centerPoint và expectedVersion theo hợp đồng mới; ranh giới sửa qua API riêng. |
| Lưu trữ Farm | Cập nhật thông báo điều kiện | Nhắc cả Survey Order chưa kết thúc, bên cạnh Zone và Mission. |

## Thanh toán: cập nhật lớp API, chưa có màn Owner hoàn chỉnh

`initiateSurveyPayment` gọi POST `/api/tenant-owner/survey-orders/{orderId}/payments` với `expectedOrderVersion` và `purpose`:

- `BASELINE_DEPOSIT`: cọc Baseline.
- `FINAL_BALANCE`: phần tiền còn lại.

FE không gửi amount/currency, không tự xác nhận thanh toán và không lấy token Manager để gọi thay Owner. Các số tiền do BE trả về. Chưa có API đọc danh sách/chi tiết đơn, lịch hẹn hoặc thanh toán cho Owner trong controller hiện tại, nên chưa dựng màn thanh toán bằng ID/version nhập tay hay dữ liệu của Manager. Cần read model Owner trước khi nối thao tác từ đơn thực tế.

## Các giới hạn BE vẫn còn

1. **Tọa độ tâm Farm:** `FarmOperationalContextApiResponse` chưa trả `centerPoint`, trong khi PUT nhận toàn bộ thông tin gồm centerPoint. FE vẫn xem Farm và xử lý ranh giới bình thường, nhưng khóa sửa thông tin chung nếu thiếu trường này để không gửi null làm mất tọa độ đã lưu. Khi BE cung cấp trường, form dùng tọa độ và version thực để sửa.
2. **Trạng thái GPS sau cọc:** xác nhận lịch → `AwaitingBaselineDeposit`, trả cọc → `BaselineReady`, nhưng repository mở phiên chỉ chấp nhận `AwaitingBoundaryCapture`. FE không gọi sai trạng thái hoặc giả version để vượt điều kiện. Với đơn mới đã Ready nhưng chưa có phiên, màn hình yêu cầu quản trị kiểm tra. Cần Long thống nhất state machine để chạy trọn nhánh này.
3. **Ảnh trực giao/đường bay:** endpoint ghi đã nối. Chọn ảnh theo georeference và chọn route từ danh sách cần thêm read API tương ứng; hiện form dùng tọa độ WGS84 và tham chiếu kế hoạch được đối chiếu ngoài màn hình.
4. **Migration:** BE có `20261020085745_AddBaselineDepositAndPaymentPurpose`. Database chạy thực tế phải được cập nhật bởi người phụ trách BE. Lượt này không thực hiện migration.

## Chống ghi đè và đồng bộ GPS

- Không tự retry mutation, tăng/đoán version hoặc báo thành công sau lỗi.
- Form giữ snapshot đã mở. Lỗi 401/403/404/409 yêu cầu đóng và tải lại trước khi gửi tiếp; hiển thị lý do BE, errorCode và traceId khi có.
- Điểm GPS giữ clientOperationId, sequenceNumber, sai số và thời gian đo. JSON phải có múi giờ, tọa độ/sai số hợp lệ, không trùng ID/thứ tự hoặc sửa nội dung điểm đã đồng bộ.
- Mỗi lần đồng bộ tối đa 500 điểm. Điểm chưa đồng bộ nằm trong bộ nhớ màn hình; có thông báo trước khi hoàn tất/hủy. Hoàn tất bị khóa khi còn điểm chưa gửi.
- Mã mở phiên giữ nguyên khi thử lại cùng drone, đổi mã khi chọn drone khác. Drone được lấy từ API khả dụng cho Manager theo khoảng thời gian người vận hành chọn.

## Kiểm thử

- TypeScript và production build: đạt.
- Toàn bộ test FE: **92/92 đạt**, không bỏ qua.
- Test API dùng mock fetch: endpoint, bearer, abort signal, payload/version, xung đột, cọc/phần còn lại.
- Test SSR dùng dữ liệu đúng shape BE: Farm context, dữ liệu tâm bị thiếu, ranh giới/Zone/bản đồ, trạng thái cọc/GPS, form 4 góc chỉ xuất hiện đúng bước.
- Chưa xác minh E2E bằng trình duyệt thật, GPS thật, database thật hoặc cổng thanh toán thật. Không kết luận full flow đã chạy được chỉ từ test FE.

## Cách kiểm tra trên web

1. Đăng nhập System Manager đã được phân công → **Nông trại phụ trách** → mở Farm. Xem ranh giới, Zones và bản đồ nền. Nếu API chưa có centerPoint thì sửa thông tin chung bị khóa với lý do rõ ràng.
2. Farm đã có ranh giới → **Cập nhật ranh giới**. Nhập các đỉnh theo thứ tự, lý do, bằng chứng. Thử hai phiên cùng sửa để kiểm tra conflict không ghi đè.
3. **Kiểm tra điểm** → nhập tọa độ và mã bằng chứng. Xem kết quả trong/gần/ngoài ranh giới. Lọc ngoại lệ → **Xét duyệt điểm** → chấp nhận, loại hoặc sửa vị trí.
4. **Đơn khảo sát được giao** → mở đơn Baseline. Nếu BE trả đúng `AWAITING_BOUNDARY_CAPTURE` và lịch đã xác nhận, mở phiên → chọn thời gian, tìm drone → thu thập/nhập GPS → đồng bộ → hoàn tất. Đơn mới bị vướng trạng thái sau cọc sẽ hiển thị giới hạn, không giả lập đi tiếp.
5. Phiên đã finalized → **Duyệt kế hoạch đường bay** với mã/phiên bản kế hoạch thực từ công cụ lập đường bay, khoảng lùi an toàn đã kiểm tra.
6. Đơn ở `AWAITING_BASELINE_REVIEW` → **Đánh dấu 4 góc trên ảnh trực giao** → nhập tọa độ bốn góc và tham chiếu ảnh. Kiểm tra đơn/Farm được tải lại sau lưu.
