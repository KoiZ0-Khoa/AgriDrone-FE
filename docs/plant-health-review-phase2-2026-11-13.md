# Kế hoạch FE — Giai đoạn 2: Xem bản đồ & tiến hành đánh giá (Review) sức khỏe cây

Nguồn: `AgriDrone Docs (2).md` (người dùng cung cấp 13/11/2026), mục "GIAI ĐOẠN 2" (2.1–2.11, phần Phú). Tiếp nối nhiệm vụ 17–20 của [`mission-flight-plan-2026-10-30.md`](./mission-flight-plan-2026-10-30.md) — tài liệu này thay thế 18–20 ở đó và bổ sung nhóm API theo đơn khảo sát.

Mốc đối chiếu: FE `bfe547f`, BE `fda57ec`. Contract dưới đây lấy từ controller/DTO thật của BE (`PlantHealthReviewController.cs`, `PlantHealthReviewContracts.cs`, `SystemManagerSurveyResultsController.cs`, `IPlantHealthReviewService.cs`), **không** chép payload mẫu trong tài liệu.

**Ký hiệu:** `[ ]` chưa làm · `[~]` đang làm / đã code, chưa đủ kiểm chứng · `[x]` đã code và tự test (typecheck/test/build) · thêm "đã test tay" khi người dùng xác nhận với BE thật.

**Cách làm:** mỗi lần một task. Xong task nào thì tự test, cập nhật trạng thái + ghi chú ngay tại task đó, rồi bàn giao cho người dùng test tay trước khi sang task kế tiếp.

## Bảng tiến độ

| # | Task | Mục tài liệu | Trạng thái |
| --- | --- | --- | --- |
| A0 | Bản đồ sức khỏe cây (chỉ đọc) | 2.1 | [x] có sẵn, chưa test tay |
| A1 | API + types nhóm theo farm | 2.5–2.7, 2.9–2.11 | [x] |
| A2 | Duyệt vết bệnh/trái trên trụ (UC-28) | 2.5 | [ ] tạm hoãn — BE chặn với dữ liệu mới (xem Rủi ro 0) |
| A3 | Hiển thị vết lệch tọa độ (UC-29, đọc) | 2.6 | [ ] |
| A4 | Xử lý vết lệch: SNAP / tạo trụ / bỏ qua (UC-29) | 2.7 | [ ] |
| A5 | Chọn vùng bệnh + xem cây thành viên (nền cho A6–A8) | 2.1 | [ ] |
| A6 | Thêm/bớt cây thành viên vùng bệnh (UC-30c) | 2.11 | [ ] |
| A7 | Chỉnh viền vùng bệnh (UC-30b) | 2.10 | [ ] |
| A8 | Gộp vùng bệnh (UC-30a) | 2.9 | [ ] |
| B1 | API + types nhóm theo đơn khảo sát | 2.2–2.4, 2.8 | [x] |
| B2 | Trang review theo đơn + tóm tắt tiến độ | 2.2 | [x] chưa test tay |
| B3 | Danh sách findings (phân trang, lọc) | 2.3 | [x] chưa test tay |
| B4 | Review findings: Reject / NonDisease / Approve (đơn lẻ + hàng loạt) | 2.4 | [x] chưa test tay |
| B5 | Review findings: Correct (sửa loại bệnh / cây / vị trí) | 2.4 | [x] chưa test tay |
| B6 | Ngoại lệ ranh giới: danh sách + xử lý | 2.8 | [ ] |
| B7 | Review vùng bệnh + chọn hướng dẫn theo đơn (chưa có trong tài liệu, nhưng BE bắt buộc nếu có vùng) | — | [ ] đã chốt làm |
| C1 | Kiểm thử tổng Giai đoạn 2 | — | [ ] |

Thứ tự (đổi 13/11 theo yêu cầu người dùng sau phát hiện ở Rủi ro 0): A1 → **B1 → B2 → B3 → B4 → B5 → B6** → (B7 nếu cần) → A5 → A6 → A7 → A8 → C1. A2/A4 chỉ làm nếu cần hỗ trợ dữ liệu cũ; A3 (hiển thị vết lệch, chỉ đọc) vẫn làm được.

---

## Nhóm A — theo farm (`/manager/farms/:farmId/plant-health`)

Gốc route BE: `api/system-manager/farms/{farmId}/plant-health/...`, policy SystemManager. Sau mọi API ghi thành công: invalidate `['farm-plant-health-map', farmId]` (và danh sách flagged ở A3) để bản đồ vẽ lại — không tự suy luận màu/trạng thái ở FE.

### A0. Bản đồ sức khỏe cây (2.1) — [x]
Đã có: `ManagerPlantHealthMapPage.tsx`, `plantHealthMapApi.ts`, `plantHealthMapTypes.ts`, `plantHealthMapWorkflow.ts`. Hiển thị ảnh nền, trụ tô màu theo `healthStatus`, vùng bệnh bằng GeoJSON, Drawer xem observation. Chưa test tay với farm có dữ liệu bệnh thật.

### A1. API + types nhóm theo farm — [x]

**Đã làm (13/11/2026):**
- `src/features/surveys/plantHealthReviewTypes.ts`, `plantHealthReviewApi.ts`: 6 hàm `reviewPlantObservation`, `getFlaggedObservations`, `resolveFlaggedObservation`, `mergeDiseaseZones`, `updateDiseaseZoneBoundary`, `updateDiseaseZoneMemberships` + `closePolygon`. Mỗi hàm kiểm tra id trong response khớp id đã gửi; chỉ gửi đúng trường của action (`resolve-flag`), bỏ `correctedConditionCode` khi Bác bỏ; tự khép kín polygon, chặn < 3 điểm, < 2 vùng khi gộp, và thay đổi thành viên rỗng — các trường hợp này không gọi BE.
- `plantHealthMapWorkflow.ts`: thêm `plantHealthReviewError` (dịch 19 mã lỗi thật của 6 handler + `*.FarmAccessDenied`) và `parseMatchingParameters` (khóa snake_case `class_name`, `image_name`, `crop_image_url`, `annotated_image_url`, `detection_id`; JSON hỏng → `null`).
- `apiRequest` sẵn có đã chạy được PATCH và 201 (chỉ chặn `!response.ok`), không cần sửa.
- Tự test: `tests/plant-health-review.test.mjs` 11 test ✓; toàn bộ `npm test` 221/221 ✓; `npm run build` (gồm typecheck) ✓. Chưa có UI nên chưa có gì để test tay — kiểm chứng thật bắt đầu từ A2.

