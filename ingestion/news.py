"""Poll NewsAPI per ticker and upsert articles into the DB.

NewsAPI does not tag tickers, so we query per-company. Ticker extraction
runs as a separate step (see nlp.ticker_extraction) — this module only
records the *query ticker* alongside each row so the ticker association
can be refined later without re-fetching.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential

from api.db import session_scope
from api.models import Article
from config import settings

log = logging.getLogger(__name__)

NEWSAPI_URL = "https://newsapi.org/v2/everything"

# Search query per ticker — both company name and symbol.
TICKER_QUERIES: dict[str, str] = {
    "AAPL": '"Apple" OR "AAPL"',
    "MSFT": '"Microsoft" OR "MSFT"',
    "NVDA": '"Nvidia" OR "NVDA"',
    "TSLA": '"Tesla" OR "TSLA"',
    "AMZN": '"Amazon" OR "AMZN"',
    "META": '"Meta Platforms" OR "META"',
    "GOOGL": '"Alphabet" OR "Google" OR "GOOGL"',
    "AMD": '"AMD" OR "Advanced Micro Devices"',
    "NFLX": '"Netflix" OR "NFLX"',
    "JPM": '"JPMorgan" OR "JP Morgan" OR "JPM"',
}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def _fetch(query: str, page_size: int = 20) -> list[dict]:
    if not settings.newsapi_key:
        raise RuntimeError("NEWSAPI_KEY is not set")
    headers = {"X-Api-Key": settings.newsapi_key}
    params = {
        "q": query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
    }
    with httpx.Client(timeout=20) as client:
        resp = client.get(NEWSAPI_URL, params=params, headers=headers)
        resp.raise_for_status()
        body = resp.json()
    if body.get("status") != "ok":
        raise RuntimeError(f"NewsAPI error: {body}")
    return body.get("articles", [])


def _to_row(ticker: str, article: dict) -> dict | None:
    url = article.get("url")
    title = article.get("title")
    published = article.get("publishedAt")
    if not (url and title and published):
        return None
    try:
        published_at = datetime.fromisoformat(published.replace("Z", "+00:00"))
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        else:
            published_at = published_at.astimezone(timezone.utc)
    except ValueError:
        log.warning("Bad timestamp from NewsAPI: %s", published)
        return None

    return {
        "ticker": ticker,
        "headline": title[:2000],
        "summary": (article.get("description") or "")[:4000] or None,
        "source": (article.get("source") or {}).get("name"),
        "url": url,
        "published_at": published_at,
    }


def upsert_articles(session: Session, rows: list[dict]) -> int:
    if not rows:
        return 0
    stmt = insert(Article).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["url", "ticker"])
    result = session.execute(stmt)
    return result.rowcount or 0


def ingest_all(page_size: int = 20) -> dict[str, int]:
    """Poll every configured ticker once, return per-ticker insert counts."""
    counts: dict[str, int] = {}
    for ticker in settings.ticker_list:
        query = TICKER_QUERIES.get(ticker, f'"{ticker}"')
        try:
            articles = _fetch(query, page_size=page_size)
        except Exception as e:
            log.exception("Fetch failed for %s: %s", ticker, e)
            counts[ticker] = 0
            continue

        rows = [r for a in articles if (r := _to_row(ticker, a))]
        with session_scope() as session:
            n = upsert_articles(session, rows)
        counts[ticker] = n
        log.info("Inserted %d new articles for %s (queried %d)", n, ticker, len(rows))
    return counts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(ingest_all())
