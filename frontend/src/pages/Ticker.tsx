import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { ArrowDown, ArrowUp } from "../icons";
import { avg, fmtPct, fmtScore, sentimentBucket, timeAgo } from "../utils";

export default function Ticker() {
  const { symbol = "" } = useParams();
  const ticker = symbol.toUpperCase();

  const { data: prices = [] } = useQuery({
    queryKey: ["prices-page", ticker],
    queryFn: () => api.prices({ ticker, limit: 500 }),
    enabled: !!ticker,
  });
  const { data: sentiment = [] } = useQuery({
    queryKey: ["sentiment-page", ticker],
    queryFn: () => api.sentiment({ ticker, limit: 500 }),
    enabled: !!ticker,
  });
  const { data: articles = [] } = useQuery({
    queryKey: ["articles-page", ticker],
    queryFn: () => api.articles({ ticker, limit: 30 }),
    enabled: !!ticker,
  });
  const { data: signals = [] } = useQuery({
    queryKey: ["signals-page", ticker],
    queryFn: () => api.signals({ ticker, limit: 50 }),
    enabled: !!ticker,
  });

  const stats = useMemo(() => {
    const scores = sentiment.map((s) => s.sentiment_score);
    const avgScore = avg(scores);
    const last = prices[prices.length - 1]?.close ?? null;
    const lookback = Math.min(24, Math.max(0, prices.length - 1));
    const prev = lookback > 0 ? prices[prices.length - 1 - lookback].close : null;
    const change = last != null && prev != null && prev > 0 ? (last - prev) / prev : null;
    return { avgScore, scoreCount: sentiment.length, last, change };
  }, [sentiment, prices]);

  const chartData = useMemo(
    () => prices.map((p) => ({ t: new Date(p.timestamp).getTime(), close: p.close })),
    [prices]
  );
  const sentimentSeries = useMemo(
    () =>
      sentiment.map((s) => ({
        t: new Date(s.created_at).getTime(),
        score: s.sentiment_score,
      })),
    [sentiment]
  );

  const bucket = sentimentBucket(stats.avgScore);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="ticker-hero">
            <span className="ticker-symbol-large">{ticker}</span>
            {stats.last != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--text-muted)" }}>
                ${stats.last.toFixed(2)}
              </span>
            )}
            {stats.change != null && (
              <span className={`pill ${stats.change > 0 ? "buy" : "sell"}`} style={{ fontSize: 11 }}>
                {fmtPct(stats.change)}
              </span>
            )}
          </div>
          <p className="page-subtitle">Aggregate sentiment {fmtScore(stats.avgScore)} across {stats.scoreCount} scores</p>
        </div>
        <Link to="/" className="last-sync" style={{ textDecoration: "none" }}>← Dashboard</Link>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="kpi">
          <div className="kpi-label">Sentiment</div>
          <div className={`kpi-value text-${bucket === "bullish" ? "pos" : bucket === "bearish" ? "neg" : "neutral"}`}>
            {fmtScore(stats.avgScore)}
          </div>
          <div className="kpi-sub">{bucket}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Articles</div>
          <div className="kpi-value">{articles.length}</div>
          <div className="kpi-sub">tracked</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Signals</div>
          <div className="kpi-value">{signals.length}</div>
          <div className="kpi-sub">historical</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">24h Price</div>
          <div className={`kpi-value ${stats.change != null && stats.change > 0 ? "text-pos" : "text-neg"}`}>
            {stats.change != null ? fmtPct(stats.change) : "—"}
          </div>
          <div className="kpi-sub">{stats.last != null ? `$${stats.last.toFixed(2)}` : "—"}</div>
        </div>
      </div>

      <div className="card ticker-section">
        <div className="card-header">
          <h3 className="card-title">Price (close)</h3>
          <span className="card-meta">{prices.length} bars</span>
        </div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString()}
              />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => v.toFixed(2)}
              />
              <Line type="monotone" dataKey="close" stroke="var(--green)" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card ticker-section">
        <div className="card-header">
          <h3 className="card-title">Sentiment over time</h3>
          <span className="card-meta">{sentiment.length} scores</span>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <ComposedChart data={sentimentSeries} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString()}
              />
              <YAxis domain={[-1, 1]} />
              <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => v.toFixed(3)}
              />
              <Scatter dataKey="score" fill="var(--amber)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Signals</h3>
            <span className="card-meta">{signals.length} total</span>
          </div>
          {signals.length === 0 ? (
            <div className="empty-state">No signals for this ticker.</div>
          ) : (
            signals.slice(0, 12).map((s) => {
              const Arrow = s.signal_type === "BUY" ? ArrowUp : ArrowDown;
              const cls = s.signal_type === "BUY" ? "buy" : "sell";
              return (
                <div key={s.id} className="signal-row">
                  <div className={`signal-icon ${cls}`}><Arrow size={16} /></div>
                  <div className="signal-body">
                    <div className="signal-line1">
                      <span className="signal-ticker">{s.signal_type}</span>
                      <span className="signal-ago">· {timeAgo(s.timestamp)}</span>
                    </div>
                    <div className="signal-reason">{s.reason}</div>
                  </div>
                  <div className="signal-conf">
                    <div className="signal-conf-value">{fmtScore(s.strength)}</div>
                    <div className="signal-conf-label">strength</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Articles</h3>
            <span className="card-meta">{articles.length} latest</span>
          </div>
          {articles.length === 0 ? (
            <div className="empty-state">No articles for this ticker.</div>
          ) : (
            articles.slice(0, 12).map((a) => (
              <div key={a.id} className="news-row">
                <div className="news-body">
                  <a className="news-headline" href={a.url} target="_blank" rel="noreferrer">
                    {a.headline}
                  </a>
                  <div className="news-meta">
                    <span className="news-source">{a.source ?? "Unknown"}</span>
                    <span>·</span>
                    <span>{timeAgo(a.published_at)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
