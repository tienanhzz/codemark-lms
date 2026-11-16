# BUILD-024 — Workspace và các trang phụ theo vai trò

Scope nguồn: **frontend preview**, không nghiệm thu nghiệp vụ backend chưa có. Tái sử dụng 12 routes live trước đó và bổ sung 39 routes preview; không seed tài khoản, bản ghi học vụ hoặc balance giả vào database.

- Student: progress/to-do/published feedback dashboard; course tab preview, practice/question workspace, assignments/assessment, grade/rubric review, attendance/calendar, leaderboard/achievements/ranks, shop/inventory/marketplace/clans, notifications. Profile/security/settings dùng các màn hình live hiện có.
- Teacher/TA: dashboard/course/attention/chart/activity, lesson plan/calendar, students/roster/individual learning overview, question bank/12-format authoring, assignment/assessment builder, grading/rubric, exam monitor/actions, reports và các trang tài khoản. Course Rules live vẫn ở chi tiết course theo quyền.
- Admin: dashboard/account/import/catalog/rules live, role/permission preview, course/module/staff/enrollment/grade-scheme/integration/audit tab preview, taxonomy, runtime metadata, assessment types/scales, rank/mission/achievement, economy/ledger, shop catalog, disputes/clan admin, templates/branding/logo, audit/retention, global settings và operations.
- Dùng grouped navigation theo **union của các role thật**; không có demo role switch cấp quyền. Administrative/Research Assistant chỉ có self-service/notification preview, không được thấy PII/course data qua preview.
- Reusable list/detail có table/card, search/status/order, Overview/History/Access tabs, related links; local forms chỉ validate trong memory. Bản ghi và biểu đồ hư cấu gắn nhãn trên màn hình, không gọi domain API hoặc lưu localStorage.
- Question preview có choices/review/summary; writing rubric local; 12-format author preview có Code disabled-execution/Listening disabled-upload; branding có square crop sample nhưng upload tắt; exam actions thật tắt.
- **20 web tests pass**: flow identity/course đã có + Student block order, drawer Escape/focus, all-page render/labels, role guards/multi-role, link catalogue, search/details/forms, 12 editors và disabled execution/upload. TypeScript và production build pass.
- HTTP **51 routes**/CSP/404/authentication boundary pass; source contract validator pass 150 paths/174 operations. Không đăng nhập tài khoản thật trong smoke.
- Browser host unavailable; visual/keyboard/mobile inspection qua browser vẫn pending. DOM/HTTP evidence không thay thế visual QA.

Status: **Done for source frontend-preview scope; browser visual QA pending**. Các workflow tương ứng phải nối UI ngay khi triển khai backend trong BUILD-025 onward. Learner-code execution vẫn tắt.
