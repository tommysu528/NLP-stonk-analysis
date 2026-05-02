"""Backtester.

For each (ticker, holding_window):
  - Load signals and prices from DB
  - For each signal, find the next price bar at-or-after the signal timestamp (entry)
    and the next bar at-or-after entry_time + holding_window (exit)
  - Compute return = (exit - entry) / entry * direction
  - Aggregate metrics

Compares the sentiment strategy against:
  - buy-and-hold over the same window
  - random signals (same count, randomly placed)
"""
from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import session_scope
from api.models import BacktestResult, Price, Signal
from config import settings

log = logging.getLogger(__name__)

HOLDING_WINDOWS = {
    "15min": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "4h": timedelta(hours=4),
    "1d": timedelta(days=1),
    "3d": timedelta(days=3),
}

BARS_PER_YEAR = 252  # daily bars; downstream Sharpe annualization assumes daily granularity


@dataclass
class TradeResult:
    entry_ts: datetime
    exit_ts: datetime
    entry_px: float
    exit_px: float
    direction: int  # +1 or -1
    return_pct: float


@dataclass
class StrategyMetrics:
    return_pct: float
    sharpe_ratio: float | None
    max_drawdown: float | None
    win_rate: float | None
    trade_count: int


def _load_prices(session: Session, ticker: str) -> pd.DataFrame:
    stmt = select(Price.timestamp, Price.close).where(Price.ticker == ticker).order_by(Price.timestamp)
    rows = session.execute(stmt).all()
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close"])
    df = pd.DataFrame(rows, columns=["timestamp", "close"])
    df["close"] = df["close"].astype(float)
    df = df.set_index("timestamp").sort_index()
    return df


def _load_signals(session: Session, ticker: str) -> list[Signal]:
    stmt = (
        select(Signal)
        .where(Signal.ticker == ticker, Signal.signal_type.in_(("BUY", "SELL")))
        .order_by(Signal.timestamp)
    )
    return list(session.scalars(stmt))


def _next_bar_at_or_after(prices: pd.DataFrame, ts: datetime) -> tuple[datetime, float] | None:
    idx = prices.index.searchsorted(ts, side="left")
    if idx >= len(prices):
        return None
    bar_ts = prices.index[idx]
    return bar_ts.to_pydatetime(), float(prices["close"].iat[idx])


def simulate(prices: pd.DataFrame, signals: list[Signal], window: timedelta) -> list[TradeResult]:
    trades: list[TradeResult] = []
    for sig in signals:
        entry = _next_bar_at_or_after(prices, sig.timestamp)
        if entry is None:
            continue
        entry_ts, entry_px = entry
        exit_target = entry_ts + window
        exit = _next_bar_at_or_after(prices, exit_target)
        if exit is None:
            continue
        exit_ts, exit_px = exit
        direction = 1 if sig.signal_type == "BUY" else -1
        ret = (exit_px - entry_px) / entry_px * direction
        trades.append(
            TradeResult(
                entry_ts=entry_ts,
                exit_ts=exit_ts,
                entry_px=entry_px,
                exit_px=exit_px,
                direction=direction,
                return_pct=ret,
            )
        )
    return trades


def metrics(trades: list[TradeResult]) -> StrategyMetrics:
    if not trades:
        return StrategyMetrics(0.0, None, None, None, 0)
    returns = [t.return_pct for t in trades]
    total = sum(returns)
    win_rate = sum(1 for r in returns if r > 0) / len(returns)

    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / max(len(returns) - 1, 1)
    std = math.sqrt(variance)
    sharpe = (mean / std) * math.sqrt(BARS_PER_YEAR) if std > 0 else None

    equity = []
    cum = 0.0
    for r in returns:
        cum += r
        equity.append(cum)
    peak = -math.inf
    mdd = 0.0
    for v in equity:
        peak = max(peak, v)
        mdd = min(mdd, v - peak)

    return StrategyMetrics(
        return_pct=total,
        sharpe_ratio=sharpe,
        max_drawdown=mdd,
        win_rate=win_rate,
        trade_count=len(trades),
    )


def buy_and_hold_metrics(prices: pd.DataFrame) -> StrategyMetrics:
    if prices.empty:
        return StrategyMetrics(0.0, None, None, None, 0)
    first = float(prices["close"].iloc[0])
    last = float(prices["close"].iloc[-1])
    return StrategyMetrics(
        return_pct=(last - first) / first,
        sharpe_ratio=None,
        max_drawdown=None,
        win_rate=None,
        trade_count=1,
    )


def random_metrics(
    prices: pd.DataFrame, n_signals: int, window: timedelta, seed: int = 42
) -> StrategyMetrics:
    if prices.empty or n_signals == 0:
        return StrategyMetrics(0.0, None, None, None, 0)
    rng = random.Random(seed)
    timestamps = list(prices.index)
    fake = []
    for _ in range(n_signals):
        ts = rng.choice(timestamps).to_pydatetime()
        signal_type = rng.choice(["BUY", "SELL"])
        fake.append(Signal(ticker="_", timestamp=ts, signal_type=signal_type, strength=0.0))
    return metrics(simulate(prices, fake, window))


def _persist(
    session: Session,
    name: str,
    ticker: str,
    window: str,
    start: datetime,
    end: datetime,
    m: StrategyMetrics,
) -> None:
    session.add(
        BacktestResult(
            strategy_name=name,
            ticker=ticker,
            start_date=start,
            end_date=end,
            return_pct=m.return_pct,
            sharpe_ratio=m.sharpe_ratio,
            max_drawdown=m.max_drawdown,
            win_rate=m.win_rate,
            trade_count=m.trade_count,
            holding_window=window,
        )
    )


def run() -> dict:
    """Run the full backtest matrix and persist results. Returns a summary dict."""
    summary: dict = {}
    with session_scope() as session:
        for ticker in settings.ticker_list:
            prices = _load_prices(session, ticker)
            signals = _load_signals(session, ticker)
            if prices.empty or not signals:
                log.info("Skipping %s (prices=%d, signals=%d)", ticker, len(prices), len(signals))
                continue
            start = prices.index.min().to_pydatetime()
            end = prices.index.max().to_pydatetime()
            ticker_summary: dict = {}

            for window_name, window in HOLDING_WINDOWS.items():
                trades = simulate(prices, signals, window)
                m = metrics(trades)
                _persist(session, "sentiment", ticker, window_name, start, end, m)

                rand_m = random_metrics(prices, n_signals=len(signals), window=window)
                _persist(session, "random", ticker, window_name, start, end, rand_m)

                ticker_summary[window_name] = {
                    "sentiment": m.return_pct,
                    "random": rand_m.return_pct,
                    "trades": m.trade_count,
                }

            bh = buy_and_hold_metrics(prices)
            _persist(session, "buy_and_hold", ticker, "full", start, end, bh)
            ticker_summary["buy_and_hold"] = bh.return_pct
            summary[ticker] = ticker_summary
            log.info("Backtested %s: %s", ticker, ticker_summary)
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(run())
