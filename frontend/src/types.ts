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
