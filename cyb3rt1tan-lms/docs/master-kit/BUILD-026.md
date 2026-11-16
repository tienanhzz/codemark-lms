T
# BUILD-026 — Identity self-service, local increment 2026-11-15

**Trạng thái: Done — phạm vi chức năng local, 2026-11-15.** Đã triển khai và nối UI cho khôi phục mật khẩu, hồ sơ cá nhân, chính sách biệt danh, quản lý phiên, provisioning/import/export, hỗ trợ hồ sơ và ảnh hồ sơ được bảo vệ. Phần account/MFA/invitation tiếp tục được kiểm tra hồi quy. Browser visual/keyboard/mobile, SMTP thật, hosted CI và release gates của BUILD-033 vẫn pending; các giới hạn này không được xem là đã nghiệm thu.

## Chức năng mới đã nối API/UI

- `/forgot-password`: kiểm tra khả dụng SMTP, nhập email chính thức, thông báo chung cho tài khoản tồn tại/không tồn tại/không hoạt động. Không trả token hoặc tiết lộ tài khoản. SMTP chưa cấu hình thì chức năng gửi bị vô hiệu hóa, có hướng dẫn và tải lại.
- `/reset-password#token=…`: đọc token vào bộ nhớ rồi xóa fragment ngay, kể cả trong React Strict Mode. Token không đi qua query string, local/session storage hay audit. Xác nhận mật khẩu 12–128 ký tự, không toàn khoảng trắng; không tự đăng nhập sau reset.
- Reset token ngẫu nhiên, lưu SHA-256 digest, hết hạn 30 phút, chỉ dùng sau giao email thành công, bị vô hiệu hóa khi gửi lại/thay đổi email hoặc credential/thu hồi quyền truy cập. Hoàn thành reset nguyên tử với thu hồi mọi phiên/challenge và audit/outbox; giữ nguyên phương thức MFA.
- Email gửi sau response qua background task dùng STARTTLS đã phê duyệt. Token thô chỉ tồn tại trong bộ nhớ; process bị dừng trước khi giao email sẽ để token chưa giao, không thể redeem. Không có hàng đợi chứa token thô. Người dùng có thể yêu cầu lại; chuyển sang durable delivery cần thiết kế token riêng, không được đẩy token thô vào outbox hiện tại.
- `/profile`: biệt danh, liên hệ riêng tư, giới thiệu, học hàm/học vị, tùy chọn email trong hồ sơ giảng viên. Danh tính chính thức/role không được chấp nhận trong lệnh tự sửa. PATCH giữ nguyên trường không gửi, kiểm tra revision để tránh ghi đè dữ liệu cũ.
- Biệt danh được chuẩn hóa NFKC/casefold và ràng buộc unique trong DB. Chặn ký tự điều khiển, tên hệ thống dành riêng và từ do Admin cấu hình. Cooldown mặc định 7 ngày, áp dụng cả đổi chữ hoa/thường và xóa biệt danh. Không tự thay biệt danh hiện có khi cập nhật policy.
- `/mfa-policy`: thêm chính sách biệt danh của Admin, cooldown 0–365 ngày, tối đa 200 từ chặn và lý do bắt buộc, có kiểm tra revision.
- `/security`: danh sách phiên cá nhân còn hạn, thời gian theo timezone đã chọn, đánh dấu phiên hiện tại/MFA. Kết thúc phiên phải xác nhận mật khẩu, có CSRF/throttle và chỉ được thao tác phiên của chính mình. Kết thúc phiên hiện tại đăng xuất ngay.
- Mutation sau khi chờ identity lock kiểm tra lại tài khoản, phiên hết hạn và yêu cầu MFA hiện hành. Đổi mật khẩu hiện tại được bảo vệ bằng lock và throttle xác thực lại.
- UI EN/VI, loading/error/empty/success, form có nhãn, dialog khóa khi đang xử lý, layout dùng theme tokens và thích ứng màn hình nhỏ.

