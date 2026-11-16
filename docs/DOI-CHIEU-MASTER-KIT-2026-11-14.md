# Đối chiếu CodeMark với master-kit (1)

Ngày kiểm tra: 14/11/2026. Phương pháp: đọc mã nguồn, cấu hình, manifest, hợp đồng và tài liệu; không build, không chạy test, không gọi API, không khởi động lại ứng dụng, không migrate hay thay đổi database.

## Kết luận

**CodeMark hiện tại chưa đáp ứng đầy đủ mô tả trong `master-kit (1)`.** Có các luồng LMS thực tế trong source, nhưng khác kiến trúc và nhiều quy tắc nghiệp vụ. Không có cơ sở để gán trạng thái Done BUILD-025–029 của bộ tài liệu cho mã CodeMark này.

`SPECIFICATION.md` của CodeMark chủ động mô tả Java/Spring Boot, H2/MariaDB và native WebSocket. `master-kit (1)` mô tả Cyb3rt1tan LMS với Python/FastAPI, PostgreSQL và Socket.IO/Redis. Đây là hai baseline khác nhau; Java tự nó không phải lỗi. Muốn lấy master-kit làm tiêu chí nghiệm thu thì cần thống nhất các khác biệt kiến trúc và hoàn thiện các hành vi dưới đây.

## Phạm vi và cách hiểu trạng thái

