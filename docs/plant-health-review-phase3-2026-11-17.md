# Kế hoạch FE — Giai đoạn 3: Phê duyệt & phát hành kết quả sức khỏe cây

Tiếp nối [`plant-health-review-phase2-2026-11-13.md`](./plant-health-review-phase2-2026-11-13.md) (B1–B7: review theo đơn). Contract lấy từ BE: `SystemManagerSurveyResultsController.cs`, `PlantHealthReviewService.Approval.cs`, `PlantHealthReviewService.Publication.cs`, `PlantHealthReviewService.Comparison.cs`, `Approve/PublishPlantHealthSurveyResultContracts.cs`.

**Ký hiệu:** `[ ]` chưa làm · `[~]` đang làm · `[x]` đã code và tự test · thêm "đã test tay" khi người dùng xác nhận với BE thật.

## Bảng tiến độ

| # | Task | Trạng thái |
| --- | --- | --- |
| D1 | API + types + dịch mã lỗi (approve / approval / publish / publication) | [x] |
| D2 | Panel "Phê duyệt & phát hành" trên trang Kiểm duyệt + khóa review sau phê duyệt | [x] chưa test tay |
| D3 | Kiểm thử (test, build, trình duyệt với API giả lập) | [x] tự động + giả lập; chờ test tay với BE thật |

## Contract (đã đọc từ BE)

Gốc: `api/system-manager/survey-orders/{orderId}/health-results/...`. Body bị từ chối nếu có trường lạ.

| API | Body / kết quả | Điều kiện BE |
| --- | --- | --- |
| `POST approve` | `{ operationId, batchId, expectedResultVersion, expectedReviewRevision, reason }` → `{ operationId, resultId, batchId, resultVersion, approvedReviewRevision, status, resultNature, teamLabelLimitation, conclusion, acceptedFindingCount, reviewedBy, reviewedAt, approvalFingerprint, isReplay, currentStatus }` | Đơn + kết quả `PENDING_REVIEW`; `readyForApproval`; batch/version/revision khớp; lý do 1–2000 ký tự. |
| `GET approval` | cùng dạng trên | 404 `PlantHealthReview.NotFound` khi chưa phê duyệt. |
| `POST publish` | `{ operationId, batchId, expectedResultVersion, expectedReviewRevision, approvalFingerprint }` → `{ operationId, publicationId, resultId, batchId, publicationVersion, status, orderStatus, resultNature, teamLabelLimitation, conclusion, publishedFindingCount, publishedZoneCount, advancedPlantIds, publishedBy, publishedAt, publicationFingerprint, isReplay }` | Kết quả `APPROVED`, đơn `PENDING_REVIEW`; fingerprint đúng 64 ký tự và khớp bản phê duyệt. |
| `GET publication` | `{ publication, fingerprint }` | Chỉ khi kết quả `PUBLISHED` **và đơn `COMPLETED`** — đơn "thanh toán sau bay" (sang `AWAITING_PRICING` sau phát hành) nhận 404. |

- Phê duyệt **khóa toàn bộ review** (mọi thao tác review sau đó → `ResultLocked`), chưa hiện cho Owner.
- Phát hành: đơn thường → `COMPLETED` + gửi sự kiện/thông báo cho Owner; đơn "thanh toán sau bay" → `AWAITING_PRICING`, không gửi gì cho Owner (Owner chỉ thấy sau khi trả phần còn lại).
- `review-summary` vẫn đọc được sau phê duyệt nhưng `readyForApproval = false` (kết quả không còn `PENDING_REVIEW`). Trạng thái thật lấy từ `GET approval` → `currentStatus` (`APPROVED` / `PUBLISHED`).
- Mã lỗi mới: `ApprovalBlocked`, `ProvenanceIncomplete`, `SourceContextChanged`, `ApprovalSnapshotChanged`, `PublicationBlocked`, `InvalidPublication`, `PublicationSnapshotChanged` (đều tiền tố `PlantHealthReview.`).
- `operationId` giữ nguyên khi gửi lại đúng nội dung → BE trả replay (`isReplay: true`).

## D1. API + types — [x]
**Đã làm:** `healthReviewTypes.ts` (`HealthApproval`, `HealthApproveRequest`, `HealthPublishRequest`, `HealthPublishResult`, `HealthPublication`); `healthReviewApi.ts`: `getHealthApproval` (404 → `null`), `approveHealthResult` (chặn lý do rỗng/quá dài, lượt review âm; kiểm `operationId`/`batchId` trả về), `publishHealthResult` (chặn fingerprint khác 64 ký tự), `getHealthPublication`. `healthReviewWorkflow.ts`: dịch 7 mã lỗi mới, `isStaleReleaseError`, `releaseStage`, `reviewEditable`, `conclusionLabels`, `expectedConclusion`, `nextStepAfterPublish`.

