from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_session
from api.models import SentimentScore
from api.schemas import SentimentOut

router = APIRouter(prefix="/api/sentiment", tags=["sentiment"])


@router.get("", response_model=list[SentimentOut])
def list_sentiment(
    ticker: str | None = None,
    since: datetime | None = None,
    limit: int = Query(500, ge=1, le=5000),
    session: Session = Depends(get_session),
):
    stmt = select(SentimentScore)
    if ticker:
        stmt = stmt.where(SentimentScore.ticker == ticker.upper())
    if since:
        stmt = stmt.where(SentimentScore.created_at >= since)
    stmt = stmt.order_by(SentimentScore.created_at.desc()).limit(limit)
    return list(session.scalars(stmt))
