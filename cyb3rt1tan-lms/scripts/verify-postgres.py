"""Run migration and security integration checks ONLY on the named disposable test DB."""
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
    raise SystemExit('Refusing to reset a database other than codemark_lms_test.')
os.environ['DATABASE_URL'] = target
os.environ['MIGRATION_DATABASE_URL'] = target  # Never inherit a target for real data.
sys.path.insert(0, str(root / 'api'))

from alembic import command
from alembic.config import Config
from app.database import SessionLocal, engine
from app.models import AuditEvent, User
from app.security import passwords
from fastapi.testclient import TestClient
from app.main import app

config = Config(str(root / 'api' / 'alembic.ini'))
config.set_main_option('script_location', str(root / 'api' / 'migrations'))
command.downgrade(config, 'base')
command.upgrade(config, 'head')
command.upgrade(config, 'head')
command.check(config)

with SessionLocal.begin() as db:
    for name, roles in [('qa.admin', ['admin']), ('qa.teacher', ['teacher']),
                         ('qa.student', ['student'])]:
        db.add(User(username=name, official_name={'qa.admin': 'Workspace Administrator',
                    'qa.teacher': 'Minh Nguyen', 'qa.student': 'An Tran'}[name],
                    email=name + '@example.test', roles=roles,
                    password_hash=passwords.hash('Build01-test-workspace-only!')))
    db.add(AuditEvent(action='integration_verified', request_id=str(uuid.uuid4()), detail={}))

with engine.connect() as connection:
    try:
        connection.execute(text("UPDATE audit_events SET action='invalid'"))
        connection.commit()
        raise AssertionError('PostgreSQL audit trigger did not reject UPDATE.')
    except DBAPIError:
        connection.rollback()

with TestClient(app) as client:
    assert client.get('/health/ready').status_code == 200
    headers = {'Origin': 'http://127.0.0.1:3100'}
    assert client.post('/v1/auth/login', headers=headers, json={
        'username': 'qa.admin', 'password': 'Build01-test-workspace-only!'}).status_code == 200
    settings = client.get('/v1/me/preferences').json()
    settings.update({'locale': 'vi', 'colorPalette': 'ocean-teal'})
    headers['X-CSRF-Token'] = client.cookies['lms_csrf']
    assert client.put('/v1/me/preferences', headers=headers, json=settings).status_code == 200
    assert client.get('/v1/me/preferences').json()['locale'] == 'vi'
    assert client.get('/v1/workspace/summary').json()['metrics']['accounts'] == 3
    assert client.post('/v1/auth/logout', headers=headers).status_code == 204
    assert client.get('/v1/me').status_code == 401

with SessionLocal() as db:
    assert len(list(db.scalars(select(User)))) == 3
print('PASS: PostgreSQL migration cycle, repeated upgrade, metadata drift, immutable audit, auth, CSRF, settings persistence and revocation.')
print('QA-only accounts are present ONLY in codemark_lms_test; no production account was created.')