## Kiểm chứng increment self-service (0006)

- Migration bổ sung `0006_identity_self_service`: normalized nickname key/change time, `user_profiles`, `identity_policy`, `password_resets`. Giữ nguyên tài khoản và dữ liệu; migration dừng/rollback khi gặp biệt danh cũ trùng sau chuẩn hóa để được xử lý rõ ràng.
- OpenAPI gốc: **158 paths / 184 operations**, 19 JSON Schemas, 17 examples. Thêm 7 paths/11 schemas; DTO web được sinh từ contract. Script đồng bộ chỉ thay block self-service, giữ các phần contract trước đó.
- **68 API tests**, Ruff check/format **39 files**, strict mypy **23 modules** pass. Có kiểm tra response với contract và negative cases cho quyền, CSRF, revision, nickname/cooldown, token hết hạn/dùng lại/không giao, thay credential/email và thu hồi phiên.
- **30 web tests** pass; TypeScript strict và Next production build pass. DOM test có Strict Mode, strip fragment, xác nhận mật khẩu, SMTP unavailable/retry, policy revision/reason và kết thúc phiên. Đây không phải browser visual/E2E.
- PostgreSQL 17: migration downgrade/upgrade/head/drift pass trên `codemark_lms_test`; các bộ identity/course/persistence hồi quy pass. Hai request cạnh tranh redeem cùng token trả **204 và 400**, chỉ một lần thành công; audit/outbox cùng transaction. SMTP giả lập, không gửi email thật. Evidence: [BUILD-026-validation.json](BUILD-026-validation.json).
- HTTP qua web/proxy production với API QA: trang/asset/CSP, profile PATCH/stale rejection, phiên cá nhân, policy, SMTP disabled pass. Read-only route coverage **53 routes**, foundation **14 routes** pass; [workspaces-http.json](workspaces-http.json).
- DB chính `codemark_lms` đã sao lưu riêng tư rồi upgrade lên **0006**. Alembic head/drift và số lượng users/sessions/audit/courses trước/sau khớp. Không seed/reset DB chính, không đổi mật khẩu Admin. Sau QA đã chuyển API về DB chính và khởi động lại web/API.

## Increment provisioning/import/export — 2026-11-15 (0007)

