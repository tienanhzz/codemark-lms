"""Alembic uses runtime configuration without embedding credentials in ini files."""

from alembic import context

from app import community_models, quest_models  # noqa: F401
from app.database import migration_engine
from app.models import Base

with migration_engine().connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
