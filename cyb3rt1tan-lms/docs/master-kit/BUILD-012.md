# BUILD-012 — Student workspace và preview navigation

Scope đúng nguồn: shell/dashboard và các trang preview; không tuyên bố nghiệp vụ assessment/grading/attendance đã chạy thật. Giữ lại login, account-synced preferences và course UI/API đã có.

- Bổ sung Student dashboard theo thứ tự Learning progress → To-do → Published grades/feedback. Course cards đọc summary thật, không bịa tiến độ lesson hoặc điểm; các khối chưa có service ghi unavailable và dẫn đến preview được gắn nhãn.
- Navigation có nhóm/role guard, practice/library, assessment/question preview, grades/rubric, attendance/excusal và calendar. Notifications là trang phụ preview. Trang mới không gọi domain APIs hay lưu sample vào DB/localStorage.
- List/card/search/status/order, chi tiết/tabs, question choices/mark-for-review/submission summary và form validation hoạt động trong bộ nhớ; mutations thật bị khóa rõ ràng.
- Giữ settings EN/VI, sáng/tối, 8 palettes và accessibility qua PostgreSQL; thêm mobile drawer Escape, focus return/trap và scroll lock. Bỏ số BUILD triển khai khỏi dashboard sản phẩm.
- Evidence: 15 web DOM/timezone tests pass; TypeScript và production build pass; HTTP 18 routes/CSP/404/authentication boundary pass; source contracts 150 paths/174 operations pass.
- Browser inventory checked again: browser access host unavailable, browsers list empty. Không thử đường vòng automation; visual/keyboard/responsive inspection thật vẫn pending. DOM tests không thay thế visual QA.

Status: **Done for source preview scope; browser visual QA pending**. BUILD-024 tiếp tục page coverage theo vai trò; các BUILD domain sau phải nối UI với dữ liệu thật.