**Phát hiện khi đọc BE, ảnh hưởng task sau:**
- `correctedConditionCode` được BE tra trong bảng `plant.plant_conditions` theo cột `code` (uppercase) — **không** phải tên lớp AI như `Disease_Sun_Burn` như ví dụ tài liệu. A2 cần lấy danh sách mã từ catalog thật.
- `plant-health-map` lọc bỏ observation `REJECTED` (`review_status <> 'REJECTED'`) nhưng không trả trạng thái duyệt; observation đã CONFIRMED và chưa duyệt trông giống nhau. Ghi nhận cho A2.
- Thêm mã lỗi tài liệu chưa có: `ResolveFlagged.InvalidAction`, `ResolveFlagged.NoDetectedLocation` (vết lệch không có tọa độ thì không tạo trụ được), `GetFlaggedObs.FarmAccessDenied`.

**Phạm vi ban đầu:**
- File mới `plantHealthReviewApi.ts` + `plantHealthReviewTypes.ts` (cạnh `plantHealthMapApi.ts`), 6 hàm:
  - `PUT observations/{observationId}/review` — body `{ decision, reason, correctedConditionCode? }` → `{ observationId, newStatus, resolvedPlantId, reason }`.
  - `GET flagged-observations` → `{ farmId, count, items[] }`; item: `observationId, missionId, detectedLat?, detectedLon?, gpsDistanceMeters?, detectionConfidence?, matchingParametersJson?, suggestedPlantId?` — **mọi trường số đều nullable** ở BE.
  - `POST observations/{observationId}/resolve-flag` — body `{ action, targetPlantId?, newPlantCode?, zoneId?, reason }`; trả 200, riêng `CREATE_NEW_PLANT` trả **201**.
  - `POST disease-zones/merge` — `{ zoneIds, mergedGeometry }` → `{ mergedZoneId, totalTrees, mergedZoneCount }`.
  - `PUT disease-zones/{zoneId}/boundary` — `{ newGeometry }` → `{ zoneId, geometryGeoJson, totalEnclosedTrees }`.
  - `PATCH disease-zones/{zoneId}/memberships` — `{ addPlantIds, removePlantIds }` → `{ zoneId, totalEnclosedTrees, addedCount, removedCount }`.
- Bảng dịch mã lỗi trong `plantHealthMapWorkflow.ts`: `ReviewObservation.*`, `ResolveFlagged.*` (`TargetPlantRequired`, `TargetPlantNotFound`, `OutsideBoundary`, `PlantCodeExists`, `NotPending`), `MergeZones.*`, và `*.InvalidStatus` của chỉnh viền/thành viên. Đọc lại handler để lấy đủ mã trước khi viết.
- Kiểm tra `apiRequest` xử lý được 201 và PATCH.
- Hàm parse an toàn `matchingParametersJson` (lấy `class_name`, `crop_image_url`; JSON hỏng → null).
- **Test:** `tests/plant-health-review.test.mjs` — đường dẫn, method, body từng hàm; parse JSON hỏng.

### A2. Duyệt vết bệnh/trái trên trụ — UC-28 (2.5) — [ ]
- Trong Drawer trụ: mỗi observation thêm nút **Xác nhận** / **Bác bỏ**, mở form bắt buộc nhập lý do; khi Xác nhận cho chọn thêm `correctedConditionCode` (tùy chọn).
- `decision` gửi đúng `CONFIRMED` / `REJECTED`.
- Chống bấm đôi; lỗi hiển thị theo bảng dịch; thành công → làm mới bản đồ, Drawer hiển thị dữ liệu mới của đúng trụ đó (hiện `selectedPlant` là bản chụp cũ trong state — đổi sang lưu `plantId` rồi tra lại từ query).
- **Cần kiểm tra khi làm:** response `plant-health-map` hiện không có trạng thái duyệt của từng observation (FE type chỉ có `className`, `confidence`…). Đọc handler `GetFarmPlantHealthMap` xem observation đã CONFIRMED có còn trả về và có phân biệt được không; nếu không phân biệt được thì ghi nhận là thiếu sót BE, không tự dựng trạng thái ở FE.
- Nguồn danh sách mã cho `correctedConditionCode`: xác định từ BE (catalog `GET /api/catalog/plant-health` hay tên lớp AI như `Disease_Sun_Burn`) trước khi dựng dropdown.
- **Test tay:** Xác nhận 1 vết trên trụ NORMAL → trụ chuyển đỏ; Bác bỏ → vết biến mất, trụ về xanh nếu không còn vết khác.

### A3. Hiển thị vết lệch tọa độ — UC-29 đọc (2.6) — [ ]
- Query mới `['farm-flagged-observations', farmId]`.
- Trên bản đồ: marker **màu tím nét đứt** tại `detectedLat/detectedLon`, kèm nhãn `gpsDistanceMeters`; đường nét đứt nối tới trụ `suggestedPlantId` nếu có. Item thiếu tọa độ chỉ hiện trong danh sách.
- Panel "Vết lệch tọa độ (n)": loại bệnh + ảnh crop (từ `matchingParametersJson`), độ tin cậy, khoảng lệch; bấm dòng → bản đồ tới điểm đó.
- Thêm chú thích màu tím vào legend.
- **Test tay:** số dòng khớp `count`; marker đúng vị trí; farm không có vết lệch hiện trạng thái rỗng.

