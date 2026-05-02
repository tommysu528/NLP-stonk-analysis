import type { Article, BacktestResult, Price, SentimentScore, Signal } from "./types";

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(path);
  if (!resp.ok) {
    throw new Error(`${resp.status} ${resp.statusText} for ${path}`);
  }
  return resp.json();
}

export const api = {
  articles: (params: { ticker?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.ticker) q.set("ticker", params.ticker);
    if (params.limit) q.set("limit", String(params.limit));
    return get<Article[]>(`/api/articles?${q}`);
  },
  sentiment: (params: { ticker?: string; since?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.ticker) q.set("ticker", params.ticker);
    if (params.since) q.set("since", params.since);
    if (params.limit) q.set("limit", String(params.limit));
    return get<SentimentScore[]>(`/api/sentiment?${q}`);
  },
  prices: (params: { ticker: string; since?: string; limit?: number }) => {
    const q = new URLSearchParams({ ticker: params.ticker });
    if (params.since) q.set("since", params.since);
    if (params.limit) q.set("limit", String(params.limit));
    return get<Price[]>(`/api/prices?${q}`);
  },
  signals: (params: { ticker?: string; active?: boolean; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.ticker) q.set("ticker", params.ticker);
    if (params.active) q.set("active", "true");
    if (params.limit) q.set("limit", String(params.limit));
    return get<Signal[]>(`/api/signals?${q}`);
  },
  backtests: () => get<BacktestResult[]>("/api/backtests"),
};
