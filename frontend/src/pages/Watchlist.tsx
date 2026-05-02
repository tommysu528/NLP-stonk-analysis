import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { api } from "../api";
import { TICKERS } from "../types";
import { ArrowDown, ArrowUp, Minus } from "../icons";
import { avg, fmtPct, fmtScore, formatTime, sentimentBucket } from "../utils";

export default function Watchlist() {
  const sentimentQueries = useQueries({
    queries: TICKERS.map((ticker) => ({
      queryKey: ["sentiment", ticker],
      queryFn: () => api.sentiment({ ticker, limit: 50 }),
    })),
  });
  const priceQueries = useQueries({
    queries: TICKERS.map((ticker) => ({
      queryKey: ["prices-recent", ticker],
      queryFn: () => api.prices({ ticker, limit: 200 }),
    })),
  });

  const lastSync = Math.max(0, ...sentimentQueries.map((q) => q.dataUpdatedAt), ...priceQueries.map((q) => q.dataUpdatedAt));

  const rows = TICKERS.map((ticker, idx) => {
    const scores = sentimentQueries[idx].data ?? [];
    const prices = priceQueries[idx].data ?? [];
    const avgScore = avg(scores.map((s) => s.sentiment_score));
    const last = prices[prices.length - 1]?.close ?? null;
    const lookback = Math.min(24, Math.max(0, prices.length - 1));
    const prev = lookback > 0 ? prices[prices.length - 1 - lookback].close : null;
    const change = last != null && prev != null && prev > 0 ? (last - prev) / prev : null;
    return { ticker, count: scores.length, avgScore, bucket: sentimentBucket(avgScore), last, change };
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Watchlist</h1>
          <p className="page-subtitle">Tracked tickers with current sentiment and 24h price change</p>
        </div>
        {lastSync > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(lastSync)}</span>
          </div>
        )}
      </div>

      <div className="watchlist-grid">
        {rows.map((r) => {
          const Arrow = r.change == null ? Minus : r.change > 0 ? ArrowUp : r.change < 0 ? ArrowDown : Minus;
          const arrowClass = r.change == null ? "text-neutral" : r.change > 0 ? "text-pos" : r.change < 0 ? "text-neg" : "text-neutral";
          const scoreClass = r.bucket === "bullish" ? "text-pos" : r.bucket === "bearish" ? "text-neg" : "text-neutral";
          return (
            <Link key={r.ticker} to={`/ticker/${r.ticker}`} className="watchlist-row">
              <div className="watchlist-left">
                <span className="watchlist-ticker">{r.ticker}</span>
                <span className={`pill ${r.bucket === "bullish" ? "buy" : r.bucket === "bearish" ? "sell" : "muted"}`}>
                  {r.bucket}
                </span>
                <span className="watchlist-meta">
                  {r.last != null ? `$${r.last.toFixed(2)}` : "—"}
                </span>
                <span className={`watchlist-meta ${arrowClass}`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Arrow size={12} /> {r.change != null ? fmtPct(r.change) : "—"}
                </span>
              </div>
              <div className="watchlist-right">
                <div className={`watchlist-score ${scoreClass}`}>{r.count > 0 ? fmtScore(r.avgScore) : "—"}</div>
                <div className="watchlist-articles">{r.count} articles</div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
