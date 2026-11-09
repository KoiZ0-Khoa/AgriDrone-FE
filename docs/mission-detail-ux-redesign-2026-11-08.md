# Kế hoạch — Tái cấu trúc UX trang Nhiệm vụ bay + trang Bản đồ sức khỏe cây

Bối cảnh: tiếp nối [`mission-flight-plan-2026-10-30.md`](./mission-flight-plan-2026-10-30.md) (nhiệm vụ 0-21). Trang `ManagerMissionDetailPage` hiện dồn hết mọi bước (Preflight → Bay → Upload → Telemetry → Finalize → Ghép bản đồ → Ranh giới/YOLO → Publish GPS → GPS cây) vào 1 trang dài, các section hiện/ẩn theo status nhưng không co gọn lại khi đã xong — khó theo dõi đang ở bước nào. Riêng mục "Cây bệnh" (nhiệm vụ 17 trong plan cũ, `[ ]` chưa làm) hoàn toàn chưa có UI/route.

**Quyết định UX (thảo luận với người dùng 2026-11-08):** so 2 phương án người dùng đề xuất (tách Preflight/Bay sang trang Đơn khảo sát — bị loại vì 1 Đơn có thể có nhiều Mission, phá vỡ ranh giới 1-trang-1-mission; hoặc gộp hết vào tab đơn — không thực sự giảm độ dài trang), chọn phương án 3: giữ 1 trang/1 Mission nhưng đổi sang bố cục **Stepper** (bước đã xong tự thu gọn, bước đang làm mở rộng), và tách "Cây bệnh" thành **trang riêng theo Farm** (vì dữ liệu tổng hợp nhiều Mission, không thuộc về 1 Mission).

Người dùng cũng yêu cầu: phần Ghép bản đồ → Ranh giới & YOLO → Publish GPS học theo cách tương tác của `backend/services/metashape-service/map_picker.py` (tab 1 — xem so sánh đã làm trước đó trong hội thoại) nhưng **giữ nguyên bảng màu UI hiện có** (`--mint #0c8c5e`, `--mint-soft`, `--ink`, `--muted`, `--mist`/`--cloud`, nền trắng `resource-panel` bo góc 16px) — không dùng theme tối/cyan của map_picker.

**Ký hiệu trạng thái:** `[ ]` chưa làm · `[~]` đang làm · `[x]` đã xong, đã tự test (typecheck/test/build).

---

## 1. Trang Bản đồ sức khỏe cây (Farm-level) — route + nav + UI đọc dữ liệu
**Trạng thái:** [x] Đã code xong. Tự test: `npm run typecheck` ✓, `npm run build` ✓. Chưa test tay (cần 1 farm đã publish base map qua BE thật).

Hiện thực nhiệm vụ 17 của plan cũ (API đã xác minh từ BE source ở đó, không lặp lại ở đây).

- File mới: `src/features/surveys/plantHealthMapTypes.ts`, `plantHealthMapApi.ts`, `plantHealthMapWorkflow.ts`, `ManagerPlantHealthMapPage.tsx` (đặt tên khác `PlantHealthPage.tsx` hiện có — trang đó là danh mục nhãn bệnh cấp hệ thống cho System Admin, khác hoàn toàn phạm vi).
- API: `GET /api/farms/{farmId}/plant-health-map?tenantId=...` — lấy `tenantId` qua `getFarmContext()` đã có sẵn trong `farmOperationsApi.ts` (không cần đăng nhập theo BE nhưng vẫn gửi token).
- UI: `react-leaflet` — `ImageOverlay` ảnh nền (`baseMap.previewUrl/bounds`), `CircleMarker` theo `healthStatus` (NORMAL=xám trung tính, HEALTHY_FRUIT=mint, DISEASE=đỏ `colorError`), click cây mở `Drawer` xem `observations` (ảnh crop/annotated, độ tin cậy, khoảng cách GPS). Vẽ `zones` bằng component `GeoJSON` của react-leaflet (không vẽ `L.circle` cứng). Panel tổng quan hiển thị `summary` + `diseaseBreakdown`.
- Route: `/manager/farms/:farmId/plant-health` trong `App.tsx`.
- Nav: thêm link "Mở bản đồ sức khỏe cây →" trong `ManagerFarmDetailPage.tsx`, cùng hàng với mục "Duyệt bản đồ nền" đã có (section `workflow-detail-link` pattern có sẵn) — đây là **nút chuyển trang duy nhất** vào trang mới này.
- **Không làm ở bước này** (để riêng, theo đúng nhiệm vụ 18-20 của plan cũ, chưa bắt đầu): duyệt vết bệnh, xử lý vết lệch tọa độ, gộp/chỉnh viền vùng dịch. Trang này chỉ **đọc & hiển thị**.

