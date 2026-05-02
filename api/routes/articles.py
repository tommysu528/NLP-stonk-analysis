from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_session
from api.models import Article
from api.schemas import ArticleOut

router = APIRouter(prefix="/api/articles", tags=["articles"])


@router.get("", response_model=list[ArticleOut])
def list_articles(
    ticker: str | None = None,
    since: datetime | None = None,
    limit: int = Query(50, ge=1, le=500),
    session: Session = Depends(get_session),
):
    stmt = select(Article)
    if ticker:
        stmt = stmt.where(Article.ticker == ticker.upper())
    if since:
        stmt = stmt.where(Article.published_at >= since)
    stmt = stmt.order_by(Article.published_at.desc()).limit(limit)
    return list(session.scalars(stmt))
