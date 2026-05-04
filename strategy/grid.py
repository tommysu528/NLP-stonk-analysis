"""Geometric grid trading simulator.

Builds a grid between [lower, upper] with N levels spaced by a constant
ratio. Walks through historical OHLC bars and fills orders when price
crosses a level, immediately placing the corresponding sell at one
level above.

Pure simulation — no exchange calls. Designed to feed a UI tab so you
can see what a grid would have done over recent history before risking
real funds.
"""
from __future__ import annotations

import logging
import math
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Iterable

log = logging.getLogger(__name__)


@dataclass
class GridConfig:
    pair: str
    lower: float
    upper: float
    n_levels: int = 12
    capital_usd: float = 1000.0
    fee_rate: float = 0.001  # 0.1% per side, Binance maker default

    def levels(self) -> list[float]:
        if self.n_levels < 2 or self.lower <= 0 or self.upper <= self.lower:
            return []
        ratio = (self.upper / self.lower) ** (1 / (self.n_levels - 1))
        return [self.lower * (ratio**i) for i in range(self.n_levels)]


@dataclass
class Fill:
    timestamp: str
    side: str  # 'buy' or 'sell'
    price: float
    qty: float
    level_idx: int
    pnl_usd: float = 0.0  # only populated on sells (round-trip pnl)


@dataclass
class GridResult:
    pair: str
    config: dict
    levels: list[float]
    fills: list[dict] = field(default_factory=list)
    round_trips: int = 0
    total_pnl_usd: float = 0.0
    total_fees_usd: float = 0.0
    realized_return_pct: float = 0.0
    unrealized_pnl_usd: float = 0.0
    unrealized_holdings: float = 0.0  # base-asset units still held
    avg_holding_price: float = 0.0
    final_price: float = 0.0
    max_drawdown_pct: float = 0.0
    open_buy_levels: list[int] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)
    bar_count: int = 0


def derive_range(closes: list[float], trim_frac: float = 0.10) -> tuple[float, float]:
    """Use hi/lo trimmed by trim_frac on each side. Returns (lower, upper).
    Falls back to +/-15% around current price if input is too short."""
    if len(closes) < 5:
        last = closes[-1] if closes else 1.0
        return last * 0.85, last * 1.15
    hi = max(closes)
    lo = min(closes)
    rng = hi - lo
    return lo + rng * trim_frac, hi - rng * trim_frac


@dataclass
class WalkForwardSegment:
    period_start: str
    period_end: str
    config_lower: float
    config_upper: float
    starting_capital: float
    ending_equity: float
    return_pct: float
    round_trips: int
    max_drawdown_pct: float
    bars_in_range_pct: float  # how often price stayed within grid bounds


@dataclass
class WalkForwardResult:
    pair: str
    segment_days: int
    lookback_days: int
    starting_capital: float
    ending_equity: float
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    profitable_segments: int
    total_segments: int
    total_round_trips: int
    avg_segment_return_pct: float
    worst_segment_return_pct: float
    best_segment_return_pct: float
    bars_in_range_pct: float
    segments: list[dict] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)


