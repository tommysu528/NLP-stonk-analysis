# Architecture

## System diagram

```
┌─────────────────┐
│   NewsAPI       │
│  (/v2/everything)│
└────────┬────────┘
         │ poll on cron
         ▼
┌─────────────────────┐      ┌──────────────────────┐
│  Ingestion Service  │─────►│  Ticker Extraction   │
│  - dedupe           │      │  - dictionary lookup │
│  - normalize UTC    │      │  - spaCy NER (later) │
└─────────────────────┘      └──────────┬───────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │  Sentiment Analysis  │
                             │  - FinBERT (HF)      │
                             └──────────┬───────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │       Postgres       │
                             │  articles            │
                             │  sentiment_scores    │
                             │  prices              │
                             │  signals             │
                             │  backtest_results    │
                             └──────────┬───────────┘
                                        │
                       ┌────────────────┼────────────────┐
                       ▼                ▼                ▼
              ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
              │ Signal      │  │ Backtesting  │  │ Dashboard    │
              │ Engine      │  │ Engine       │  │ (React)      │
              │ (windowed   │  │ (offline     │  │ (read-only)  │
              │  aggregator)│  │  batch)      │  │              │
              └─────────────┘  └──────────────┘  └──────────────┘
```

## Service responsibilities

### News Ingestion Service
- Polls NewsAPI on a cron schedule (every N minutes)
- Queries per-company (`q="Apple OR AAPL"`) since NewsAPI does not tag tickers
- Deduplicates by URL hash and headline-similarity check
- Normalizes timestamps to UTC
- Writes raw article rows to `articles`

### Ticker Extraction
- Runs after ingestion (sync inline for MVP, async worker for advanced)
- **MVP:** company-name → ticker dictionary lookup
- **Better:** spaCy NER on `ORG` entities, then dictionary lookup against extracted orgs
- One article can tag multiple tickers (one row per (article, ticker) pair downstream)

### Sentiment Analysis Service
- Consumes article rows that have at least one ticker tag
- Runs FinBERT on `headline + summary`
- Writes `{label, score, confidence}` rows to `sentiment_scores`, one per (article, ticker)

### Signal Engine
- Windowed aggregator over `sentiment_scores`
- For each ticker, compute rolling sentiment in N-minute or N-hour windows
- Apply threshold rule or weighted strength formula (see [strategy.md](strategy.md))
- Write `signals` rows when a BUY/SELL threshold is crossed

### Backtesting Engine
- Offline batch process
- Joins historical `signals` to `prices` by `(ticker, timestamp)`
- Simulates entries, exits, and returns over configurable holding windows
- Writes summary metrics to `backtest_results`

### Dashboard
- Read-only views over the database
- Three pages: Dashboard, Ticker, Backtest (see [frontend.md](frontend.md))

## Sync vs async

**MVP:** single FastAPI app + cron. Ingestion → extraction → sentiment runs in the same process, sequentially per polling interval. The signal engine and backtester are CLI commands or separate FastAPI endpoints triggered manually.

**Advanced:** decouple via Celery + Redis (or Kafka). Ingestion enqueues article IDs; workers handle extraction and sentiment in parallel; signal engine runs as its own consumer. Required once article volume or model latency makes inline processing too slow.

## Failure modes to design for
- NewsAPI rate limit hit mid-poll → checkpoint and resume next cycle
- Duplicate articles from different sources → dedupe must be robust to URL-encoding and tracking-param differences
- Sentiment model OOM on long article bodies → truncate to model's max token length
- Postgres connection lost during batch insert → use upserts so retries are idempotent
