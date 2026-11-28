# Audit UX & Accessibility — 2026-11-28

## Mục đích và cách làm

Đây là audit thứ hai, tiếp theo [docs/unslop-audit-2026-11-28.md](unslop-audit-2026-11-28.md) (đã xong và sửa một phần — nhãn viết hoa, spacing 4px, tông giọng copy). File này **không lặp lại** các dấu hiệu slop thị giác đó. Phạm vi ở đây là hai khía cạnh khác:

1. **Accessibility** — thao tác bằng bàn phím, ngữ nghĩa ARIA, quản lý focus, độ tương phản màu thực tế (tính từ mã hex, không áng chừng), live-region cho nội dung động, liên kết label/lỗi trong form.
2. **UX / phê bình tương tác** — theo tinh thần Nielsen heuristics: tính nhất quán giữa các luồng tương tự, phản hồi cho thao tác bất đồng bộ, xử lý lỗi, rõ ràng về vị trí/điều hướng, usability của form.

Phương pháp: đọc code đối chiếu hai bộ tiêu chí trên (không dựng server/chụp từng màn — không đáng chi phí cho một audit triage). Lượt 1 soát các thành phần dùng chung mà mọi trang có xác thực đều đi qua (3 layout, `DashboardUI.tsx`, `CommonState.tsx`, các file CSS dùng chung) — lỗi ở đây ảnh hưởng tất cả các trang cùng lúc. Lượt 2 soát nhanh một số luồng nghiệp vụ phức tạp (vẽ ranh giới, xử lý nhiệm vụ bay, xóa/hủy dữ liệu) để tìm vấn đề đặc thù. Mọi tỷ lệ tương phản dưới đây được tính bằng công thức WCAG 2.1 (relative luminance) từ đúng mã hex trong code, không ước lượng mắt thường.

## Bảng tổng hợp

| # | Hạng mục | Mức độ | Phạm vi ảnh hưởng |
|---|---|---|---|
| A1 | Drawer menu mobile không có focus trap / Esc / trả focus | **Nghiêm trọng** | Cả 3 layout (~45 trang, chế độ mobile) |
| A2 | `CommonState` dùng `aria-label` trên `div` trần, không có `role`/live-region | **Nghiêm trọng** | 48 file dùng component này |
| A3 | Màu `#8a8d91` tương phản 3.33:1 (yêu cầu 4.5:1) | **Trung bình** | Nhãn sidebar (mọi trang) + `resource-meta dt` (~20 trang) + `revenue.css` |
| U1 | 2 thao tác xóa không hồi phục bỏ qua xác nhận, trong khi hành động liền kề trong cùng file lại có xác nhận | **Nghiêm trọng** | `BoundaryTilingPanel.tsx`, `YoloDetectionPanel.tsx` |
| U2 | `requiredMark={false}` ẩn dấu `*` toàn form trong khi form có trộn field bắt buộc/tùy chọn | **Trung bình** | `FarmManagementActions.tsx` (modal lưu trữ khu vực) |

Không phát hiện vấn đề Modal/Dialog (antd `Modal` tự quản lý `role="dialog"` + focus trap + `aria-modal`, đã kiểm tra là áp dụng nhất quán qua `RequestsPage.tsx`, `FarmManagementActions.tsx`, `ManagerMissionDetailPage.tsx`). Luồng nhiều bước duy nhất tìm thấy (`Steps` trong [ManagerMissionDetailPage.tsx:651-652](src/features/missions/ManagerMissionDetailPage.tsx:651)) lấy `current` từ trạng thái nhiệm vụ phía server (`missionStepIndex`), không phải state client — nên không có rủi ro mất tiến trình khi refresh, không cần sửa.

## Accessibility

### A1 — Drawer menu mobile thiếu focus trap, phím Esc, và trả focus (Nghiêm trọng)

Giống hệt nhau ở cả 3 layout: [AppLayout.tsx:109-111](src/layouts/AppLayout.tsx:109), [SystemManagerLayout.tsx:22](src/layouts/SystemManagerLayout.tsx:22), và SystemAdminLayout.tsx (cùng mẫu). Khi bấm nút hamburger (`mobile-menu-button`) mở `<aside>` làm overlay full-screen trên mobile:

- `<aside>` không có `role="dialog"` + `aria-modal="true"` khi đang mở — trình đọc màn hình không biết đây là lớp phủ che nội dung phía sau.
- Không có `onKeyDown` bắt phím Escape để đóng.
- DOM order: `<aside>` → nút `sidebar-backdrop` → `<main>`. Không có focus trap, nên người dùng bàn phím có thể Tab xuyên qua drawer đang mở để tới nội dung `<main>` bị che khuất phía sau (cả `aria-hidden` lẫn `inert` trên `<main>`/`mobile-header` đều không được set khi `menuOpen`).
- Khi đóng (qua nút `sidebar-close` hoặc backdrop), focus không được trả về nút hamburger đã mở nó — focus rơi về đầu trang hoặc bị mất.

