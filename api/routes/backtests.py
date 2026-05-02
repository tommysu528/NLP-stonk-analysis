from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_session
from api.models import BacktestResult
from api.schemas import BacktestOut

router = APIRouter(prefix="/api/backtests", tags=["backtests"])


@router.get("", response_model=list[BacktestOut])
def list_backtests(session: Session = Depends(get_session)):
    stmt = select(BacktestResult).order_by(BacktestResult.created_at.desc()).limit(500)
    return list(session.scalars(stmt))


@router.get("/{result_id}", response_model=BacktestOut)
def get_backtest(result_id: int, session: Session = Depends(get_session)):
    result = session.get(BacktestResult, result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="not found")
    return result
