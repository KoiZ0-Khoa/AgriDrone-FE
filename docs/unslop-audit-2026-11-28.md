# Audit unslop toàn bộ app — 2026-11-28

## Mục đích và cách làm

Trang `/manager` (ManagerFarmsPage + phần khung sidebar dùng chung) đã được audit và sửa 2 điểm trong phiên làm việc trước đó của session này: sentence-case các nhãn viết hoa trong sidebar, và snap các giá trị spacing lẻ về thang 4px trong `dashboard.css` + khung sidebar dùng chung. Hai điểm đó **không** được liệt lại trong tài liệu này.

File này khảo sát **tất cả màn hình còn lại** để quyết định màn nào thật sự cần chạy `/unslop`, trước khi sửa bất kỳ gì khác. Đây là audit đọc code, đối chiếu với checklist `references/signs.md` của skill unslop (không dựng server/mock đăng nhập để chụp từng màn — chi phí quá lớn cho ~25 trang; chỉ code-review, giống cách đã phát hiện phần lớn lỗi ở `/manager`). Hai trang public không cần đăng nhập (`/`, `/login`) được đọc kỹ nhất vì rủi ro slop cao nhất theo lý thuyết.

**Kết luận chung:** đây là một codebase có kỷ luật thiết kế rất tốt — một theme màu trung tính duy nhất (`ConfigProvider` ở [App.tsx:90-106](src/app/App.tsx:90) đặt `colorPrimary/colorSuccess/colorWarning/colorError` một lần, mọi Tag/Button/Alert kế thừa theo), không gradient lạ, không emoji, không copy hô hào ở bất kỳ đâu trong toàn bộ `src/`. Phần lớn màn hình **Không slop**. Chỉ có **2 lỗi hệ thống lặp lại nhiều nơi** (nhãn viết hoa + spacing lẻ — cùng loại lỗi đã sửa ở `/manager`) và một vài điểm riêng lẻ đáng chú ý.

## ⚠️ Một việc cần sửa ngay (không phải lỗi mới — là tác dụng phụ của lần sửa `/manager` trước đó)

[workspace.css:86](src/styles/workspace.css:86) có rule `.app-shell .dw-manager .dw-farm-row { grid-template-columns: 42px minmax(0, 1fr) 12px; }` — rule này specificity cao hơn rule đã sửa trong `dashboard.css` (`.workspace-dashboard .dw-farm-row` đã đổi 42px→40px), nên nó **ghi đè** và làm cột icon bị lệch 2px so với ô icon `dw-farm-mark` (đã đổi thành 40×40) trên chính trang `/manager`. Cần đổi `42px` → `40px` ở dòng này để khớp lại. Việc này thuộc về lần sửa trước, nêu ở đây vì audit này là nơi phát hiện ra.

## Bảng tổng hợp

