"""Signal engine.

For each ticker, aggregate sentiment in a rolling window and emit a
BUY/SELL/HOLD signal whenever the weighted strength crosses a threshold.

Strength = mean(score * confidence * recency_weight) * log(1 + n)
where recency_weight is exponential decay with half-life HALF_LIFE_MIN.

Source credibility is left at 1.0 for MVP — wire in once we have a
hand-curated source list.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import session_scope
from api.models import Article, SentimentScore, Signal
from config import settings

log = logging.getLogger(__name__)

WINDOW_MIN = 60
HALF_LIFE_MIN = 30
MIN_ARTICLES = 2
BUY_THRESHOLD = 0.15
SELL_THRESHOLD = -0.15


@dataclass
class WindowSample:
    score: float
    confidence: float
    age_min: float


def _recency_weight(age_min: float) -> float:
    return math.exp(-age_min / HALF_LIFE_MIN)


def compute_strength(samples: list[WindowSample]) -> float:
    if len(samples) < MIN_ARTICLES:
        return 0.0
    weighted = [s.score * s.confidence * _recency_weight(s.age_min) for s in samples]
    mean_weighted = sum(weighted) / len(weighted)
    volume_factor = math.log(1 + len(samples))
    return mean_weighted * volume_factor


def classify(strength: float) -> str:
    if strength >= BUY_THRESHOLD:
        return "BUY"
    if strength <= SELL_THRESHOLD:
        return "SELL"
    return "HOLD"


def _samples_for(session: Session, ticker: str, now: datetime) -> list[WindowSample]:
    since = now - timedelta(minutes=WINDOW_MIN)
    stmt = (
        select(SentimentScore.sentiment_score, SentimentScore.confidence, Article.published_at)
        .join(Article, Article.id == SentimentScore.article_id)
        .where(SentimentScore.ticker == ticker, Article.published_at >= since, Article.published_at <= now)
    )
    rows = session.execute(stmt).all()
    return [
        WindowSample(score=r[0], confidence=r[1], age_min=(now - r[2]).total_seconds() / 60.0)
        for r in rows
    ]


def evaluate_ticker(session: Session, ticker: str, now: datetime | None = None) -> Signal | None:
    now = now or datetime.now(timezone.utc)
    samples = _samples_for(session, ticker, now)
    strength = compute_strength(samples)
    signal_type = classify(strength)
    if signal_type == "HOLD":
        return None
    reason = (
        f"strength={strength:+.3f} over {len(samples)} articles in last {WINDOW_MIN}min "
        f"(buy>={BUY_THRESHOLD}, sell<={SELL_THRESHOLD})"
    )
    sig = Signal(ticker=ticker, timestamp=now, signal_type=signal_type, strength=strength, reason=reason)
    session.add(sig)
    return sig


def evaluate_all(now: datetime | None = None) -> list[Signal]:
    """Evaluate every configured ticker once. Returns emitted signals."""
    now = now or datetime.now(timezone.utc)
    emitted: list[Signal] = []
    with session_scope() as session:
        for ticker in settings.ticker_list:
            sig = evaluate_ticker(session, ticker, now=now)
            if sig is not None:
                emitted.append(sig)
                log.info("Signal: %s %s strength=%+.3f", sig.ticker, sig.signal_type, sig.strength)
    return emitted


def backfill_all(step_hours: int = 1) -> int:
    """Walk historical sentiment for each ticker and emit signals at each step.

    Without this, a single 'now' evaluation produces nothing to backtest against
    when news arrives in batches (e.g., NewsAPI free tier with its 24h delay).
    Emits a signal only when the signal *type* changes from the previous step,
    avoiding redundant rows.
    """
    from sqlalchemy import func as sa_func

    step = timedelta(hours=step_hours)
    total = 0
    with session_scope() as session:
        for ticker in settings.ticker_list:
            bounds = session.execute(
                select(sa_func.min(Article.published_at), sa_func.max(Article.published_at))
                .join(SentimentScore, SentimentScore.article_id == Article.id)
                .where(SentimentScore.ticker == ticker)
            ).one()
            earliest, latest = bounds
            if earliest is None or latest is None:
                continue

            t = earliest + timedelta(minutes=WINDOW_MIN)
            last_type: str | None = None
            ticker_count = 0
            while t <= latest + step:
                samples = _samples_for(session, ticker, t)
                if not samples:
                    t += step
                    continue
                strength = compute_strength(samples)
                signal_type = classify(strength)
                if signal_type != "HOLD" and signal_type != last_type:
                    reason = (
                        f"strength={strength:+.3f} over {len(samples)} articles "
                        f"in {WINDOW_MIN}min window ending {t.isoformat()}"
                    )
                    session.add(
                        Signal(
                            ticker=ticker,
                            timestamp=t,
                            signal_type=signal_type,
                            strength=strength,
                            reason=reason,
                        )
                    )
                    ticker_count += 1
                    last_type = signal_type
                elif signal_type == "HOLD":
                    last_type = None
                t += step
            log.info("Backfilled %d signals for %s", ticker_count, ticker)
            total += ticker_count
    return total


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sigs = evaluate_all()
    print(f"emitted {len(sigs)} signals")
