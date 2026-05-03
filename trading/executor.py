"""Translate signals into Alpaca orders (paper or live).

MVP rules:
- BUY signal + no existing position + market open + budget available
  -> submit notional market buy at ALPACA_TRADE_SIZE_USD
- SELL signal + existing position
  -> submit market sell to close
- SELL signal + no position: ignore (we don't short)
- Idempotency via signal.id as client_order_id; Alpaca rejects duplicates.

Skips silently when ALPACA_API_KEY is unset, so the cron stays green
for users who haven't enrolled in paper trading yet.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from api.db import session_scope
from api.models import Signal
from config import settings

log = logging.getLogger(__name__)

OUT_PATH = Path("frontend/public/data/trading.json")
SIGNAL_LOOKBACK_MIN = 90  # only act on signals from the last 90 minutes


def _client():
    """Lazy-import alpaca-py so module load doesn't require the dep at all."""
    if not settings.alpaca_api_key or not settings.alpaca_secret_key:
        return None, None, None
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import MarketOrderRequest
    from alpaca.trading.enums import OrderSide, TimeInForce

    client = TradingClient(
        settings.alpaca_api_key,
        settings.alpaca_secret_key,
        paper=settings.alpaca_paper,
    )
    return client, MarketOrderRequest, (OrderSide, TimeInForce)


