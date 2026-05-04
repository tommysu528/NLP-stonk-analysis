import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { GridPair } from "../types";
import { fmtPct, formatTime, timeAgo } from "../utils";

function fmtMoney(v: number, digits = 2): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits });
}

function fmtCryptoPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(4);
}

export default function GridTrading() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["crypto"],
    queryFn: api.crypto,
  });
  const [selectedPair, setSelectedPair] = useState("BTC");

  const active = useMemo(
    () => data?.pairs.find((p) => p.pair === selectedPair) ?? data?.pairs[0],
    [data, selectedPair]
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Grid Trading <span className="pill muted" style={{ marginLeft: 8 }}>SIMULATION</span>
          </h1>
          <p className="page-subtitle">
            Geometric grid backtest on hourly BTC/ETH bars · not connected to a live exchange
          </p>
        </div>
        {dataUpdatedAt > 0 && (
          <div className="last-sync">
            LAST SYNC <span className="last-sync-time">{formatTime(dataUpdatedAt)}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : !data || data.pairs.length === 0 ? (
        <div className="empty-state">No crypto data yet.</div>
      ) : !active || active.error ? (
        <div className="empty-state">No backtest data for {selectedPair}.</div>
      ) : (
        <Body pair={active} selectedPair={selectedPair} setSelectedPair={setSelectedPair} pairs={data.pairs.map((p) => p.pair)} />
      )}

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Geometric grid: {active?.config.n_levels ?? 12} levels spaced by a fixed ratio between the
        30-day high/low (trimmed 10% each side), $1000 starting capital, 0.1% maker fee per side.
        Each filled buy places a sell at the next level up. <strong>This is a backtest only</strong> —
        wiring to a real exchange (Binance, Coinbase) requires a separate live-trading module
        (ccxt + WebSocket order management + state reconciliation) and is intentionally out of scope
        until the simulation parameters look right.
      </p>
    </>
  );
}

