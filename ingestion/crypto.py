"""Crypto grid simulation pipeline.

For each tracked crypto pair:
  1. Fetch ~30 days of hourly bars from yfinance
  2. Derive a sensible grid range (30d hi/lo, trimmed 10% each side)
  3. Run the geometric grid simulator over those bars
  4. Write everything to frontend/public/data/crypto.json

No exchange connection, no real orders. Pure backtest/visualization.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

from strategy.grid import GridConfig, derive_range, simulate

log = logging.getLogger(__name__)

CRYPTO_PAIRS: list[tuple[str, str]] = [
    ("BTC", "BTC-USD"),
    ("ETH", "ETH-USD"),
]

OUT_PATH = Path("frontend/public/data/crypto.json")


def fetch_bars(yf_symbol: str, period: str = "30d", interval: str = "1h") -> list[dict]:
    log.info("Fetching %s bars (%s @ %s)", yf_symbol, period, interval)
    df = yf.Ticker(yf_symbol).history(period=period, interval=interval, auto_adjust=False)
    if df.empty:
        return []

    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")

    bars = []
    for ts, row in df.iterrows():
        bars.append(
            {
                "timestamp": ts.to_pydatetime().isoformat(),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": float(row["Volume"]) if row["Volume"] == row["Volume"] else 0.0,
            }
        )
    return bars


def run_pair(pair: str, yf_symbol: str) -> dict:
    bars = fetch_bars(yf_symbol)
    if len(bars) < 24:
        log.warning("Not enough bars for %s (%d)", pair, len(bars))
        return {"pair": pair, "error": "insufficient_data"}

    closes = [b["close"] for b in bars]
    lower, upper = derive_range(closes, trim_frac=0.10)
    config = GridConfig(pair=pair, lower=lower, upper=upper, n_levels=12, capital_usd=1000.0, fee_rate=0.001)
    log.info("%s grid: lower=%.2f upper=%.2f levels=%d", pair, lower, upper, config.n_levels)

    result = simulate(config, bars)
    res = asdict(result)
    res["bars"] = bars  # keep for chart rendering
    return res


def run() -> None:
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "pairs": [run_pair(p, sym) for p, sym in CRYPTO_PAIRS],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), default=str))
    log.info("wrote %s (%d bytes)", OUT_PATH, OUT_PATH.stat().st_size)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