**Tự test:** `npm run typecheck`, `npm run build`. Test tay cần 1 farm đã publish base map qua nhiệm vụ 15 (ngoài khả năng tự làm — cần BE thật).

---

## 2. `ManagerMissionDetailPage` — bố cục Stepper (thu gọn bước đã xong)
**Trạng thái:** [x] Đã code xong: thêm `<Steps>` (5 bước: Preflight/Bay/Upload & Telemetry/Ghép bản đồ/Ranh giới-YOLO-Publish, tính từ `status`) + component dùng chung `StepSection.tsx` bọc từng section cũ. Mở rộng điều kiện hiển thị của vài section (Preflight/Bắt đầu bay/Kết thúc bay/Telemetry/Hoàn tất upload) để chúng không biến mất hẳn sau khi qua bước mà thu gọn lại, thay vì giữ nguyên hành vi cũ (biến mất khi hết điều kiện). Không đổi mutation/idempotency key/validate nào. Tự test: `npm run typecheck` ✓, `npm test` 181/181 ✓, `npm run build` ✓. Chưa test tay qua từng status với BE thật.

- Thêm `<Steps>` (antd) ngang ở đầu trang, 6 bước: Preflight → Bay → Upload & Telemetry → Hoàn tất upload → Ghép bản đồ → Ranh giới & YOLO/Publish GPS — tính "bước hiện tại" từ `status` (tái dùng các cờ `draft/scheduled/inFlight/postFlight/...` đã có).
- Bọc từng section hiện có bằng 1 wrapper chung `StepSection` (file mới `StepSection.tsx` trong `features/missions/`): bước đã xong + không phải bước đang xem → thu gọn còn 1 dòng tóm tắt + nút "Xem lại"; bước đang hoạt động → mở rộng như hiện tại. Không đổi logic bên trong mỗi section (mutation, idempotency key, validate...), chỉ đổi lớp bọc ngoài.
- Giữ nguyên "GPS cây (lưu nháp)" và "Thao tác khác" ở cuối trang (không thuộc luồng tuần tự chính).

**Tự test:** `npm run typecheck`, `npm test`, `npm run build`. Test tay: đi qua từng status 1 Mission thật, xác nhận Steps/thu gọn đúng, không mất chức năng nào so với bản cũ.

---

## 3. `BoundaryTilingPanel` — học UX map_picker, giữ màu app
**Trạng thái:** [x] Đã code xong: slider độ mờ (`ImageOverlay.opacity`), map cao 560px, banner nổi góc trên trái (điểm/diện tích realtime, nền trắng + viền `--cloud`, không phải nền tối của map_picker), màu viền đổi sang `var(--mint)`, nút khóa viền đổi `type="primary"` khi đã khóa. Tự test: `npm run typecheck` ✓, `npm run build` ✓.

- Thêm slider "Độ mờ ảnh drone" điều khiển `opacity` của `ImageOverlay` (tương tự map_picker, nhưng dùng `Slider` antd + màu `--mint`).
- Tăng chiều cao map (480px → ~560px), thêm banner nhỏ góc trên bản đồ hiển thị điểm vừa thêm/diện tích realtime (nền trắng mờ thay vì nền tối của map_picker).
- Nút khóa viền đổi màu/icon rõ hơn khi khóa (dùng `colorSuccess`/`--mint` thay vì chỉ đổi label).