### A4. Xử lý vết lệch — UC-29 ghi (2.7) — [ ]
- Bấm 1 vết lệch → chọn 1 trong 3:
  - **Gắn vào trụ (SNAP):** chọn trụ đích — mặc định `suggestedPlantId`, hoặc bấm trụ khác trên bản đồ / chọn trong các trụ gần nhất. Bắt buộc `targetPlantId`.
  - **Tạo trụ mới (CREATE_NEW_PLANT):** `newPlantCode` tùy chọn (để trống BE tự sinh). FE không tự kiểm tra ranh giới — hiển thị lỗi `OutsideBoundary` của BE.
  - **Bỏ qua (DISMISS):** chỉ cần lý do.
- Bắt buộc lý do ở cả 3. Thành công → làm mới bản đồ + danh sách flagged; CREATE_NEW_PLANT còn phải invalidate các query bản đồ nền (`baseMaps`) vì có trụ mới.
- **Test tay:** SNAP → trụ đích chuyển đỏ, vết biến mất khỏi danh sách; DISMISS → biến mất; tạo trụ ngoài ranh giới → đúng lỗi, không tạo; xử lý lại vết đã xử lý → `NotPending`.

### A5. Chọn vùng bệnh + xem cây thành viên — [ ]
- Bấm vùng (trên bản đồ hoặc trong danh sách) → tô đậm vùng, tô viền các trụ trong `zone.trees`, mở panel chi tiết: trạng thái, loại bệnh, `diseaseBreakdown`, danh sách cây.
- Nút thao tác (A6–A8) chỉ hiện với vùng `PROPOSED`; `REVIEWED`/`REJECTED` chỉ xem, có ghi chú "đã khóa sau duyệt".
- Không gọi API ghi nào. Đây là phần khung để A6–A8 gắn vào.

### A6. Thêm/bớt cây thành viên — UC-30c (2.11) — [ ]
- Chế độ "Sửa thành viên" của vùng đang chọn: bấm trụ trên bản đồ để thêm/bỏ; hiển thị danh sách chờ thêm/chờ bỏ; Lưu gửi `{ addPlantIds, removePlantIds }` (mảng không dùng gửi `[]`).
- Chặn Lưu khi cả hai mảng rỗng. Xác nhận trước khi lưu vì vùng sẽ chuyển `REVIEWED` và khóa.
- **Test tay:** thêm 1, bớt 1 → `addedCount`/`removedCount` đúng, vùng thành ĐÃ DUYỆT, nút sửa biến mất.

### A7. Chỉnh viền vùng bệnh — UC-30b (2.10) — [ ]
- Tái dùng cách tương tác của `BoundaryTilingPanel` (bấm thêm điểm, Xóa điểm cuối, Xóa hết) — không thêm thư viện vẽ. Nạp sẵn điểm từ `zone.geometryGeoJson`.
- Gửi Polygon `[lon, lat]`, tự khép kín điểm đầu–cuối, tối thiểu 3 điểm.
- Hiển thị `totalEnclosedTrees` BE trả về (BE tự cắt theo ranh giới farm và đếm lại cây) — FE không tự đếm.
- Xác nhận trước khi lưu (vùng chuyển `REVIEWED`, khóa).
- **Lưu ý:** vùng có geometry MultiPolygon hoặc có lỗ → không nạp được vào trình sửa điểm; hiển thị thông báo thay vì làm mất hình.

### A8. Gộp vùng bệnh — UC-30a (2.9) — [ ]
- Chọn ≥ 2 vùng `PROPOSED` (checkbox trong danh sách) → vẽ polygon bao trùm bằng trình sửa điểm của A7; gợi ý sẵn bao lồi (convex hull) của các vùng đã chọn để người dùng chỉnh.
- Gửi `{ zoneIds, mergedGeometry }`. Thành công: vùng nguồn thành `REJECTED`, vùng mới `PROPOSED`.
- **Test tay:** gộp 2 vùng → `mergedZoneCount = 2`; thử gộp vùng đã `REVIEWED` → bị chặn từ UI, và BE trả `InvalidStatus` nếu gọi thẳng.

---

## Nhóm B — theo đơn khảo sát

Gốc route BE: `api/system-manager/survey-orders/{orderId}/...`. Mọi request body ở nhóm này bị BE **từ chối nếu có trường lạ** (`JsonUnmappedMemberHandling.Disallow`) — chỉ gửi đúng các trường của DTO.

### Khác biệt contract so với tài liệu (đã đọc từ BE)

| Chỗ | Tài liệu ghi | BE thật |
| --- | --- | --- |
| Query phân trang | `page`, `pageSize` | `pageNumber`, `pageSize`, cùng `batchId`, `decision`, `classCode`, `zoneId`, `resolutionState` |
| Response danh sách | `batchId, expectedResultVersion, items, page, pageSize, totalItems` | `resultId, batchId, resultVersion, reviewRevision, resultNature, teamLabelLimitation, isCurrentBatch, pageNumber, pageSize, totalCount, items` |
| Item | — | `id, sourceVersion?, sourceRowVersion, observedAt, resolutionState, original (JSON thô, khóa PascalCase), review?, blockingReasons[], guidanceReview?` |
| review-summary | `unresolvedDiseaseZones, missingGuidanceDecisions, dependencyIssues, totalFindings, totalBoundaryExceptions, totalDiseaseZones` | `resultId, batchId, resultVersion, reviewRevision, unreviewedFindings, ambiguousFindings, acceptedFindings, rejectedFindings, nonDiseaseFindings, unresolvedBoundaryExceptions, undecidedZones, rejectedZones, approvedZones, invalidGuidance, staleDependencies, readyForApproval` — **không có** các trường `total*` |
| Body review ngoại lệ ranh giới | không có `evidenceMediaIds` | có `evidenceMediaIds` (gửi `[]`), thêm tùy chọn `findingId`, `findingReviewId` |
| Response mọi API review | không mô tả | `HealthReviewOutcome`: `operationId, resultId, batchId, resultVersion, reviewRevision, reviews[], invalidatedZoneIds[], isReplay, isCurrentBatch` |

