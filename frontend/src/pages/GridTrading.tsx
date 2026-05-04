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
import type { GridPair, WalkForwardResult } from "../types";
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

function WalkForwardCard({
  wf,
  wfProtected,
  pair,
}: {
  wf: WalkForwardResult;
  wfProtected: WalkForwardResult | null;
  pair: string;
}) {
  const [variant, setVariant] = useState<"raw" | "protected">(wfProtected ? "protected" : "raw");
  const active = variant === "protected" && wfProtected ? wfProtected : wf;
  const losing = active.total_return_pct < 0;
  const equityChart = active.equity_curve.map((e) => ({
    t: new Date(e.timestamp).getTime(),
    equity: e.equity,
  }));
  const segReturns = active.segments.map((s, i) => ({
    idx: i,
    period: new Date(s.period_start).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    return: s.return_pct * 100,
    inRange: s.bars_in_range_pct * 100,
  }));

  return (
    <div className="card" style={{ marginTop: 24, borderColor: losing ? "var(--red)" : "var(--border)" }}>
      <div className="card-header">
        <div>
          <h3 className="card-title">
            2-Year Walk-Forward Backtest
            {losing && <span className="pill sell" style={{ marginLeft: 8 }}>STRATEGY UNPROFITABLE</span>}
          </h3>
          <p className="card-subtitle">
            Re-derives the grid every {active.segment_days} days from the prior {active.lookback_days}-day high/low.
            {variant === "protected"
              ? " With trend filter (skip ±20% lookback moves), range-breach stop (5%), and drawdown halt (15%)."
              : " No risk controls — naive baseline."}
          </p>
        </div>
        {wfProtected && (
          <div className="filter-pills">
            <button
              className={`filter-pill ${variant === "raw" ? "active" : ""}`}
              onClick={() => setVariant("raw")}
            >
              Raw
            </button>
            <button
              className={`filter-pill ${variant === "protected" ? "active" : ""}`}
              onClick={() => setVariant("protected")}
            >
              With risk controls
            </button>
          </div>
        )}
      </div>

      {wfProtected && (
        <div style={{
          background: "var(--bg-elevated)", padding: 12, borderRadius: 6,
          border: "1px solid var(--border)", marginBottom: 16, fontSize: 12,
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
        }}>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raw return</div>
            <div className={`mono ${wf.total_return_pct >= 0 ? "text-pos" : "text-neg"}`} style={{ fontSize: 16, fontWeight: 600 }}>
              {(wf.total_return_pct * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Protected return</div>
            <div className={`mono ${wfProtected.total_return_pct >= 0 ? "text-pos" : "text-neg"}`} style={{ fontSize: 16, fontWeight: 600 }}>
              {(wfProtected.total_return_pct * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Raw max DD</div>
            <div className="mono text-neg" style={{ fontSize: 16, fontWeight: 600 }}>
              {(wf.max_drawdown_pct * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Protected max DD</div>
            <div className="mono text-neg" style={{ fontSize: 16, fontWeight: 600 }}>
              {(wfProtected.max_drawdown_pct * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Total Return</div>
          <div className={`kpi-value ${losing ? "text-neg" : "text-pos"}`}>
            {(active.total_return_pct * 100).toFixed(1)}%
          </div>
          <div className="kpi-sub">${active.starting_capital.toFixed(0)} &rarr; ${active.ending_equity.toFixed(0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Annualized</div>
          <div className={`kpi-value ${active.annualized_return_pct < 0 ? "text-neg" : "text-pos"}`}>
            {(active.annualized_return_pct * 100).toFixed(1)}%
          </div>
          <div className="kpi-sub">over ~{active.total_segments} months</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Max Drawdown</div>
          <div className="kpi-value text-neg">{(active.max_drawdown_pct * 100).toFixed(1)}%</div>
          <div className="kpi-sub">peak-to-trough loss</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bars In Range</div>
          <div className={`kpi-value ${active.bars_in_range_pct < 0.7 ? "text-neg" : ""}`}>
            {(active.bars_in_range_pct * 100).toFixed(0)}%
          </div>
          <div className="kpi-sub">price stays within grid bounds</div>
        </div>
      </div>

      <div style={{ width: "100%", height: 280, marginBottom: 16 }}>
        <ResponsiveContainer>
          <ComposedChart data={equityChart} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                   tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" })} />
            <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `$${v.toFixed(0)}`} />
            <Tooltip labelFormatter={(t) => new Date(t as number).toLocaleDateString()}
                     formatter={(v: number) => `$${v.toFixed(2)}`} />
            <ReferenceLine y={active.starting_capital} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="equity" stroke={losing ? "var(--red)" : "var(--green)"}
                  strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="two-col">
        <div>
          <h4 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Per-segment summary
          </h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th style={{ textAlign: "right" }}>Return</th>
                <th style={{ textAlign: "right" }}>In range</th>
                <th style={{ textAlign: "right" }}>Trips</th>
                <th style={{ textAlign: "right" }}>End equity</th>
              </tr>
            </thead>
            <tbody>
              {active.segments.map((s, i) => (
                <tr key={i}>
                  <td className="text-neutral" style={{ fontSize: 12 }}>{segReturns[i].period}</td>
                  <td className={`mono ${s.return_pct >= 0 ? "text-pos" : "text-neg"}`} style={{ textAlign: "right" }}>
                    {(s.return_pct * 100).toFixed(1)}%
                  </td>
                  <td className={`mono ${s.bars_in_range_pct < 0.5 ? "text-neg" : ""}`} style={{ textAlign: "right" }}>
                    {(s.bars_in_range_pct * 100).toFixed(0)}%
                  </td>
                  <td className="mono text-neutral" style={{ textAlign: "right" }}>{s.round_trips}</td>
                  <td className="mono" style={{ textAlign: "right" }}>${s.ending_equity.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h4 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            What this tells you
          </h4>
          <div style={{ background: losing ? "rgba(239,68,68,0.08)" : "var(--bg-elevated)", padding: 16, borderRadius: 8, border: `1px solid ${losing ? "rgba(239,68,68,0.3)" : "var(--border)"}` }}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {losing ? (
                <>
                  <p style={{ marginTop: 0 }}>
                    <strong>{pair} grid lost {Math.abs(active.total_return_pct * 100).toFixed(1)}%</strong> over the
                    last 2 years despite winning {active.profitable_segments} of {active.total_segments} months.
                  </p>
                  <p>
                    The losing months wiped out the gains, with a worst-segment loss of
                    <strong className="text-neg"> {(active.worst_segment_return_pct * 100).toFixed(1)}%</strong>.
                    This is the classic grid failure mode: <strong>directional breakouts.</strong> When
                    price walks out of the grid range and stays out, the bot keeps buying all the way
                    down with no sell-side fills.
                  </p>
                  <p>
                    Bars-in-range was only <strong>{(active.bars_in_range_pct * 100).toFixed(0)}%</strong> &mdash;
                    price was outside the grid {(100 - active.bars_in_range_pct * 100).toFixed(0)}% of the time.
                    A range-bound strategy needs price to stay range-bound.
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>Do not run this live without major changes.</strong> Minimum: a hard stop-loss
                    on portfolio drawdown (e.g., halt at -15%), a trend filter (don't trade when price is
                    in a strong directional move), and tighter range re-tuning. Even then, grids lose to
                    persistent trends &mdash; that's structural.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ marginTop: 0 }}>
                    {pair} grid earned <strong className="text-pos">{(active.total_return_pct * 100).toFixed(1)}%</strong> over
                    the last 2 years, profitable in {active.profitable_segments} of {active.total_segments} months.
                    Annualized: <strong>{(active.annualized_return_pct * 100).toFixed(1)}%</strong>.
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    Worst single segment: {(active.worst_segment_return_pct * 100).toFixed(1)}%. Max drawdown:
                    {(active.max_drawdown_pct * 100).toFixed(1)}%. Strategy survived multiple regimes &mdash;
                    a meaningful step toward live trading, though paper trading on a real exchange
                    testnet is still the next step before any real funds.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
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

      {(pair as any).walk_forward && (
        <WalkForwardCard
          wf={(pair as any).walk_forward}
          wfProtected={(pair as any).walk_forward_protected}
          pair={pair.pair}
        />
      )}
    </>
  );
}
