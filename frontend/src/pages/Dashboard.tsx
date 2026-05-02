import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { TICKERS } from "../types";

function sentimentColor(score: number): string {
  if (score > 0.2) return "#1f7a1f";
  if (score > 0.05) return "#7fb87f";
  if (score < -0.2) return "#a51212";
  if (score < -0.05) return "#d97777";
  return "#888";
}

function HeatmapRow({ ticker }: { ticker: string }) {
  const { data: scores = [] } = useQuery({
    queryKey: ["sentiment", ticker],
    queryFn: () => api.sentiment({ ticker, limit: 50 }),
  });
  const avg =
    scores.length === 0
      ? 0
      : scores.reduce((s, x) => s + x.sentiment_score, 0) / scores.length;
  return (
    <Link to={`/ticker/${ticker}`} className="heatmap-cell" style={{ background: sentimentColor(avg) }}>
      <div className="ticker-symbol">{ticker}</div>
      <div className="ticker-score">{scores.length > 0 ? avg.toFixed(2) : "—"}</div>
      <div className="ticker-count">{scores.length} articles</div>
    </Link>
  );
}

export default function Dashboard() {
  const { data: latestArticles = [] } = useQuery({
    queryKey: ["articles-latest"],
    queryFn: () => api.articles({ limit: 20 }),
  });
  const { data: activeSignals = [] } = useQuery({
    queryKey: ["signals-active"],
    queryFn: () => api.signals({ active: true, limit: 50 }),
  });

  return (
    <div className="dashboard">
      <section>
        <h2>Sentiment heatmap (last 50 scores per ticker)</h2>
        <div className="heatmap">
          {TICKERS.map((t) => (
            <HeatmapRow key={t} ticker={t} />
          ))}
        </div>
      </section>

      <section>
        <h2>Active signals (last 24h)</h2>
        {activeSignals.length === 0 ? (
          <p className="muted">No active signals.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Type</th>
                <th>Strength</th>
                <th>When</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {activeSignals.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/ticker/${s.ticker}`}>{s.ticker}</Link>
                  </td>
                  <td className={`sig-${s.signal_type.toLowerCase()}`}>{s.signal_type}</td>
                  <td>{s.strength.toFixed(3)}</td>
                  <td>{new Date(s.timestamp).toLocaleString()}</td>
                  <td className="muted">{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Latest news</h2>
        <ul className="article-list">
          {latestArticles.map((a) => (
            <li key={a.id}>
              <Link to={`/ticker/${a.ticker}`} className="ticker-tag">
                {a.ticker}
              </Link>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.headline}
              </a>
              <span className="muted">
                {a.source} · {new Date(a.published_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