def walk_forward(
    bars: list[dict],
    pair: str,
    segment_days: int = 30,
    lookback_days: int = 30,
    n_levels: int = 12,
    starting_capital: float = 1000.0,
    fee_rate: float = 0.001,
) -> WalkForwardResult:
    """Walk-forward grid backtest: re-derive the grid range every segment_days
    using the trailing lookback_days of price history. Compounds capital
    between segments — start segment N+1 with whatever segment N ended at.

    Bars are expected to be daily; segment_days/lookback_days are in days.
    """
    if not bars:
        return WalkForwardResult(
            pair=pair, segment_days=segment_days, lookback_days=lookback_days,
            starting_capital=starting_capital, ending_equity=starting_capital,
            total_return_pct=0.0, annualized_return_pct=0.0, max_drawdown_pct=0.0,
            profitable_segments=0, total_segments=0, total_round_trips=0,
            avg_segment_return_pct=0.0, worst_segment_return_pct=0.0, best_segment_return_pct=0.0,
            bars_in_range_pct=0.0,
        )

    bars = sorted(bars, key=lambda b: b["timestamp"])
    segments_out: list[WalkForwardSegment] = []
    equity_curve_out: list[dict] = []
    capital = starting_capital
    total_round_trips = 0
    bars_in_range_total = 0
    bars_seen_total = 0

    # Walk by segment_days, requiring lookback_days behind us first
    i = lookback_days
    while i < len(bars):
        seg_end_idx = min(i + segment_days, len(bars))
        lookback_slice = bars[max(0, i - lookback_days):i]
        segment_bars = bars[i:seg_end_idx]
        if len(segment_bars) < 2:
            break

        # Derive grid from lookback's hi/lo (using highs and lows, not closes)
        highs = [b["high"] for b in lookback_slice]
        lows = [b["low"] for b in lookback_slice]
        if not highs or not lows:
            i = seg_end_idx
            continue
        rng_hi = max(highs)
        rng_lo = min(lows)
        rng = rng_hi - rng_lo
        lower = rng_lo + rng * 0.10
        upper = rng_hi - rng * 0.10
        if upper <= lower or lower <= 0:
            i = seg_end_idx
            continue

        config = GridConfig(
            pair=pair, lower=lower, upper=upper, n_levels=n_levels,
            capital_usd=capital, fee_rate=fee_rate,
        )
        result = simulate(config, segment_bars)

        ending_equity = capital + result.total_pnl_usd

        # How often price stayed in range during this segment
        in_range = sum(
            1 for b in segment_bars if lower <= b["close"] <= upper
        )
        bars_in_range_total += in_range
        bars_seen_total += len(segment_bars)

        seg = WalkForwardSegment(
            period_start=str(segment_bars[0]["timestamp"]),
            period_end=str(segment_bars[-1]["timestamp"]),
            config_lower=round(lower, 2),
            config_upper=round(upper, 2),
            starting_capital=round(capital, 2),
            ending_equity=round(ending_equity, 2),
            return_pct=round((ending_equity - capital) / capital, 4) if capital > 0 else 0.0,
            round_trips=result.round_trips,
            max_drawdown_pct=result.max_drawdown_pct,
            bars_in_range_pct=round(in_range / len(segment_bars), 4),
        )
        segments_out.append(seg)

        # Stitch the segment's per-bar equity into the global equity curve.
        # Re-base each segment's equity_curve to its starting capital.
        for pt in result.equity_curve:
            equity_curve_out.append({
                "timestamp": pt["timestamp"],
                "equity": round(capital + (pt["equity"] - config.capital_usd), 2),
            })

        capital = ending_equity
        total_round_trips += result.round_trips
        i = seg_end_idx

    if not segments_out:
        return WalkForwardResult(
            pair=pair, segment_days=segment_days, lookback_days=lookback_days,
            starting_capital=starting_capital, ending_equity=starting_capital,
            total_return_pct=0.0, annualized_return_pct=0.0, max_drawdown_pct=0.0,
            profitable_segments=0, total_segments=0, total_round_trips=0,
            avg_segment_return_pct=0.0, worst_segment_return_pct=0.0, best_segment_return_pct=0.0,
            bars_in_range_pct=0.0,
        )

    total_return = (capital - starting_capital) / starting_capital
    days_total = len(equity_curve_out)
    years = days_total / 365.0 if days_total > 0 else 0.0
    annualized = ((1 + total_return) ** (1 / years) - 1) if years > 0.1 else total_return

    # Global max drawdown from the stitched equity curve
    max_dd = 0.0
    if equity_curve_out:
        peak = equity_curve_out[0]["equity"]
        for pt in equity_curve_out:
            peak = max(peak, pt["equity"])
            dd = (pt["equity"] - peak) / peak if peak > 0 else 0.0
            max_dd = min(max_dd, dd)

    seg_returns = [s.return_pct for s in segments_out]
    profitable = sum(1 for r in seg_returns if r > 0)

    return WalkForwardResult(
        pair=pair,
        segment_days=segment_days,
        lookback_days=lookback_days,
        starting_capital=starting_capital,
        ending_equity=round(capital, 2),
        total_return_pct=round(total_return, 4),
        annualized_return_pct=round(annualized, 4),
        max_drawdown_pct=round(max_dd, 4),
        profitable_segments=profitable,
        total_segments=len(segments_out),
        total_round_trips=total_round_trips,
        avg_segment_return_pct=round(sum(seg_returns) / len(seg_returns), 4),
        worst_segment_return_pct=round(min(seg_returns), 4),
        best_segment_return_pct=round(max(seg_returns), 4),
        bars_in_range_pct=round(bars_in_range_total / bars_seen_total, 4) if bars_seen_total else 0.0,
        segments=[asdict(s) for s in segments_out],
        equity_curve=equity_curve_out,
    )


