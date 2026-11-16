"""Browser QA server, isolated from the application database."""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.engine import make_url
import uvicorn

root = Path(__file__).resolve().parents[1]
load_dotenv(root / '.env')
target = os.environ['TEST_DATABASE_URL']
if make_url(target).database != 'codemark_lms_test':
    raise SystemExit('QA only supports codemark_lms_test.')
os.environ['DATABASE_URL'] = target
os.environ['MIGRATION_DATABASE_URL'] = target
os.environ['SMTP_APPROVED'] = 'false'  # QA must never send mail through a real relay.
sys.path.insert(0, str(root / 'api'))
from app.main import app

@app.middleware('http')
async def qa_boundary(request, call_next):
    response = await call_next(request)
    response.headers['X-QA-Database'] = 'codemark_lms_test'
    return response

uvicorn.run('app.main:app', host='127.0.0.1', port=8100, access_log=False)
