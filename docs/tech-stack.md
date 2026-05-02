# Tech Stack

Two parallel tracks. Build the **MVP** first end-to-end. Only upgrade an individual layer when MVP performance, throughput, or quality forces the move.

| Layer | MVP | Advanced | When to upgrade |
|---|---|---|---|
| **Language** | Python 3.11+ | Python 3.11+ | N/A |
| **API framework** | FastAPI | FastAPI | N/A — FastAPI scales fine |
| **Worker / queue** | cron + sync calls in FastAPI | Celery + Redis (or Kafka) | When ingestion + sentiment can't finish in one polling interval |
| **Database** | Postgres 16 | Postgres + TimescaleDB hypertables for `prices` | When you go below daily bars and `prices` grows past ~10M rows |
| **Price data** | `yfinance` | Polygon.io or Alpha Vantage | When you need true intraday (1-min) bars or after-hours data |
| **News data** | NewsAPI | NewsAPI + Finnhub + Alpha Vantage news/sentiment | When NewsAPI's 100 req/day or 24h delay becomes binding |
| **Ticker extraction** | hardcoded dictionary | dictionary + spaCy NER (`en_core_web_sm`) | Once you see false positives ("Apple" the fruit, "Amazon" the rainforest) in your articles |
| **Sentiment model** | HF Transformers + `ProsusAI/finbert` | + `yiyanghkust/finbert-tone` A/B, fine-tuning | When backtest shows model is the bottleneck on signal quality |
| **Backtesting** | hand-rolled in pandas | Backtrader or vectorbt | Once you want walk-forward analysis, slippage modeling, or complex order types |
| **Frontend framework** | React 18 + Vite | Next.js 14 with SSR | When dashboard SEO matters or initial paint feels slow with real data volumes |
| **Charts** | Recharts | Plotly.js | When you need synced zoom across multiple y-axes (price + sentiment overlay) |
| **State / data fetching** | TanStack Query | TanStack Query + WebSocket push | When you want live signal updates instead of polling |
| **Containerization** | Docker Compose (api, db, worker) | Docker Compose + GitHub Actions CI/CD | Once you have someone else running the stack |
| **Observability** | print + FastAPI access logs | OpenTelemetry → Grafana/Loki/Tempo | Once you have multiple workers and need to trace a slow signal |
| **Testing** | pytest, basic unit tests | pytest + integration tests against a test Postgres + frontend Playwright | Before sharing the repo publicly |

## MVP one-liner

`Python · FastAPI · Postgres · NewsAPI · yfinance · HF FinBERT · React + Recharts · Docker Compose`

## Advanced one-liner

`Python · FastAPI · Celery + Redis · Postgres + TimescaleDB · NewsAPI/Finnhub/Alpha Vantage · yfinance/Polygon · HF FinBERT + spaCy · Backtrader · Next.js + Plotly · Docker + GHA CI`

## Project layout (proposed)

```
NLP-stonk-analysis/
├── api/                  # FastAPI app
│   ├── main.py
│   ├── routes/
│   ├── models/           # SQLAlchemy or Pydantic
│   └── db.py
├── ingestion/            # NewsAPI poller, yfinance fetcher
├── nlp/                  # ticker extraction, sentiment service
├── strategy/             # signal engine, backtester
├── frontend/             # React app
├── migrations/           # alembic
├── tests/
├── docker-compose.yml
├── pyproject.toml
└── README.md
```