| Route(s) | Component | Kết luận | Ghi chú |
|---|---|---|---|
| `/` | HomePage + home.css | **Không slop** | Trang landing thiết kế riêng, có chủ đích; chỉ 1-2 điểm nhỏ |
| `/login`, `/forgot-password`, `/reset-password` | LoginPage, AuthActionPages | **Slop nhẹ** | 2 nhãn viết hoa kiểu "Welcome back" |
| `/invitation`, `/accept-invitation`, `/accept-system-manager-invitation` | InvitationPage | Không slop | Dùng chung style `.login-card`, chưa thấy dấu hiệu riêng |
| `/dashboard` | DashboardPage (Owner/Tenant) | **Slop nhẹ** | Tiêu đề kiểu greeting + spacing lẻ ở `dw-feature`/`dw-shortcut` |
| `/system` | SystemDashboardPage | Slop nhẹ | Chỉ do 2 lỗi hệ thống (nhãn + spacing), không có lỗi riêng |
| `/farms`, `/farms/:id`, `/farms/archived*`, `/zones` | FarmsPage, ArchivedFarmsPage, ZonesPage | Slop nhẹ | Dùng chung template `resource-*`, dính cả 2 lỗi hệ thống |
| `/account`, `/team`, `/my-farms`, `/system/account`, `/manager/account` | AccountPage, TeamPage, MyFarmsPage | Slop nhẹ | page-kicker viết hoa |
| `/survey-requests/new`, `/request-survey` | SurveyIntakePage | Slop nhẹ | page-kicker viết hoa |
| `/survey-payments*` | OwnerPaymentsPage, OwnerSurveyResultPage | Slop nhẹ | page-kicker viết hoa |
| `/system/tenants`, `/users`, `/plant-conditions`, `/harvest-quality-grades` | SystemPage | Slop nhẹ | page-kicker "SYSTEM ADMIN" |
| `/system/plant-health` | PlantHealthPage | Slop nhẹ | page-kicker viết hoa |
| `/system/managers` | ManagersPage | Slop nhẹ | page-kicker viết hoa |
| `/system/drones` | DronesPage | Slop nhẹ | page-kicker viết hoa |
| `/system/preflight-checklist` | PreflightChecklistPage | Slop nhẹ | page-kicker viết hoa |
| `/system/survey-services` | ServicesPage | Slop nhẹ | page-kicker viết hoa |
| `/system/survey-requests*` | RequestsPage | Slop nhẹ | page-kicker viết hoa |
| `/system/survey-orders*` | SystemOrdersPage, AdminQualityRefundPage | Slop nhẹ | page-kicker viết hoa |
| `/system/revenue` | RevenueDashboardPage | Slop nhẹ | page-kicker viết hoa; phần còn lại (bảng số liệu tài chính) rất sạch |
| `/manager/farms/:id` | ManagerFarmDetailPage | Slop nhẹ | 2 lỗi hệ thống |
| `/manager/farms/:id/base-maps*` | FarmBaseMapsPage | Slop nhẹ | 2 lỗi hệ thống, công cụ bản đồ nên không ưu tiên |
| `/manager/farms/:id/base-map-drafts*` | ManagerBaseMapsPage | Slop nhẹ | page-kicker động (tên farm), không phải literal — ít ưu tiên |
| `/manager/farms/:id/plant-health` | ManagerPlantHealthMapPage | Slop nhẹ | page-kicker viết hoa |
| `/manager/orders*` | ManagerOrdersPage, ManagerOrderDetailPage | Slop nhẹ | page-kicker viết hoa (2 chỗ) |
| `/manager/orders/:id/health-review` | ManagerHealthReviewPage | Slop nhẹ | page-kicker viết hoa |
| `/manager/orders/:id/result-review` | ManagerResultReviewPage | Slop nhẹ | page-kicker viết hoa |
| `/manager/farms/:id/missions/:id` | ManagerMissionDetailPage | Slop nhẹ | page-kicker viết hoa |

Không có màn nào rơi vào **Slop nặng**.

## Chi tiết 2 lỗi hệ thống (lặp lại khắp app)

### 1. Nhãn viết hoa + tracking rộng (`page-kicker`, `step-label`)

Giống hệt lỗi đã sửa ở sidebar `/manager`. CSS dùng chung ở [global.css:97-102](src/styles/global.css:97) (`font-size:11px; letter-spacing:1.35px`) và [workspace.css:9](src/styles/workspace.css:9) (`.app-shell .page-kicker { font-size:14px; letter-spacing:.4px }` — đã nhẹ hơn, dễ sửa). Dấu hiệu đúng signs.md: *"Uppercase labels with wide tracking, like `NAVIGATION` → sentence case"*.

19 chỗ literal (không tính các `page-kicker` hiển thị dữ liệu động như tên farm/mã đơn — những chỗ đó không phải lỗi vì không phải là "label", chỉ là code/tên hiển thị nguyên dạng):

