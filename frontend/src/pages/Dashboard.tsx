import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { TICKERS } from "../types";
import type { Article, SentimentScore } from "../types";
import { ArrowDown, ArrowUp, Bolt, Minus, Newspaper } from "../icons";
import { avg, fmtPct, fmtScore, formatTime, sentimentBucket, timeAgo } from "../utils";

interface TickerStats {
  ticker: string;
  scores: SentimentScore[];
  avgScore: number;
  count: number;
  bucket: "bullish" | "neutral" | "bearish";
  priceChangePct: number | null;
}

function useTickerStats(): { stats: TickerStats[]; allSentiment: SentimentScore[]; lastSync: number } {
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

  const lastSync = Math.max(
    0,
    ...sentimentQueries.map((q) => q.dataUpdatedAt),
    ...priceQueries.map((q) => q.dataUpdatedAt)
  );

  const allSentiment = sentimentQueries.flatMap((q) => q.data ?? []);

  const stats: TickerStats[] = TICKERS.map((ticker, idx) => {
    const scores = sentimentQueries[idx].data ?? [];
    const prices = priceQueries[idx].data ?? [];
    const avgScore = avg(scores.map((s) => s.sentiment_score));
    const count = scores.length;

    let priceChangePct: number | null = null;
    if (prices.length >= 2) {
      const last = prices[prices.length - 1].close;
      // 24h ago: pick the bar closest to 24h before the latest, or the bar 24 entries back for hourly
      const lookback = Math.min(24, prices.length - 1);
      const prev = prices[prices.length - 1 - lookback].close;
      if (prev > 0) priceChangePct = (last - prev) / prev;
    }

    return {
      ticker,
      scores,
      avgScore,
      count,
      bucket: sentimentBucket(avgScore),
      priceChangePct,
    };
  });

  return { stats, allSentiment, lastSync };
}

function HeatmapTile({ s }: { s: TickerStats }) {
  const Arrow = s.priceChangePct == null ? Minus : s.priceChangePct > 0 ? ArrowUp : s.priceChangePct < 0 ? ArrowDown : Minus;
  const arrowClass = s.priceChangePct == null ? "" : s.priceChangePct > 0 ? "up" : s.priceChangePct < 0 ? "down" : "";
  const changeClass = s.priceChangePct == null ? "" : s.priceChangePct > 0 ? "pos" : "neg";
  return (
    <Link to={`/ticker/${s.ticker}`} className={`heatmap-tile ${s.bucket}`}>
      <div className="heatmap-tile-top">
        <span className="heatmap-tile-ticker">{s.ticker}</span>
        <span className={`heatmap-tile-arrow ${arrowClass}`}><Arrow size={14} /></span>
      </div>
      <div className={`heatmap-tile-score ${s.bucket}`}>
        {s.count > 0 ? fmtScore(s.avgScore) : "—"}
      </div>
      <div className="heatmap-tile-bottom">
        <span>{s.count} articles</span>
        <span className={`change ${changeClass}`}>
          {s.priceChangePct == null ? "—" : fmtPct(s.priceChangePct)}
        </span>
      </div>
    </Link>
  );
}

