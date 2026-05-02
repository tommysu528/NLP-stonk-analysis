import { Link, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Ticker from "./pages/Ticker";
import Backtest from "./pages/Backtest";

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>NLP-stonk-analysis</h1>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/backtest">Backtest</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ticker/:symbol" element={<Ticker />} />
          <Route path="/backtest" element={<Backtest />} />
        </Routes>
      </main>
    </div>
  );
}
