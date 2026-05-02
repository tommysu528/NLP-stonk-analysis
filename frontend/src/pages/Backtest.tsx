import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BacktestResult } from "../types";
import { fmtNum, fmtPct, formatTime } from "../utils";

const WINDOWS = ["15min", "1h", "4h", "1d", "3d"] as const;

interface Cell {
  ticker: string;
  window: string;
  sentiment?: BacktestResult;
  random?: BacktestResult;
  buyHold?: BacktestResult;
}

function group(results: BacktestResult[]): Cell[] {
  const map = new Map<string, Cell>();
  for (const r of results) {
    const window = r.holding_window ?? "full";
    const key = `${r.ticker}|${window}`;
    const cell = map.get(key) ?? { ticker: r.ticker, window };
    if (r.strategy_name === "sentiment") cell.sentiment = r;
    else if (r.strategy_name === "random") cell.random = r;
    else if (r.strategy_name === "buy_and_hold") cell.buyHold = r;
    map.set(key, cell);
  }
  return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker) || WINDOWS.indexOf(a.window as any) - WINDOWS.indexOf(b.window as any));
}

export default function Backtest() {
  const { data: results = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["backtests"],
    queryFn: api.backtests,
  });
  const [windowFilter, setWindowFilter] = useState<string>("all");

  const cells = useMemo(() => group(results), [results]);
  const filtered = useMemo(
    () => cells.filter((c) => windowFilter === "all" || c.window === windowFilter),
    [cells, windowFilter]
  );

  const sentimentCells = filtered.filter((c) => c.sentiment && c.sentiment.trade_count && c.sentiment.trade_count > 0);
  const totalTrades = sentimentCells.reduce((s, c) => s + (c.sentiment?.trade_count ?? 0), 0);
  const avgReturn = sentimentCells.length > 0
    ? sentimentCells.reduce((s, c) => s + (c.sentiment?.return_pct ?? 0), 0) / sentimentCells.length
    : 0;
  const winRateMean = sentimentCells.length > 0
    ? sentimentCells.reduce((s, c) => s + (c.sentiment?.win_rate ?? 0), 0) / sentimentCells.length
    : 0;
  const sentimentBeatsRandom = sentimentCells.filter(
    (c) => c.sentiment && c.random && c.sentiment.return_pct > c.random.return_pct
  ).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Backtest Results</h1>
          <p className="page-subtitle">Sentiment strategy vs. random-signal baseline · buy-and-hold reference</p>
        </div>
        {dataUpdatedAt > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(dataUpdatedAt)}</span>
          </div>
        )}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Avg Return</div>
          <div className={`kpi-value ${avgReturn > 0 ? "text-pos" : avgReturn < 0 ? "text-neg" : "text-neutral"}`}>{fmtPct(avgReturn)}</div>
          <div className="kpi-sub">across {sentimentCells.length} runs</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Trades</div>
          <div className="kpi-value">{totalTrades}</div>
          <div className="kpi-sub">simulated</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Win Rate</div>
          <div className="kpi-value">{fmtPct(winRateMean)}</div>
          <div className="kpi-sub">avg across runs</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Beats Random</div>
          <div className="kpi-value text-pos">{sentimentBeatsRandom}/{sentimentCells.length || 0}</div>
          <div className="kpi-sub">runs outperforming baseline</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Strategy Comparison</h3>
            <p className="card-subtitle">Returns by ticker × holding window</p>
          </div>
          <div className="filter-pills">
            {(["all", ...WINDOWS] as string[]).map((w) => (
              <button
                key={w}
                className={`filter-pill ${windowFilter === w ? "active" : ""}`}
                onClick={() => setWindowFilter(w)}
              >
                {w === "all" ? "All" : w}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No backtest results yet. Run <code>make backtest</code>.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Window</th>
                <th style={{ textAlign: "right" }}>Sentiment</th>
                <th style={{ textAlign: "right" }}>Random</th>
                <th style={{ textAlign: "right" }}>Sharpe</th>
                <th style={{ textAlign: "right" }}>Win rate</th>
                <th style={{ textAlign: "right" }}>Max DD</th>
                <th style={{ textAlign: "right" }}>Trades</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const s = c.sentiment;
                const r = c.random;
                const sentClass = !s
                  ? ""
                  : s.return_pct > 0 ? "text-pos"
                  : s.return_pct < 0 ? "text-neg" : "";
                return (
                  <tr key={`${c.ticker}|${c.window}`}>
                    <td className="mono" style={{ fontWeight: 600 }}>{c.ticker}</td>
                    <td><span className="tag">{c.window}</span></td>
                    <td className={`mono ${sentClass}`} style={{ textAlign: "right" }}>{fmtPct(s?.return_pct)}</td>
                    <td className="mono text-neutral" style={{ textAlign: "right" }}>{fmtPct(r?.return_pct)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtNum(s?.sharpe_ratio, 2)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{s?.win_rate != null ? fmtPct(s.win_rate) : "—"}</td>
                    <td className="mono text-neg" style={{ textAlign: "right" }}>{fmtPct(s?.max_drawdown)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{s?.trade_count ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Buy-and-hold Baseline</h3>
            <p className="card-subtitle">Total return over the price history available</p>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Period</th>
              <th style={{ textAlign: "right" }}>Return</th>
            </tr>
          </thead>
          <tbody>
            {results
              .filter((r) => r.strategy_name === "buy_and_hold")
              .sort((a, b) => a.ticker.localeCompare(b.ticker))
              .map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{r.ticker}</td>
                  <td className="text-neutral">
                    {new Date(r.start_date).toLocaleDateString()} → {new Date(r.end_date).toLocaleDateString()}
                  </td>
                  <td className={`mono ${r.return_pct > 0 ? "text-pos" : "text-neg"}`} style={{ textAlign: "right" }}>
                    {fmtPct(r.return_pct)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
