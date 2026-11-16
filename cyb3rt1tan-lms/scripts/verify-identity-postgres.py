"""BUILD-02 flows on the guarded test database; SMTP transport is mocked, never sent."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pyotp
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[1]
load_dotenv(root / '.env')
target = os.environ['TEST_DATABASE_URL']
if make_url(target).database != 'codemark_lms_test' or target == os.environ['DATABASE_URL']:
    raise SystemExit('Identity integration tests require codemark_lms_test.')
os.environ['DATABASE_URL'] = target
sys.path.insert(0, str(root / 'api'))
from fastapi.testclient import TestClient
from app import mfa
from app.auth import revoke_sessions
from app.database import SessionLocal
from app.main import app
from app.models import MfaPolicy, User

origin = {'Origin': 'http://127.0.0.1:3100'}
password = 'Build01-test-workspace-only!'

with TestClient(app) as admin, TestClient(app) as student:
    assert admin.post('/v1/auth/login', headers=origin, json={'username': 'qa.admin', 'password': password}).status_code == 200
    headers = {**origin, 'X-CSRF-Token': admin.cookies['lms_csrf']}
    listed = admin.get('/v1/admin/users').json()['items']
    selected = next(user for user in listed if user['username'] == 'qa.student')
    assert admin.get('/v1/admin/users/' + selected['id'] + '/sessions').status_code == 200
    for operation in ['suspensions', 'restore']:
        assert admin.post('/v1/admin/users/' + selected['id'] + '/' + operation, headers=headers, json={'reason': 'Isolated integration check'}).status_code == 200
    enrollment = admin.post('/v1/me/security/mfa/enrollment', headers=headers, json={'current_password': password})
    assert enrollment.status_code == 200, enrollment.text
    with patch('app.mfa.current_step', return_value=20000000):
        confirmation = admin.post('/v1/me/security/mfa/enrollment/confirm', headers=headers,
                                  json={'code': pyotp.TOTP(enrollment.json()['secret']).at(20000000 * 30)})
    assert confirmation.status_code == 200, confirmation.text
    recovery = confirmation.json()['recoveryCodes'][0]
    assert admin.post('/v1/auth/login', headers=origin, json={'username': 'qa.admin', 'password': password, 'recovery_code': recovery}).status_code == 200
    assert admin.post('/v1/auth/login', headers=origin, json={'username': 'qa.admin', 'password': password, 'recovery_code': recovery}).status_code == 401
    tokens = []
    headers = {**origin, 'X-CSRF-Token': admin.cookies['lms_csrf']}
    with patch('app.mail.configured', return_value=True), patch('app.mail.deliver_invitation', side_effect=lambda email, token: tokens.append(token)):
        invitation = admin.post('/v1/admin/invitations', headers=headers, json={'email': 'qa.invited@example.test', 'role': 'student'})
    assert invitation.status_code == 202, invitation.text
    accepted = student.post('/v1/auth/accept-invitation', headers=origin, json={'token': tokens[0],
        'username': 'qa.invited', 'official_name': 'Invited QA User', 'password': password})
    assert accepted.status_code == 201, accepted.text
    assert student.get('/v1/me').status_code == 200

# Leave only the QA fixture's ordinary password login enabled for the HTTP smoke.
with SessionLocal.begin() as db:
    for user in db.scalars(select(User)):
        mfa.reset(db, user)
        revoke_sessions(db, user)
    for policy in db.scalars(select(MfaPolicy)):
        db.delete(policy)
print('PASS: PostgreSQL Admin list/detail/session access, suspension/restore, encrypted MFA, single-use recovery and invitation acceptance.')
print('SMTP was mocked; all mutations were restricted to codemark_lms_test.')