BE còn có các API mà tài liệu Giai đoạn 2 **không nhắc**: review 1 finding (`POST health-findings/{id}/review`), lịch sử review (`GET health-findings/{id}/reviews`), và nhóm vùng bệnh theo đơn (`GET disease-zones`, `POST disease-zones/{id}/review`, `guidance-options`, `guidance-review`). Xem mục "Rủi ro" bên dưới.

### B1. API + types nhóm theo đơn — [x]

**Đã làm (13/11/2026):** `healthReviewTypes.ts`, `healthReviewApi.ts` (`getHealthReviewSummary`, `getHealthReviewQueue` cho findings/exceptions, `reviewHealthFindings`, `reviewHealthBoundaryException`), `healthReviewWorkflow.ts` (dịch 14 mã `PlantHealthReview.*`, nhãn quyết định/trạng thái/lý do chặn, đọc `original`/`snapshot` PascalCase, `findingVersions`/`boundaryVersions`). API chặn trước khi gọi BE: lô rỗng/>100/trùng, lý do rỗng/>2000 ký tự, Correct không có trường sửa hoặc trường sửa đi kèm quyết định khác, ngoại lệ ranh giới thiếu/thừa liên kết finding. Kiểm tra `operationId` của outcome khớp. Test: `tests/health-review-order.test.mjs` 10 test ✓.

**Contract đã chốt từ `PlantHealthReviewService*.cs` (khác tài liệu):**
- `decision` so khớp **chính xác** tên enum, phân biệt hoa thường. Finding: `Approve | Correct | Reject | NonDisease | Ambiguous`. Ngoại lệ ranh giới: `AcceptCorrectedPosition | ExcludeEvidence | NeedsEvidence` — **không có `RetainEvidence`** như tài liệu ghi.
- `expectedReviewVersion` = **`null`** khi mục chưa review lần nào (BE `CheckHead`: chưa có head mà gửi số → `VersionConflict`); đã review thì bằng `review.version`. Tài liệu ghi `0` là sai.
- `expectedSourceVersion` = `item.sourceVersion`; `expectedExceptionVersion` = `item.sourceRowVersion`; `batchId`/`expectedResultVersion` lấy từ response danh sách mới nhất.
- `reason` bắt buộc, ≤ 2000 ký tự; `evidenceMediaIds` bắt buộc (gửi `[]`), ≤ 128, phải thuộc media của Mission.
- Approve/Correct finding: bắt buộc finding gắn trụ có thật trên bản đồ lúc bay (`InvalidAssociation`), vị trí trong ranh giới; gần ranh giới (≤ ngưỡng) cần bằng chứng (`InvalidEvidence` — media gốc của finding được tính).
- Ngoại lệ ranh giới: `ExcludeEvidence`/`AcceptCorrectedPosition` bắt buộc `findingId` + `findingReviewId` (= `review.reviewId` hiện tại của finding đó); `ExcludeEvidence` chỉ hợp lệ khi finding đã `Reject`/`NonDisease`. ⇒ **B6 phụ thuộc B4.**
- Gửi lại cùng `operationId` + cùng nội dung → replay (`isReplay: true`); cùng `operationId` khác nội dung → `OperationConflict`.
- Chỉ review được khi đơn và kết quả đều `PENDING_REVIEW` (`ResultLocked`).
- `resolutionState`: `PENDING_REVIEW | NEEDS_REVIEW | RESOLVED`. `original` và `review.snapshot` là JSON khóa PascalCase.

**Phạm vi ban đầu:**
- File mới `healthReviewApi.ts` + `healthReviewTypes.ts`: `getHealthReviewSummary`, `getHealthFindings`, `reviewHealthFindingsBatch`, `getHealthBoundaryExceptions`, `reviewHealthBoundaryException`.
- Kiểu `original` để `unknown` + hàm đọc an toàn (`FindingId`, `PlantId`, `Position.Coordinates [lon, lat]`, `Confidence`, `SuspectedClassCode`).
- `operationId` sinh theo cách `operationFor()` sẵn có (giữ nguyên khi payload không đổi để gửi lại là replay, đổi payload thì sinh mới).
- Đọc service để chốt: danh sách `decision` hợp lệ, giá trị `resolutionState`, `blockingReasons`, và các mã lỗi 409/422 (lệch version, batch cũ).
- **Test:** đường dẫn/query/body từng hàm; không lọt trường thừa vào body; đọc `original` thiếu trường.

### B2. Trang review theo đơn + tóm tắt tiến độ (2.2) — [x] chưa test tay

**Đã làm (13/11/2026):** `ManagerHealthReviewPage.tsx`, route `/manager/orders/:orderId/health-review`; đường vào là link "Kiểm duyệt kết quả sức khỏe cây →" trong chi tiết đơn (`ManagerOrderDetailPage`) khi dịch vụ `PLANT_HEALTH` và đơn `PENDING_REVIEW`/`COMPLETED`. Trang hiển thị bộ đếm, nhãn Sẵn sàng/Chưa sẵn sàng phê duyệt, danh sách việc còn chặn (chỉ các bộ đếm > 0), cảnh báo khi đơn không ở `PENDING_REVIEW`, trạng thái rỗng khi 404 (chưa có kết quả sơ bộ) và khi đơn không phải Plant Health (không gọi summary). Link sang bản đồ sức khỏe cây của farm. Chưa có nút Phê duyệt (Giai đoạn 3).

**Tự test:** build ✓, 231/231 test ✓. Trình duyệt với API giả lập (dev server, session SYSTEM_MANAGER giả, `fetch` bị thay trong trang): đúng cả 4 trường hợp còn chặn / sẵn sàng / 404 / đơn đã hoàn tất; đơn không phải Plant Health không gọi summary (sửa sau lần test đầu); 375px không tràn ngang. Chưa kiểm tra link đường vào trên trang chi tiết đơn bằng trình duyệt.