**Tự test:** `npm run typecheck`, `npm run build`.

---

## 4. `YoloDetectionPanel` — sửa tay kết quả AI (học map_picker)
**Trạng thái:** [x] Đã code xong: Popup trên điểm khuyết (Xác nhận/Xóa điểm khuyết, renumber cột cùng hàng), Popup trên cây active (Xóa cây, renumber), chế độ "Chấm thêm trụ bằng tay" (click map, tự nhận điểm gần 1 vị trí khuyết <~2m thì coi như xác nhận), khối Tag thống kê (số cây active/khuyết/kích thước lưới tính lại từ dữ liệu hiện tại). Mỗi lần sửa gọi lại `onDetected()` nên `yoloResult` ở trang cha (CSV/Publish) luôn khớp. Chưa làm "Tính toán lại toàn bộ hàng/cột" (renumberAllRowsAndColumns của map_picker — xem lý do ở đầu file). Tự test: `npm run typecheck` ✓, `npm test` 181/181 ✓, `npm run build` ✓.

Toàn bộ thao tác dưới đây là **state cục bộ trên FE**, không cần API mới (đúng như map_picker cũng làm thuần client-side) — mỗi lần sửa gọi lại `onDetected(...)` để `yoloResult` ở trang cha (dùng cho Publish GPS) luôn khớp dữ liệu đã sửa tay.

- Click 1 điểm "khuyết cây" (marker nét đứt) → Popup "Xác nhận có cây thực tế" (chuyển sang active) / "Xóa điểm khuyết" (xóa, renumber cột các cây sau trong cùng hàng).
- Chế độ "Chấm thêm trụ bằng tay": bật rồi click map để thêm 1 cây (tự nhận nếu click trúng gần 1 điểm khuyết thì coi như xác nhận điểm đó).
- Mỗi cây đã nhận diện (active) có Popup với nút "Xóa cây" (renumber cột các cây sau trong cùng hàng).
- Thêm khối thống kê: số cây active / số điểm khuyết / kích thước lưới (hàng×cột tính lại từ dữ liệu hiện tại, không dùng `maxRow/maxCol` gốc vì có thể lệch sau khi sửa tay).
- Đổi nút "Tải CSV kết quả cây" (hiện gọi API `yolo-csv`, phản ánh lần `yolo-detect` cuối trên server) sang **sinh CSV phía client** từ `yoloResult` đang có (giống `downloadCurrentTreesCsv` của map_picker) — để khớp đúng các chỗ đã sửa tay, không bị lệch với dữ liệu server.
- **Không làm ở bước này:** "Tính toán lại toàn bộ hàng/cột" (`renumberAllRowsAndColumns` của map_picker) — thuật toán xếp lưới theo anchor/spacing chưa đọc kỹ phần source đó, để tránh đoán sai; ghi lại làm nhiệm vụ riêng sau nếu cần.

**Tự test:** `npm run typecheck`, `npm test`, `npm run build`.

---

## 5. Dọn dẹp CSV ở `ManagerMissionDetailPage`
**Trạng thái:** [x] Đã code xong: bỏ `downloadCsvMutation` (gọi BE `yolo-csv`), thay bằng hàm `downloadTreesCsv()` sinh CSV trực tiếp từ `yoloResult` (đồng bộ, không cần mutation/loading). Hàm `downloadMissionTreesCsv`/`apiRequestFile` vẫn giữ nguyên trong `missionApi.ts`/`client.ts` (hạ tầng chung, không xóa). Tự test: cùng đợt với mục 2 ở trên.

- Bỏ `downloadCsvMutation` (gọi BE), thay bằng hàm tải CSV client-side dùng chung với mục 4 (nhận `yoloResult` hiện có, tạo Blob, không cần mutation/loading state vì là thao tác đồng bộ).

**Tự test:** cùng đợt với mục 4.

---

