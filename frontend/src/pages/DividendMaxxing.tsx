import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { DividendTicker } from "../types";
import { ArrowDown, ArrowUp, Minus } from "../icons";
import { fmtNum, fmtPct, formatTime } from "../utils";

type SortKey = "dividend_yield" | "price" | "change_pct_1d" | "payout_ratio";

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

function compare(a: DividendTicker, b: DividendTicker, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return bv - av;
}

export default function DividendMaxxing() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["dividends"],
    queryFn: api.dividends,
  });
  const [sortKey, setSortKey] = useState<SortKey>("dividend_yield");

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.tickers].sort((a, b) => compare(a, b, sortKey));
  }, [data, sortKey]);

  const stats = useMemo(() => {
    if (!data || data.tickers.length === 0) return { avg: 0, max: 0, top: "—" };
    const yields = data.tickers.map((t) => t.dividend_yield ?? 0);
    const max = Math.max(...yields);
    const top = data.tickers.find((t) => (t.dividend_yield ?? 0) === max);
    return {
      avg: yields.reduce((s, v) => s + v, 0) / yields.length,
      max,
      top: top?.ticker ?? "—",
    };
  }, [data]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dividend Maxxing</h1>
          <p className="page-subtitle">High-yield income stocks · live yield, price, payout ratio from yfinance</p>
        </div>
        {dataUpdatedAt > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(dataUpdatedAt)}</span>
          </div>
        )}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Avg Yield</div>
          <div className="kpi-value text-pos">{fmtPct(stats.avg, 2)}</div>
          <div className="kpi-sub">across {data?.tickers.length ?? 0} tickers</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Top Yielder</div>
          <div className="kpi-value">{stats.top}</div>
          <div className="kpi-sub">{fmtPct(stats.max, 2)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Income on $10k</div>
          <div className="kpi-value text-pos">${fmtNum(stats.avg * 10000, 0)}</div>
          <div className="kpi-sub">avg annual at avg yield</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Strategy</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>Max Yield</div>
          <div className="kpi-sub">8%+ targets, dividend-cut risk applies</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Holdings</h3>
            <p className="card-subtitle">Click a column header to sort</p>
          </div>
          <div className="filter-pills">
            {([
              { key: "dividend_yield", label: "Yield" },
              { key: "price", label: "Price" },
              { key: "change_pct_1d", label: "Change" },
              { key: "payout_ratio", label: "Payout" },
            ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                className={`filter-pill ${sortKey === key ? "active" : ""}`}
                onClick={() => setSortKey(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No dividend data yet. Run the cron once.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name</th>
                <th>Sector</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>1d</th>
                <th style={{ textAlign: "right" }}>Yield</th>
                <th style={{ textAlign: "right" }}>5y avg</th>
                <th style={{ textAlign: "right" }}>$/share</th>
                <th style={{ textAlign: "right" }}>Payout</th>
                <th>Ex-div</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ChangeIcon =
                  r.change_pct_1d == null ? Minus : r.change_pct_1d > 0 ? ArrowUp : r.change_pct_1d < 0 ? ArrowDown : Minus;
                const changeClass =
                  r.change_pct_1d == null ? "text-neutral" : r.change_pct_1d > 0 ? "text-pos" : "text-neg";
                const fiveYrPct = r.five_year_avg_yield != null ? r.five_year_avg_yield / 100 : null;
                return (
                  <tr key={r.ticker}>
                    <td className="mono" style={{ fontWeight: 600 }}>{r.ticker}</td>
                    <td style={{ maxWidth: 220 }}>{r.name}</td>
                    <td className="text-neutral" style={{ fontSize: 12 }}>{r.sector ?? "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={`mono ${changeClass}`} style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <ChangeIcon size={11} />
                        {r.change_pct_1d != null ? fmtPct(r.change_pct_1d, 2) : "—"}
                      </span>
                    </td>
                    <td className="mono text-pos" style={{ textAlign: "right", fontWeight: 600 }}>
                      {r.dividend_yield != null ? fmtPct(r.dividend_yield, 2) : "—"}
                    </td>
                    <td className="mono text-neutral" style={{ textAlign: "right" }}>
                      {fiveYrPct != null ? fmtPct(fiveYrPct, 2) : "—"}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {r.dividend_rate != null ? `$${r.dividend_rate.toFixed(2)}` : "—"}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {r.payout_ratio != null ? fmtPct(r.payout_ratio, 0) : "—"}
                    </td>
                    <td className="text-neutral">{fmtDate(r.ex_dividend_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Yield = trailing 12-month dividends / current price. Payout ratio &gt; 100% means the company is
        paying more than it earns — flag for cut risk. Ex-div date is the cutoff to qualify for the
        next dividend payment. Data updated by the same cron that refreshes sentiment.
      </p>
    </>
  );
}
