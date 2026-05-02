from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_session
from api.models import Price
from api.schemas import PriceOut

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("", response_model=list[PriceOut])
def list_prices(
    ticker: str = Query(...),
    since: datetime | None = None,
    limit: int = Query(2000, ge=1, le=10000),
    session: Session = Depends(get_session),
):
    stmt = select(Price).where(Price.ticker == ticker.upper())
    if since:
        stmt = stmt.where(Price.timestamp >= since)
    stmt = stmt.order_by(Price.timestamp.asc()).limit(limit)
    return list(session.scalars(stmt))