**Fix đề xuất:** thêm `role="dialog" aria-modal={menuOpen}` lên `<aside>`, bắt `Escape` để gọi `setMenuOpen(false)`, dùng `inert` (hoặc `aria-hidden="true"`) trên `<main>`/`mobile-header` khi `menuOpen`, và lưu/trả `ref` của nút hamburger để focus lại sau khi đóng. Vì 3 layout giống hệt nhau, nên rút thành 1 hook/component dùng chung thay vì sửa 3 nơi.

### A2 — `CommonState` không công bố trạng thái động cho trình đọc màn hình (Nghiêm trọng)

[CommonState.tsx:13](src/components/CommonState.tsx:13): nhánh `loading` đặt `aria-label` trực tiếp lên một `<div>` không có `role`. `aria-label` trên phần tử không có role ngữ nghĩa (hoặc role tường minh) **không được công bố** khi nội dung xuất hiện/thay đổi — khác với `role="status"`/`role="alert"` thật sự tạo live-region. Ba nhánh còn lại (`empty`, `forbidden`, `conflict`, `error`, dùng antd `Result`) cũng không có live-region: `Result` của antd không tự thêm `role="alert"`.

Hệ quả: một người dùng trình đọc màn hình đang điền form, bấm submit và gặp lỗi (`Result status="error"`) hoặc xung đột dữ liệu (`Result status="warning"` ở nhánh `conflict`) sẽ **không được thông báo gì** trừ khi họ tình cờ di chuyển focus tới đúng vùng đó. So sánh với [DashboardUI.tsx](src/components/dashboard/DashboardUI.tsx) cùng codebase: `DashboardState` ở đó làm đúng — `role="status"` cho loading, `role="alert"` cho error ([DashboardUI.tsx:32-33](src/components/dashboard/DashboardUI.tsx:32)). `CommonState` được 48 file khác import (toàn bộ `src/features/*`, `src/management/*`) nên đây là khoảng trống rộng nhất trong toàn app.

**Fix đề xuất:** bọc nhánh `loading` bằng `role="status"` (giữ `aria-label`), nhánh `error`/`conflict` bằng `role="alert"` (hoặc `aria-live="assertive"` trên wrapper quanh `<Result>`), theo đúng mẫu đã có sẵn ở `DashboardState`.

### A3 — Màu `#8a8d91` không đạt tương phản AA (Trung bình)

Tính bằng công thức WCAG (relative luminance), `#8a8d91` trên nền trắng `#fff` cho tỷ lệ **3.33:1** — dưới ngưỡng 4.5:1 bắt buộc cho chữ thường (không phải "large text", vì các chỗ dùng đều ở size 9–12px). Bốn chỗ:

- [global.css:235](src/styles/global.css:235) `.workspace-context span` — nhãn "Phạm vi làm việc" trong sidebar, xuất hiện ở **mọi trang có xác thực**.
- [global.css:452](src/styles/global.css:452) `.resource-meta dt` — nhãn meta trong card, dùng ở ~20 trang theo template `resource-*`.
- [global.css:276](src/styles/global.css:276) `.account-button > svg` — icon mũi tên, ít quan trọng hơn vì là icon trang trí chứ không phải text mang nghĩa (không bắt buộc đạt AA text-contrast, nhưng vẫn nên đồng bộ nếu sửa biến màu).
- [revenue.css:13,25](src/features/reports/revenue.css:13) `.revenue-info dt`, `.revenue-metric small` — ở `/system/revenue`.

Để so sánh, `--muted`/`--dw-muted` (`#68746c`) đã được kiểm tra và đạt **4.88:1** — không cần sửa, chỉ riêng `#8a8d91` là vấn đề.

**Fix đề xuất:** đổi `#8a8d91` thành một sắc độ tối hơn trong cùng ramp xám, ví dụ `#73777c` (đạt ~4.6:1) hoặc dùng thẳng `var(--muted)`/`var(--dw-muted)` đã có sẵn và đã qua kiểm tra, để tránh phát sinh thêm một biến màu chưa kiểm chứng.

## UX / Phê bình tương tác

### U1 — Hai thao tác xóa không xác nhận, trong khi hành động tương tự liền kề lại có xác nhận (Nghiêm trọng)

