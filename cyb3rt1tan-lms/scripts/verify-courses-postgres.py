"""BUILD-03 acceptance on the named disposable test DB; never sends mail."""
import json
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import make_url, select, text
from sqlalchemy.exc import DBAPIError

root = Path(__file__).resolve().parents[1]
load_dotenv(root / '.env')
target = os.environ['TEST_DATABASE_URL']
if make_url(target).database != 'codemark_lms_test' or target == os.environ['DATABASE_URL']:
    raise SystemExit('Course verification requires codemark_lms_test.')
os.environ['DATABASE_URL'] = target
os.environ['SMTP_APPROVED'] = 'false'
sys.path.insert(0, str(root / 'api'))
from fastapi.testclient import TestClient
from app.database import SessionLocal, engine
from app.main import app
from app.models import CourseMembership, PracticeAttempt, RunnerJobReceipt, RunnerJobResult, TeachingSession
from app.outbox import enqueue_runner_job
from app.runner_queue import DEAD_LETTER_STREAM, JOB_STREAM, WORKER_GROUP, consume_once, dispatch_once, queue_snapshot, record_result


class MemoryStreams:
    def __init__(self):
        self.streams = {}
        self.groups = set()
        self.pending = set()
        self.delivered = set()
        self.sequence = 0

    def xadd(self, stream, fields):
        self.sequence += 1
        entry_id = f'{self.sequence}-0'
        self.streams.setdefault(stream, []).append((entry_id, dict(fields)))
        return entry_id

    def xgroup_create(self, stream, group, **_kwargs):
        self.groups.add(group)
        self.streams.setdefault(stream, [])

    def xautoclaim(self, *_args, **_kwargs):
        return '0-0', [], []

    def xreadgroup(self, _group, _consumer, streams, **_kwargs):
        stream = next(iter(streams))
        entries = []
        for entry_id, fields in self.streams.get(stream, []):
            if entry_id not in self.delivered:
                self.delivered.add(entry_id)
                self.pending.add(entry_id)
                entries.append((entry_id, dict(fields)))
        return [(stream, entries)] if entries else []

    def xack(self, _stream, _group, entry_id):
        self.pending.discard(entry_id)
        return 1

    def xlen(self, stream):
        return len(self.streams.get(stream, []))

    def xinfo_groups(self, _stream):
        return [{'name':WORKER_GROUP,'pending':len(self.pending),'lag':0,'consumers':1}]

    def close(self):
        return None

