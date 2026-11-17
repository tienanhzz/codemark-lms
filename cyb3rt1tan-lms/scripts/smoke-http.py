"""HTTP production smoke through the same-origin Next.js proxy; QA test DB only."""
import re
import uuid
from pathlib import Path
import httpx

root = Path(__file__).resolve().parents[1]

with httpx.Client(base_url='http://127.0.0.1:3100', timeout=20) as client:
    assert client.get('/v1/me').headers.get('X-QA-Database') == 'codemark_lms_test', 'Refusing HTTP mutations without the guarded QA server.'
    for route in ['/', '/profile', '/profile-support', '/security', '/settings', '/activity', '/accounts', '/imports', '/mfa-policy', '/accept-invitation', '/forgot-password', '/reset-password', '/courses', '/academic-catalogs', '/course-rules']:
        response = client.get(route)
        assert response.status_code == 200, (route, response.status_code)
        assert "frame-ancestors 'none'" in response.headers['content-security-policy']
        assert 'unsafe-eval' not in response.headers['content-security-policy']
        for asset in set(re.findall(r'(?:src|href)="([^\"]+\.(?:js|css)(?:\?[^\"]*)?)"', response.text)):
            if asset.startswith('/'):
                assert client.get(asset).status_code == 200, asset
    for asset in ['/branding/font.css', '/branding/NotoSans-Regular.ttf', '/favicon.ico']:
        assert client.get(asset).status_code == 200, asset
    assert client.get('/v1/me').status_code == 401
    response = client.post('/v1/auth/login', headers={'Origin': 'http://127.0.0.1:3100'},
                            json={'username': 'qa.admin', 'password': 'Build01-test-workspace-only!'})
    assert response.status_code == 200, response.text
    assert 'HttpOnly' in response.headers.get('set-cookie', '')
    assert 'SameSite=strict' in response.headers.get('set-cookie', '')
    assert client.get('/v1/me').json()['username'] == 'qa.admin'
    # Do not run export/import mutations against any workspace other than the named QA account.
    assert client.get('/v1/workspace/summary').json()['metrics']['accounts'] >= 3
    accounts = client.get('/v1/admin/users').json()['items']
    selected = next(item for item in accounts if item['username'] == 'qa.student')
    assert client.get('/v1/admin/users/' + selected['id']).status_code == 200
    assert client.get('/v1/admin/users/' + selected['id'] + '/sessions').status_code == 200
    assert client.get('/v1/admin/security/mfa-policies').status_code == 200
    assert client.get('/v1/me/security/mfa').status_code == 200
    persistence = client.get('/v1/admin/operations/persistence')
    assert persistence.status_code == 200 and persistence.headers['cache-control'] == 'no-store'
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    config = Config(str(root / 'api/alembic.ini'))
    config.set_main_option('script_location', str(root / 'api/migrations'))
    assert persistence.json()['migrations'] == [ScriptDirectory.from_config(config).get_current_head()]
    assert persistence.json()['dispatcherEnabled'] is False
    assert persistence.json()['pending'] > 0
    courses = client.get('/v1/courses').json()['items']
    course = next(item for item in courses if item['courseCode'] == 'QA-CS101')
    for suffix in ['', '/lesson-plan', '/rules', '/sessions', '/staff', '/enrollments', '/permission-grants']:
        assert client.get('/v1/courses/' + course['id'] + suffix).status_code == 200
    csrf = client.cookies['lms_csrf']
    headers = {'Origin': 'http://127.0.0.1:3100', 'X-CSRF-Token': csrf}
    import io
    from PIL import Image
    image_buffer = io.BytesIO()
    Image.new('RGB', (512, 512), 'navy').save(image_buffer, format='PNG')
    media_revision = client.get('/v1/me/profile').json()['revision']
    avatar_response = client.put('/v1/me/avatar', headers={**headers, 'Content-Type':'image/png', 'If-Match':f'"{media_revision}"'}, content=image_buffer.getvalue())
    assert avatar_response.status_code == 200, avatar_response.text
    avatar_profile = avatar_response.json()
    served_photo = client.get(avatar_profile['avatarUrl'])
    assert served_photo.status_code == 200 and served_photo.headers['content-type'] == 'image/png'
    assert served_photo.headers['cache-control'] == 'no-store'
    assert client.get('/v1/me').json()['avatarUrl'] == avatar_profile['avatarUrl']
    assert client.delete('/v1/me/avatar', headers={**headers, 'If-Match':f'"{avatar_profile["revision"]}"'}).status_code == 200
    assert client.get(avatar_profile['avatarUrl']).status_code == 404
    support_profile = client.post('/v1/profile-support/users/' + selected['id'] + '/access', headers=headers, json={'reason':'HTTP QA support read'})
    assert support_profile.status_code == 200
    assert client.patch('/v1/profile-support/users/' + selected['id'], headers=headers, json={
        'expectedRevision':support_profile.json()['revision'], 'reason':'HTTP QA no-op contact check', 'phone':support_profile.json()['phone'],
    }).status_code == 200
    for format in ['csv', 'xlsx']:
        prepared = client.post('/v1/admin/account-exports', headers=headers, json={
            'kind': 'users', 'format': format, 'query': 'qa.admin', 'reason': 'Isolated HTTP QA export',
        })
        assert prepared.status_code == 201, prepared.text
        export = prepared.json()
        assert export['rowCount'] == 1
        downloaded = client.get(export['downloadPath'])
        assert downloaded.status_code == 200 and downloaded.headers['cache-control'] == 'no-store'
        assert 'attachment' in downloaded.headers['content-disposition']
        if format == 'xlsx':
            import io
            import zipfile
            with zipfile.ZipFile(io.BytesIO(downloaded.content)) as archive:
                assert 'xl/worksheets/sheet1.xml' in archive.namelist()
        else:
            assert b'username' in downloaded.content and b'qa.admin' in downloaded.content
    profile = client.get('/v1/me/profile')
    assert profile.status_code == 200 and profile.headers['cache-control'] == 'no-store'
    initial_profile = profile.json()
    assert client.get('/v1/me/sessions').json()['items']
    assert client.get('/v1/admin/identity-policy').status_code == 200
    assert client.get('/v1/auth/recovery/status').json() == {'available': False}
    assert client.post('/v1/auth/password-resets', headers=headers, json={'email': 'qa.admin@example.test'}).status_code == 503
    changed_profile = client.patch('/v1/me/profile', headers=headers, json={
        'expectedRevision': initial_profile['revision'], 'about': 'HTTP QA self-service check',
    })
    assert changed_profile.status_code == 200, changed_profile.text
    assert client.patch('/v1/me/profile', headers=headers, json={
        'expectedRevision': initial_profile['revision'], 'about': 'stale',
    }).status_code == 409
    assert client.patch('/v1/me/profile', headers=headers, json={
        'expectedRevision': changed_profile.json()['revision'], 'about': initial_profile['about'],
    }).status_code == 200
    # Exercise a real course mutation through the same-origin production proxy.
    draft = client.post('/v1/courses', headers=headers, json={
        'courseCode':'QA-HTTP-' + str(uuid.uuid4())[:8], 'title':'HTTP proxy check',
        'termId':'qa-2026','facultyId':'qa-cs','timezone':'Asia/Bangkok'})
    assert draft.status_code == 201, draft.text
    path = '/v1/courses/' + draft.json()['id']
    assert draft.headers['etag'] == '"1"'
    changed = client.patch(path, headers={**headers,'If-Match':draft.headers['etag']},
                            json={'title':'HTTP ETag verified'})
    assert changed.status_code == 200 and changed.headers['etag'] == '"2"', changed.text
    assert client.patch(path, headers={**headers,'If-Match':'"1"'},
                        json={'title':'Stale edit'}).status_code == 409
    series = client.post(path + '/session-series', headers={**headers,'If-Match':changed.headers['etag']}, json={
        'startsAt':'2026-12-01T09:00:00+07:00','endsAt':'2026-12-01T10:00:00+07:00',
        'timezone':'Asia/Bangkok','frequency':'weekly','interval':1,'occurrences':2,'room':'QA-202'})
    assert series.status_code == 201 and len(series.json()['items']) == 2, series.text
    exception = client.patch(path + '/sessions/' + series.json()['items'][1]['id'],
        headers={**headers,'If-Match':series.headers['etag']},
        json={'status':'cancelled','room':'QA-203','reason':'HTTP QA schedule exception'})
    assert exception.status_code == 200 and exception.json()['status'] == 'cancelled', exception.text
    assert len(client.get(path + '/sessions').json()['items']) == 2
    current_revision = client.get(path).json()['revision']
    resources = client.put(path + '/resources', headers={**headers,'If-Match':f'"{current_revision}"'}, json={'items':[
        {'kind':'learningResource','title':'HTTP QA notes','note':'Chapter one','coverage':'Basics','url':'https://example.test/notes','position':0}]})
    assert resources.status_code == 200 and resources.json()['items'][0]['title'] == 'HTTP QA notes', resources.text
    scheme = client.post(path + '/grade-schemes', headers={**headers,'If-Match':resources.headers['etag']}, json={
        'components':[{'componentId':'midterm','name':'Midterm','weight':40},{'componentId':'final','name':'Final','weight':60}],
        'bands':[{'minimumScore':0,'label':'F'},{'minimumScore':100,'label':'A'}]})
    assert scheme.status_code == 201, scheme.text
    published_scheme = client.post(path + '/grade-schemes/' + scheme.json()['id'] + '/publish',
        headers={**headers,'If-Match':scheme.headers['etag']})
    assert published_scheme.status_code == 202 and client.get(path + '/grade-scheme').json()['version'] == 1
    assert client.post(path + '/enrollments', headers=headers,
                        json={'userId':selected['id']}).status_code == 201
    assert client.get(path + '/teaching-team').status_code == 200
    import hashlib
    enrollment_csv = ('institutional_id,username,course_id,section_id,status\n,qa.student,' + draft.json()['id'] + ',HTTP-A1,active\n').encode()
    created_import = client.post('/v1/admin/csv-imports', headers=headers, json={
        'importKind': 'enrollments', 'templateVersion': 1, 'duplicatePolicy': 'upsert',
    })
    assert created_import.status_code == 201
    import_id = created_import.json()['jobId']
    csv_headers = {**headers, 'Content-Type':'text/csv', 'X-File-SHA256': hashlib.sha256(enrollment_csv).hexdigest()}
    import_preview = client.post('/v1/admin/csv-imports/' + import_id + '/preview', headers=csv_headers, content=enrollment_csv)
    assert import_preview.status_code == 200 and import_preview.json()['summary']['reject'] == 0
    csv_headers.update({'X-Preview-Token': import_preview.json()['previewToken'], 'X-Duplicate-Policy':'upsert','X-Confirm':'true'})
    assert client.post('/v1/admin/csv-imports/' + import_id + '/commit', headers=csv_headers, content=enrollment_csv).status_code == 200
    with httpx.Client(base_url='http://127.0.0.1:3100',timeout=20) as student:
        assert student.post('/v1/auth/login', headers={'Origin':'http://127.0.0.1:3100'},
            json={'username':'qa-student-001','password':'Build01-test-workspace-only!'}).status_code == 200
        assert student.get(path).status_code == 404
        assert client.post(path + '/activate', headers=headers,
                            json={'reason':'QA HTTP visibility check'}).status_code == 200
        assert student.get(path).status_code == 200
        assert student.get(path + '/enrollments').status_code == 403
    preferences = client.get('/v1/me/preferences').json()
    for theme, locale, palette in [('dark', 'vi', 'violet-amber'), ('light', 'en', 'navy-cyan-gold')]:
        preferences.update({'theme': theme, 'locale': locale, 'colorPalette': palette})
        assert client.put('/v1/me/preferences', headers=headers, json=preferences).status_code == 200
        assert client.get('/v1/me/preferences').json()['colorPalette'] == palette
    assert client.post('/v1/auth/logout', headers=headers).status_code == 204
    assert client.get('/v1/me').status_code == 401
print('PASS: 15 production pages/assets/CSP, private avatar bytes/revision/delete, profile support, teaching profiles, recurring schedule exceptions, resources, grade schemes, CSV enrollment/export, proxy ETag/stale writes, Student visibility, preferences/logout.')
print('This is HTTP verification, not a browser visual or interactive test.')