Codebase đã có một chuẩn nhất quán cho thao tác phá hủy: route qua `Popconfirm` (antd) hoặc helper dùng chung `confirmation()` ([management/actions.ts:76](src/management/actions.ts:76)) mở `Modal`. Ví dụ đúng chuẩn: [ManagerMissionDetailPage.tsx:924-928](src/features/missions/ManagerMissionDetailPage.tsx:924) (`Popconfirm` trước khi xác nhận ranh giới), [PreflightChecklistPage.tsx:66](src/features/missions/PreflightChecklistPage.tsx:66) (`confirmation()` trước khi xóa điều kiện checklist), [RequestsPage.tsx:102](src/features/surveys/RequestsPage.tsx:102), [OwnerPaymentsPage.tsx:92](src/features/surveys/OwnerPaymentsPage.tsx:92), [FarmManagementActions.tsx:78](src/features/farms/FarmManagementActions.tsx:78) (đều mở `Modal` yêu cầu lý do/xác nhận trước khi hủy đơn, lưu trữ farm...).

Hai chỗ phá vỡ chuẩn này, gọi hàm thay đổi dữ liệu thẳng từ `onClick`, không qua `Popconfirm`/`confirmation()`:

- [BoundaryTilingPanel.tsx:48](src/features/missions/BoundaryTilingPanel.tsx:48): nút "🗑️ Xóa hết" xóa **toàn bộ** điểm ranh giới người dùng vừa vẽ tay trên bản đồ, không có bước xác nhận nào, không thể hoàn tác (khác với "Xóa điểm cuối" ở dòng 47 là undo từng điểm — rủi ro thấp hơn nhiều).
- [YoloDetectionPanel.tsx:154](src/features/missions/YoloDetectionPanel.tsx:154): nút "Xóa điểm khuyết" xóa ngay lập tức, trong khi **10 dòng bên dưới**, [YoloDetectionPanel.tsx:164](src/features/missions/YoloDetectionPanel.tsx:164) "Xóa trụ này?" — một hành động xóa tương tự về bản chất, cùng component, cùng tác giả — lại được bọc `Popconfirm`. Đây là một vi phạm tính nhất quán rõ ràng ngay trong nội bộ 1 file.

*(Ngoài phạm vi audit này nhưng tiện thấy: nút "Xóa hết" ở trên còn dùng emoji 🗑️ — đúng dấu hiệu slop mà `docs/unslop-audit-2026-11-28.md` chưa quét tới vì đây là sub-panel, không phải route cấp trang. Nêu ở đây để tiện gộp sửa một thể.)*

**Fix đề xuất:** bọc cả hai bằng `Popconfirm` theo đúng mẫu đã dùng ở ngay cạnh chúng — không cần thiết kế pattern mới, chỉ cần áp dụng pattern đã có.

### U2 — Ẩn dấu bắt buộc toàn form trong khi form có field tùy chọn (Trung bình)

[FarmManagementActions.tsx](src/features/farms/FarmManagementActions.tsx) đặt `requiredMark={false}` cho `Form` của modal "Lưu trữ", nhưng form này trộn lẫn:
- `name` (Tên khu vực) — `required: true` ([dòng 87](src/features/farms/FarmManagementActions.tsx:87))
- `areaHectares` (Diện tích) — **không** required, chỉ có validator điều kiện ([dòng 88](src/features/farms/FarmManagementActions.tsx:88))
- `reason` (Lý do lưu trữ) — `required: true` ([dòng 92](src/features/farms/FarmManagementActions.tsx:92))

Khi ẩn dấu `*`, người dùng không có cách nào biết trước field nào bắt buộc — chỉ phát hiện sau khi bấm submit và gặp lỗi validate, vi phạm nguyên tắc "error prevention" của Nielsen. `requiredMark={false}` ở `LoginPage`/`AuthActionPages` không có vấn đề này vì các form đó chỉ có field bắt buộc (ẩn dấu `*` ở form toàn-required là lựa chọn hợp lý, không phải lỗi).

**Fix đề xuất:** bỏ `requiredMark={false}` ở form này (hoặc đổi field `areaHectares` thành optional có text "(không bắt buộc)" cạnh label) để người dùng thấy rõ trước khi nhập.

## Thứ tự ưu tiên đề xuất

1. **A2 — `CommonState` live-region**: 1 file, ~10 dòng sửa, lợi ích rộng nhất (48 nơi dùng).
2. **U1 — 2 nút xóa thiếu xác nhận**: 2 file, áp dụng đúng pattern đã có sẵn, rủi ro mất dữ liệu thật nếu không sửa.
3. **A1 — focus trap drawer mobile**: ảnh hưởng rộng nhưng cần thiết kế 1 hook dùng chung cho 3 layout, tốn công hơn 2 việc trên.
4. **A3 — đổi màu `#8a8d91`**: đổi sang biến đã có sẵn (`var(--muted)`), rất nhanh.
5. **U2 — bật lại `requiredMark`** ở form lưu trữ khu vực: 1 dòng.

Không có mục nào ở mức "chặn hoàn toàn người dùng" (không ai bị khóa cứng không thao tác được), nhưng A1/A2/U1 đều là lỗ hổng thật sự cho người dùng bàn phím/trình đọc màn hình và rủi ro mất dữ liệu — nên xếp *Nghiêm trọng*, không phải *Nhẹ*.
