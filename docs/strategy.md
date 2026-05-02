# Strategy: Signal Engine and Backtesting

## Signal engine

### MVP rule

Per ticker, compute average sentiment over a rolling lookback window:

```python
def signal(ticker: str, now: datetime) -> str:
    avg = avg_sentiment(ticker, since=now - timedelta(minutes=60))
    if avg > 0.6:
        return "BUY"
    if avg < -0.6:
        return "SELL"
    return "HOLD"
```

`avg_sentiment` computes the mean of `sentiment_score` rows in the window. If fewer than N articles (e.g., N=2) exist in the window, return `HOLD` — single-article signals are too noisy.

### Weighted strength formula

Replace the flat average with a weighted score that captures more of the signal:

```
strength = sentiment_score
         × confidence
         × recency_weight
         × article_volume
         × source_credibility
```

Where:
- **`sentiment_score`** — model output, signed [-1, +1]
- **`confidence`** — model's softmax probability for the chosen class
- **`recency_weight`** — exponential decay, e.g. `exp(-Δt / half_life)` with half_life=30min
- **`article_volume`** — `log(1 + n_articles_in_window)` to reward confirmation across multiple sources without unbounded growth
- **`source_credibility`** — per-source multiplier (Reuters=1.0, Bloomberg=1.0, less reputable sources lower). Hand-curated for MVP.

Aggregate per ticker, then apply threshold logic to bucket into BUY/SELL/HOLD.

### Improved trigger conditions

A BUY signal should require *all* of:
- Aggregated `strength` above a threshold
- At least 3 confirming articles in the window
- Total article volume above a per-ticker baseline (avoids signals during news droughts)
- Price has not already moved >2% in the lookback window (don't chase the move — the market may have already priced it in)

## Backtesting

### Methodology

```
for each signal in signals:
    entry_price = price at signal.timestamp (next available bar)
    for each holding_window in [15m, 1h, 4h, 1d, 3d]:
        exit_price = price at signal.timestamp + holding_window
        return = (exit_price - entry_price) / entry_price * direction
        record trade
```

`direction = +1` for BUY, `-1` for SELL. HOLD signals are ignored.

### Holding windows

Test five fixed windows per signal: **15min, 1h, 4h, 1d, 3d**. The "right" holding period is one of the things we're *learning* from the backtest.

### Metrics

Per (strategy, ticker, holding_window):

- **Total return** — sum of per-trade returns
- **Sharpe ratio** — `mean(returns) / std(returns) * sqrt(annualization_factor)`
- **Max drawdown** — largest peak-to-trough decline of the equity curve
- **Win rate** — fraction of trades with positive return
- **Average gain / loss** — mean return on winners, mean loss on losers
- **Trade count** — total signals acted on

### Baselines

Compare every strategy run against:

- **Buy-and-hold** — buy at start, sell at end
- **Random signals** — generate the same number of BUY/SELL signals at random timestamps; run the same simulation
- **Moving-average crossover** — classic 50/200-day crossover, no sentiment input

A sentiment strategy that doesn't beat random signals on Sharpe ratio has no edge. **Reporting backtest results without baselines is the single biggest red flag for portfolio reviewers.**

### Pitfalls

- **Look-ahead bias** — never use a price bar that closed *before* the signal was generated. Use the *next* bar after `signal.timestamp`.
- **Timezone misalignment** — news timestamps are UTC, yfinance returns market-local. Convert both to UTC before joining or trades land on the wrong bar.
- **Survivorship bias** — the 10-ticker list is today's mega-caps; backtesting over many years makes the strategy look better than it would have looked in real time. Mention this honestly in any results writeup.
- **Overfitting** — if you tune thresholds to maximize Sharpe on the same period you're reporting, the result is meaningless. Hold out a final validation period.
- **Transaction costs** — MVP can ignore them, but at intraday frequency a 5–10 bps round-trip cost will eat most of the strategy's edge. Add a fixed cost per trade once intraday signals are working.