- [DronesPage.tsx:42](src/features/drones/DronesPage.tsx:42) — `QUẢN TRỊ VẬN HÀNH`
- [PreflightChecklistPage.tsx:49](src/features/missions/PreflightChecklistPage.tsx:49) — `QUẢN TRỊ VẬN HÀNH`
- [ZonesPage.tsx:124](src/features/farms/ZonesPage.tsx:124) — `KHU VỰC`
- [ZonesPage.tsx:163](src/features/farms/ZonesPage.tsx:163) — `KHU VỰC CANH TÁC`
- [ManagerMissionDetailPage.tsx:637](src/features/missions/ManagerMissionDetailPage.tsx:637) — `NHIỆM VỤ BAY`
- [RevenueDashboardPage.tsx:79](src/features/reports/RevenueDashboardPage.tsx:79) — `BÁO CÁO TÀI CHÍNH`
- [ManagerHealthReviewPage.tsx:65](src/features/surveys/ManagerHealthReviewPage.tsx:65) — `KIỂM DUYỆT KẾT QUẢ SỨC KHỎE CÂY`
- [ManagerOrdersPage.tsx:32](src/features/surveys/ManagerOrdersPage.tsx:32) — `CÔNG VIỆC KHẢO SÁT`
- [ManagerOrdersPage.tsx:82](src/features/surveys/ManagerOrdersPage.tsx:82) — `ĐƠN KHẢO SÁT`
- [ManagerPlantHealthMapPage.tsx:94](src/features/surveys/ManagerPlantHealthMapPage.tsx:94) — `BẢN ĐỒ SỨC KHỎE CÂY`
- [ManagerResultReviewPage.tsx:50](src/features/surveys/ManagerResultReviewPage.tsx:50) — `DUYỆT KẾT QUẢ KHẢO SÁT`
- [ManagersPage.tsx:37](src/features/surveys/ManagersPage.tsx:37) — `NHÂN SỰ VẬN HÀNH`
- [OwnerPaymentsPage.tsx:108](src/features/surveys/OwnerPaymentsPage.tsx:108) — `ĐƠN KHẢO SÁT & THANH TOÁN`
- [PlantHealthPage.tsx:41](src/features/surveys/PlantHealthPage.tsx:41) — `DỮ LIỆU PLANT HEALTH`
- [RequestsPage.tsx:22](src/features/surveys/RequestsPage.tsx:22) — `TIẾP NHẬN KHẢO SÁT`
- [ServicesPage.tsx:44](src/features/surveys/ServicesPage.tsx:44) — `DỊCH VỤ KHẢO SÁT`
- [SurveyIntakePage.tsx:57](src/features/surveys/SurveyIntakePage.tsx:57) — `DỊCH VỤ AGRIDRONE`
- [SystemOrdersPage.tsx:32](src/features/surveys/SystemOrdersPage.tsx:32) — `QUẢN LÝ KHẢO SÁT`
- [AccountPage.tsx:11](src/management/AccountPage.tsx:11) — `TÀI KHOẢN`
- [SystemPage.tsx:33](src/management/SystemPage.tsx:33) — `SYSTEM ADMIN`

Cộng thêm 2 chỗ dùng class `step-label` (cùng rule CSS) ở trang đăng nhập — xem mục LoginPage bên dưới.

**Fix đề xuất:** đổi từng chuỗi sang sentence case (`Khu vực`, `Tiếp nhận khảo sát`...), và giảm `letter-spacing` trong `global.css:97-102` từ `1.35px` xuống khoảng `.3px` (đã làm y hệt cho sidebar). `workspace.css:9` có thể giữ nguyên `.4px` vì đã khá nhẹ.

**Lưu ý:** `.resource-code` ([global.css:447](src/styles/global.css:447), hiển thị mã farm/zone như "F-001") **không phải** lỗi — đây là mã định danh, quy ước viết hoa+tracking cho code/serial là hợp lý, khác với nhãn mô tả bằng lời.

### 2. Spacing lẻ ngoài thang 4px

Cùng loại lỗi đã snap trong `dashboard.css` cho `/manager`, nhưng còn ở các phần **chưa đụng tới** vì không nằm trong phạm vi `/manager`:

- `dashboard.css` — các class `.dw-feature`, `.dw-field-art`, `.dw-shortcut*`, `.dw-order-*`, `.dw-admin-tools`, `.dw-page-foot`, `.dw-farm-meta`/`.dw-request-meta` (dùng ở `/dashboard` và `/system`, ví dụ `padding: 26px`, `gap: 13px`, `margin-top: 27px`...).
- Template `resource-*` dùng ở ~20 trang — [global.css:416-454](src/styles/global.css:416): `.resource-card h2 { margin: 7px 0 6px }`, `.resource-grid { gap: 14px }`, `.resource-meta { margin: 18px 0 }`, `.resource-card-link { padding-top: 14px }`, `.resource-card-heading { margin-bottom: 22px }`, `.resource-icon { width: 38px; height: 38px }`.

**Fix đề xuất:** làm y hệt cách đã làm cho `dashboard.css`/`global.css` ở `/manager` — snap từng giá trị về bội số 4 gần nhất.

## Điểm riêng từng trang

