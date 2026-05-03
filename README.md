# NLP-stonk-analysis

A real-time financial news sentiment platform that ingests market news, applies financial NLP models, generates trading signals, and evaluates performance through backtesting against historical stock data.

## Architecture

```
News APIs (NewsAPI)
       │
       ▼
Ingestion Service ──► Ticker Extraction ──► Sentiment Analysis
                                                    │
                                                    ▼
                                                Postgres
                                                    │
                                                    ▼
                                             Signal Engine
                                                    │
                                                    ▼
                                          Backtesting Engine
                                                    │
                                                    ▼
                                             Dashboard (React)
```

## Stack at a glance

**MVP:** Python 3.11 · FastAPI · Postgres · NewsAPI · yfinance · Hugging Face FinBERT · React + Recharts · Docker Compose

See [docs/tech-stack.md](docs/tech-stack.md) for the full MVP-vs-Advanced comparison.

## Quickstart

Prereqs: **Docker Desktop** (or Docker + Compose), and a free **NewsAPI key** from <https://newsapi.org/register>.

```bash
# 1. Configure
cp .env.example .env
# Edit .env and set NEWSAPI_KEY=<your key>

# 2. Start Postgres + API + frontend
docker compose up -d --build

# 3. Run database migrations
docker compose exec api alembic upgrade head

# 4. Pull historical prices (yfinance, 2 years daily)
docker compose exec api stonk fetch-prices

# 5. Pull news, score sentiment, generate signals (one-shot)
docker compose exec api stonk pipeline

# 6. Run the backtest
docker compose exec api stonk backtest
```

Open the dashboard at **<http://localhost:5173>** and the API at **<http://localhost:8000/docs>**.

### Local dev without Docker

Requires Python 3.11+ and a Postgres instance.

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env  # edit DATABASE_URL and NEWSAPI_KEY
alembic upgrade head
stonk fetch-prices
stonk pipeline
stonk backtest
uvicorn api.main:app --reload
# in another shell:
cd frontend && npm install && npm run dev
```

### CLI commands

| Command | What it does |
|---|---|
| `stonk fetch-prices` | Pull OHLCV bars from yfinance for all tickers, upsert into `prices` |
| `stonk fetch-news` | Poll NewsAPI per ticker, upsert into `articles` |
| `stonk score` | Run FinBERT on pending articles, write `sentiment_scores` |
| `stonk signals` | Evaluate the signal engine, write `signals` rows |
| `stonk signals --backfill` | Walk historical sentiment and emit signals at each step (idempotent for type changes) |
| `stonk backtest` | Run the full backtest matrix, write `backtest_results` |
| `stonk export` | Dump all tables to JSON snapshots in `frontend/public/data/` |
| `stonk pipeline` | `fetch-news` + `score` + `signals` end-to-end |

## Public deployment (GitHub Pages + Actions)

This repo is set up to host itself on GitHub Pages with no external infrastructure:

- **`.github/workflows/refresh.yml`** runs every 3 hours. It installs the pipeline,
  fetches news, scores sentiment with FinBERT, generates signals, runs the backtest,
  exports JSON snapshots into `frontend/public/data/`, and commits them back to the repo.
  SQLite acts as the persistent store, cached between runs via `actions/cache`.
- **`.github/workflows/deploy.yml`** rebuilds the React app with `VITE_STATIC_MODE=true`
  (so it reads from the JSON snapshots instead of FastAPI) and publishes it to Pages.
  It runs on push to `main` and after every refresh.

### One-time setup

1. **Add your NewsAPI key as a repo secret.** Settings → Secrets and variables →
   Actions → New repository secret: name `NEWSAPI_KEY`, value your key.
2. **Allow Actions to write to the repo.** Settings → Actions → General →
   Workflow permissions → "Read and write permissions" → Save.
3. **Enable GitHub Pages with Actions as the source.** Settings → Pages →
   Build and deployment → Source: GitHub Actions.
4. **Trigger the first refresh manually.** Actions tab → "Refresh data" →
   Run workflow → main. The first run takes ~5 minutes (downloads FinBERT,
   pulls news, runs backtest). Subsequent runs are ~2 minutes.
5. After refresh completes, deploy will trigger automatically. Your dashboard
   will be live at `https://<your-username>.github.io/NLP-stonk-analysis/`.