**Test tay (người dùng):** mở 1 đơn Plant Health đã gửi kết quả sơ bộ (`PENDING_REVIEW`) → Chi tiết đơn → "Kiểm duyệt kết quả sức khỏe cây" → số liệu khớp với BE.

**Phạm vi ban đầu:**
- Route mới `/manager/orders/:orderId/health-review`; đường vào từ `ManagerOrdersPage` ở đơn Plant Health đã chuyển kết quả sơ bộ.
- Panel tóm tắt từ `review-summary`: các bộ đếm và danh sách việc còn chặn phê duyệt; hiển thị `readyForApproval`. Nút **Phê duyệt** thuộc Giai đoạn 3 — ở đây chỉ hiển thị trạng thái sẵn sàng, chưa gọi approve.
- Trạng thái rỗng/lỗi rõ ràng khi đơn chưa có kết quả (404) hoặc Manager không được phân công (403).
- Link sang bản đồ sức khỏe cây của farm (nhóm A).

### B3. Danh sách findings (2.3) — [x] chưa test tay

**Đã làm (13/11/2026):** `HealthFindingsTable.tsx`, gắn dưới panel tiến độ của trang Kiểm duyệt (chỉ hiện khi đã có summary). Phân trang phía server (20/50/100, mặc định 50), lọc theo trạng thái xử lý và theo quyết định (gồm "Chưa review" = `Pending`); đổi bộ lọc/cỡ trang thì về trang 1. Cột: loại nghi ngờ (tên từ catalog `/api/catalog/plant-health`, hiện thêm "AI: …" nếu review đã sửa loại), độ tin cậy, trụ cây (mã trụ tra từ `plant-health-map` của farm; "Chưa gắn trụ" / "Trụ ngoài bản đồ hiện tại"), vị trí, thời điểm chụp, trạng thái, quyết định (tooltip lý do + thời điểm review), lý do còn chặn. Trụ/loại/vị trí ưu tiên giá trị sau review (`findingRow()` trong `healthReviewWorkflow.ts`). Cảnh báo khi `isCurrentBatch = false`. Lỗi tải catalog/bản đồ không chặn bảng (chỉ mất tên đẹp). "Tải lại" ở đầu trang làm mới cả bảng.

**Tự test:** build ✓, 232/232 test ✓ (thêm test `findingRow`). Trình duyệt với API giả lập 62 findings: trang 1 = 50 dòng, trang 2 = 12 dòng (`pageNumber=2`); lọc "Đã xử lý" về trang 1 và gửi `resolutionState=RESOLVED`; cảnh báo lô cũ hiện đúng; lỗi 400 hiện thông báo dịch. **Đã sửa lỗi phát hiện khi test:** khi lần tải sau bị lỗi, số đếm và cảnh báo lô cũ của lần trước vẫn hiện cạnh thông báo lỗi. 375px không tràn ngang (bảng cuộn riêng).

**Hạn chế đã biết:** API findings không trả URL ảnh crop (chỉ có `EvidenceMedia` id) nên bảng chưa có ảnh — xem xét ở B4 (có thể lấy link qua `media/{id}/download-url` của Mission, cần missionId).

**Phạm vi ban đầu:**
- Bảng phân trang phía server (`pageNumber`, `pageSize` ≤ 100), lọc `resolutionState` (NEEDS_REVIEW / RESOLVED).
- Cột: loại nghi ngờ, độ tin cậy, tọa độ, có gắn trụ hay chưa, trạng thái, quyết định hiện tại, lý do bị chặn.
- Cảnh báo khi `isCurrentBatch = false` và khóa thao tác ghi.
- Chưa có nút review (để B4).

### B4. Review findings: Reject / NonDisease / Approve (2.4) — [x] chưa test tay

**Đã làm (13/11/2026):** trong `HealthFindingsTable.tsx`: cột checkbox chọn dòng (chỉ trong trang hiện tại; đổi trang/bộ lọc/cỡ trang thì bỏ chọn) + thanh thao tác "Bác bỏ", "Không phải bệnh", "Xác nhận bệnh", "Bỏ chọn". Hộp thoại `FindingReviewModal.tsx`: mô tả quyết định, danh sách mục đã chọn (kèm quyết định hiện tại nếu review lại), lý do bắt buộc (dùng chung, ≤ 2000 ký tự). Body dựng bởi `buildFindingBatch()` từ đúng response danh sách lúc bấm (batchId, resultVersion, sourceVersion, review.version hoặc `null`).
- Khóa thao tác khi: đơn không `PENDING_REVIEW`, đang xem lô cũ, hoặc bảng đang tải.
- "Xác nhận bệnh" khóa nếu có mục mà **AI chưa gắn trụ** (`original.PlantId` null) — BE kiểm `CorrectedPlantId ?? finding.PlantId` với giá trị gốc, nên trụ gắn ở lần review trước (Correct) không tính. Mục đó phải dùng "Sửa" (B5).
- Chống gửi trùng: ref chặn bấm nhiều lần + `operationId` giữ nguyên khi gửi lại đúng nội dung (BE trả replay), đổi nội dung thì sinh mã mới.
- Lỗi `VersionConflict`/`BatchChanged`/`DependencyChanged`/`ResultLocked`: khóa nút gửi, nút Hủy thành "Đóng và tải lại" (tải lại danh sách + tóm tắt, bỏ chọn). Lỗi khác: hiện thông báo dịch + mã lỗi, cho sửa và gửi lại.
- Thành công: thông báo (phân biệt replay), cảnh báo nếu `invalidatedZoneIds` khác rỗng, tải lại danh sách + tóm tắt, bỏ chọn.
- Chưa có: chọn ảnh bằng chứng (`evidenceMediaIds` luôn `[]`) — nếu Approve finding sát ranh giới mà finding không có media gốc, BE trả `InvalidEvidence`; quyết định `Ambiguous` (BE có hỗ trợ, tài liệu không yêu cầu, và nó tạo mục chặn phê duyệt) không đưa lên giao diện.