## 6. `ManagerFarmDetailPage` — danh sách đầy đủ "Nhiệm vụ bay" theo Farm
**Trạng thái:** [x] Người dùng báo không có đường vào `/manager/farms/:farmId/missions/:missionId` cho 1 Mission cụ thể (phải gõ URL tay). Nguyên nhân: đường vào duy nhất trước đó là qua `ManagerOrderDetailPage` → `findMissionsBySurveyOrder()`, vốn suy ra Mission từ Order bằng cách khớp tiền tố `missionCode` (`ORD-{surveyOrderId:N}-...`) — nếu Mission không khớp đúng quy ước này (dữ liệu test, hoặc Order không còn hiển thị đúng ngữ cảnh) thì không có link nào xuất hiện ở bất kỳ đâu trong UI. Đã thêm bảng "Nhiệm vụ bay" trong `ManagerFarmDetailPage` dùng thẳng `getFarmMissions()` (đã có sẵn, không suy luận qua Order) — liệt kê toàn bộ Mission của farm kèm link "Xem →", luôn hoạt động bất kể Mission có gắn đúng Order hay không. Tự test: `npm run typecheck` ✓, `npm test` 181/181 ✓, `npm run build` ✓.

---

## 7. Ảnh ghép bản đồ bị lặp 2 lần + map hiển thị xấu (phản hồi người dùng kèm ảnh chụp màn hình)
**Trạng thái:** [x]

Người dùng báo 2 việc:
- Bước "Ghép bản đồ trực giao" hiện ảnh preview to full-width, rồi bước "Vẽ ranh giới vườn" ngay dưới lại hiện CHÍNH ảnh đó lần nữa trên bản đồ tương tác — dư thừa.
- Bản đồ tương tác (`BoundaryTilingPanel`) hiện ảnh drone nhỏ xíu giữa 1 vùng xám trống rất lớn — do `bounds` trả về từ BE là hình chữ nhật bao quanh cả vùng bay (có thể chéo/không đều so với ảnh thật, xem ảnh người dùng gửi: vệt ảnh thật nằm chéo trong khung chữ nhật lớn), và map không có lớp nền nào bên dưới `ImageOverlay` nên phần còn lại chỉ là màu xám — khác map_picker luôn có `L.tileLayer` (Google Satellite/OSM) làm nền.

Đã sửa:
- `ManagerMissionDetailPage`: khi đã có `bounds` (tức bước ranh giới bên dưới sẽ hiện bản đồ tương tác), bước "Ghép bản đồ" **không hiện ảnh nữa**, chỉ còn 1 dòng ghi chú trỏ xuống bước dưới — thử phương án thumbnail nhỏ (160px) trước nhưng người dùng phản hồi layout xấu (ảnh thật tỉ lệ cao/hẹp nên thumbnail bị kéo cao bất thường, nút "Tải GeoTIFF" bị đẩy lệch do `Space` + phần tử inline trôi nổi) nên bỏ hẳn ảnh thay vì cố chỉnh layout. Khi không có `bounds` (không có bản đồ tương tác để thay thế), vẫn giữ ảnh to như cũ vì đó là cách duy nhất để xem. Nút "Tải GeoTIFF" bọc trong `<div>` riêng để luôn xuống dòng, không còn trôi nổi cạnh phần tử trước.
- Thêm `src/components/MapBaseLayers.tsx` — lớp nền vệ tinh/OSM có thể chuyển qua lại (học đúng ý tưởng map_picker: 2 lớp nền chuyển được), nhưng dùng **Esri World Imagery** thay vì `mt1.google.com` của map_picker vì tile Google Maps không công khai cho dùng trực tiếp ngoài Google Maps JS API (rủi ro ToS); Esri World Imagery là ảnh vệ tinh miễn phí, không cần API key, đã phổ biến trong các dự án leaflet mã nguồn mở. Gắn `<MapBaseLayers />` vào cả 3 map hiện có: `BoundaryTilingPanel`, `YoloDetectionPanel`, `ManagerPlantHealthMapPage`.