### LoginPage — Slop nhẹ
- [LoginPage.tsx:89](src/features/auth/LoginPage.tsx:89): `<span className="step-label">CHÀO MỪNG TRỞ LẠI</span>` — đúng y khuôn mẫu "Welcome back, Damir!" mà signs.md nêu làm ví dụ slop kinh điển (vừa viết hoa, vừa là greeting). Nên đổi thành tên trang/ngữ cảnh, ví dụ bỏ hẳn dòng này hoặc đổi "Đăng nhập".
- [LoginPage.tsx:48](src/features/auth/LoginPage.tsx:48): `BƯỚC 2 / 2` — chỉ cần sentence-case thành `Bước 2 / 2`, bản thân việc có step-indicator là hợp lý, không cần bỏ.

### DashboardPage (`/dashboard`) — Slop nhẹ
- [DashboardPage.tsx:30](src/pages/DashboardPage.tsx:30) và [:38](src/pages/DashboardPage.tsx:38): tiêu đề `'Chào ' + firstName` — đúng dấu hiệu "Greeting headlines" trong signs.md (nhẹ hơn ví dụ gốc vì không có emoji/dấu !, nhưng vẫn là greeting thay vì nêu tên trang). Trang `/manager` và `/system` đã làm đúng chuẩn (tiêu đề nêu mục đích trang: "Công việc của bạn", "Tổng quan vận hành"), chỉ `/dashboard` lệch mẫu. Gợi ý đổi tiêu đề thành tên trang (ví dụ "Tổng quan nông trại") và chuyển "Chào {tên}" xuống làm `description` như `/manager` đang làm.

### HomePage (`/`) — Không slop (điểm nhỏ, tuỳ chọn)
Trang landing được đầu tư kỹ: màu forest/lime bám chủ đề nông nghiệp-drone, headline nêu đúng việc sản phẩm làm ("Nhìn nông trại từ trên cao, quyết định từ dưới đất"), ảnh drone thật, demo bản đồ bay tương tác, slider so sánh ảnh thường/bản đồ sức khỏe cây, 1 nút chính + 1 nút phụ trong hero, không badge/gradient/emoji giả tạo. Đây là mẫu tốt, không cần chạy full 9-pass.

Hai điểm rất nhỏ, có thể bỏ qua:
- [HomePage.tsx:77](src/features/home/HomePage.tsx:77): hiệu ứng parallax (di chuyển ảnh nền hero theo scroll) — đúng dấu hiệu "Parallax... → static layout" trong signs.md, dù đã tôn trọng `prefers-reduced-motion`.
- `.hp-eyebrow`/`.hp-hud-top`/`.hp-panel .hp-k`/`.hp-role .hp-badge`/`.hp-footer h4` ([home.css:33,94,172,232,250](src/features/home/home.css:33)) dùng uppercase+tracking làm nhãn mục/eyebrow — là mẫu thiết kế phổ biến ở landing page thật, không giống "NAVIGATION" trong nav; cân nhắc giữ nguyên, không bắt buộc sửa.

### Các trang workflow/bản đồ/mission (FarmBaseMapsPage, ManagerBaseMapsPage, các panel trong `features/missions`, `features/surveys`)
Chỉ xem lướt do đây là công cụ thao tác dữ liệu (bản đồ, bảng, modal), không phải nơi slop thường xuất hiện; không thấy emoji/gradient/hype copy. Dùng chung 2 lỗi hệ thống ở trên, không có lỗi riêng đáng kể nào được phát hiện thêm. Có thể bỏ qua không cần chạy riêng /unslop — khi 2 lỗi hệ thống được sửa ở style dùng chung, các trang này tự động được hưởng lợi.

## Thứ tự ưu tiên đề xuất

1. **Sửa `workspace.css:86` (42px→40px)** — bug nhỏ, chỉ 1 dòng, nằm trong việc đã làm.
2. **Sửa 2 lỗi hệ thống dùng chung** (nhãn viết hoa trong `page-kicker`/`step-label`, spacing lẻ trong phần còn lại của `dashboard.css` + template `resource-*`) — sửa 1 lần ở CSS + ~20 chuỗi text, tự động áp dụng cho toàn bộ ~20 trang đang "Slop nhẹ" bên trên. Đây là việc tốn ít công nhất, lợi ích rộng nhất.
3. **LoginPage** — 2 dòng text, rất nhanh, gây ấn tượng đầu tiên khi người dùng vào app.
4. **DashboardPage** — đổi tiêu đề greeting thành tên trang, đồng bộ với `/manager` và `/system`.
5. HomePage — tuỳ chọn, không ưu tiên, có thể bỏ qua hoàn toàn.

Không khuyến nghị chạy full `/unslop` (9-pass) cho bất kỳ trang nào — không có trang nào đạt mức "Slop nặng".
