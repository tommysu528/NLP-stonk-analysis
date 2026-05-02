"""Fetch OHLCV bars from yfinance and upsert into the prices table."""
from __future__ import annotations

import logging
from datetime import datetime

import yfinance as yf
from sqlalchemy.orm import Session

from api.db import session_scope
from api.models import Price
from config import settings


def _insert(bind):
    """Return the dialect-specific insert() with on_conflict_* support."""
    name = bind.dialect.name
    if name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as _ins
    else:
        from sqlalchemy.dialects.postgresql import insert as _ins
    return _ins

log = logging.getLogger(__name__)


def fetch_ticker(ticker: str, period: str = "2y", interval: str = "1d") -> list[dict]:
    """Pull OHLCV from yfinance and return a list of dicts ready for upsert."""
    df = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=False)
    if df.empty:
        log.warning("yfinance returned no rows for %s", ticker)
        return []

    if df.index.tz is None:
        df.index = df.index.tz_localize("America/New_York")
    df.index = df.index.tz_convert("UTC")

    rows = []
    for ts, row in df.iterrows():
        rows.append(
            {
                "ticker": ticker,
                "timestamp": ts.to_pydatetime(),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            }
        )
    return rows


def upsert_prices(session: Session, rows: list[dict]) -> int:
    if not rows:
        return 0
    insert = _insert(session.bind)
    stmt = insert(Price).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["ticker", "timestamp"],
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
        },
    )
    session.execute(stmt)
    return len(rows)


def ingest_all(period: str = "2y", interval: str = "1d") -> dict[str, int]:
    """Fetch all configured tickers; return per-ticker row counts written."""
    counts = {}
    for ticker in settings.ticker_list:
        try:
            rows = fetch_ticker(ticker, period=period, interval=interval)
        except Exception as e:
            log.exception("Failed to fetch %s: %s", ticker, e)
            counts[ticker] = 0
            continue
        with session_scope() as session:
            n = upsert_prices(session, rows)
        counts[ticker] = n
        log.info("Upserted %d price rows for %s", n, ticker)
    return counts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(ingest_all())
