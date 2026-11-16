"""Read-only, payload-free persistence diagnostics for real Admin sessions."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, inspect, select, text

from .auth import DB, Admin
from .database import settings
from .models import OutboxMessage, now
from .realtime import manager
from .security import utc

router = APIRouter(prefix="/v1/admin/operations")


class PersistenceStatus(BaseModel):
    database: Literal["postgresql", "sqlite-test"]
    environment: str
    migrations: list[str]
    poolSize: int
    maxOverflow: int
    poolTimeoutSeconds: int
    pending: int
    dispatched: int
    exhausted: int
    oldestPendingSeconds: int | None
    dispatcherEnabled: bool = False
    realtimeConnected: bool = False
    productionPrivilegesVerified: bool = False


@router.get("/persistence", response_model=PersistenceStatus)
def persistence(db: DB, user: Admin) -> PersistenceStatus:
    db.execute(text("SELECT 1"))
    heads = (
        list(db.scalars(text("SELECT version_num FROM alembic_version")))
        if inspect(db.connection()).has_table("alembic_version")
        else []
    )
    counts = dict(
        db.execute(select(OutboxMessage.status, func.count()).group_by(OutboxMessage.status)).all()
    )
    oldest = db.scalar(
        select(func.min(OutboxMessage.created_at)).where(OutboxMessage.status == "pending")
    )
    return PersistenceStatus(
        database="postgresql"
        if db.bind is not None and db.bind.dialect.name == "postgresql"
        else "sqlite-test",
        environment=settings.environment,
        migrations=heads,
        poolSize=settings.pool_size,
        maxOverflow=settings.max_overflow,
        poolTimeoutSeconds=settings.pool_timeout,
        pending=counts.get("pending", 0),
        dispatched=counts.get("dispatched", 0),
        exhausted=counts.get("exhausted", 0),
        dispatcherEnabled=settings.environment != "test",
        realtimeConnected=bool(manager.connected),
        productionPrivilegesVerified=settings.environment == "production",
        oldestPendingSeconds=max(0, int((now() - utc(oldest)).total_seconds())) if oldest else None,
    )
