# Roadmap

## Build order

Each step has a "definition of done" — do not move on until DoD is met. Progress means working software, not partial scaffolds across many layers.

| # | Step | Definition of done |
|---|---|---|
| 1 | Pull stock prices via yfinance | Script that fetches 2y of daily OHLCV for the 10 tickers and writes to a local CSV or to Postgres `prices` |
| 2 | Pull news from NewsAPI | Script that queries one ticker, returns articles, and prints headline + summary + timestamp |
| 3 | Set up Postgres + create tables | Compose file runs Postgres locally; migrations create all 5 tables; smoke-test insert+select works |
| 4 | Wire ingestion → DB | Polling job runs every N minutes, dedupes, and writes to `articles` for all 10 tickers |
| 5 | Implement ticker extraction | MVP dictionary lookup runs over headline+summary; multi-ticker articles produce multiple rows |
| 6 | Add sentiment analysis | FinBERT loads, runs on each new article, writes `sentiment_scores` rows |
| 7 | Build signal logic | Threshold rule emits BUY/SELL/HOLD; `signals` table populated; printable per-ticker timeline |
| 8 | Implement backtesting | Backtester joins signals to prices, simulates trades over the 5 holding windows, writes `backtest_results`, prints Sharpe vs buy-and-hold baseline |
| 9 | Build frontend dashboard | React app renders Dashboard, Ticker, and Backtest pages off the FastAPI endpoints |
| 10 | Dockerize | `docker compose up` starts api + db + frontend + worker; fresh clone works end-to-end |
| 11 | Write README | Quickstart in README is verified against a fresh clone; backtest results screenshot included |

## Definition of MVP

You can run the full pipeline end-to-end on at least one ticker for one week of historical data, produce a backtest report comparing the sentiment strategy against buy-and-hold and random-signal baselines, and show all of it in the React dashboard. **That is the bar to hit before considering any advanced-stack upgrade.**

## Scope

Start with **10 tickers** at **daily resolution**:

```
AAPL  MSFT  NVDA  TSLA  AMZN  META  GOOGL  AMD  NFLX  LZ
```

Why these:
- All US large-caps, all yfinance-supported, all heavily covered by NewsAPI sources
- Span enough sectors (tech, auto, finance) that strategy results are not all driven by one industry
- Small enough that you can manually spot-check sentiment outputs

Once daily works end-to-end, drop to **hourly**. Only go to minute-level after upgrading the price data source (yfinance's minute history is capped at 60 days).

## Common pitfalls

These are the failure modes that will make the project either invalid or unimpressive. Address each explicitly in the implementation:

- **Generic sentiment models** — VADER and distilbert-sst2 mis-score finance jargon. Use FinBERT from day one. (See [nlp-pipeline.md](nlp-pipeline.md).)
- **No backtesting** — A sentiment-tagging dashboard with no proof of trading edge is not the project. The backtest is the headline result.
- **No baselines** — A backtest without buy-and-hold and random-signal comparisons is not a credible result.
- **Timestamp misalignment** — News in UTC, yfinance in market-local. Convert at write time, not at query time.
- **Look-ahead bias** — Always use the *next* price bar after a signal, never one that closed before the signal existed.
- **Duplicate news** — Multiple sources republish the same wire story. Dedupe by URL hash and headline similarity.
- **Survivorship bias** — Today's mega-caps are today's mega-caps because they survived. Note this honestly in any results writeup.
- **Overfitting thresholds** — Hold out a validation window; do not tune on the period you report.

## Advanced features (parking lot)

After MVP ships and you have credible backtest numbers:

- **Entity-level sentiment** — multi-company articles get per-company sentiment, not one score for all
- **Latency analysis** — measure time between news publication and price reaction, plot the distribution
- **Multi-signal strategy** — combine sentiment with price momentum and volume spikes; A/B test combinations
- **Strategy comparison framework** — first-class support for running N strategies on the same data and comparing
- **Live paper trading** — wire signals into a paper-trading API (Alpaca) and track real-time P&L
- **Source credibility scoring** — automatically learn which sources lead price moves vs lag them

## Resume bullet (target)

> Built a real-time financial news sentiment trading system using Python, FastAPI, and transformer-based NLP models (FinBERT) to generate and backtest equity trading signals across 10 large-cap US stocks, evaluated against buy-and-hold and moving-average baselines, with a React dashboard for live monitoring and historical analysis.