**Tự test:** build ✓, 234/234 test ✓ (thêm test `buildFindingBatch`, `unapprovableRows`). Trình duyệt với API giả lập có trạng thái: chọn 2 mục (1 chưa gắn trụ) → "Xác nhận bệnh" khóa; Bác bỏ + bấm gửi 3 lần → **1 request**, body đúng (`expectedReviewVersion: null`, lý do đã trim), bảng + tóm tắt cập nhật, bỏ chọn; review lại mục đã Bác bỏ thành Không phải bệnh → `expectedReviewVersion: 1`, `expectedResultVersion` lấy bản mới; giả lập 409 `VersionConflict` → thông báo đúng, khóa gửi, "Đóng và tải lại" gọi lại findings + summary; Hủy/Esc không gửi gì. **Đã sửa khi test:** dòng gợi ý dính vào bộ đếm ký tự trong hộp thoại.

**Test tay (người dùng):** trên đơn thật, Bác bỏ 1–2 phát hiện → `Chưa review` trong tóm tắt giảm tương ứng; mở 2 tab, review cùng 1 mục ở tab 1 rồi tab 2 → tab 2 phải báo dữ liệu đã thay đổi.

**Phạm vi ban đầu:**
- Chọn nhiều dòng → 1 quyết định + 1 lý do → `review-batch` (tối đa 100 mục/lần, BE xử lý nguyên khối).
- Mỗi mục gửi `findingId` (= `id` ngoài cùng của item), `expectedSourceVersion` (= `sourceVersion`), `expectedReviewVersion` (= `review.version`, chưa review thì theo quy ước BE — chốt ở B1), `evidenceMediaIds: []`.
- `batchId` và `expectedResultVersion` lấy từ **response danh sách mới nhất**; sau mỗi lần ghi phải tải lại danh sách + summary vì `resultVersion` đổi.
- **Approve** chỉ bật cho finding đã gắn `PlantId`.
- 409 lệch version → báo "dữ liệu đã thay đổi", tải lại, không tự gửi lại.
- **Test tay:** Reject 2 dòng → `unreviewedFindings` giảm 2; gửi lại y nguyên → `isReplay = true`, không đổi số.

### B5. Review findings: Correct (2.4) — [x] chưa test tay

**Đã làm (13/11/2026):** nút "Sửa" trên thanh thao tác của bảng (bật khi chọn đúng 1 phát hiện) mở `CorrectFindingModal.tsx`:
- **Loại bệnh:** chọn trong các nhãn `SUSPECTED_DISEASE` của catalog (BE chỉ nhận nhóm này cho Approve/Correct), có ô tìm. Không tải được catalog thì chỉ giữ được loại hiện tại.
- **Trụ cây:** chọn trong các trụ `ACTIVE` của farm (lấy từ `plant-health-map`), sắp theo khoảng cách tới vị trí phát hiện, hiện "H-C" và số mét, có ô tìm theo mã trụ. Cảnh báo khi trụ cách > 3 m (lớn hơn khoảng cách hàng/cột).
- **Vị trí:** giữ nguyên / đặt tại trụ đã chọn / nhập tọa độ.
- Mặc định form = giá trị **hiện hành** (sau lần review trước). `correctionFields()` chỉ gửi trường **khác giá trị AI gốc** — vì BE luôn lấy giá trị gốc làm nền (`CorrectedX ?? finding gốc`), nên lần sửa trước vẫn được giữ khi sửa tiếp trường khác. Mọi trường trùng gốc → chặn và nhắc dùng "Xác nhận bệnh".
- Dòng "Sẽ gửi: …" liệt kê đúng các thay đổi (mã trụ + khoảng cách, tọa độ mới).
- Dùng chung cơ chế với B4: chống gửi trùng, `operationId` giữ khi gửi lại đúng nội dung, lỗi lệch phiên bản → "Đóng và tải lại" (đã tách `isStaleReviewError()` dùng chung).

**Tự test:** build ✓, 238/238 test ✓ (thêm test `correctionFields`, `plantsByDistance`, Correct đi qua validate của API). Trình duyệt với API giả lập có trạng thái: chọn 2 dòng → "Sửa" khóa; phát hiện AI chưa gắn trụ → danh sách trụ đúng thứ tự khoảng cách, trụ `REMOVED` bị loại, nhãn `CONFUSING_NON_DISEASE` bị loại; lưu gửi `correctedPlantId`; sửa tiếp chỉ đổi loại bệnh + trụ → gửi cả hai, `expectedReviewVersion: 1`; không đổi gì → khóa nút; "Đặt tại trụ" → gửi `correctedPosition` `[lon, lat]` của trụ. **Cải thiện sau khi test:** lần đầu bấm nhầm trụ xa 36 m mà hộp thoại chỉ ghi "trụ cây mới" → thêm mã trụ + khoảng cách vào dòng "Sẽ gửi" và cảnh báo trụ xa; thêm ô tìm cho loại bệnh. Chưa kiểm tra hộp thoại ở màn 375px.

**Giới hạn đã biết (từ BE):**
- Trụ phải thuộc **đúng phiên bản bản đồ nền lúc bay** (`plant.FarmBaseMapVersionId == batch.FarmBaseMapVersionId`). FE không biết phiên bản này nên liệt kê mọi trụ `ACTIVE` hiện tại; chọn trụ thêm sau khi bay → BE trả `InvalidAssociation` (đã dịch).
- Vị trí phải nằm trong ranh giới lúc bay; sát ranh giới cần ảnh bằng chứng (`InvalidEvidence`) — chưa có chọn ảnh.
- Chưa có chọn vị trí bằng click trên bản đồ (chỉ nhập số / lấy tọa độ trụ).
- Không có cách tạo trụ mới từ đây (thay thế UC-29 CREATE_NEW_PLANT: thêm trụ ở màn chỉnh bản đồ nền trước — nhưng trụ đó lại thuộc phiên bản bản đồ khác ⇒ vướng giới hạn đầu tiên, cần BE xác nhận).

