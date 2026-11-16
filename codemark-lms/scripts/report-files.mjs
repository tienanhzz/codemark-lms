import fs from 'node:fs';
import path from 'node:path';
function walk(p) { return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name).replaceAll('\\','/')]); }
const added=new Set([
 'IdentityMigration','RankBootstrap','RankModels','RankService','RankController','Csv','BulkAccountController','QuizController'
].map(n=>`backend/src/main/java/com/codemark/lms/${n}.java`));
added.add('frontend/components/admin/BulkAccountForm.tsx');
for(const p of ['backend/src/test/java/com/codemark/lms/RankIntegrationTest.java','backend/src/test/java/com/codemark/lms/IdentityMigrationTest.java','frontend/components/Leaderboard.tsx','frontend/components/InlineConfirm.tsx','frontend/components/course/QuizLinksTab.tsx','frontend/app/(app)/admin/bulk-accounts/page.tsx','frontend/app/(app)/admin/rank/page.tsx','frontend/app/(app)/leaderboard/page.tsx','frontend/app/(app)/rank-adjustment/page.tsx','scripts/migrate-mariadb.ps1','scripts/audit-ui.mjs','scripts/package-source.ps1','scripts/report-files.mjs']) added.add(p);
const modified=['User','Access','Store','AuthController','AdminController','Views','DemoSeed','GradingService','Assessment','AssessmentController','CourseController','RealtimeService'].map(n=>`backend/src/main/java/com/codemark/lms/${n}.java`);
modified.push('backend/src/test/java/com/codemark/lms/LmsIntegrationTest.java','backend/src/test/java/com/codemark/lms/WebSocketIntegrationTest.java','backend/src/main/resources/demo-questions.json','README.md','package-lock.json','frontend/package.json');
for(const dir of ['frontend/app','frontend/components','frontend/lib']) for(const p of walk(dir)) if(!added.has(p)) modified.push(p);
for(const p of walk('docs')) if(!p.endsWith('files-thay-doi.txt')) added.add(p);
fs.writeFileSync('docs/files-thay-doi.txt','FILE MỚI\n'+[...added].sort().join('\n')+'\n\nFILE SỬA (gồm các file giao diện được rà và ghi lại để Việt hóa)\n'+[...new Set(modified)].sort().join('\n')+'\n');