## D2. Panel phê duyệt & phát hành — [x] chưa test tay
**Đã làm:** `HealthReleasePanel.tsx` (panel + `ApproveModal` + `PublishModal`), gắn dưới "Tiến độ kiểm duyệt" trong `ManagerHealthReviewPage.tsx`.
- Trang đọc thêm `GET approval`; review ở bảng phát hiện / ngoại lệ / vùng bệnh chỉ mở khi đơn `PENDING_REVIEW` **và** chưa phê duyệt (đang tải trạng thái phê duyệt thì khóa).
- Thay câu "Giai đoạn 3 chưa có trên giao diện"; thêm thông báo "Các quyết định review đã bị khóa" khi đã phê duyệt.
- Hộp thoại dùng chung cơ chế của Giai đoạn 2: chống bấm đôi, `operationId` giữ nguyên khi gửi lại đúng nội dung, lỗi dữ liệu đã đổi → "Đóng và tải lại".
- FE không biết đơn có phải "thanh toán sau bay" trước khi phát hành (không có trường này trong danh sách đơn) → hộp thoại Phát hành nêu cả hai khả năng; sau khi phát hành dùng `orderStatus` BE trả về để hiện bước tiếp theo. Sau khi tải lại trang, đơn `AWAITING_PRICING`/`AWAITING_PAYMENT` chỉ hiện thông tin phê duyệt + bước tiếp theo (BE không cho đọc `publication` ở trạng thái này).
Trạng thái panel:
1. Chưa phê duyệt, chưa sẵn sàng → nút Phê duyệt khóa, nhắc xử lý mục chặn.
2. Chưa phê duyệt, sẵn sàng → nút **Phê duyệt kết quả** (hộp thoại: kết luận dự kiến theo số phát hiện đã xác nhận, cảnh báo khóa review, lý do bắt buộc).
3. Đã phê duyệt (`APPROVED`) → thông tin phê duyệt + nút **Phát hành kết quả** (hộp thoại: nói rõ đơn sẽ sang trạng thái nào).
4. Đã phát hành (`PUBLISHED`) → thông tin phát hành; đơn `COMPLETED` thì đọc thêm `GET publication`; đơn thanh toán sau bay thì hướng dẫn bước tiếp theo (chốt giá).

Review ở bảng phát hiện / ngoại lệ / vùng bệnh bị khóa khi đã có phê duyệt.
## D3. Kiểm thử — [x] tự động + giả lập
- `tests/health-release.test.mjs` 8 test ✓ (route, body đúng DTO, 404 → null, chặn trước khi gọi BE, `releaseStage`, `reviewEditable`, lỗi "dữ liệu đã đổi", dịch lỗi). `npm test` 266/266 ✓, `npm run build` ✓.
- Trình duyệt với API giả lập có trạng thái: sẵn sàng → bấm Phê duyệt 3 lần khi BE trả `ApprovalBlocked` → 1 request, lỗi dịch đúng kèm mã, nút gửi khóa, "Đóng và tải lại" tải lại tóm tắt + danh sách + phê duyệt; phê duyệt thành công → panel "Đã phê duyệt", thanh review và checkbox biến mất; Phát hành bấm 2 lần → 1 request đúng fingerprint, đơn sang `AWAITING_PRICING` hiện bước chốt giá, không gọi `GET publication`; đơn `COMPLETED` sau khi tải lại → gọi `GET publication`, hiện phiên bản + số phát hiện. 375px không tràn ngang.

**Test tay (người dùng) với BE thật:** đơn `48eb208a…` (CaiLay Farm) sau khi xử lý hết 54 phát hiện + 21 ngoại lệ → Phê duyệt → Phát hành → đơn sang `AWAITING_PRICING`.
**Rủi ro khi test thật:** BE kiểm tra nguồn gốc lúc phê duyệt (`ProvenanceIncomplete`): cần ảnh đầu vào đã đăng ký và số ảnh đã xử lý > 0. Dữ liệu local hiện không có ảnh bằng chứng nào gắn với phát hiện (lệch tên ảnh `img_0004.JPG` ↔ `AATM0852.JPG`) — nếu BE báo lỗi này thì đó là lỗi dữ liệu Giai đoạn 1, không phải FE.

## Nhật ký
- 17/11/2026 — Lập kế hoạch, đọc contract BE. Người dùng đồng ý làm Giai đoạn 3 FE.
- 17/11/2026 — Xong D1–D3 (266/266 test, build ✓, tự test trình duyệt với API giả lập). Chưa commit, chưa test tay.