**Phạm vi ban đầu:**
- Form riêng cho 1 finding: `correctedClassCode`, `correctedPlantId` (chọn trụ), `correctedPosition`. Tách khỏi B4 vì cần chọn trụ/vị trí trên bản đồ và phải đọc service để biết tổ hợp trường nào hợp lệ.

### B6. Ngoại lệ ranh giới (2.8) — [ ]
- Danh sách `health-boundary-exceptions` (cùng dạng trang như findings) + nút **Loại bỏ chứng cứ** (`ExcludeEvidence`) / **Giữ lại** (`RetainEvidence`), bắt buộc lý do.
- Body: `operationId, batchId, expectedResultVersion, expectedExceptionVersion` (= `sourceRowVersion` của item — xác nhận lại ở B1), `expectedReviewVersion, decision, reason, evidenceMediaIds: []`.
- Xác định ở B1: `RetainEvidence` có bắt buộc kèm `findingId`/`findingReviewId` không.
- **Test tay:** xử lý hết → `unresolvedBoundaryExceptions = 0`.

---

## C1. Kiểm thử tổng — [ ]
- Tự động: `npm run typecheck`, `npm test`, `npm run build`.
- Trình duyệt với API giả lập: từng thao tác ghi gửi đúng payload, chống bấm đôi, hủy không ghi, lỗi 409 hiển thị đúng, bố cục 390px.
- Test tay với BE thật (người dùng): cần 1 đơn Plant Health đã chạy detect + publish sơ bộ (Giai đoạn 1) để có findings, vết lệch và vùng bệnh.

## Kết luận đọc BE về quan hệ nhóm A ↔ nhóm B (13/11/2026)

Đọc trực tiếp các handler (mốc BE `fda57ec`), không chạy với dữ liệu thật.

**Câu 1 — API theo farm (2.5–2.11) có còn dùng cho dữ liệu mới không? → Không.**
- 2.5 (duyệt vết) và 2.7 (xử lý vết lệch): chặn chủ động bằng `PlantHealthLegacyWriteGuard` → 409 `PlantHealth.V4ReviewRequired` (xem Rủi ro 0).
- 2.9–2.11 (gộp / chỉnh viền / thành viên vùng): không có guard, viết SQL thô thẳng vào `plant.disease_zones`, nhưng **không tương thích vùng V4** (vùng do luồng hiện tại sinh ra, `source_schema_version = 4`):
  - Gộp: INSERT vùng mới không đặt `source_schema_version` (mặc định 3) và chép `health_level_id` (NULL ở vùng V4) → vi phạm `ck_disease_zones_source_schema` → lỗi 500, không ghi gì.
  - Chỉnh viền: UPDATE sang `REVIEWED` nhưng không đặt `current_health_review_id`, `reviewed_suspected_class_code`, `guidance_decision`… mà `ck_disease_zones_lifecycle` bắt buộc với V4 → lỗi 500, không ghi gì.
  - Thành viên: **INSERT các dòng membership mới trước**, rồi mới UPDATE vùng (bị chặn bởi cùng ràng buộc) → lỗi 500 nhưng **để lại membership rác**, vì handler không chạy trong transaction. Membership rác có thể làm sai bộ lọc "phát hiện theo vùng" của nhóm B (B so khớp theo `zone.Memberships` khi vùng chưa review).
  - Lỗi phụ trong cả 3 handler: `reviewed_by = (SELECT id FROM identity.users LIMIT 1)` ghi người duyệt là một user bất kỳ; chỉnh viền trả về `proposed_geometry` (hình cũ) thay vì hình mới.
  - ⇒ Nhóm A chỉ chạy được với dữ liệu cũ (vùng V3, observation không có `SourceVersion`).

**Câu 2 — Sửa vùng ở A có xung đột với review vùng ở B không? → Với dữ liệu mới: A không ghi được (trừ membership rác ở trên). Với vùng V3: B không đụng tới** (B chỉ nạp vùng `source_schema_version = 4` theo `import_batch_id`). Hai bên không cùng sửa một vùng hợp lệ, nhưng thao tác thành viên ở A trên vùng V4 có thể làm bẩn dữ liệu B ⇒ FE **không được gọi** 2.9–2.11 cho vùng V4.

**Câu 3 — Bản đồ sức khỏe cây có cập nhật theo kết quả review ở B không? → Màu trụ: KHÔNG, kể cả sau khi phát hành. Vùng bệnh: CÓ một phần.**
- `GetFarmPlantHealthMapQueryHandler` tô màu trụ hoàn toàn từ `mission.mission_plant_observations` thô (bỏ dòng `REJECTED` của luồng farm cũ), phân loại theo tên lớp AI (`Healthy*` → trái khỏe, còn lại → bệnh). Nó không đọc review của B, không đọc kết quả phát hành; phần phát hành (`PlantHealthReviewService.Publication.cs`) không ghi ngược vào bảng observation. ⇒ Phát hiện đã bị **Bác bỏ/Không phải bệnh ở B vẫn hiện đỏ** trên bản đồ.
- Vùng bệnh trên bản đồ đọc `plant.disease_zones` (bỏ `REJECTED`/`SUPERSEDED`, hình = `reviewed_geometry` nếu có). Review vùng ở B (B7) có ghi ngược vào bảng này (`DiseaseZone.ProjectHealthReview`): Reject → vùng ẩn; Approve/Correct kèm quyết định hướng dẫn → `REVIEWED` với hình đã duyệt.
- BE đã có view `plant.latest_reviewed_plant_health` (dùng khi phát hành) — là nguồn phù hợp nếu BE muốn bản đồ phản ánh kết quả đã duyệt.

