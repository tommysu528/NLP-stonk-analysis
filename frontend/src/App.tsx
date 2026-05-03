import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Dashboard from "./pages/Dashboard";
import Ticker from "./pages/Ticker";
import Backtest from "./pages/Backtest";
import Watchlist from "./pages/Watchlist";
import DividendMaxxing from "./pages/DividendMaxxing";
import Earnings from "./pages/Earnings";
import Trading from "./pages/Trading";
import { Activity, Search } from "./icons";
import { TICKERS } from "./types";

function Header() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const lastFetched = Math.max(
    0,
    ...queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.state.dataUpdatedAt || 0)
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = query.trim().toUpperCase();
    if (TICKERS.includes(candidate)) {
      navigate(`/ticker/${candidate}`);
      setQuery("");
    }
  }

  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="app-brand-icon">
          <Activity size={18} />
        </span>
        <span className="app-brand-name">NLP</span>
        <span className="app-brand-sub">stonk-analysis</span>
      </div>
      <nav className="app-nav">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/backtest">Backtest</NavLink>
        <NavLink to="/watchlist">Watchlist</NavLink>
        <NavLink to="/dividend-maxxing">Dividend Maxxing</NavLink>
        <NavLink to="/earnings">Earnings</NavLink>
        <NavLink to="/trading">Trading</NavLink>
      </nav>
      <div className="app-header-spacer" />
      <form className="app-search" onSubmit={onSubmit}>
        <span className="app-search-icon"><Search size={14} /></span>
        <input
          placeholder="Search ticker…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <div className="app-live" title={lastFetched ? `Last data update: ${new Date(lastFetched).toLocaleTimeString()}` : ""}>
        <span className="app-live-dot" /> LIVE
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ticker/:symbol" element={<Ticker />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/dividend-maxxing" element={<DividendMaxxing />} />
          <Route path="/earnings" element={<Earnings />} />
          <Route path="/trading" element={<Trading />} />
        </Routes>
      </main>
    </div>
  );
}