### What this gives you

- A public dashboard auto-updating every 3 hours, free.
- Real accumulating dataset: each refresh adds new articles and signals to
  the SQLite store, with the JSON snapshots that the dashboard reads being
  committed to the repo as a side effect.
- No always-on server, no database to manage, no credit card required.

### What this does **not** give you

- Sub-3-hour latency on signals (NewsAPI free tier is 24h-delayed anyway).
- Server-side filtering or pagination — the frontend pulls full JSON files
  and filters client-side. Fine for the current 10-ticker scope; would need
  rethinking past ~100 tickers or ~10k articles.
- Personal data, auth, or write actions from the UI.

## Paper trading (optional)

The pipeline can auto-execute its signals against an Alpaca paper-trading
account. Disabled by default; opt in by adding two repo secrets.

### Setup

1. Sign up at <https://alpaca.markets> (free, ~2 minutes).
2. From the dashboard, generate a **paper-trading** API key + secret. (Make
   sure you're on Paper, not Live, in the top-right toggle.)
3. Add the secrets to your repo:
   Settings → Secrets and variables → Actions →
   - `ALPACA_API_KEY` = your paper API key
   - `ALPACA_SECRET_KEY` = your paper secret
4. Wait for the next cron run (or manually trigger "Refresh data"). The
   `Execute paper trades` step will start submitting market orders for any
   fresh BUY/SELL signals during market hours.

### Behavior

- **BUY signal + no existing position + market open**: submit a $500 notional
  market buy. Idempotent — same signal can't be submitted twice (uses the
  signal's DB ID as `client_order_id`).
- **SELL signal + open position in that ticker**: close the entire position.
- **Otherwise**: skip silently.
- **Max simultaneous positions**: 8. Tunable via `ALPACA_MAX_POSITIONS`.
- **Trade size**: $500 per buy. Tunable via `ALPACA_TRADE_SIZE_USD`.

### Going live

Once paper trading has a track record you trust, switch to live:
1. Generate a separate **live** API key from Alpaca (different from paper).
2. Replace the secrets in your repo with the live key/secret.
3. Set `ALPACA_PAPER: "false"` in `.github/workflows/refresh.yml`.
4. **Strongly recommended first**: drop `ALPACA_TRADE_SIZE_USD` to a small
   amount (e.g. $50) for the first weeks of live trading.

The Trading dashboard tab will show your positions, P&L, and recent orders
in either mode. A **LIVE** badge appears next to the page title when
`ALPACA_PAPER=false`.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System diagram and service-by-service responsibilities |
| [docs/data-model.md](docs/data-model.md) | Data sources (NewsAPI, yfinance) and Postgres schema |
| [docs/nlp-pipeline.md](docs/nlp-pipeline.md) | Ticker extraction and sentiment analysis approach |
| [docs/strategy.md](docs/strategy.md) | Signal engine logic and backtesting methodology |
| [docs/frontend.md](docs/frontend.md) | Dashboard, ticker, and backtest pages |
| [docs/tech-stack.md](docs/tech-stack.md) | MVP and Advanced stack options, side-by-side |
| [docs/roadmap.md](docs/roadmap.md) | Build order, scope, common pitfalls, advanced features |

## Scope

Start with 10 tickers — `AAPL, MSFT, NVDA, TSLA, AMZN, META, GOOGL, AMD, NFLX, LZ` — at daily resolution. Move to intraday once the end-to-end pipeline produces a credible backtest report.

---

*Built a real-time financial news sentiment trading system using Python, FastAPI, and transformer-based NLP models to generate and backtest equity trading signals, evaluated against buy-and-hold and moving-average baselines.*