- Hoàn thiện CSV tài khoản v2 với 8 cột `username,email,official_name,institutional_id,role,faculty_id,course_id,section_id`; giữ nguyên mẫu v1 5 cột. Khoa phải hoạt động; lớp phải draft/active. Thêm lớp chỉ tạo/cập nhật ghi danh Student, không ngầm cấp vai trò giảng viên. Tài khoản mới vẫn invited và chỉ nhận enrollment invited; email chưa giao được hiển thị thất bại đúng thực tế.
- Hoàn thiện CSV ghi danh v1 với `institutional_id,username,course_id,section_id,status`. Đối chiếu ID ổn định rồi username, không gộp theo email, không sửa danh tính/credential/role. Hỗ trợ active/invited/withdrawn/completed và upsert/skip; kiểm tra tài khoản Student đủ điều kiện, cột/định danh/lớp/nhóm và duplicate theo cặp user/course.
- Admin quản lý cả hai loại CSV; Administrative Assistant chỉ tạo/xem/preview/commit CSV ghi danh thuộc chính mình. Mỗi request kiểm tra lại phiên/MFA/role sau identity lock; quyền hỗ trợ này không mở quyền xem bài nộp/điểm/roster hoặc xuất dữ liệu định danh.
- Preview/commit vẫn tối đa 1 MB/500 dòng, SHA-256 trên đúng bytes, token preview digest-only có hạn, cần xác nhận. Snapshot thêm revision course/membership; dữ liệu thay đổi sau preview làm commit bị từ chối. Không lưu raw CSV, tên/email hoặc filename. Mọi dòng và audit/outbox cùng transaction; SMTP chỉ chạy sau commit.
- Migration `0007_identity_provisioning`: faculty/source tài khoản có index, metadata loại/version CSV, revision/source/ngày của membership, bảng `account_exports`. Source cũ để legacy; chỉ đánh dấu bootstrap khi có audit bootstrap tương ứng. Ngày ghi danh/kết thúc cũ chưa biết giữ NULL; thay đổi trạng thái mới có thời gian ghi nhận. Upsert lặp không viết lại ngày kết thúc.
- `/accounts` có bộ lọc khoa/lớp/nguồn ngoài search/role/status, hiển thị khoa/nguồn trong chi tiết. `/imports` có chọn loại/version, tải đúng mẫu, hướng dẫn, preview/validation/xác nhận và kết quả; Administrative Assistant chỉ thấy mẫu ghi danh. UI EN/VI, loading/error/success, responsive và controls có nhãn.
- Thêm Admin API `POST /v1/admin/account-exports`, `GET /{id}` và `GET /{id}/download`. Chọn users/enrollments, CSV/XLSX, lọc dữ liệu, bắt buộc lý do. Xuất toàn bộ dữ liệu khớp bộ lọc, tối đa 10.000 dòng; vượt giới hạn bị từ chối, không cắt thầm. Khi xuất ghi danh, account filters áp dụng cho tài khoản, course filter gồm mọi trạng thái enrollment.
- Job chỉ lưu UUID/revisions và metadata bộ lọc không chứa search text/PII. Không lưu nội dung tệp hoặc token tải. Chỉ đúng người tạo còn quyền Admin/phiên/MFA hợp lệ được tải trong 15 phút; kiểm tra revision user/course/membership trước khi tạo bytes, dữ liệu thay đổi yêu cầu tạo bản mới. Tạo job và từng download có audit/outbox. Không đưa password/MFA/địa chỉ liên hệ riêng/điểm/bài nộp vào tệp.
- CSV UTF-8 BOM có escaping chống formula injection. XLSX được tạo trong bộ nhớ bằng OpenXML inline strings, giữ số 0 đầu và Unicode, không có công thức, macro hoặc quan hệ ngoài. Đã kiểm tra cấu trúc XML/ZIP và bytes HTTP; chưa kiểm tra trực quan trong Microsoft Excel.
- Kiểm chứng mới: **82 API tests**, **35 web DOM tests**, Ruff check/format **43 files**, strict mypy **25 modules**, strict TypeScript và Next production build pass. Contract: **161 paths / 187 operations**, 19 JSON Schemas/17 examples; DTO được sinh lại, response CSV status/account/export khớp schema đóng.
- PostgreSQL: full migration cycle/repeated head/drift, hồi quy identity/course/persistence/self-service và provisioning pass. Hai commit cạnh tranh cùng preview trả **200/409**, không ghi danh hai lần. CSV v2, quyền trợ lý, audit/outbox export, expiry/stale/ownership và CSV/XLSX formula safety pass; [evidence](BUILD-026-provisioning-validation.json). Chỉ DB thử nghiệm được tạo fixtures, không gửi mail thật.
- HTTP qua guarded QA server: nhận CSV/XLSX bytes, nhập CSV ghi danh, CSRF/origin/auth, stale writes và hồi quy pass. Script từ chối mutations nếu không có dấu hiệu QA `codemark_lms_test`. **53 routes/14 foundation routes** pass. DB chính đã sao lưu riêng tư rồi nâng lên **0007**, Alembic drift và số lượng users/sessions/audit/courses khớp; không seed/reset hoặc đổi password. Sau kiểm tra đã chuyển lại API/web dùng DB chính.
- Browser inventory được kiểm tra lại: browser list rỗng, browser access host unavailable. Không vòng qua bằng automation khác; visual/keyboard/mobile QA và hosted CI vẫn pending.

Các chức năng BUILD-026 đã hoàn tất trong source local và được kiểm tra qua API, PostgreSQL test DB, DOM, contract và production build. Các cổng vận hành/quan sát sau vẫn pending:

- Kiểm chứng email thật khi có SMTP của đơn vị. Các lần kiểm tra hiện tại dùng mock/SMTP disabled; không bật relay hoặc ghi token vào log.
- Browser visual/keyboard/mobile QA còn pending do browser surface không khả dụng trong phiên làm việc. DOM và HTTP pass không thay thế kiểm chứng này. Hosted CI chưa chạy.

### Hỗ trợ hồ sơ, ảnh và privacy projection

- Administrative Assistant được tìm kiếm người dùng và xem/chỉnh contact email, phone, about, academic title sau khi nhập reason. Mỗi lần xem riêng tư có audit; thay đổi yêu cầu revision, target active/invited và quyền được kiểm tra lại. Identity, roles, credentials, MFA, privacy consent và avatar nằm ngoài allowlist.
- Avatar chỉ lưu ở bảng riêng trong PostgreSQL, khóa theo user, không có public file path. Upload nhận PNG tĩnh tối đa 1 MB, chính xác 512×512; ảnh nguồn trên UI tối đa 2 MB và 2048 px mỗi chiều, được crop thành PNG 512×512. Server xác minh/giải mã, xóa metadata bằng cách tạo ảnh mới, giới hạn kích thước đầu ra và audit UUID/digest mà không ghi bytes. Download chỉ self hoặc course member có quyền hiện hành; UUID cũ, user khác, rút quyền hoặc không còn xem course trả 404. Thay/xóa ảnh tăng profile revision.
- Xử lý ảnh là kiểm tra định dạng, giới hạn tài nguyên và metadata re-encoding; **không phải malware scan**. Không có antivirus scanner cấu hình. Xem [dependency review](../DEPENDENCIES.md) về Pillow 13.0.0, license, lock và scan.
- Teaching team chỉ trả thông tin công khai tối thiểu của giảng viên/TA đang dạy course mà người xem được phép truy cập. Email chính thức chỉ hiện theo privacy opt-in; contact/about/student identifiers/global roles bị loại. Course khác chỉ liệt kê khi viewer có quyền xem và target hiện đang dạy tại đó. Từng request ảnh kiểm tra lại course/staff authorization.

## Kiểm chứng increment profile support/media (0008)

- Thêm migration `0008_protected_avatars`; full downgrade/upgrade/head/schema drift được kiểm tra trên `codemark_lms_test`. Database chính chưa được migrate trong increment này.
- **94 API tests**, **42 web DOM tests**, Ruff, strict mypy (28 modules), strict TypeScript, OpenAPI (168 paths/195 operations), source contract validation và Next production build pass. Đây không phải browser visual/E2E.
- PostgreSQL integration xác nhận profile reason/allowlist/revision, quyền trợ lý, concurrent avatar update (200/409), metadata-free PNG, invalid/animated/oversized image rejection, private self/course access, email opt-in, hidden course exclusion, role withdrawal, audit/outbox atomicity. Evidence: [BUILD-026-profile-media-validation.json](BUILD-026-profile-media-validation.json).
- HTTP smoke mở rộng bao phủ 15 pages/assets/CSP và avatar/support/team endpoints qua guarded QA DB: pass. Workspace HTTP coverage **54 routes**, foundation **15 routes**; sau migration, read-only HTTP checks qua production service cũng pass. Đây không phải browser visual/E2E. Email mock-only; không gửi SMTP thật.
- DB chính `codemark_lms` được backup riêng tư theo ACL rồi nâng lên `0008_protected_avatars`; Alembic head/schema drift và số lượng users/sessions/audit/courses trước/sau khớp. Không seed/reset tài khoản hay đổi mật khẩu. API/web production local được khởi động lại và health/read-only HTTP pass.

Các BUILD domain tiếp theo giữ trạng thái pending theo [execution](../MASTER-KIT-EXECUTION.md).
