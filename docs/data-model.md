# Data Model

## Data sources

### NewsAPI

- **Endpoint:** `GET https://newsapi.org/v2/everything`
- **Auth:** API key in `X-Api-Key` header
- **Query strategy:** one request per ticker per polling cycle, e.g. `q="Apple" OR "AAPL"`. NewsAPI does **not** tag tickers, so we are responsible for ticker association via the extraction step.
- **Free tier reality:** ~100 requests/day, 24-hour delay on article timestamps, no commercial use. Plan polling cadence accordingly (10 tickers × 6 polls/day = 60 requests, leaves headroom).
- **Pagination:** `pageSize` up to 100, `page` 1..N. For MVP, `pageSize=20` and only page 1 is enough.
- **Required response fields:**
  - `title` → `articles.headline`
  - `description` → `articles.summary`
  - `publishedAt` → `articles.published_at` (ISO 8601, must be parsed to UTC)
  - `source.name` → `articles.source`
  - `url` → `articles.url`

### yfinance

- **Library:** `yfinance` (Python, no auth)
- **Primary call:** `yf.Ticker(symbol).history(period="2y", interval="1d")`
- **Intervals supported:** `1d` for MVP; `1h` and below available but with shorter lookback windows (max 730d for `1h`, 60d for `1m`)
- **Required fields:** `Open, High, Low, Close, Volume`, indexed by timestamp
- **Gotcha:** yfinance returns timestamps in market-local timezone (e.g., America/New_York for US equities). Convert to UTC at write time so they align with news timestamps.

## Postgres schema

### `articles`
```sql
CREATE TABLE articles (
  id           BIGSERIAL PRIMARY KEY,
  ticker       TEXT NOT NULL,
  headline     TEXT NOT NULL,
  summary      TEXT,
  source       TEXT,
  url          TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (url, ticker)
);
CREATE INDEX idx_articles_ticker_pub ON articles (ticker, published_at DESC);
```
*Raw ingested news. One row per (article, ticker) — an article mentioning two tickers produces two rows.*

### `sentiment_scores`
```sql
CREATE TABLE sentiment_scores (
  id              BIGSERIAL PRIMARY KEY,
  article_id      BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  ticker          TEXT NOT NULL,
  sentiment_label TEXT NOT NULL,        -- 'positive' | 'neutral' | 'negative'
  sentiment_score REAL NOT NULL,        -- signed: -1.0 to +1.0
  confidence      REAL NOT NULL,        -- 0.0 to 1.0
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sentiment_article ON sentiment_scores (article_id);
CREATE INDEX idx_sentiment_ticker_created ON sentiment_scores (ticker, created_at DESC);
```
*FinBERT output, one row per (article, ticker).*

### `prices`
```sql
CREATE TABLE prices (
  id        BIGSERIAL PRIMARY KEY,
  ticker    TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  open      NUMERIC(12,4) NOT NULL,
  high      NUMERIC(12,4) NOT NULL,
  low       NUMERIC(12,4) NOT NULL,
  close     NUMERIC(12,4) NOT NULL,
  volume    BIGINT NOT NULL,
  UNIQUE (ticker, timestamp)
);
CREATE INDEX idx_prices_ticker_ts ON prices (ticker, timestamp DESC);
```
*OHLCV bars from yfinance. `(ticker, timestamp)` uniqueness lets us upsert on re-fetch.*

### `signals`
```sql
CREATE TABLE signals (
  id          BIGSERIAL PRIMARY KEY,
  ticker      TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL,
  signal_type TEXT NOT NULL,            -- 'BUY' | 'SELL' | 'HOLD'
  strength    REAL NOT NULL,            -- weighted score, see strategy.md
  reason      TEXT                      -- human-readable: 'avg sent +0.72 over 60min, 4 articles'
);
CREATE INDEX idx_signals_ticker_ts ON signals (ticker, timestamp DESC);
```
*Output of the signal engine. One row per generated signal.*

### `backtest_results`
```sql
CREATE TABLE backtest_results (
  id            BIGSERIAL PRIMARY KEY,
  strategy_name TEXT NOT NULL,
  ticker        TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  return_pct    REAL NOT NULL,
  sharpe_ratio  REAL,
  max_drawdown  REAL,
  win_rate      REAL,
  trade_count   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
*Summary metrics per (strategy, ticker, date range) backtest run.*

## Hot-path indexes

The signal engine joins `sentiment_scores` to `articles` and groups by ticker over recent time windows. The backtester joins `signals` to `prices` by `(ticker, timestamp)`. The indexes above are sized for those queries.

## Data retention

No cleanup policy in MVP — disk is cheap, the volumes are small (10 tickers × ~20 articles/day = 200 rows/day). Revisit if intraday news ingestion pushes volume up two orders of magnitude.