def simulate(config: GridConfig, bars: Iterable[dict]) -> GridResult:
    """bars: iterable of {'timestamp', 'open', 'high', 'low', 'close'} sorted asc.

    Each grid level holds at most one buy order. When a buy fills, it places
    a sell at the next level up. When that sell fills, the buy is restored.
    """
    levels = config.levels()
    if not levels:
        return GridResult(pair=config.pair, config=asdict(config), levels=[])

    n = len(levels)
    capital_per_level = config.capital_usd / max(n - 1, 1)  # n-1 buy slots; topmost level only sells

    # State per level: 'buy_open' (resting buy), 'sell_open' (resting sell at this
    # level after a buy filled below), 'idle' (between fills).
    # buys[i] = base asset qty held when level i has been bought and is waiting
    # to sell at level i+1.
    state = ["buy_open"] * (n - 1) + ["idle"]  # topmost level: nothing rests
    buy_qty = [0.0] * n
    buy_price = [0.0] * n

    fills: list[Fill] = []
    round_trips = 0
    total_fees = 0.0
    realized_pnl = 0.0
    equity_curve: list[dict] = []
    last_close = 0.0
    bar_count = 0
    peak_equity = config.capital_usd

    for bar in bars:
        bar_count += 1
        try:
            t = bar["timestamp"]
            high = float(bar["high"])
            low = float(bar["low"])
            close = float(bar["close"])
        except (KeyError, TypeError, ValueError):
            continue
        last_close = close

        # Cross checks: if low <= level <= high, the bar swept that price.
        # Walk levels low->high to fill buys as price drops, then high->low for sells.
        for i, lvl in enumerate(levels):
            if state[i] != "buy_open" or i >= n - 1:
                continue
            if low <= lvl:
                # Buy fills at level price
                qty = capital_per_level / lvl
                fee = capital_per_level * config.fee_rate
                buy_qty[i] = qty
                buy_price[i] = lvl
                state[i] = "sell_open"
                total_fees += fee
                fills.append(Fill(timestamp=str(t), side="buy", price=lvl, qty=qty, level_idx=i))

        for i in range(n - 1, 0, -1):
            # A sell at level i corresponds to buy that filled at level i-1
            if state[i - 1] != "sell_open":
                continue
            sell_lvl = levels[i]
            if high >= sell_lvl:
                qty = buy_qty[i - 1]
                proceeds = qty * sell_lvl
                cost_basis = qty * buy_price[i - 1]
                fee = proceeds * config.fee_rate
                pnl = proceeds - cost_basis - fee
                realized_pnl += pnl
                total_fees += fee
                round_trips += 1
                fills.append(
                    Fill(
                        timestamp=str(t),
                        side="sell",
                        price=sell_lvl,
                        qty=qty,
                        level_idx=i,
                        pnl_usd=pnl,
                    )
                )
                buy_qty[i - 1] = 0.0
                buy_price[i - 1] = 0.0
                state[i - 1] = "buy_open"

        # Track equity = realized_pnl + unrealized at current close
        unreal = sum(buy_qty[i] * (close - buy_price[i]) for i in range(n) if buy_qty[i] > 0)
        equity = config.capital_usd + realized_pnl + unreal
        peak_equity = max(peak_equity, equity)
        equity_curve.append({"timestamp": str(t), "equity": round(equity, 2)})

    # Wrap up
    held_base = sum(buy_qty)
    unreal = sum(buy_qty[i] * (last_close - buy_price[i]) for i in range(n) if buy_qty[i] > 0)
    avg_basis = (
        sum(buy_qty[i] * buy_price[i] for i in range(n) if buy_qty[i] > 0) / held_base
        if held_base > 0
        else 0.0
    )

    # Max drawdown over equity curve
    max_dd = 0.0
    if equity_curve:
        running_peak = config.capital_usd
        for pt in equity_curve:
            running_peak = max(running_peak, pt["equity"])
            dd = (pt["equity"] - running_peak) / running_peak if running_peak > 0 else 0.0
            max_dd = min(max_dd, dd)

    open_buy_levels = [i for i in range(n - 1) if state[i] == "buy_open"]

    return GridResult(
        pair=config.pair,
        config=asdict(config),
        levels=[round(l, 4) for l in levels],
        fills=[asdict(f) for f in fills],
        round_trips=round_trips,
        total_pnl_usd=round(realized_pnl + unreal, 2),
        total_fees_usd=round(total_fees, 2),
        realized_return_pct=round(realized_pnl / config.capital_usd, 4),
        unrealized_pnl_usd=round(unreal, 2),
        unrealized_holdings=round(held_base, 6),
        avg_holding_price=round(avg_basis, 2),
        final_price=round(last_close, 2),
        max_drawdown_pct=round(max_dd, 4),
        open_buy_levels=open_buy_levels,
        equity_curve=equity_curve,
        bar_count=bar_count,
    )
