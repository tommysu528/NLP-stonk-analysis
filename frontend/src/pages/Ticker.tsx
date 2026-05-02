import { useParams } from "react-router-dom";
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

export default function Ticker() {
  const { symbol = "" } = useParams();
  const ticker = symbol.toUpperCase();

  const { data: prices = [] } = useQuery({
    queryKey: ["prices", ticker],
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

  const chartData = prices.map((p) => ({
    t: new Date(p.timestamp).getTime(),
    close: p.close,
  }));
  const sentimentSeries = sentiment.map((s) => ({
    t: new Date(s.created_at).getTime(),
    score: s.sentiment_score,
  }));

  return (
    <div className="ticker-page">
      <h2>{ticker}</h2>

      <section>
        <h3>Price (close)</h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString()}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => v.toFixed(2)}
              />
              <Line type="monotone" dataKey="close" stroke="#1f77b4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h3>Sentiment over time</h3>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <ComposedChart data={sentimentSeries}>
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
              <Scatter dataKey="score" fill="#9467bd" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h3>Signals</h3>
        {signals.length === 0 ? (
          <p className="muted">No signals yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Strength</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.timestamp).toLocaleString()}</td>
                  <td className={`sig-${s.signal_type.toLowerCase()}`}>{s.signal_type}</td>
                  <td>{s.strength.toFixed(3)}</td>
                  <td className="muted">{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Articles</h3>
        <ul className="article-list">
          {articles.map((a) => (
            <li key={a.id}>
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