Tự test: `npm run typecheck` ✓, `npm test` 181/181 ✓, `npm run build` ✓. Chưa test tay xem map có hiển thị đẹp hơn thật không (cần xem trên trình duyệt với dữ liệu thật).

**2026-11-08 (tiếp):** Người dùng test tay thấy khi zoom sâu để chấm điểm, nền vệ tinh hiện tile "Map data not yet available" lặp khắp màn hình — Esri World Imagery không có ảnh độ phân giải cao ở khu vực nông thôn này quá khoảng zoom nhất định, nên zoom sâu hơn vẫn xin tile ở mức server không có ảnh thật. Đã hạ `maxNativeZoom` của lớp Vệ tinh từ 19 xuống **17** (mức được cộng đồng Leaflet ghi nhận là an toàn gần như toàn cầu cho Esri World Imagery) — Leaflet sẽ ngừng xin tile vượt z17 và tự phóng to tile z17 thật lên thay vì tiếp tục xin (và nhận placeholder) ở z18-19+. Đây là cách khắc phục theo kinh nghiệm chung, không kiểm chứng được bằng dữ liệu phủ sóng thật của Esri tại đúng tọa độ nông trại này — nếu người dùng vẫn thấy placeholder sau khi test lại, cần hạ tiếp `maxNativeZoom` (ví dụ xuống 15-16) hoặc chấp nhận nền trống/mờ ở mức zoom rất sâu, vì lúc đó trọng tâm thao tác là ảnh ortho của chính mission (ImageOverlay, độ phân giải riêng, không phụ thuộc lớp nền) chứ không phải lớp vệ tinh nền. Tự test: `npm run typecheck` ✓, `npm run build` ✓.

---

## 8. Bắt buộc chấm điểm chỉ trong phạm vi ảnh orthophoto, không phải trên nền vệ tinh
**Trạng thái:** [x]

Người dùng yêu cầu: click vẽ ranh giới / chấm thêm trụ chỉ được tính khi click trúng ảnh drone, không được tính khi click ra nền vệ tinh/OSM xung quanh (nền này mới thêm ở mục 7).

- Thêm `isWithinOrthophotoBounds(lat, lon, bounds)` dùng chung trong `missionWorkflow.ts` — so lat/lon với khung `bounds` (minLat/maxLat/minLon/maxLon) của chính ảnh orthophoto.
- `BoundaryTilingPanel` và `YoloDetectionPanel`: `ClickCapture` nhận thêm `bounds` + `onOutsideBounds`, bỏ qua và báo `message.warning(...)` khi click ngoài phạm vi ảnh thay vì âm thầm bỏ qua.
- Giới hạn theo khung chữ nhật `bounds`, chưa theo đúng hình dạng thật (có thể chéo/không đều) của ảnh — vì FE không có dữ liệu alpha/viền thật của ảnh để kiểm tra chính xác hơn; chấp nhận được vì khung `bounds` luôn sát ảnh hơn nhiều so với toàn bộ vùng nền vệ tinh.

Tự test: `npm run typecheck` ✓, `npm test` 181/181 ✓, `npm run build` ✓.

---

## 9. Publish GPS cây bị chặn sau khi tải lại trang (thiếu surveyOrderId) — khắc phục không cần sửa BE
**Trạng thái:** [x]

Người dùng gặp lỗi "Thiếu mã đơn khảo sát (surveyOrderId)..." khi bấm "Đưa vào hệ thống chính thức" sau khi tải lại trang. Nguyên nhân gốc là giới hạn kiến trúc đã biết (xem nhiệm vụ 15, `mission-flight-plan-2026-10-30.md`): System Manager không có API GET 1 Mission đầy đủ, nên `surveyOrderId` chỉ sống trong state `latest` (chỉ có sau 1 mutation trong cùng phiên) — tải lại trang là mất.

