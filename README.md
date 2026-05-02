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
| `stonk backtest` | Run the full backtest matrix, write `backtest_results` |
| `stonk pipeline` | `fetch-news` + `score` + `signals` end-to-end |

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

Start with 10 tickers — `AAPL, MSFT, NVDA, TSLA, AMZN, META, GOOGL, AMD, NFLX, JPM` — at daily resolution. Move to intraday once the end-to-end pipeline produces a credible backtest report.

---

*Built a real-time financial news sentiment trading system using Python, FastAPI, and transformer-based NLP models to generate and backtest equity trading signals, evaluated against buy-and-hold and moving-average baselines.*