def _recent_signals() -> list[Signal]:
    """Pull signals from the last SIGNAL_LOOKBACK_MIN minutes that came from
    evaluate_all (i.e., timestamped at 'now'-ish, not historical backfill).
    Backfill signals are timestamped at article time which is 24h+ old, so
    the time filter naturally excludes them."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=SIGNAL_LOOKBACK_MIN)
    with session_scope() as session:
        rows = session.execute(
            select(Signal)
            .where(Signal.timestamp >= cutoff)
            .order_by(Signal.timestamp.desc())
        ).scalars().all()
        # Detach so callers can use without a session
        for r in rows:
            session.expunge(r)
    return rows


def execute_signals() -> dict:
    """Process recent signals into Alpaca orders. Returns a summary dict."""
    client, MarketOrderRequest, enums = _client()
    if client is None:
        log.info("Alpaca not configured (ALPACA_API_KEY unset); skipping trade execution.")
        return {"enabled": False, "submitted": 0, "skipped": 0, "errors": 0}

    OrderSide, TimeInForce = enums

    # Pre-flight checks
    try:
        clock = client.get_clock()
        if not clock.is_open:
            log.info("Market is closed (next open: %s); skipping.", clock.next_open)
            return {"enabled": True, "submitted": 0, "skipped": 0, "errors": 0, "market_open": False}
    except Exception as e:
        log.exception("Failed to fetch market clock: %s", e)
        return {"enabled": True, "submitted": 0, "skipped": 0, "errors": 1}

    try:
        account = client.get_account()
        positions = {p.symbol: p for p in client.get_all_positions()}
    except Exception as e:
        log.exception("Failed to fetch account/positions: %s", e)
        return {"enabled": True, "submitted": 0, "skipped": 0, "errors": 1}

    buying_power = float(account.buying_power)
    log.info("Buying power: $%.2f, %d open positions", buying_power, len(positions))

    submitted = 0
    skipped = 0
    errors = 0

    # Dedupe: act on the most recent signal per (ticker, signal_type)
    seen: set[tuple[str, str]] = set()
    for sig in _recent_signals():
        key = (sig.ticker, sig.signal_type)
        if key in seen:
            continue
        seen.add(key)

        if sig.signal_type == "BUY":
            if sig.ticker in positions:
                log.info("Skip BUY %s: already holding %s shares", sig.ticker, positions[sig.ticker].qty)
                skipped += 1
                continue
            if len(positions) >= settings.alpaca_max_positions:
                log.info("Skip BUY %s: max positions (%d) reached", sig.ticker, settings.alpaca_max_positions)
                skipped += 1
                continue
            if buying_power < settings.alpaca_trade_size_usd:
                log.info("Skip BUY %s: insufficient buying power", sig.ticker)
                skipped += 1
                continue

            try:
                order = MarketOrderRequest(
                    symbol=sig.ticker,
                    notional=settings.alpaca_trade_size_usd,
                    side=OrderSide.BUY,
                    time_in_force=TimeInForce.DAY,
                    client_order_id=f"sig-{sig.id}",
                )
                client.submit_order(order)
                log.info("Submitted BUY $%.0f %s (signal id=%d strength=%+.3f)",
                         settings.alpaca_trade_size_usd, sig.ticker, sig.id, sig.strength)
                submitted += 1
                buying_power -= settings.alpaca_trade_size_usd
            except Exception as e:
                # Most common: 422 "duplicate client_order_id" — already submitted on a prior run
                msg = str(e)
                if "client_order_id" in msg or "duplicate" in msg.lower():
                    log.info("Skip BUY %s: signal %d already submitted previously", sig.ticker, sig.id)
                    skipped += 1
                else:
                    log.exception("Order submit failed for %s: %s", sig.ticker, e)
                    errors += 1

        elif sig.signal_type == "SELL":
            if sig.ticker not in positions:
                continue  # not holding; nothing to close
            try:
                client.close_position(sig.ticker)
                log.info("Submitted SELL (close) %s (signal id=%d)", sig.ticker, sig.id)
                submitted += 1
            except Exception as e:
                log.exception("Close position failed for %s: %s", sig.ticker, e)
                errors += 1

    return {"enabled": True, "submitted": submitted, "skipped": skipped, "errors": errors, "market_open": True}


def export_state() -> None:
    """Snapshot account state + positions + recent orders to trading.json."""
    client, _, _ = _client()
    if client is None:
        # Write a stub file so the frontend can detect "not configured"
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps({
            "enabled": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }))
        return

    payload: dict = {
        "enabled": True,
        "paper": settings.alpaca_paper,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        account = client.get_account()
        payload["account"] = {
            "equity": float(account.equity),
            "cash": float(account.cash),
            "buying_power": float(account.buying_power),
            "portfolio_value": float(account.portfolio_value),
            "long_market_value": float(account.long_market_value),
            "last_equity": float(account.last_equity),
            "status": str(account.status),
        }
    except Exception as e:
        log.exception("Failed account fetch: %s", e)
        payload["account"] = None

    try:
        positions = client.get_all_positions()
        payload["positions"] = [
            {
                "symbol": p.symbol,
                "qty": float(p.qty),
                "avg_entry_price": float(p.avg_entry_price),
                "current_price": float(p.current_price) if p.current_price else None,
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
                "unrealized_plpc": float(p.unrealized_plpc),
                "side": str(p.side),
            }
            for p in positions
        ]
    except Exception as e:
        log.exception("Failed positions fetch: %s", e)
        payload["positions"] = []

    try:
        from alpaca.trading.requests import GetOrdersRequest
        from alpaca.trading.enums import QueryOrderStatus

        req = GetOrdersRequest(status=QueryOrderStatus.ALL, limit=50)
        orders = client.get_orders(filter=req)
        payload["recent_orders"] = [
            {
                "id": str(o.id),
                "client_order_id": o.client_order_id,
                "symbol": o.symbol,
                "side": str(o.side).lower(),
                "qty": float(o.qty) if o.qty else None,
                "notional": float(o.notional) if o.notional else None,
                "filled_qty": float(o.filled_qty) if o.filled_qty else 0.0,
                "filled_avg_price": float(o.filled_avg_price) if o.filled_avg_price else None,
                "status": str(o.status),
                "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
                "filled_at": o.filled_at.isoformat() if o.filled_at else None,
            }
            for o in orders
        ]
    except Exception as e:
        log.exception("Failed orders fetch: %s", e)
        payload["recent_orders"] = []

    try:
        from alpaca.trading.requests import GetPortfolioHistoryRequest

        req = GetPortfolioHistoryRequest(period="1M", timeframe="1D")
        hist = client.get_portfolio_history(history_filter=req)
        payload["equity_curve"] = [
            {"timestamp": ts, "equity": eq}
            for ts, eq in zip(hist.timestamp or [], hist.equity or [])
        ]
    except Exception as e:
        log.warning("Portfolio history unavailable: %s", e)
        payload["equity_curve"] = []

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), default=str))
    log.info("wrote %s", OUT_PATH)


def run() -> None:
    summary = execute_signals()
    log.info("Execution summary: %s", summary)
    export_state()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