Khắc phục **chỉ ở FE, không sửa BE**: `missionCode` của mọi Mission được BE sinh theo công thức cố định `ORD-{surveyOrderId dạng Guid "N" 32-hex không dấu gạch}-{BASE|HEALTH|READY}` (đã xác nhận từ source BE, dùng cho `findMissionsBySurveyOrder` ở nhiệm vụ 11), và `missionCode` thì luôn có sẵn từ GET danh sách missions (sống sót qua tải lại trang). Thêm `surveyOrderIdFromMissionCode()` trong `missionWorkflow.ts` để tách ngược GUID gốc từ `missionCode` (chèn lại dấu gạch đúng vị trí chuẩn). `publishPlantGpsMutation` giờ ưu tiên `latest.surveyOrderId` (nếu còn trong phiên), mất thì tự suy từ `mission.missionCode`; chỉ báo lỗi như cũ khi cả 2 đều không có (ví dụ mission không theo đúng quy ước).

Tự test: `npm run typecheck` ✓, `npm test` 183/183 ✓ (thêm 2 test cho `surveyOrderIdFromMissionCode` trong `tests/mission-plant-gps-publish.test.mjs`) ✓, `npm run build` ✓. Chưa test tay với BE thật (cần publish sau khi tải lại trang để xác nhận).

---

## 10. Set ranh giới farm ngay trong lần publish GPS cây đầu tiên (giải quyết gốc rễ nhiệm vụ 9)
**Trạng thái:** [x]

Đọc kỹ contract thật `ReplaceMissionPlantGpsRequest.cs` (BE) phát hiện: API `POST .../plant-gps` vốn đã hỗ trợ sẵn field tùy chọn `boundary` (≥3 điểm `{longitude, latitude}`) — khi có, BE tự so với ranh giới đã duyệt hiện tại của farm (tự đọc version mới nhất tại thời điểm xử lý qua `VerifyFarmBoundaryCommand`, FE không cần tự quản version) và set/cập nhật `farm.farm_boundaries`. Đây chính là cách khắc phục gốc rễ cho vấn đề nhiệm vụ 9 (farm chưa có boundary → publish GPS bị kẹt dead-letter) — không cần sửa BE.

- `missionTypes.ts`: thêm `MissionPlantGpsBoundaryPoint`.
- `missionApi.ts`: `replaceMissionPlantGps()` nhận thêm tham số tùy chọn `boundary`.
- `missionWorkflow.ts`: thêm 3 mã lỗi `FarmZone.BoundaryOutsideFarm` / `Farm.BoundaryConcurrentModification` / `Farm.UnmappedFarmBoundaryRequiresCaptureSession` vào `missionError()`.
- `ManagerMissionDetailPage.tsx`: thêm `farmContextQuery` (đọc `getFarmContext`, cùng queryKey với trang Farm nên cache dùng chung) để biết farm đã có `approvedBoundary` chưa. Trong `publishPlantGpsMutation`, **chỉ** gửi kèm `boundary` (lấy từ `boundaryPolygon` đã vẽ ở bước Ranh giới) khi: mission đúng `BaselineMapping` **và** farm hiện chưa có boundary — tránh gửi lại mỗi lần publish, tránh vô tình ghi đè ranh giới farm bằng polygon vẽ hơi khác ở lần chạy YOLO lại. Hiện alert báo trước khi farm sắp được set boundary, và alert kết quả `boundaryId`/`boundaryVersionNumber` sau khi thành công.
- Không đổi cách **cập nhật** ranh giới farm về sau — vẫn dùng nút "Cập nhật ranh giới" sẵn có ở trang Farm (`FarmBoundaryModal` → `/boundary/verify`), không biến `plant-gps` thành kênh update chính thức lâu dài.

Tự test: `npm run typecheck` ✓, `npm test` 185/185 ✓ (thêm 2 test trong `tests/mission-plant-gps.test.mjs`) ✓, `npm run build` ✓. Chưa test tay với BE thật — cần thử lại đúng farm/mission đã kẹt ở nhiệm vụ 9 (sau khi F5 để tạo Idempotency-Key mới).

