"""Export DB tables as JSON snapshots consumed by the static frontend.

Writes to frontend/public/data/ so that Vite includes the files in the build
output and they are served by GitHub Pages alongside index.html.

Layout:
  meta.json                       - last update timestamp, ticker list
  articles.json                   - latest N articles, all tickers (descending by published_at)
  signals.json                    - all signals (descending by timestamp)
  backtests.json                  - all backtest_results
  sentiment/<TICKER>.json         - latest 200 sentiment scores per ticker
  prices/<TICKER>.json            - all price bars per ticker
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from api.db import session_scope
from api.models import Article, BacktestResult, Price, SentimentScore, Signal
from config import settings

log = logging.getLogger(__name__)

OUT_DIR = Path("frontend/public/data")
ARTICLE_LIMIT = 200
SENTIMENT_LIMIT_PER_TICKER = 200


def _serialize(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _row_to_dict(row, columns: list[str]) -> dict:
    return {col: _serialize(getattr(row, col)) for col in columns}


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")))
    log.info("wrote %s (%d bytes)", path, path.stat().st_size)


def export() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "sentiment").mkdir(exist_ok=True)
    (OUT_DIR / "prices").mkdir(exist_ok=True)

    with session_scope() as session:
        articles = session.execute(
            select(Article).order_by(Article.published_at.desc()).limit(ARTICLE_LIMIT)
        ).scalars().all()
        article_cols = ["id", "ticker", "headline", "summary", "source", "url", "published_at"]
        _write(OUT_DIR / "articles.json", [_row_to_dict(a, article_cols) for a in articles])

        signals = session.execute(
            select(Signal).order_by(Signal.timestamp.desc())
        ).scalars().all()
        signal_cols = ["id", "ticker", "timestamp", "signal_type", "strength", "reason"]
        _write(OUT_DIR / "signals.json", [_row_to_dict(s, signal_cols) for s in signals])

        backtests = session.execute(
            select(BacktestResult).order_by(BacktestResult.created_at.desc())
        ).scalars().all()
        backtest_cols = [
            "id",
            "strategy_name",
            "ticker",
            "start_date",
            "end_date",
            "return_pct",
            "sharpe_ratio",
            "max_drawdown",
            "win_rate",
            "trade_count",
            "holding_window",
            "created_at",
        ]
        _write(OUT_DIR / "backtests.json", [_row_to_dict(b, backtest_cols) for b in backtests])

        sentiment_cols = ["id", "article_id", "ticker", "sentiment_label", "sentiment_score", "confidence", "created_at"]
        for ticker in settings.ticker_list:
            rows = session.execute(
                select(SentimentScore)
                .where(SentimentScore.ticker == ticker)
                .order_by(SentimentScore.created_at.desc())
                .limit(SENTIMENT_LIMIT_PER_TICKER)
            ).scalars().all()
            _write(OUT_DIR / "sentiment" / f"{ticker}.json", [_row_to_dict(r, sentiment_cols) for r in rows])

        price_cols = ["ticker", "timestamp", "open", "high", "low", "close", "volume"]
        for ticker in settings.ticker_list:
            rows = session.execute(
                select(Price).where(Price.ticker == ticker).order_by(Price.timestamp)
            ).scalars().all()
            _write(OUT_DIR / "prices" / f"{ticker}.json", [_row_to_dict(r, price_cols) for r in rows])

    meta = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "tickers": settings.ticker_list,
    }
    _write(OUT_DIR / "meta.json", meta)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    export()