function Body({
  pair,
  selectedPair,
  setSelectedPair,
  pairs,
}: {
  pair: GridPair;
  selectedPair: string;
  setSelectedPair: (s: string) => void;
  pairs: string[];
}) {
  const totalReturnPct = pair.total_pnl_usd / pair.config.capital_usd;
  const realizedPct = pair.realized_return_pct;
  const numFills = pair.fills.length;
  const lastFills = pair.fills.slice(-12).reverse();

  const chartData = useMemo(
    () => pair.bars.map((b) => ({ t: new Date(b.timestamp).getTime(), price: b.close })),
    [pair.bars]
  );
  const equityChart = useMemo(
    () => pair.equity_curve.map((e) => ({ t: new Date(e.timestamp).getTime(), equity: e.equity })),
    [pair.equity_curve]
  );

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div className="filter-pills" style={{ display: "inline-flex" }}>
          {pairs.map((p) => (
            <button
              key={p}
              className={`filter-pill ${selectedPair === p ? "active" : ""}`}
              onClick={() => setSelectedPair(p)}
            >
              {p}/USD
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Total Return</div>
          <div className={`kpi-value ${totalReturnPct >= 0 ? "text-pos" : "text-neg"}`}>
            {fmtPct(totalReturnPct)}
          </div>
          <div className="kpi-sub">{fmtMoney(pair.total_pnl_usd)} on {fmtMoney(pair.config.capital_usd, 0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Round Trips</div>
          <div className="kpi-value">{pair.round_trips}</div>
          <div className="kpi-sub">{numFills} total fills · {pair.bar_count} bars</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Max Drawdown</div>
          <div className="kpi-value text-neg">{fmtPct(pair.max_drawdown_pct)}</div>
          <div className="kpi-sub">peak-to-trough on equity</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Fees Paid</div>
          <div className="kpi-value">{fmtMoney(pair.total_fees_usd)}</div>
          <div className="kpi-sub">at 0.10% per side</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Price + Grid Levels</h3>
            <p className="card-subtitle">
              Range ${fmtCryptoPrice(pair.config.lower)} – ${fmtCryptoPrice(pair.config.upper)} ·
              current ${fmtCryptoPrice(pair.final_price)} · {pair.unrealized_holdings.toFixed(4)} {pair.pair} held
            </p>
          </div>
        </div>
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString()}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => `$${fmtCryptoPrice(v)}`}
              />
              {pair.levels.map((lvl, i) => {
                const isOpen = pair.open_buy_levels.includes(i);
                const isTop = i === pair.levels.length - 1;
                return (
                  <ReferenceLine
                    key={i}
                    y={lvl}
                    stroke={isOpen ? "var(--green)" : isTop ? "var(--red)" : "rgba(255,255,255,0.15)"}
                    strokeDasharray={isOpen ? "0" : "2 4"}
                    strokeWidth={isOpen ? 1.5 : 1}
                  />
                );
              })}
              <Line type="monotone" dataKey="price" stroke="var(--amber)" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 11, marginTop: 8, color: "var(--text-muted)" }}>
          <span><span style={{ display: "inline-block", width: 16, borderTop: "1.5px solid var(--green)", verticalAlign: "middle", marginRight: 4 }} />open buy resting</span>
          <span><span style={{ display: "inline-block", width: 16, borderTop: "1px dashed rgba(255,255,255,0.4)", verticalAlign: "middle", marginRight: 4 }} />grid level</span>
          <span><span style={{ display: "inline-block", width: 16, borderTop: "1.5px solid var(--amber)", verticalAlign: "middle", marginRight: 4 }} />close price</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Equity Curve</h3>
          <span className="card-meta">$1000 starting capital</span>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <ComposedChart data={equityChart} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString()}
              />
              <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v: number) => fmtMoney(v)}
              />
              <ReferenceLine y={pair.config.capital_usd} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="equity" stroke="var(--green)" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Fills</h3>
            <span className="card-meta">last 12 of {numFills}</span>
          </div>
          {lastFills.length === 0 ? (
            <div className="empty-state">No fills.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Side</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {lastFills.map((f, idx) => (
                  <tr key={`${f.timestamp}-${f.side}-${idx}`}>
                    <td className="text-neutral" style={{ fontSize: 12 }}>{timeAgo(f.timestamp)}</td>
                    <td>
                      <span className={`pill ${f.side === "buy" ? "buy" : "sell"}`}>{f.side.toUpperCase()}</span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>${fmtCryptoPrice(f.price)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{f.qty.toFixed(6)}</td>
                    <td className={`mono ${f.pnl_usd > 0 ? "text-pos" : f.pnl_usd < 0 ? "text-neg" : "text-neutral"}`} style={{ textAlign: "right" }}>
                      {f.side === "sell" ? `${f.pnl_usd >= 0 ? "+" : ""}${fmtMoney(f.pnl_usd)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Grid Detail</h3>
            <span className="card-meta">{pair.levels.length} levels</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>#</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th>State</th>
                <th style={{ textAlign: "right" }}>Buys</th>
                <th style={{ textAlign: "right" }}>Sells</th>
              </tr>
            </thead>
            <tbody>
              {pair.levels.map((lvl, i) => {
                const buys = pair.fills.filter((f) => f.side === "buy" && f.level_idx === i).length;
                const sells = pair.fills.filter((f) => f.side === "sell" && f.level_idx === i).length;
                const isOpen = pair.open_buy_levels.includes(i);
                const isTop = i === pair.levels.length - 1;
                return (
                  <tr key={i}>
                    <td className="mono text-neutral" style={{ textAlign: "right" }}>{i}</td>
                    <td className="mono" style={{ textAlign: "right" }}>${fmtCryptoPrice(lvl)}</td>
                    <td>
                      {isTop ? (
                        <span className="pill muted">top</span>
                      ) : isOpen ? (
                        <span className="pill buy">resting buy</span>
                      ) : (
                        <span className="pill muted">idle</span>
                      )}
                    </td>
                    <td className="mono text-pos" style={{ textAlign: "right" }}>{buys || "—"}</td>
                    <td className="mono text-neg" style={{ textAlign: "right" }}>{sells || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
            Realized {fmtPct(realizedPct)} from completed round-trips · unrealized
            {" "}{fmtMoney(pair.unrealized_pnl_usd)} on {pair.unrealized_holdings.toFixed(4)} {pair.pair}
            {pair.unrealized_holdings > 0 && ` @ avg $${fmtCryptoPrice(pair.avg_holding_price)}`}.
          </p>
        </div>
      </div>
    </>
  );
}
