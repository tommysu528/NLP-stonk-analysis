import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { fmtNum, formatTime } from "../utils";

function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  return Math.round((target - Date.now()) / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function urgencyClass(days: number): string {
  if (days < 0) return "text-neutral";
  if (days <= 3) return "text-neg";
  if (days <= 14) return "text-pos";
  return "text-neutral";
}

export default function Earnings() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["earnings"],
    queryFn: api.earnings,
  });

  const rows = useMemo(() => data?.tickers ?? [], [data]);

  const stats = useMemo(() => {
    const upcoming = rows.filter((r) => r.next_earnings_date && daysUntil(r.next_earnings_date) >= 0);
    const next7 = upcoming.filter((r) => r.next_earnings_date && daysUntil(r.next_earnings_date) <= 7);
    const nextOne = upcoming[0];
    return {
      total: rows.length,
      next7: next7.length,
      nextTicker: nextOne?.ticker ?? "—",
      nextDate: nextOne?.next_earnings_date ?? null,
      nextDays: nextOne?.next_earnings_date ? daysUntil(nextOne.next_earnings_date) : null,
    };
  }, [rows]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Earnings Calendar</h1>
          <p className="page-subtitle">Next earnings dates for tracked tickers · estimates from yfinance</p>
        </div>
        {dataUpdatedAt > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(dataUpdatedAt)}</span>
          </div>
        )}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Tickers Tracked</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-sub">with known next-report date</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">In Next 7 Days</div>
          <div className={`kpi-value ${stats.next7 > 0 ? "text-pos" : "text-neutral"}`}>{stats.next7}</div>
          <div className="kpi-sub">imminent reports</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Next Up</div>
          <div className="kpi-value">{stats.nextTicker}</div>
          <div className="kpi-sub">
            {stats.nextDays != null
              ? stats.nextDays === 0
                ? "today"
                : stats.nextDays === 1
                  ? "tomorrow"
                  : `in ${stats.nextDays} days`
              : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Strategy Note</div>
          <div className="kpi-value" style={{ fontSize: 14 }}>Earnings drift</div>
          <div className="kpi-sub">sentiment + price often spike post-report</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Upcoming Earnings</h3>
            <p className="card-subtitle">Sorted by closest report date</p>
          </div>
        </div>
        {isLoading ? (
          <div className="empty-state">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">No earnings calendar data yet. The cron will populate this on the next run.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Days</th>
                <th style={{ textAlign: "right" }}>EPS Avg Est.</th>
                <th style={{ textAlign: "right" }}>EPS Range</th>
                <th style={{ textAlign: "right" }}>Revenue Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = r.next_earnings_date ? daysUntil(r.next_earnings_date) : null;
                return (
                  <tr key={r.ticker}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <Link to={`/ticker/${r.ticker}`} style={{ color: "inherit" }}>{r.ticker}</Link>
                    </td>
                    <td>{r.next_earnings_date ? fmtDate(r.next_earnings_date) : "—"}</td>
                    <td className={`mono ${days != null ? urgencyClass(days) : "text-neutral"}`} style={{ textAlign: "right" }}>
                      {days != null ? (days === 0 ? "today" : days === 1 ? "tomorrow" : `${days}d`) : "—"}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {r.earnings_average_estimate != null ? `$${fmtNum(r.earnings_average_estimate, 2)}` : "—"}
                    </td>
                    <td className="mono text-neutral" style={{ textAlign: "right" }}>
                      {r.earnings_low_estimate != null && r.earnings_high_estimate != null
                        ? `$${fmtNum(r.earnings_low_estimate, 2)} – $${fmtNum(r.earnings_high_estimate, 2)}`
                        : "—"}
                    </td>
                    <td className="mono text-neutral" style={{ textAlign: "right" }}>
                      {r.revenue_average_estimate != null
                        ? `$${(r.revenue_average_estimate / 1e9).toFixed(2)}B`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Earnings drift = the tendency for stocks to continue moving in the direction of an earnings
        surprise for several days after the report. Worth watching how sentiment shifts in the 24-72h
        window post-report.
      </p>
    </>
  );
}
