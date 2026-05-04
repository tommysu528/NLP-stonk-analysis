export interface Article {
  id: number;
  ticker: string;
  headline: string;
  summary: string | null;
  source: string | null;
  url: string;
  published_at: string;
}

export interface SentimentScore {
  id: number;
  article_id: number;
  ticker: string;
  sentiment_label: string;
  sentiment_score: number;
  confidence: number;
  created_at: string;
}

export interface Price {
  ticker: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  id: number;
  ticker: string;
  timestamp: string;
  signal_type: "BUY" | "SELL" | "HOLD";
  strength: number;
  reason: string | null;
}

export interface BacktestResult {
  id: number;
  strategy_name: string;
  ticker: string;
  start_date: string;
  end_date: string;
  return_pct: number;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  trade_count: number | null;
  holding_window: string | null;
  created_at: string;
}

export const TICKERS = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN",
  "META", "GOOGL", "AMD", "NFLX", "LZ",
];

export interface DividendTicker {
  ticker: string;
  name: string;
  price: number | null;
  change_pct_1d: number | null;
  dividend_yield: number | null;
  dividend_rate: number | null;
  payout_ratio: number | null;
  ex_dividend_date: string | null;
  five_year_avg_yield: number | null;
  sector: string | null;
  industry: string | null;
}

export interface DividendsPayload {
  updated_at: string;
  tickers: DividendTicker[];
}

export interface EarningsRow {
  ticker: string;
  next_earnings_date: string | null;
  earnings_average_estimate: number | null;
  earnings_low_estimate: number | null;
  earnings_high_estimate: number | null;
  revenue_average_estimate: number | null;
  ex_dividend_date: string | null;
  dividend_date: string | null;
}

export interface EarningsPayload {
  updated_at: string;
  tickers: EarningsRow[];
}

export interface TradingAccount {
  equity: number;
  cash: number;
  buying_power: number;
  portfolio_value: number;
  long_market_value: number;
  last_equity: number;
  status: string;
}

export interface TradingPosition {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number | null;
  market_value: number;
  unrealized_pl: number;
  unrealized_plpc: number;
  side: string;
}

export interface TradingOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  side: "buy" | "sell" | string;
  qty: number | null;
  notional: number | null;
  filled_qty: number;
  filled_avg_price: number | null;
  status: string;
  submitted_at: string | null;
  filled_at: string | null;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
}

export interface TradingPayload {
  enabled: boolean;
  paper?: boolean;
  updated_at: string;
  account?: TradingAccount | null;
  positions?: TradingPosition[];
  recent_orders?: TradingOrder[];
  equity_curve?: EquityPoint[];
}

export interface GridFill {
  timestamp: string;
  side: "buy" | "sell";
  price: number;
  qty: number;
  level_idx: number;
  pnl_usd: number;
}

export interface GridBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GridConfigOut {
  pair: string;
  lower: number;
  upper: number;
  n_levels: number;
  capital_usd: number;
  fee_rate: number;
}

export interface GridPair {
  pair: string;
  config: GridConfigOut;
  levels: number[];
  fills: GridFill[];
  round_trips: number;
  total_pnl_usd: number;
  total_fees_usd: number;
  realized_return_pct: number;
  unrealized_pnl_usd: number;
  unrealized_holdings: number;
  avg_holding_price: number;
  final_price: number;
  max_drawdown_pct: number;
  open_buy_levels: number[];
  equity_curve: { timestamp: string; equity: number }[];
  bar_count: number;
  bars: GridBar[];
  error?: string;
}

export interface CryptoPayload {
  updated_at: string;
  pairs: GridPair[];
}
