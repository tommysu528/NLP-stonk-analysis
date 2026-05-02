import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BacktestResult } from "../types";

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(2) + "%";
}

function fmt(v: number | null | undefined, digits = 3): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

interface GroupKey {
  ticker: string;
  window: string;
}

function groupResults(results: BacktestResult[]): Map<string, Record<string, BacktestResult>> {
  // key = `${ticker}|${window}` -> { strategy_name -> result }
  const grouped = new Map<string, Record<string, BacktestResult>>();
  for (const r of results) {
    const window = r.holding_window || "full";
    const key = `${r.ticker}|${window}`;
    const bucket = grouped.get(key) || {};
    bucket[r.strategy_name] = r;
    grouped.set(key, bucket);
  }
  return grouped;
}

function parseKey(key: string): GroupKey {
  const [ticker, window] = key.split("|");
  return { ticker, window };
}

export default function Backtest() {
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["backtests"],
    queryFn: api.backtests,
  });

  if (isLoading) return <p>Loading...</p>;
  if (results.length === 0) {
    return (
      <div>
        <h2>Backtest results</h2>
        <p className="muted">
          No backtest results yet. Run <code>stonk backtest</code> after you have signals.
        </p>
      </div>
    );
  }

  const grouped = groupResults(results);
  const rows = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <h2>Backtest results</h2>
      <p className="muted">
        Sentiment strategy vs. random-signal baseline at each holding window. Buy-and-hold over the full
        period for reference.
      </p>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Window</th>
            <th>Sentiment return</th>
            <th>Random return</th>
            <th>Sentiment Sharpe</th>
            <th>Win rate</th>
            <th>Max DD</th>
            <th>Trades</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, bucket]) => {
            const { ticker, window } = parseKey(key);
            const sent = bucket["sentiment"];
            const rand = bucket["random"];
            return (
              <tr key={key}>
                <td>{ticker}</td>
                <td>{window}</td>
                <td className={sent && sent.return_pct > 0 ? "pos" : "neg"}>
                  {fmtPct(sent?.return_pct)}
                </td>
                <td>{fmtPct(rand?.return_pct)}</td>
                <td>{fmt(sent?.sharpe_ratio, 2)}</td>
                <td>{fmtPct(sent?.win_rate)}</td>
                <td>{fmtPct(sent?.max_drawdown)}</td>
                <td>{sent?.trade_count ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Buy-and-hold baseline</h3>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Period</th>
            <th>Return</th>
          </tr>
        </thead>
        <tbody>
          {results
            .filter((r) => r.strategy_name === "buy_and_hold")
            .map((r) => (
              <tr key={r.id}>
                <td>{r.ticker}</td>
                <td>
                  {new Date(r.start_date).toLocaleDateString()} →{" "}
                  {new Date(r.end_date).toLocaleDateString()}
                </td>
                <td className={r.return_pct > 0 ? "pos" : "neg"}>{fmtPct(r.return_pct)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