**Hướng xử lý (đề xuất):**
1. Nhóm B (+ B7) là luồng review chính và đủ để đi tới phê duyệt/phát hành.
2. Nhóm A: giữ A0 (bản đồ, chỉ xem) và A3 (vết lệch, chỉ xem). **Không làm A2, A4–A8** cho dữ liệu hiện tại. Các hàm API ở A1 giữ lại nhưng chưa dùng.
3. Trên bản đồ sức khỏe cây, ghi chú rõ màu trụ là **kết quả AI chưa qua kiểm duyệt**, để Manager không hiểu nhầm sau khi đã review ở B.
4. Đề nghị BE (Phú): (a) cho bản đồ đọc kết quả đã duyệt/đã phát hành (ví dụ view `latest_reviewed_plant_health`) thay vì observation thô; (b) chặn 2.9–2.11 với vùng V4 (trả lỗi rõ thay vì 500) và bọc transaction cho handler thành viên; (c) sửa `reviewed_by` lấy user hiện tại.
5. Với UC-28/29/30: thống nhất với nhóm rằng chúng được đáp ứng qua luồng theo đơn (B4/B5 ≈ UC-28, B5 gắn trụ ≈ UC-29 SNAP, B7 Correct ≈ UC-30b/c). Thiếu tương đương cho **gộp vùng** (UC-30a) và **tạo trụ mới từ vết lệch** (UC-29 CREATE_NEW_PLANT — thay bằng thêm trụ ở màn chỉnh bản đồ nền rồi dùng Sửa để gắn).

## Rủi ro và câu hỏi mở

0. **[Phát hiện 13/11 khi bắt đầu A2 — quan trọng nhất] Duyệt theo farm bị BE chặn với dữ liệu mới.** `ReviewPlantObservationCommandHandler` (2.5) và `ResolveFlaggedObservationCommandHandler` (2.7) gọi `PlantHealthLegacyWriteGuard.IsV4Async`: nếu observation thuộc job `DISEASE_DETECTION` có `parameters ? 'SourceVersion'` thì trả **409 `PlantHealth.V4ReviewRequired`** ("Review this observation through its pending Plant Health result"). `DetectMissionDiseasesCommandHandler` hiện tại **luôn** tạo job qua `AiProcessingJob.RecordCompletedHealthRun` với snapshot có `SourceVersion`, và publish sơ bộ (1.2) cũng bắt buộc có `SourceVersion`. Nghĩa là mọi vết bệnh sinh từ luồng Giai đoạn 1 hiện tại chỉ duyệt được qua **nhóm B** (health-findings theo đơn); 2.5 và 2.7 chỉ còn dùng được cho dữ liệu cũ (legacy). Gộp/chỉnh viền/thành viên vùng (2.9–2.11) không có guard này. Chưa kiểm được dữ liệu local vì Docker không chạy.

1. **[Đã trả lời 13/11 — xem "Kết luận đọc BE" ở trên] Hai hệ thống review song song.** Nhóm A ghi vào observation/vùng bệnh theo farm (module Missions); nhóm B ghi vào findings theo đơn (module Surveys). Chưa rõ thao tác ở A có làm thay đổi bộ đếm của `review-summary` hay không. Kiểm tra khi làm B2; nếu hai bên độc lập thì ghi rõ trên giao diện, tránh người dùng tưởng duyệt một nơi là đủ.
2. **[Đã xác nhận từ BE 13/11] Vùng bệnh chặn phê duyệt.** `ZoneIssues` trả `UnreviewedZone` cho vùng chưa review và `MissingGuidanceDecision` khi chưa quyết định hướng dẫn; `readyForApproval` yêu cầu mọi vùng không còn issue. Đơn có vùng bệnh ⇒ bắt buộc B7. Ghi chú gốc: `review-summary` có `undecidedZones` và `invalidGuidance`, nhưng tài liệu Giai đoạn 2 không có bước review vùng/hướng dẫn theo đơn. Nếu đơn có vùng bệnh, `readyForApproval` có thể không bao giờ `true` chỉ với 2.2–2.11. Khi gặp: thêm task B7 (review vùng + chọn hướng dẫn theo đơn) — cần người dùng quyết định.
3. **Thiếu trạng thái duyệt của observation** trong `plant-health-map` (xem A2).
4. **Khóa sau duyệt:** chỉnh viền/thành viên chuyển vùng sang `REVIEWED` vĩnh viễn — mọi thao tác này phải có bước xác nhận.
5. **Giai đoạn 3** (approve / publish / xem ấn bản) nằm ngoài tài liệu này.

## Nhật ký

- 13/11/2026 — Lập kế hoạch, đối chiếu contract BE. Chưa viết code Giai đoạn 2.
- 13/11/2026 — Xong A1 (API + types + dịch lỗi nhóm theo farm), 221/221 test, build ✓. Chưa commit.
- 13/11/2026 — Bắt đầu A2 thì phát hiện BE chặn duyệt theo farm với dữ liệu V4 (Rủi ro 0). Người dùng chọn làm nhóm B trước.
- 13/11/2026 — Xong B1 + B2 (231/231 test, build ✓, tự test trình duyệt với API giả lập). Chưa commit, chưa test tay.
- 13/11/2026 — Xong B3 (232/232 test, build ✓, tự test trình duyệt). Chưa commit, chưa test tay.
- 13/11/2026 — Xong B4 (234/234 test, build ✓, tự test trình duyệt với API giả lập có trạng thái). Chưa commit, chưa test tay.
- 13/11/2026 — Đọc BE trả lời 3 câu hỏi về quan hệ A ↔ B (mục "Kết luận đọc BE"). Đề xuất bỏ A2, A4–A8 cho dữ liệu hiện tại; chờ người dùng chốt.
- 13/11/2026 — **Người dùng chốt:** chỉ làm nhóm B + B7; bỏ A2, A4–A8 (giữ A0, A3 chỉ xem).
- 13/11/2026 — Xong B5 (238/238 test, build ✓, tự test trình duyệt). Chưa commit, chưa test tay.
