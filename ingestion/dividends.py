"""Dividend Maxxing data: pull yield + price metadata for high-yield tickers.

Independent of the sentiment pipeline: doesn't touch Postgres/SQLite,
doesn't consume NewsAPI quota. Just yfinance. Writes a single JSON file
the static frontend reads directly.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

log = logging.getLogger(__name__)

DIVIDEND_TICKERS: list[str] = [
    # User-requested
    "WU",    # Western Union — historically ~8-9%
    "UPS",   # United Parcel Service — ~6-7% post price drop
    # Tobacco / telecom — classic high-yielders
    "BTI",   # British American Tobacco
    "MO",    # Altria
    "T",     # AT&T
    "VZ",    # Verizon
    # REITs / BDCs — actually-high-yield income vehicles
    "O",     # Realty Income
    "MAIN",  # Main Street Capital (BDC)
    "ARCC",  # Ares Capital (BDC) — typically ~9%
    "AGNC",  # AGNC Investment (mortgage REIT) — typically 13%+, cut history
    "OHI",   # Omega Healthcare (healthcare REIT) — typically 7-8%
]

OUT_PATH = Path("frontend/public/data/dividends.json")


def _safe(d: dict, key: str, default=None):
    """yfinance .info dicts are sometimes missing keys or have NaN values."""
    v = d.get(key, default)
    if v is None:
        return None
    try:
        if isinstance(v, float) and (v != v):  # NaN
            return None
    except Exception:
        pass
    return v


def _ex_div_iso(ts: int | None) -> str | None:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()
    except Exception:
        return None


def fetch_one(ticker: str) -> dict | None:
    log.info("Fetching dividend data for %s", ticker)
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
    except Exception as e:
        log.exception("yfinance .info failed for %s: %s", ticker, e)
        return None

    # Last price + 24h change from a small history window (more reliable than info['currentPrice']).
    last_price = None
    change_pct = None
    try:
        hist = t.history(period="5d", interval="1d", auto_adjust=False)
        if not hist.empty:
            last_price = float(hist["Close"].iloc[-1])
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                if prev > 0:
                    change_pct = (last_price - prev) / prev
    except Exception as e:
        log.warning("price history failed for %s: %s", ticker, e)

    yield_raw = _safe(info, "dividendYield") or _safe(info, "trailingAnnualDividendYield")
    # yfinance is inconsistent: sometimes returns 0.07 (=7%), sometimes 7.0. Normalize to fraction.
    if yield_raw is not None and yield_raw > 1:
        yield_raw = yield_raw / 100.0

    return {
        "ticker": ticker,
        "name": _safe(info, "longName") or _safe(info, "shortName") or ticker,
        "price": last_price,
        "change_pct_1d": change_pct,
        "dividend_yield": yield_raw,
        "dividend_rate": _safe(info, "dividendRate"),
        "payout_ratio": _safe(info, "payoutRatio"),
        "ex_dividend_date": _ex_div_iso(_safe(info, "exDividendDate")),
        "five_year_avg_yield": _safe(info, "fiveYearAvgDividendYield"),
        "sector": _safe(info, "sector"),
        "industry": _safe(info, "industry"),
    }


def fetch_all() -> list[dict]:
    rows = []
    for ticker in DIVIDEND_TICKERS:
        r = fetch_one(ticker)
        if r is None:
            continue
        # Skip tickers where yfinance returned nothing useful (likely 404 /
        # symbol change). Better to omit than render an empty row.
        if r.get("price") is None and r.get("dividend_yield") is None:
            log.warning("Skipping %s — no price or yield data", ticker)
            continue
        rows.append(r)
    return rows


def write(rows: list[dict]) -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "tickers": rows,
    }
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")))
    log.info("wrote %s (%d tickers, %d bytes)", OUT_PATH, len(rows), OUT_PATH.stat().st_size)


def run() -> None:
    rows = fetch_all()
    write(rows)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