**2026-11-08 (tiếp) — người dùng test tay, vẫn dead-letter với đúng lỗi cũ:** Tra lại outbox/RabbitMQ y hệt cách ở nhiệm vụ 9, `farm.farm_boundaries` vẫn 0 dòng → `boundary` đã **không được gửi kèm**. Nguyên nhân: `isBaselineMapping` dùng `latest?.purpose`, mà `latest` chỉ có trong cùng phiên (giống hệt lỗ hổng `surveyOrderId` ở nhiệm vụ 9) — sau khi F5 để lấy Idempotency-Key mới (đúng như hướng dẫn ở nhiệm vụ 9), `latest` rỗng nên `isBaselineMapping` sai thành `false`, bỏ qua luôn việc gửi `boundary`, và cảnh báo "Nhiệm vụ này không phải Khảo sát bản đồ nền" cũng bị ẩn sai (vì cùng điều kiện). Đã sửa: thêm `isBaselineMappingMissionCode()` trong `missionWorkflow.ts` — đọc hậu tố `missionCode` (`-BASE`/`-HEALTH`/`-READY`, luôn có sẵn từ `GET .../missions`) làm fallback giống `surveyOrderIdFromMissionCode()`; `isBaselineMapping` giờ ưu tiên `latest.purpose`, mất thì suy từ `missionCode`. Áp dụng fix này cho cả điều kiện gửi `boundary` lẫn Alert cảnh báo purpose (trước đó dùng riêng `latest?.purpose` nên bị ẩn sai luôn). Tự test: `npm run typecheck` ✓, `npm test` 186/186 ✓, `npm run build` ✓. Người dùng cần F5 lại trang và publish lại (2 message trước đã dead-letter, cần 1 message mới) để test tay lần nữa.

**2026-11-08 (tiếp) — lỗi hiển thị tiếng Anh thô "The farm boundary has been updated by another operation":** Soát lại đúng mã lỗi trong `FarmError.cs` thì phát hiện tôi gõ sai 2 mã khi thêm bản dịch ở nhiệm vụ 10: mã thật là `FarmBoundary.ConcurrentModification` (không phải `Farm.BoundaryConcurrentModification`) và `FarmBoundary.UnmappedRequiresCaptureSession` (không phải `Farm.UnmappedFarmBoundaryRequiresCaptureSession`) — nên `missionError()` không khớp được, rơi về hiển thị message gốc tiếng Anh từ BE. Đã sửa đúng theo source. Đồng thời tra `VerifyFarmBoundaryCommandHandler.cs` thấy lỗi này có 2 nguồn: (a) version ranh giới gửi lên không khớp version hiện tại, (b) `catch (DbUpdateException)` khi `SaveChangesAsync` — khả năng cao là race: 2 request cùng tính `nextVersionNumber = max+1` cùng lúc thì request thua bị DB constraint chặn, map chung vào lỗi này. Đã xác nhận `farm.farm_boundaries` vẫn 0 dòng và không có audit log `VERIFY_BOUNDARY` nào mới — tức lần publish đó chưa tạo được gì, không phải dữ liệu bị hỏng nửa chừng. Đây là khả năng ở phía BE (tính `nextVersionNumber` không khóa đúng), không sửa vì người dùng đã yêu cầu không đụng BE — khuyến nghị người dùng thử publish lại 1 lần sạch (không bấm nhiều lần liên tiếp); nếu vẫn lỗi ở mọi lần thử thì cần báo đội BE kiểm tra `VerifyFarmBoundaryCommandHandler`. Tự test: `npm run typecheck` ✓, `npm test` 186/186 ✓, `npm run build` ✓.

---

## Thứ tự làm & bàn giao

Làm theo đúng thứ tự 1 → 5. Sau mỗi mục: tự chạy `npm run typecheck` / `npm test` / `npm run build`, cập nhật trạng thái trong file này, rồi báo người dùng để họ test tay trước khi sang mục tiếp theo (theo thói quen đã thống nhất trước đó trong dự án).
