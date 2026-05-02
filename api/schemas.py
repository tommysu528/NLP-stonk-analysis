from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticker: str
    headline: str
    summary: str | None
    source: str | None
    url: str
    published_at: datetime


class SentimentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    article_id: int
    ticker: str
    sentiment_label: str
    sentiment_score: float
    confidence: float
    created_at: datetime


class PriceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ticker: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class SignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticker: str
    timestamp: datetime
    signal_type: str
    strength: float
    reason: str | None


class BacktestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    strategy_name: str
    ticker: str
    start_date: datetime
    end_date: datetime
    return_pct: float
    sharpe_ratio: float | None
    max_drawdown: float | None
    win_rate: float | None
    trade_count: int | None
    holding_window: str | None
    created_at: datetime
