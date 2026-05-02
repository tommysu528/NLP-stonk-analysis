from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_session
from api.models import Signal
from api.schemas import SignalOut

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.get("", response_model=list[SignalOut])
def list_signals(
    ticker: str | None = None,
    active: bool = Query(False, description="Only signals from the last 24h"),
    limit: int = Query(200, ge=1, le=2000),
    session: Session = Depends(get_session),
):
    stmt = select(Signal)
    if ticker:
        stmt = stmt.where(Signal.ticker == ticker.upper())
    if active:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        stmt = stmt.where(Signal.timestamp >= cutoff)
    stmt = stmt.order_by(Signal.timestamp.desc()).limit(limit)
    return list(session.scalars(stmt))
