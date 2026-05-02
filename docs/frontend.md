# Frontend

A read-only dashboard over the Postgres data. Three pages.

## Pages

### Dashboard (`/`)
Landing page. Shows live state at a glance.

- **Latest news feed** — most recent N articles across all tickers, with sentiment label color-coded
- **Sentiment heatmap** — grid of tickers × time-buckets, cell color = average sentiment
- **Active signals** — current BUY/SELL signals, sorted by strength

### Ticker page (`/ticker/:symbol`)
Drill-down view per stock.

- **Price chart** — OHLC or close-line, last 30 days default
- **Sentiment overlay** — sentiment scores plotted on the same time axis (secondary y-axis)
- **Articles list** — paginated, with headline, source, sentiment, link
- **Signals list** — historical BUY/SELL/HOLD signals on this ticker with strength and reason

### Backtest page (`/backtest`)
Strategy evaluation view.

- **Strategy picker** — dropdown of strategies stored in `backtest_results`
- **Equity curve** — cumulative return over time, strategy vs buy-and-hold vs random baseline
- **Metrics table** — Sharpe, max drawdown, win rate, trade count side-by-side with baselines
- **Per-ticker breakdown** — metrics broken down by ticker so it's clear whether one ticker carries the strategy

## Tech

### MVP
- **React 18** with Vite for the build
- **Recharts** for charts (price line, sentiment overlay, equity curve)
- **TanStack Query** for data fetching against the FastAPI backend
- Plain CSS or Tailwind — no component library overhead at this stage

### Advanced
- **Next.js 14** with SSR for the ticker page (better SEO, faster first paint with lots of data)
- **Plotly.js** if Recharts hits limits on the price+sentiment overlay (synced zoom across two y-axes)
- **WebSocket** push from FastAPI for live signal updates instead of polling

## API contract

All endpoints return JSON. Pagination via `?page=&page_size=` where applicable.

| Endpoint | Returns |
|---|---|
| `GET /api/articles?ticker=AAPL&limit=20` | recent articles for ticker |
| `GET /api/sentiment?ticker=AAPL&since=2026-04-01` | sentiment scores time series |
| `GET /api/prices?ticker=AAPL&interval=1d&since=...` | OHLCV bars |
| `GET /api/signals?ticker=AAPL&active=true` | signal history or current active |
| `GET /api/backtests` | list of stored backtest runs |
| `GET /api/backtests/:id` | detailed metrics + equity curve points |