- Đối tượng chính: `backend/`, `frontend/`, `scripts/`, `.github/workflows/ci.yml`, manifest và cấu hình ở `D:\CodeMark`. `scripts/dev.mjs` chọn trực tiếp hai thư mục backend/frontend ở gốc.
- Kiểm kê được 60 tệp Java trong main, 15 tệp Java trong test, 22 tệp Next.js `page.tsx` và 114 annotation mapping HTTP. Đây là số lượng tệp/khai báo, không phải số tính năng đạt hoặc kết quả test.
- Đã đọc các controller, entity, service và thành phần frontend trọng tâm cho identity, access, course, question/assessment, grading, attendance, rank, rewards, realtime, reporting và preferences.
- Nguồn yêu cầu: `PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `SECURITY_STANDARDS.md`, `DECISIONS.md`, OpenAPI/schema, `API_CONTRACTS.md`, ADR-0010 và snapshot mới nhất trong `PROJECT_STATE.md`/`BUILDING_PROCESS.md`.
- Với thực thi mã nguồn, áp dụng ADR-0010 mới nhất: không chạy/chấm tự động mã sinh viên; gVisor là đề xuất lịch sử. Không lấy mô tả cũ để yêu cầu bật runner.
- “Có trong source” chỉ xác nhận có đường xử lý và dữ liệu tương ứng. “Một phần” nghĩa là có luồng cơ bản nhưng thiếu điều kiện nghiệm thu. “Chưa thấy” nghĩa là không tìm được implementation trong phạm vi mã nguồn đã kiểm tra; không khẳng định về ứng dụng khác hoặc hệ thống bên ngoài.

## Ma trận đối chiếu

| Nhóm | Master-kit yêu cầu | CodeMark hiện tại | Đánh giá |
| --- | --- | --- | --- |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Alembic | Java 21, Spring Boot 3.5.7, JPA/Hibernate | Khác kiến trúc |
| Frontend | Next.js 16, React 19, Tailwind 3, Font Awesome 6 | Lockfile ghi Next.js 15.5.28, React 19.3.1, Tailwind 3.4.19, Font Awesome 6.7.2 | Khớp một phần stack |
| Database | PostgreSQL 17, migration có phiên bản, audit/outbox bền vững | JDBC mặc định H2; có driver MariaDB; Hibernate `ddl-auto=update`; chưa có PostgreSQL JDBC driver | Chưa khớp |
| API/ID | Contract `/v1`, DTO/error envelope theo OpenAPI, ID public ngẫu nhiên | API `/api`; DTO/type viết riêng; lỗi `{error: ...}`; public ID kiểu Long tăng dần | Khác contract |
| Vai trò | 6 vai trò, một người có thể nhiều vai trò; grant theo course có hạn/thu hồi | 4 vai trò admin/teacher/ta/student; một trường `User.role`; courseRole + cờ staff | Chưa đủ |
| Tài khoản | CSV identity/enrollment, email invitation, người dùng tự đặt mật khẩu, MFA, suspend/restore | CSV `studentId,password`, Admin đặt/reset mật khẩu; đăng nhập bằng mã 10 số; có revoke session; chưa thấy invitation/MFA/suspend | Một phần, có quy tắc trái đặc tả |
| Khóa học | Module metadata, staff/permissions, lesson plan, Course Rules, grade scheme, archive | Course, enrollment, meetings, lessons, discussion, announcement có API/UI; chưa thấy cấu trúc academic/rules/weighted grade scheme đầy đủ; có xóa cứng | Một phần |
| Taxonomy | Category riêng, tag riêng, seed 6 category/67 tag, question primary category | Một entity LearningTag; seed 73 tag, không có category; question chỉ giữ tagIds; có lọc any/all | Một phần, khác mô hình |
| Loại câu hỏi | 12 nhánh schema, gồm writing/rubric, multiple select, matching, ordering, reading/listening set | API chỉ chấp nhận `mcq`, `short`, `code`; chưa thấy rubric hay set passage/audio | Chưa đủ |
| Version/snapshot | Question version bất biến và snapshot khi publish assignment/exam | Question gắn trực tiếp Assessment, sửa tại chỗ; Attempt không ghim question-version | Chưa khớp |
| Làm bài | Deadline phía server, autosave/revision, resume, acknowledgement, lifecycle đầy đủ | Có deadline, lưu câu trả lời/flags, countdown, resume, submit và chặn quá hạn; chưa thấy acknowledgement, answer revision/ETag theo contract | Một phần |
| Chấm/công bố điểm | Grade revisions, rubric, override reason, công bố riêng, Student chỉ đọc điểm đã release | Có tự chấm MCQ/short và sửa tổng điểm/feedback; DTO trả score/feedback trực tiếp, không có release gate | Chưa khớp |
| Practice | Luyện tập không giới hạn lượt, độc lập điểm chính thức khi chưa đưa vào assessment | Practice dùng chung Assessment/Attempt và maxAttempts (mặc định 1, giới hạn cấu hình tối đa 100); có ràng buộc lịch daily/weekly | Khác mô hình |
| Giám sát thi | Signals, thông báo, điều chỉnh giờ; reset bài giữ timer/history; freeze, pause, appeals, lý do/evidence | Có telemetry và monitor; backend hỗ trợ alert/adjust_time/force_submit; chưa có reset/freeze/pause/appeals; action chưa yêu cầu reason/evidence | Một phần |
| Điểm danh | Present/Late/Absent/Excused, grace period, close đánh dấu vắng, sửa có reason/history | Có token/QR và check-in, close, leave request/evidence/decision; AttendanceRecord không có status và close chỉ đặt active=false | Một phần |
| Student Learning Overview/báo cáo | Tổng hợp theo student/course/time, field-level permissions, CSV/XLSX, kiểm tra quyền khi tạo/tải export | Có dashboard, course stats, gradebook, CSV audit/proctor, PDF rank; chưa thấy Student Learning Overview và report-job/export đúng contract | Một phần |
| Rank/EXP | Không mùa; hai track Student/staff dựa vào EXP thresholds và criteria | Có Season; chỉ tính ledger mùa active; tier theo vị trí 1/2/3/5/10; award giới hạn Student/Teacher | Khác quy tắc cốt lõi |
| Quyền riêng tư leaderboard | Student nickname + practice score; Student xem staff name/rank, không EXP/task details | API trả name, studentId, points cho leaderboard; chưa có nickname trong User | Chưa khớp |
| Coin/economy | Coin ledger, mission version, shop/inventory, escrow/fees, marketplace, clans | Có point ledger, badge/cosmetic và yêu cầu đổi thưởng; chưa thấy Coin/shop/escrow/marketplace/clan | Chưa thấy implementation |
| Realtime | Socket.IO, Redis đa instance, transactional outbox, recover qua API | Native WebSocket, room/session ở ConcurrentHashMap; gửi sau commit nhưng không có durable outbox/Redis | Có realtime, khác kiến trúc và khả năng phục hồi |
| Preferences | Locale/theme/palette cho mọi người, lưu theo account, đồng bộ đa thiết bị; default English | Có EN/VI qua cookie, default VI; theme reward được khóa theo vị trí rank; chưa thấy personal settings API cho 8 palette/light-dark/accessibility | Một phần, khác chính sách |
| Notifications | In-app/email/realtime, emergency acknowledgement, thống kê đã/chưa xác nhận | Có thông báo home/course và teacher alerts; chưa thấy email channel, inbox/acknowledgement/policy theo account | Một phần |
| Audit/security/operations | Append-only audit, reason/diff/correlation, retention/legal hold, Argon2id, MFA, CSRF, login throttle, backup/restore và release evidence | Có audit events, BCrypt, cookie Strict/HttpOnly, Origin check, kiểm tra course và upload; chưa đủ các cơ chế theo chuẩn yêu cầu | Một phần |
| CI | Contract validation và quality/security/release gates | CI gốc gọi Maven verify và frontend build; chưa gọi validator master-kit; không kiểm chứng hosted run trong lượt này | Chưa đủ bằng chứng nghiệm thu |

## Các phát hiện cần ưu tiên

### F01 — Đề/câu hỏi đã giao chưa bất biến

Yêu cầu: snapshot chính xác question-version lúc công bố; thay đổi ngân hàng không thay đổi bài đã giao (`API_CONTRACTS.md:91`).

Bằng chứng:

- [Question.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/Question.java:15): question trỏ trực tiếp tới Assessment, không có version aggregate.
- [AssessmentController.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AssessmentController.java:196): PATCH câu hỏi gọi `questionFields` trên entity hiện tại, không chặn vì đã publish/có attempt.
- [GradingService.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/GradingService.java:78): submit đọc danh sách Question hiện tại để tính điểm.
- [Views.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/Views.java:237): chi tiết attempt cũng lấy câu hỏi hiện tại của assessment.

Hệ quả suy ra từ source: sửa prompt/answer/points sau khi phát hành có thể thay đổi đề hiển thị hoặc kết quả chấm của bài đã bắt đầu. Chưa tái hiện bằng runtime trong lượt kiểm tra này.

### F02 — Điểm/feedback chưa có bước release riêng

Yêu cầu: Student chỉ xem grades/feedback đã Published (`PRODUCT_REQUIREMENTS.md:94`, `:178`; `API_CONTRACTS.md:103`).

[Views.attempt](/D:/CodeMark/backend/src/main/java/com/codemark/lms/Views.java:237) đưa `score`, `teacherFeedback`, `inlineFeedback` vào DTO mà không kiểm tra trạng thái công bố; Attempt chỉ có trạng thái làm/nộp bài. [ManualGradingController](/D:/CodeMark/backend/src/main/java/com/codemark/lms/ManualGradingController.java:46) ghi đè điểm hiện tại, chưa lưu grade revision hoặc yêu cầu override reason riêng.

`Assessment.published` là quyền mở đề, không thay thế trạng thái công bố kết quả.

### F03 — Phân quyền course chưa đạt mô hình grant

Yêu cầu: 6 global roles, đa vai trò và các course permission riêng cho roster/grading/attendance/examMonitoring/export (`PRODUCT_REQUIREMENTS.md:11`, `:89`; `API_CONTRACTS.md:19`).

[User.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/User.java:24) chỉ có một role; [Access.course](/D:/CodeMark/backend/src/main/java/com/codemark/lms/Access.java:71) coi mọi course role khác Student là staff. Bởi vậy quyền TA xem bài/điểm, quản lý assessment hay monitor không có grant riêng. Ngược lại, [ManualGradingController](/D:/CodeMark/backend/src/main/java/com/codemark/lms/ManualGradingController.java:23) cấm TA hoàn toàn, nên chưa hỗ trợ TA đã được Teacher cấp quyền grading.

Ngoài ra, [AssessmentController.attempt](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AssessmentController.java:327) ở nhánh `own=true` chỉ kiểm tra chủ attempt và mạng, chưa tái kiểm tra enrollment. Các route answers/flags/submit dùng nhánh này. Cần xác minh bằng test trường hợp bị rút enrollment giữa lúc làm bài; đây là phát hiện từ luồng source, chưa phải kết quả tái hiện.

### F04 — Leaderboard trả dữ liệu trái quy định privacy

Yêu cầu: Student board dùng nickname/practice score, không công khai institutional ID; Student xem staff chỉ được name/rank (`PRODUCT_REQUIREMENTS.md:35`, `:187–193`).

[RankService.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/RankService.java:229) trả `studentId`, `name`, `points`; nhánh staff cũng trả các trường tương tự ở dòng 89. [RankController](/D:/CodeMark/backend/src/main/java/com/codemark/lms/RankController.java:13) chưa lọc projection theo vai trò người xem; maskCodes trong cấu hình chưa được áp dụng vào các DTO này. Việc che bằng giao diện sẽ không đáp ứng yêu cầu lọc dữ liệu tại API.

### F05 — Có đường xóa cứng dữ liệu học tập

Yêu cầu: suspend/archive, giữ lịch sử học tập và audit (`PRODUCT_REQUIREMENTS.md:27`, phần Course list/lifecycle).

- [AdminController.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AdminController.java:125) gọi `store.delete(u)` sau khi xóa enrollment, thay vì suspend/restore. Foreign key có thể chặn một số trường hợp; không kết luận mọi tài khoản đều xóa được.
- [CourseController.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/CourseController.java:111) xóa course cùng assessment, attempt, proctor event, attendance và các entity liên quan.
- [AssessmentController.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AssessmentController.java:132) xóa assessment cùng bài làm/câu hỏi.

Các đường xử lý này chưa tuân thủ cơ chế lưu lịch sử và retention của master-kit.

### F06 — PostgreSQL local đã cài nhưng backend chưa tích hợp

[application.properties](/D:/CodeMark/backend/src/main/resources/application.properties:7) mặc định dùng H2; [pom.xml](/D:/CodeMark/backend/pom.xml:16) chỉ có H2 và MariaDB runtime driver. Chưa có profile datasource PostgreSQL và migration tương ứng trong source.

Database local được tạo ở lượt trước không đồng nghĩa ứng dụng đã dùng PostgreSQL. Lượt này không đọc dữ liệu DB, đổi datasource, migrate hoặc khởi động lại backend.

### F07 — Rank dùng mùa và vị trí thay vì EXP thresholds

Yêu cầu: không seasonal reset, hai track EXP Student/staff (`PRODUCT_REQUIREMENTS.md:188`, `:242–253`).

[RankService.active](/D:/CodeMark/backend/src/main/java/com/codemark/lms/RankService.java:13) chọn Season đang active; board chỉ cộng ledger của mùa đó. [tierAt](/D:/CodeMark/backend/src/main/java/com/codemark/lms/RankService.java:184) xếp Master/Ruby/Diamond/Gold theo thứ hạng, không dùng ngưỡng `RankTier.threshold` đã lưu. Vì vậy chức năng cấu hình tier hiện có chưa làm rank tuân theo master-kit. Coin và track staff cho TA/Admin/các trợ lý cũng chưa có implementation tương ứng.

### F08 — Identity/security có nhiều khác biệt xác nhận được

- [AdminController.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AdminController.java:93) cho Admin đặt/reset password; [BulkAccountController.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/BulkAccountController.java:16) nhận CSV password. Master-kit yêu cầu invitation và không cho Admin đặt password người dùng.
- [Access.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/Access.java:15) dùng BCrypt, session inactivity 120 giây và raw session ID; `DECISIONS.md:19` yêu cầu Argon2id, opaque session 8 giờ, digest và login throttling.
- [WebConfig.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/WebConfig.java:41) kiểm tra Origin khi có header; chưa thấy CSRF verifier/token, MFA hoặc login rate-limit trong source. Cookie SameSite=Strict là biện pháp hiện có, không đồng nghĩa đã đạt toàn bộ contract CSRF.
- [RankBootstrap.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/RankBootstrap.java:21) có tự tạo Admin bằng thông tin mặc định khi không tìm được Admin đủ điều kiện, kèm bắt đổi password; master-kit yêu cầu bootstrap CLI tương tác một lần.
- [BaseEntity.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/BaseEntity.java:9) dùng IDENTITY Long và DTO/route public sử dụng trực tiếp. Master-kit yêu cầu public identifier ngẫu nhiên; đây là khác biệt thiết kế, không tự chứng minh có lỗi vượt quyền.

### F09 — Điểm danh và monitor mới đạt luồng cơ bản

[AttendanceController.close](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AttendanceController.java:124) chỉ đặt `active=false`; [AttendanceRecord.java](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AttendanceRecord.java:10) không có trường Present/Late/Absent/Excused. Duyệt leave request chỉ cập nhật request, không chuyển bản ghi attendance sang Excused. Chưa thấy đánh dấu Absent khi đóng phiên, late grace, sửa lịch sử có reason.

[RealtimeService.action](/D:/CodeMark/backend/src/main/java/com/codemark/lms/RealtimeService.java:64) hỗ trợ alert/adjust_time/force_submit; chưa có reset work giữ nguyên timer và lịch sử/revision (`PRODUCT_REQUIREMENTS.md:234`), freeze, pause/resume hay appeal. Backend chưa yêu cầu reason/evidence cho các can thiệp giờ/nộp bài; xác nhận ở frontend không thay thế điều kiện phía server.

### F10 — Hướng runner chưa đúng ADR-0010

Mặc định `CODE_RUNNER_ENABLED=false` phù hợp chủ trương tắt thực thi. Tuy nhiên [AssessmentController.run](/D:/CodeMark/backend/src/main/java/com/codemark/lms/AssessmentController.java:250) và [CodeAnswerGrader](/D:/CodeMark/backend/src/main/java/com/codemark/lms/GradingService.java:36) vẫn nối learner source tới ContainerRunner khi bật cấu hình. Source hỗ trợ thêm C++/SQL qua Docker, khác Local Autograder chỉ dùng trusted C/Java/Python và phải tách khỏi LMS theo ADR-0010.

Không kết luận learner runner đang bật trên môi trường chạy thật; lượt này chỉ kiểm tra source/default configuration và không chạy mã sinh viên.

## Các phần có thể giữ làm nền tảng

- API/UI cho course, enrollment, lesson, announcement/discussion và schedule đã có source thực tế.
- Question DTO tách answer key cho staff; hidden test không được đưa vào danh sách testcase Student.
- Attempt có deadline server, kiểm tra thời gian khi lưu câu trả lời, flags và submit; start-attempt dùng khóa để giới hạn số lượt; submit có kiểm tra trạng thái để tránh chấm lại tuần tự.
- WebSocket có kiểm tra session/course, room monitor và teacher action; gửi sự kiện sau commit.
- QR/token attendance dùng AES-GCM; upload minh chứng có giới hạn kích thước, kiểm tra loại/magic bytes, tên file ngẫu nhiên và download kiểm tra quyền.
- PointEntry có chặn update/delete tại JPA và có xử lý chống thưởng lặp trong những luồng hiện có. Đây chưa phải Coin ledger/economy hoàn chỉnh.
- Có ngôn ngữ EN/VI, Font Awesome đóng gói local, role workspace và các tệp test tích hợp. Chưa xác nhận chúng chạy thành công ở lượt này.

## Độ tin cậy của tài liệu và tổ chức repo

1. `master-kit (1)/PROJECT_STATE.md:3` ghi BUILD-030 Active và các BUILD trước Done trên dự án `cyb3rt1tan-lms`; thư mục ứng dụng được nhắc tới không có ở workspace. README/TASKS/báo cáo cũ còn nội dung chưa đồng bộ. Phải tách yêu cầu mong muốn khỏi bằng chứng triển khai trên máy khác.
2. `master-kit (1)/modules/*` phần lớn là README scaffold. Chưa có runtime adapter/CLI/core theo cấu trúc AI Development Master Kit. Bộ tài liệu đang chứa đồng thời nền tảng AI tooling ban đầu và sản phẩm LMS; cần xác định phần nào thuộc tiêu chí nghiệm thu CodeMark.
3. Có bản sao `codemark-lms/` với `.git` riêng. 60 tệp Java main trùng nội dung với bản gốc; nhóm app/components/lib/locales frontend có 41 tệp chung khác nội dung. Báo cáo này lấy frontend ở gốc làm chuẩn vì launcher/workspace dùng bản đó; không gộp các tính năng chỉ có ở bản sao.
4. CI gốc chưa gọi `master-kit (1)/scripts/validate_contracts.py`. Workflow nằm trong `.github` của thư mục con không tự trở thành workflow của repository gốc.
5. Phép `_schema_discriminators` trong validator chỉ đọc properties trực tiếp của nhánh oneOf, trong khi schema dùng `$ref`; kiểm tra riêng ở lượt phân tích trước trả tập rỗng ở cả hai schema 12 loại. Cần sửa resolve `$ref`/allOf và kiểm tra tập không rỗng trước khi dùng phép so sánh này làm bằng chứng tính nhất quán.

## Thứ tự xử lý đề xuất

1. Chốt baseline giữa SPECIFICATION của CodeMark và master-kit: giữ Java và điều chỉnh kiến trúc đã duyệt, hoặc thực hiện một kế hoạch chuyển stack riêng. Không nên thay backend chỉ vì hai bộ tài liệu khác nhau.
2. Ưu tiên bảo toàn dữ liệu và privacy: snapshot/version câu hỏi, release điểm, granular course permissions, projection leaderboard và archive/suspend.
3. Hoàn thiện identity/invitation/MFA, public IDs, audit/security; chuẩn bị datasource/driver/migrations PostgreSQL và kế hoạch chuyển dữ liệu trước khi thay database.
4. Bổ sung taxonomy category, các loại câu hỏi/rubric, attendance status, reset/incident workflow và Student Learning Overview/report exports.
5. Điều chỉnh rank không mùa theo EXP và triển khai Coin/economy/clan, preferences/notifications khi tới phạm vi tương ứng.
6. Đồng bộ backlog/bằng chứng và nối contract checks vào CI. Build, runtime tests, browser E2E, database migration/restore và deployment acceptance cần thực hiện trong một lượt kiểm chứng sau, theo phạm vi được yêu cầu.

Không đưa phần trăm hoàn thành vì chưa có bộ tiêu chí nghiệm thu có trọng số và chưa kiểm chứng runtime. Kết luận của báo cáo là mức độ khớp từ source, không phải chứng nhận tính ổn định hoặc an toàn của môi trường đang chạy.
