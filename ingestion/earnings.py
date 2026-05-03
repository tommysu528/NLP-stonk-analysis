"""Earnings calendar: pull next-earnings dates for tracked tickers via yfinance.

yfinance returns either a calendar dict or DataFrame depending on version.
We normalize to a flat dict per ticker.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

from config import settings

log = logging.getLogger(__name__)

OUT_PATH = Path("frontend/public/data/earnings.json")


def _coerce_date(v) -> str | None:
    if v is None:
        return None
    try:
        if hasattr(v, "isoformat"):
            return v.isoformat() if hasattr(v, "year") else None
        if isinstance(v, str):
            # Already ISO-ish; let the frontend parse
            return v
    except Exception:
        return None
    return None


def fetch_one(ticker: str) -> dict | None:
    log.info("Fetching earnings calendar for %s", ticker)
    try:
        t = yf.Ticker(ticker)
        cal = t.calendar
    except Exception as e:
        log.warning("yfinance .calendar failed for %s: %s", ticker, e)
        return None

    if cal is None:
        return None

    # yfinance returns a dict in newer versions (>=0.2.5)
    if isinstance(cal, dict):
        ed = cal.get("Earnings Date")
        # Earnings Date is usually a list[date] (estimated start, estimated end)
        if isinstance(ed, list) and ed:
            next_date = _coerce_date(ed[0])
        else:
            next_date = _coerce_date(ed)
        return {
            "ticker": ticker,
            "next_earnings_date": next_date,
            "earnings_average_estimate": cal.get("Earnings Average"),
            "earnings_low_estimate": cal.get("Earnings Low"),
            "earnings_high_estimate": cal.get("Earnings High"),
            "revenue_average_estimate": cal.get("Revenue Average"),
            "ex_dividend_date": _coerce_date(cal.get("Ex-Dividend Date")),
            "dividend_date": _coerce_date(cal.get("Dividend Date")),
        }

    # Older versions returned a DataFrame; we no longer support that path.
    return None


def fetch_all() -> list[dict]:
    rows = []
    for ticker in settings.ticker_list:
        r = fetch_one(ticker)
        if r is not None and r.get("next_earnings_date"):
            rows.append(r)
    rows.sort(key=lambda r: r["next_earnings_date"])
    return rows


def write(rows: list[dict]) -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "tickers": rows,
    }
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), default=str))
    log.info("wrote %s (%d tickers, %d bytes)", OUT_PATH, len(rows), OUT_PATH.stat().st_size)


def run() -> None:
    write(fetch_all())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