function ActiveSignalsCard() {
  const { data: signals = [] } = useQuery({
    queryKey: ["signals-active"],
    queryFn: () => api.signals({ active: true, limit: 10 }),
  });

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <span style={{ color: "var(--amber)", display: "flex" }}><Bolt size={14} /></span>
          Active Signals
          <span className="tag" style={{ marginLeft: 4 }}>24H</span>
        </h3>
        <span className="card-meta">{signals.length} active</span>
      </div>
      {signals.length === 0 ? (
        <div className="empty-state">No active signals in the last 24h.</div>
      ) : (
        signals.map((s) => {
          const Arrow = s.signal_type === "BUY" ? ArrowUp : ArrowDown;
          const cls = s.signal_type === "BUY" ? "buy" : "sell";
          const conf = Math.min(99, Math.round(Math.abs(s.strength) * 100 + 50));
          return (
            <Link key={s.id} to={`/ticker/${s.ticker}`} className="signal-row" style={{ color: "inherit" }}>
              <div className={`signal-icon ${cls}`}><Arrow size={16} /></div>
              <div className="signal-body">
                <div className="signal-line1">
                  <span className="signal-ticker">{s.ticker}</span>
                  <span className={`pill ${cls}`}>{s.signal_type}</span>
                  <span className="signal-ago">· {timeAgo(s.timestamp)}</span>
                </div>
                <div className="signal-reason">{s.reason}</div>
              </div>
              <div className="signal-conf">
                <div className="signal-conf-value">{conf}%</div>
                <div className="signal-conf-label">conf.</div>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

type NewsFilter = "all" | "bullish" | "bearish";

function LatestNewsCard({ allSentiment }: { allSentiment: SentimentScore[] }) {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const { data: articles = [] } = useQuery({
    queryKey: ["articles-latest"],
    queryFn: () => api.articles({ limit: 30 }),
  });

  const sentimentByArticle = useMemo(() => {
    const map = new Map<number, SentimentScore>();
    for (const s of allSentiment) {
      const existing = map.get(s.article_id);
      if (!existing || Math.abs(s.sentiment_score) > Math.abs(existing.sentiment_score)) {
        map.set(s.article_id, s);
      }
    }
    return map;
  }, [allSentiment]);

  // Articles are stored one row per (article, ticker) pair, so a piece of
  // news mentioning multiple tickers shows up multiple times. Dedupe by URL
  // (more reliable than headline) and aggregate every ticker that matched.
  const deduped = useMemo(() => {
    const groups = new Map<string, { article: Article; tickers: string[] }>();
    for (const a of articles) {
      const key = a.url;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.tickers.includes(a.ticker)) existing.tickers.push(a.ticker);
      } else {
        groups.set(key, { article: a, tickers: [a.ticker] });
      }
    }
    return [...groups.values()].sort(
      (a, b) =>
        new Date(b.article.published_at).getTime() - new Date(a.article.published_at).getTime()
    );
  }, [articles]);

  const enriched = useMemo(() => {
    return deduped
      .map(({ article, tickers }) => ({
        article,
        tickers,
        sentiment: sentimentByArticle.get(article.id),
      }))
      .filter(({ sentiment }) => {
        if (filter === "all") return true;
        if (!sentiment) return false;
        if (filter === "bullish") return sentiment.sentiment_score > 0.05;
        if (filter === "bearish") return sentiment.sentiment_score < -0.05;
        return true;
      });
  }, [deduped, sentimentByArticle, filter]);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <span style={{ color: "var(--text-muted)", display: "flex" }}><Newspaper size={14} /></span>
          Latest News
        </h3>
        <div className="filter-pills">
          {(["all", "bullish", "bearish"] as NewsFilter[]).map((f) => (
            <button
              key={f}
              className={`filter-pill ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {enriched.length === 0 ? (
        <div className="empty-state">No news matches the current filter.</div>
      ) : (
        enriched.slice(0, 12).map(({ article, tickers, sentiment }) => (
          <NewsRow key={article.url} article={article} tickers={tickers} sentiment={sentiment} />
        ))
      )}
    </div>
  );
}

function NewsRow({
  article,
  tickers,
  sentiment,
}: {
  article: Article;
  tickers: string[];
  sentiment?: SentimentScore;
}) {
  const bucket = sentiment ? sentimentBucket(sentiment.sentiment_score) : "neutral";
  const score = sentiment?.sentiment_score ?? 0;
  const fillHeight = Math.min(100, Math.abs(score) * 100 + 15);
  return (
    <div className="news-row">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flexShrink: 0, marginTop: 2 }}>
        {tickers.map((t) => (
          <Link key={t} to={`/ticker/${t}`} className="tag news-tag">{t}</Link>
        ))}
      </div>
      <div className="news-body">
        <a className="news-headline" href={article.url} target="_blank" rel="noreferrer">
          {article.headline}
        </a>
        <div className="news-meta">
          <span className="news-source">{article.source ?? "Unknown"}</span>
          <span>·</span>
          <span>{timeAgo(article.published_at)}</span>
        </div>
      </div>
      <div className="news-sentiment">
        <div className="sentiment-bar" title={`Sentiment ${fmtScore(score)}`}>
          <div className={`sentiment-bar-fill ${bucket}`} style={{ height: `${fillHeight}%` }} />
        </div>
        <span className={`news-score text-${bucket === "bullish" ? "pos" : bucket === "bearish" ? "neg" : "neutral"}`}>
          {sentiment ? fmtScore(score) : "—"}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { stats, allSentiment, lastSync } = useTickerStats();

  const allScores = stats.flatMap((s) => s.scores.map((x) => x.sentiment_score));
  const marketSentiment = avg(allScores);
  const marketBucket = sentimentBucket(marketSentiment);
  const articlesTracked = allSentiment.length > 0
    ? new Set(allSentiment.map((s) => s.article_id)).size
    : 0;
  const bullishCount = stats.filter((s) => s.bucket === "bullish").length;
  const bearishCount = stats.filter((s) => s.bucket === "bearish").length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sentiment Dashboard</h1>
          <p className="page-subtitle">Real-time NLP signals across your watchlist · updated continuously</p>
        </div>
        {lastSync > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(lastSync)}</span>
          </div>
        )}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Market Sentiment</div>
          <div className={`kpi-value text-${marketBucket === "bullish" ? "pos" : marketBucket === "bearish" ? "neg" : "neutral"}`}>
            {fmtScore(marketSentiment, 3)}
          </div>
          <div className="kpi-sub">
            {marketBucket === "bullish" ? "Net Bullish" : marketBucket === "bearish" ? "Net Bearish" : "Neutral"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Articles Tracked</div>
          <div className="kpi-value">{articlesTracked}</div>
          <div className="kpi-sub">across {TICKERS.length} tickers</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bullish Tickers</div>
          <div className="kpi-value text-pos">{bullishCount}/{TICKERS.length}</div>
          <div className="kpi-sub">score &gt; +0.05</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bearish Tickers</div>
          <div className="kpi-value text-neg">{bearishCount}/{TICKERS.length}</div>
          <div className="kpi-sub">score &lt; -0.05</div>
        </div>
      </div>

      <div className="card heatmap-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Sentiment Heatmap</h3>
            <p className="card-subtitle">Aggregate score · last 50 articles per ticker</p>
          </div>
          <div className="legend">
            <span className="legend-item"><span className="legend-dot bearish" /> Bearish</span>
            <span className="legend-item"><span className="legend-dot neutral" /> Neutral</span>
            <span className="legend-item"><span className="legend-dot bullish" /> Bullish</span>
          </div>
        </div>
        <div className="heatmap">
          {stats.map((s) => <HeatmapTile key={s.ticker} s={s} />)}
        </div>
      </div>

      <div className="two-col">
        <ActiveSignalsCard />
        <LatestNewsCard allSentiment={allSentiment} />
      </div>
    </>
  );
}
