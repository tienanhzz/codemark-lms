"""Print non-sensitive taxonomy deployment readiness for the local LMS database."""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

root = os.path.dirname(os.path.dirname(__file__))
load_dotenv(os.path.join(root, ".env"))
url = make_url(os.environ["DATABASE_URL"])
if url.database != "codemark_lms" or url.host not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Refusing an unexpected database target.")
engine = create_engine(url, hide_parameters=True)
with engine.connect() as connection:
    print("migration", connection.scalar(text("SELECT version_num FROM alembic_version")))
    print("categories", connection.scalar(text("SELECT count(*) FROM taxonomy_categories")))
    print("tags", connection.scalar(text("SELECT count(*) FROM taxonomy_tags")))
engine.dispose()
