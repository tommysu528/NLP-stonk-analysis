"""End-to-end pipeline: pending articles -> extracted tickers -> sentiment scores.

For each article that has no sentiment_scores rows, run ticker extraction
on the headline+summary, then run sentiment on each detected ticker
(currently the same text — same sentiment per ticker per article).
This is a deliberate MVP simplification; entity-level sentiment is in the
roadmap parking lot.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import session_scope
from api.models import Article, SentimentScore
from config import settings
from nlp.sentiment import score_batch
from nlp.ticker_extraction import extract_from_article

log = logging.getLogger(__name__)

BATCH_SIZE = 16


def _pending_articles(session: Session, limit: int) -> list[Article]:
    """Articles with no sentiment_scores rows yet, oldest first."""
    subq = select(SentimentScore.article_id).distinct()
    stmt = (
        select(Article)
        .where(Article.id.notin_(subq))
        .order_by(Article.published_at.asc())
        .limit(limit)
    )
    return list(session.scalars(stmt))


def process_pending(limit: int = 200) -> int:
    """Process up to `limit` pending articles. Returns number of sentiment rows written."""
    in_scope = set(settings.ticker_list)
    written = 0

    with session_scope() as session:
        pending = _pending_articles(session, limit)
        if not pending:
            log.info("No pending articles")
            return 0

        # Build the batch: one (article, ticker) pair per detected in-scope ticker.
        # Fall back to the article's query ticker if extraction finds nothing
        # in scope (the ingestion step queried for it, so it's likely relevant).
        pairs: list[tuple[Article, str]] = []
        for article in pending:
            tickers = extract_from_article(article.headline, article.summary) & in_scope
            if not tickers:
                tickers = {article.ticker}
            for ticker in tickers:
                pairs.append((article, ticker))

        if not pairs:
            return 0

        log.info("Scoring %d (article, ticker) pairs from %d articles", len(pairs), len(pending))

        for i in range(0, len(pairs), BATCH_SIZE):
            chunk = pairs[i : i + BATCH_SIZE]
            texts = [
                (a.headline if not a.summary else f"{a.headline}. {a.summary}") for a, _ in chunk
            ]
            results = score_batch(texts)
            for (article, ticker), result in zip(chunk, results, strict=True):
                session.add(
                    SentimentScore(
                        article_id=article.id,
                        ticker=ticker,
                        sentiment_label=result.label,
                        sentiment_score=result.score,
                        confidence=result.confidence,
                    )
                )
                written += 1

    log.info("Wrote %d sentiment rows", written)
    return written


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(process_pending())