origin = {'Origin':'http://127.0.0.1:3100'}
password = 'Build01-test-workspace-only!'
with TestClient(app) as admin, TestClient(app) as student, TestClient(app) as teacher:
    for client, name in [(admin,'qa.admin'),(student,'qa.student'),(teacher,'qa.teacher')]:
        assert client.post('/v1/auth/login', headers=origin, json={'username':name,'password':password}).status_code == 200
    headers = {**origin,'X-CSRF-Token':admin.cookies['lms_csrf']}
    student_id = student.get('/v1/me').json()['id']
    teacher_id = teacher.get('/v1/me').json()['id']
    initial_taxonomy = admin.get('/v1/question-taxonomy?includeRetired=true')
    assert initial_taxonomy.status_code == 200 and initial_taxonomy.json()['catalogVersion'] == 1
    taxonomy_path = root / 'web' / 'public' / 'learning-taxonomy.example.json'
    taxonomy_seed = json.loads(taxonomy_path.read_text(encoding='utf-8'))
    taxonomy_seed.pop('catalogVersion', None)
    taxonomy_seed['expectedCatalogVersion'] = 1
    imported_taxonomy = admin.post('/v1/admin/taxonomy/seed',headers=headers,json=taxonomy_seed)
    assert imported_taxonomy.status_code == 201, imported_taxonomy.text
    assert imported_taxonomy.json() == {'catalogVersion':2,'categories':6,'tags':67}
    category = admin.post('/v1/admin/question-taxonomy/categories',headers=headers,json={
        'id':'qa-algorithms','names':{'en':'QA Algorithms','vi':'QA Thuật toán'}})
    assert category.status_code == 201, category.text
    child_category = admin.post('/v1/admin/question-taxonomy/categories',headers=headers,json={
        'id':'qa-sorting','names':{'en':'QA Sorting','vi':'QA Sắp xếp'},'parentId':'qa-algorithms'})
    assert child_category.status_code == 201, child_category.text
    tag = admin.post('/v1/admin/question-taxonomy/tags',headers=headers,json={
        'id':'qa-stable-sort','names':{'en':'QA Stable sort','vi':'QA Sắp xếp ổn định'},
        'applicability':['multipleChoice']})
    assert tag.status_code == 201, tag.text
    assert admin.patch('/v1/admin/question-taxonomy/categories/qa-algorithms',headers=headers,
                       json={'parentId':'qa-sorting'}).status_code == 422
    assert admin.patch('/v1/admin/question-taxonomy/categories/qa-algorithms',headers=headers,
                       json={'status':'retired'}).status_code == 409
    live_taxonomy = admin.get('/v1/question-taxonomy').json()
    assert live_taxonomy['catalogVersion'] == 5 and len(live_taxonomy['categories']) == 8
    assert any(tag['id'] == 'qa-stable-sort' for tag in live_taxonomy['tags'])
    old_tag = admin.post('/v1/admin/question-taxonomy/tags',headers=headers,json={
        'id':'qa-legacy-sort','names':{'en':'QA Legacy sort'},'applicability':['multipleSelect']})
    assert old_tag.status_code == 201
    merged = admin.post('/v1/admin/question-taxonomy/tags/qa-legacy-sort/merge',headers=headers,json={'targetId':'qa-stable-sort'})
    assert merged.status_code == 200, merged.text
    redirects = admin.get('/v1/question-taxonomy?includeRetired=true').json()['redirects']
    assert {'kind':'tag','sourceId':'qa-legacy-sort','targetId':'qa-stable-sort'} in redirects
    assert 'usageCount' not in student.get('/v1/question-taxonomy').json()['categories'][0]
    lesson_taxonomy = admin.get('/v1/taxonomy').json()
    assert len(lesson_taxonomy['categories']) == 6 and len(lesson_taxonomy['tags']) == 67
    assert admin.post('/v1/admin/faculties',headers=headers,json={'facultyId':'qa-cs','names':{'en':'QA Computer Science'}}).status_code == 201
    assert admin.post('/v1/admin/academic-terms',headers=headers,json={'termCode':'qa-2026','name':'QA Term','startsAt':'2026-01-01T00:00:00+07:00','endsAt':'2026-12-31T00:00:00+07:00','timezone':'Asia/Bangkok'}).status_code == 201
    created = admin.post('/v1/courses',headers=headers,json={'courseCode':'QA-CS101','title':'QA Course','facultyId':'qa-cs','termId':'qa-2026','timezone':'Asia/Bangkok'})
    assert created.status_code == 201, created.text
    course = created.json()
    path = '/v1/courses/'+course['id']
    assert admin.post(path+'/enrollments',headers=headers,json={'userId':student_id}).status_code == 201
    assert student.get(path).status_code == 404
    assert admin.post(path+'/staff',headers=headers,json={'userId':teacher_id,'staffRole':'teacher','ownerTransfer':True,'reason':'QA ownership check'}).status_code == 201
    assert admin.post(path+'/activate',headers=headers,json={'reason':'QA activation'}).status_code == 200
    assert student.get(path).status_code == 200
    assert student.get(path+'/enrollments').status_code == 403
    question_body = {
        'questionType':'multipleChoice','title':'QA Question','prompt':'Choose one.',
        'categoryId':'qa-algorithms','difficulty':'newbie','language':'en',
        'usageTypes':['practice','exam'],'tagIds':['qa-stable-sort'],
        'content':{'contentType':'multipleChoice','choices':[
            {'choiceId':'a','text':'A'},{'choiceId':'b','text':'B'}]},
        'authoringConfig':{'configType':'multipleChoice','correctChoiceIds':['a']}}
    question = admin.post(path+'/questions',headers=headers,json=question_body)
    assert question.status_code == 201, question.text
    qid, qvid = question.json()['questionId'], question.json()['questionVersionId']
    validated = admin.post(f'/v1/questions/{qid}/versions/{qvid}/validate',headers=headers)
    assert validated.status_code == 200 and validated.json()['valid'], validated.text
    published_question = admin.post(f'/v1/questions/{qid}/versions/{qvid}/publish',headers=headers)
    assert published_question.status_code == 202, published_question.text
    student_question = student.get(path+'/questions?q=QA%20Question').json()['items']
    assert len(student_question) == 1 and 'authoringConfig' not in student_question[0]
    student_headers = {**origin,'X-CSRF-Token':student.cookies['lms_csrf']}
    assessment = admin.post(path+'/assessments',headers=headers,json={
        'kind':'exam','title':'QA Exam','instructions':'Choose an answer.',
        'timezone':'Asia/Bangkok','durationMinutes':60,'attemptLimit':1,
        'questionVersionIds':[qvid]})
    assert assessment.status_code == 201, assessment.text
    assessment_id = assessment.json()['id']
    assert admin.post(path+f'/assessments/{assessment_id}/publish',headers=headers).status_code == 202
    learner_list = student.get(path+'/assessments').json()['items']
    assert len(learner_list) == 1 and 'questionItems' not in learner_list[0]
    attempt = student.post(path+f'/assessments/{assessment_id}/attempts',headers=student_headers)
    assert attempt.status_code == 201 and attempt.json()['assessment']['questionItems'][0]['questionVersionId'] == qvid
    attempt_id = attempt.json()['attemptId']
    saved = student.put(path+f'/assessments/{assessment_id}/attempts/{attempt_id}/answers',
        headers={**student_headers,'If-Match':'"1"'},json={'answers':{qvid:'a'}})
    assert saved.status_code == 200 and saved.json()['revision'] == 2, saved.text
    submitted = student.post(path+f'/assessments/{assessment_id}/attempts/{attempt_id}/submit',
        headers={**student_headers,'If-Match':'"2"'})
    assert submitted.status_code == 200 and submitted.json()['status'] == 'submitted', submitted.text
    practice = student.post(path+'/practice/attempts',headers=student_headers,json={
        'questionVersionId':qvid,'answer':'a'})
    assert practice.status_code == 201 and practice.json()['score'] == 1, practice.text
    assert len(student.get(path+'/practice/history').json()['items']) == 1
    audio = admin.post('/v1/courses/'+course['id']+'/question-assets',headers={**headers,'Content-Type':'audio/ogg','X-Question-Asset-Kind':'audio'},content=b'OggS-postgres-qa')
    assert audio.status_code == 201, audio.text
    audio_id = audio.json()['assetId']
    assert student.get('/v1/question-assets/'+audio_id).status_code == 404
    listening_body = {
        'questionType':'listeningSet','title':'QA Listening','prompt':'Listen and answer.',
        'categoryId':'qa-algorithms','difficulty':'newbie','language':'en','usageTypes':['practice'],'tagIds':[],
        'content':{'contentType':'listeningSet','audioAssetId':audio_id,'childQuestionVersionIds':[qvid],'playLimit':2},
        'authoringConfig':{'configType':'listeningSet','children':[{'questionVersionId':qvid,'questionType':'multipleChoice','points':1}]}
    }
    listening = admin.post(path+'/questions',headers=headers,json=listening_body)
    assert listening.status_code == 201, listening.text
    listening_id, listening_version = listening.json()['questionId'], listening.json()['questionVersionId']
    listening_check = admin.post(f'/v1/questions/{listening_id}/versions/{listening_version}/validate',headers=headers)
    assert listening_check.status_code == 200 and listening_check.json()['valid'], listening_check.text
    assert admin.post(f'/v1/questions/{listening_id}/versions/{listening_version}/publish',headers=headers).status_code == 202
    assert student.get('/v1/question-assets/'+audio_id).content == b'OggS-postgres-qa'
    queue = MemoryStreams()
    runner_job_id = str(uuid.uuid4())
    job = {
        'jobId':runner_job_id,'idempotencyKey':'qa-attempt-question-v1','attemptId':'qa-attempt',
        'questionVersionId':qvid,'profileId':'qa-python','profileVersion':1,
        'sourceFiles':[{'relativePath':'Main.py','content':'print(1)'}],
        'testCaseSetId':'qa-tests-v1','limits':{'wallTimeMs':1000,'cpuTimeMs':1000,'memoryBytes':1048576}}
    with SessionLocal.begin() as db:
        runner_outbox = enqueue_runner_job(db,str(uuid.uuid4()),None,job)
        runner_outbox_id = runner_outbox.id
    assert dispatch_once(SessionLocal,queue) == 1
    assert consume_once(SessionLocal,queue,'qa-consumer') == 1
    with SessionLocal() as db:
        receipt = db.get(RunnerJobReceipt,runner_job_id)
        assert receipt is not None and receipt.outbox_id == runner_outbox_id
        result = {'jobId':runner_job_id,'status':'completed','finishedAt':'2026-11-15T10:00:00Z','testResults':[]}
        assert record_result(db,result).job_id == runner_job_id
        db.commit()
    result_digest = None
    with SessionLocal() as db:
        result_digest = db.get(RunnerJobResult,runner_job_id).result_digest
    with SessionLocal.begin() as db:
        assert record_result(db,result).result_digest == result_digest
    queue.xadd(JOB_STREAM,{'jobId':'source-fragment','payload':'private source must not enter dead letter'})
    assert consume_once(SessionLocal,queue,'qa-consumer') == 0
    assert 'payload' not in queue.streams[DEAD_LETTER_STREAM][0][1]
    with SessionLocal() as db:
        snapshot = queue_snapshot(db,queue)
        assert snapshot['streamLength'] == 2 and snapshot['pending'] == 0 and snapshot['lag'] == 0
        assert snapshot['deadLetterLength'] == 1
    runtime_profile = {
        'profileId':'qa-python','language':'python','languageVersion':'3.13',
        'imageDigest':'sha256:'+'a'*64,'allowedLibraries':[],
        'resourceCaps':{'wallTimeMs':1000,'cpuTimeMs':1000,'memoryBytes':1048576,'maxSourceBytes':65536},
        'sandbox':{'network':'disabled','nonRootUser':True,'readOnlyRootFilesystem':True,
                   'dropAllCapabilities':True,'ephemeralWorkspace':True,'secretMounts':False}}
    profile = admin.post('/v1/admin/runtime-profiles',headers=headers,json=runtime_profile)
    assert profile.status_code == 201, profile.text
    assert profile.json()['profile']['status'] == 'draft' and profile.json()['executionAvailable'] is False
    version = admin.get(path).json()['revision']
    plan = admin.put(path+'/lesson-plan',headers={**headers,'If-Match':f'"{version}"'},json={'entries':[{'week':'1','topic':'QA Topic','position':1}]})
    assert plan.status_code == 200, plan.text
    assert admin.put(path+'/lesson-plan',headers={**headers,'If-Match':f'"{version}"'},json={'entries':[]}).status_code == 409
    entry = plan.json()['entries'][0]['entryId']
    teaching = admin.post(path+'/sessions',headers=headers,json={'startsAt':'2026-11-20T09:00:00+07:00','endsAt':'2026-11-20T10:00:00+07:00','timezone':'Asia/Bangkok','lessonPlanEntryId':entry})
    assert teaching.status_code == 201, teaching.text
    version = admin.get(path).json()['revision']
    series = admin.post(path+'/session-series',headers={**headers,'If-Match':f'"{version}"'},json={
        'startsAt':'2026-11-27T09:00:00+07:00','endsAt':'2026-11-27T10:00:00+07:00',
        'timezone':'Asia/Bangkok','frequency':'weekly','interval':1,'occurrences':2,'lessonPlanEntryId':entry})
    assert series.status_code == 201 and len(series.json()['items']) == 2, series.text
    assert series.json()['items'][1]['startsAt'].startswith('2026-12-04T02:00:00')
    exception = admin.patch(path+'/sessions/'+series.json()['items'][1]['id'],headers={**headers,'If-Match':series.headers['etag']},json={
        'status':'cancelled','reason':'QA room exception','room':'A-102'})
    assert exception.status_code == 200 and exception.json()['status'] == 'cancelled', exception.text
    assert len(admin.get(path+'/sessions').json()['items']) == 3
    version = admin.get(path).json()['revision']
    resources = admin.put(path+'/resources',headers={**headers,'If-Match':f'"{version}"'},json={'items':[
        {'kind':'learningResource','title':'QA Notes','note':'Chapter one','coverage':'Introduction','url':'https://example.test/notes','position':0}]})
    assert resources.status_code == 200 and resources.json()['items'][0]['title'] == 'QA Notes', resources.text
    version = admin.get(path).json()['revision']
    draft_scheme = admin.post(path+'/grade-schemes',headers={**headers,'If-Match':f'"{version}"'},json={
        'components':[{'componentId':'midterm','name':'Midterm','weight':40},{'componentId':'final','name':'Final','weight':60}],
        'bands':[{'minimumScore':0,'label':'F'},{'minimumScore':100,'label':'A'}]})
    assert draft_scheme.status_code == 201, draft_scheme.text
    published = admin.post(path+'/grade-schemes/'+draft_scheme.json()['id']+'/publish',headers={**headers,'If-Match':draft_scheme.headers['etag']})
    assert published.status_code == 202 and admin.get(path+'/grade-scheme').json()['version'] == 1, published.text
    version = admin.get(path).json()['revision']
    assert admin.put(path+'/lesson-plan',headers={**headers,'If-Match':f'"{version}"'},json={'entries':[]}).status_code == 409
    rule = {'ruleId':'qa-conduct','category':'classroomConduct','title':'Respect','body':'Listen to each other.','position':0}
    template = admin.post('/v1/admin/course-rule-templates',headers=headers,json={'rules':[rule]})
    assert template.status_code == 201, template.text
    assert admin.post('/v1/admin/course-rule-templates/'+template.json()['id']+'/activate',headers=headers).status_code == 200
    assert admin.put(path+'/rules',headers={**headers,'If-Match':f'"{version}"'},json={'expectedTemplateVersion':template.json()['version'],'overrides':[{'ruleId':'qa-conduct','action':'override','title':'Respect everyone','body':'Take turns speaking.'}],'customRules':[]}).status_code == 200
    assert student.get(path+'/rules').json()['rules'][0]['body'] == 'Take turns speaking.'
    history = admin.get(path+'/rules/history').json()['items']
    assert len(history) == 2 and history[0]['rules'][0]['body'] == 'Take turns speaking.'
    with engine.connect() as connection:
        try:
            connection.execute(text("UPDATE course_rule_publications SET rules='[]'::json WHERE course_id=:id AND version=1"), {'id':course['id']})
            connection.commit()
            raise AssertionError('PostgreSQL allowed a Course Rules publication to change.')
        except DBAPIError:
            connection.rollback()
        for statement, params, description in (
            ("UPDATE question_versions SET title='Tampered' WHERE id=:id", {'id':qvid}, 'question version content'),
            ("UPDATE question_versions SET status='draft' WHERE id=:id", {'id':qvid}, 'published question status'),
            ("DELETE FROM question_version_tags WHERE question_version_id=:id", {'id':qvid}, 'published question tags'),
            ("UPDATE question_assets SET digest='tampered' WHERE id=:id", {'id':audio_id}, 'question asset'),
            ("DELETE FROM runner_job_receipts WHERE job_id=:id", {'id':runner_job_id}, 'runner job receipt'),
            ("DELETE FROM runner_job_results WHERE job_id=:id", {'id':runner_job_id}, 'runner result'),
            ("UPDATE practice_attempts SET score=0 WHERE id=:id", {'id':practice.json()['attemptId']}, 'practice attempt'),
            ("DELETE FROM practice_attempts WHERE id=:id", {'id':practice.json()['attemptId']}, 'practice attempt'),
            ("UPDATE runtime_profile_versions SET profile='{}'::json WHERE profile_id='qa-python'", {}, 'runtime profile metadata'),
        ):
            try:
                connection.execute(text(statement), params)
                connection.commit()
                raise AssertionError(f'PostgreSQL allowed mutation of {description}.')
            except DBAPIError:
                connection.rollback()
        try:
            connection.execute(text("UPDATE grade_scheme_versions SET components='[]'::json WHERE id=:id"), {'id':draft_scheme.json()['id']})
            connection.commit()
            raise AssertionError('PostgreSQL allowed a published grade scheme version to change.')
        except DBAPIError:
            connection.rollback()
    assert admin.post(path+'/complete',headers=headers,json={'reason':'QA completion'}).status_code == 200
    assert admin.post(path+'/archive',headers=headers,json={'reason':'QA history'}).status_code == 200
    assert student.get(path+'/lesson-plan').json()['entries'][0]['entryId'] == entry
    assert admin.post('/v1/admin/courses/'+course['id']+'/restore',headers=headers,json={'reason':'QA restoration'}).json()['status'] == 'completed'
    assert len(admin.get('/v1/admin/users?courseId='+course['id']).json()['items']) == 1
    with SessionLocal() as db:
        assert db.get(CourseMembership,(course['id'],student_id)).status == 'active'
        assert len(list(db.scalars(select(TeachingSession).where(TeachingSession.course_id == course['id'])))) == 3
print('PASS: PostgreSQL taxonomy/question authoring, assessment recipient snapshots and attempt start/autosave/submit, safe published projections, runtime metadata, Redis Streams runner admission/results/dead-letter metrics, immutable versions, recurrence/exceptions, resources/grade schemes, Course Rules history and archive retention.')
print('Only codemark_lms_test was modified; no email was sent.')
