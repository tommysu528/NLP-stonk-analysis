import type { Article, BacktestResult, Price, SentimentScore, Signal } from "./types";

const STATIC = import.meta.env.VITE_STATIC_MODE === "true";
const BASE = import.meta.env.BASE_URL || "/";
const DATA_BASE = `${BASE.replace(/\/$/, "")}/data`;

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(path);
  if (!resp.ok) {
    throw new Error(`${resp.status} ${resp.statusText} for ${path}`);
  }
  return resp.json();
}

const _cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!_cache.has(key)) _cache.set(key, fn());
  return _cache.get(key) as Promise<T>;
}

function applyTickerFilter<T extends { ticker: string }>(rows: T[], ticker?: string): T[] {
  if (!ticker) return rows;
  return rows.filter((r) => r.ticker === ticker);
}

function applySinceFilter<T>(rows: T[], field: keyof T, since?: string): T[] {
  if (!since) return rows;
  const cutoff = new Date(since).getTime();
  return rows.filter((r) => new Date(r[field] as unknown as string).getTime() >= cutoff);
}

function applyLimit<T>(rows: T[], limit?: number): T[] {
  return limit ? rows.slice(0, limit) : rows;
}

async function staticArticles(params: { ticker?: string; limit?: number }): Promise<Article[]> {
  const all = await cached("articles", () => get<Article[]>(`${DATA_BASE}/articles.json`));
  return applyLimit(applyTickerFilter(all, params.ticker), params.limit);
}

async function staticSentiment(params: { ticker?: string; since?: string; limit?: number }): Promise<SentimentScore[]> {
  if (params.ticker) {
    const rows = await cached(`sentiment-${params.ticker}`, () =>
      get<SentimentScore[]>(`${DATA_BASE}/sentiment/${params.ticker}.json`)
    );
    return applyLimit(applySinceFilter(rows, "created_at", params.since), params.limit);
  }
  return [];
}

async function staticPrices(params: { ticker: string; since?: string; limit?: number }): Promise<Price[]> {
  const rows = await cached(`prices-${params.ticker}`, () =>
    get<Price[]>(`${DATA_BASE}/prices/${params.ticker}.json`)
  );
  return applyLimit(applySinceFilter(rows, "timestamp", params.since), params.limit);
}

async function staticSignals(params: { ticker?: string; active?: boolean; limit?: number }): Promise<Signal[]> {
  const all = await cached("signals", () => get<Signal[]>(`${DATA_BASE}/signals.json`));
  let rows = applyTickerFilter(all, params.ticker);
  if (params.active) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    rows = rows.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }
  return applyLimit(rows, params.limit);
}

async function staticBacktests(): Promise<BacktestResult[]> {
  return cached("backtests", () => get<BacktestResult[]>(`${DATA_BASE}/backtests.json`));
}

export const api = STATIC
  ? {
      articles: staticArticles,
      sentiment: staticSentiment,
      prices: staticPrices,
      signals: staticSignals,
      backtests: staticBacktests,
    }
  : {
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
