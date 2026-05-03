import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { fmtPct, formatTime, timeAgo } from "../utils";

function fmtMoney(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits });
}

export default function Trading() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["trading"],
    queryFn: api.trading,
  });

  const equityChart = useMemo(() => {
    if (!data?.equity_curve) return [];
    return data.equity_curve
      .filter((p) => p.equity != null)
      .map((p) => ({ t: p.timestamp * 1000, equity: p.equity }));
  }, [data]);

  if (isLoading) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Paper Trading</h1>
        </div>
        <div className="empty-state">Loading…</div>
      </>
    );
  }

  if (!data?.enabled) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Paper Trading</h1>
            <p className="page-subtitle">Connect Alpaca to execute signals automatically</p>
          </div>
        </div>
        <div className="card">
          <h3 className="card-title">Setup required</h3>
          <p style={{ marginTop: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Paper trading is disabled until you add Alpaca API credentials. Steps:
          </p>
          <ol style={{ color: "var(--text)", lineHeight: 1.7, paddingLeft: 20 }}>
            <li>
              Sign up at <a href="https://alpaca.markets" target="_blank" rel="noreferrer" style={{ color: "var(--green)" }}>alpaca.markets</a> (free, takes ~2 minutes)
            </li>
            <li>Generate paper-trading API keys from the dashboard</li>
            <li>
              Add them as repo secrets (Settings → Secrets and variables → Actions): <code>ALPACA_API_KEY</code> and <code>ALPACA_SECRET_KEY</code>
            </li>
            <li>The next cron run will start executing recent BUY/SELL signals as paper trades</li>
          </ol>
          <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 12 }}>
            Defaults: $500 per trade, max 8 simultaneous positions, market orders only.
            See <code>config/settings.py</code> to tune.
          </p>
        </div>
      </>
    );
  }

  const account = data.account;
  const positions = data.positions ?? [];
  const orders = data.recent_orders ?? [];
  const equityChange = account ? account.equity - account.last_equity : 0;
  const equityChangePct = account && account.last_equity > 0 ? equityChange / account.last_equity : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Paper Trading {data.paper === false && <span className="pill sell" style={{ marginLeft: 8 }}>LIVE</span>}</h1>
          <p className="page-subtitle">
            Auto-executing recent signals · {data.paper === false ? "real money" : "Alpaca paper account"} · ${fmtMoney(account?.equity ?? 0, 0).replace("$", "")} equity
          </p>
        </div>
        {dataUpdatedAt > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(dataUpdatedAt)}</span>
          </div>
        )}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Equity</div>
          <div className="kpi-value">{fmtMoney(account?.equity)}</div>
          <div className={`kpi-sub ${equityChange >= 0 ? "text-pos" : "text-neg"}`}>
            {equityChange >= 0 ? "+" : ""}{fmtMoney(equityChange)} ({fmtPct(equityChangePct)}) today
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Cash</div>
          <div className="kpi-value">{fmtMoney(account?.cash)}</div>
          <div className="kpi-sub">{fmtMoney(account?.buying_power)} buying power</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Positions</div>
          <div className="kpi-value">{positions.length}</div>
          <div className="kpi-sub">{fmtMoney(account?.long_market_value)} long</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Orders (50)</div>
          <div className="kpi-value">{orders.length}</div>
          <div className="kpi-sub">{orders.filter((o) => o.status === "filled").length} filled</div>
        </div>
      </div>

      {equityChart.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title">Equity Curve (1 month)</h3>
          </div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={equityChart} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                       tickFormatter={(t) => new Date(t).toLocaleDateString()} />
                <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                <Tooltip
                  labelFormatter={(t) => new Date(t as number).toLocaleString()}
                  formatter={(v: number) => fmtMoney(v)}
                />
                <Line type="monotone" dataKey="equity" stroke="var(--green)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Open Positions</h3>
            <span className="card-meta">{positions.length} · {fmtMoney(account?.long_market_value)}</span>
          </div>
          {positions.length === 0 ? (
            <div className="empty-state">No open positions.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Entry</th>
                  <th style={{ textAlign: "right" }}>Now</th>
                  <th style={{ textAlign: "right" }}>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const cls = p.unrealized_pl >= 0 ? "text-pos" : "text-neg";
                  return (
                    <tr key={p.symbol}>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        <Link to={`/ticker/${p.symbol}`} style={{ color: "inherit" }}>{p.symbol}</Link>
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>{p.qty.toFixed(2)}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{fmtMoney(p.avg_entry_price)}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{fmtMoney(p.current_price)}</td>
                      <td className={`mono ${cls}`} style={{ textAlign: "right" }}>
                        {p.unrealized_pl >= 0 ? "+" : ""}{fmtMoney(p.unrealized_pl)}<br/>
                        <span style={{ fontSize: 11 }}>{fmtPct(p.unrealized_plpc)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Orders</h3>
            <span className="card-meta">last 50</span>
          </div>
          {orders.length === 0 ? (
            <div className="empty-state">No orders yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th style={{ textAlign: "right" }}>Filled</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 25).map((o) => (
                  <tr key={o.id}>
                    <td className="text-neutral" style={{ fontSize: 12 }}>
                      {o.submitted_at ? timeAgo(o.submitted_at) : "—"}
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>{o.symbol}</td>
                    <td>
                      <span className={`pill ${o.side === "buy" ? "buy" : "sell"}`}>{o.side.toUpperCase()}</span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {o.filled_qty > 0 ? o.filled_qty.toFixed(2) : "—"}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {o.filled_avg_price ? fmtMoney(o.filled_avg_price) : "—"}
                    </td>
                    <td className="text-neutral" style={{ fontSize: 12 }}>{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Paper trading executes BUY signals at $500/trade with max 8 positions. SELL signals close
        existing positions. Idempotent via signal ID — same signal can't be submitted twice.
        Orders only submit during market hours (9:30am-4pm ET).
      </p>
    </>
  );
}
