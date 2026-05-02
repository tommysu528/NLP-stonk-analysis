"""Dictionary-based ticker extraction from article text.

MVP: case-insensitive substring search of company aliases and ticker symbols
against headline + summary. Returns the set of in-scope tickers found.
"""
from __future__ import annotations

import re

# Aliases per ticker. Keep entries unambiguous — avoid bare common words.
TICKER_ALIASES: dict[str, tuple[str, ...]] = {
    "AAPL": ("Apple", "AAPL"),
    "MSFT": ("Microsoft", "MSFT"),
    "NVDA": ("Nvidia", "NVIDIA", "NVDA"),
    "TSLA": ("Tesla", "TSLA"),
    "AMZN": ("Amazon", "AMZN"),
    "META": ("Meta Platforms", "Facebook", "META"),
    "GOOGL": ("Alphabet", "Google", "GOOGL", "GOOG"),
    "AMD": ("AMD", "Advanced Micro Devices"),
    "NFLX": ("Netflix", "NFLX"),
    "JPM": ("JPMorgan", "JP Morgan", "JPMorgan Chase", "JPM"),
}

# Compile once. Word boundaries to avoid matching "Applesauce" or "rampant".
_PATTERNS: dict[str, re.Pattern[str]] = {
    ticker: re.compile(r"\b(?:" + "|".join(re.escape(a) for a in aliases) + r")\b", re.IGNORECASE)
    for ticker, aliases in TICKER_ALIASES.items()
}


def extract_tickers(text: str) -> set[str]:
    """Return the set of in-scope tickers mentioned in the text."""
    if not text:
        return set()
    return {ticker for ticker, pattern in _PATTERNS.items() if pattern.search(text)}


def extract_from_article(headline: str, summary: str | None) -> set[str]:
    """Run extraction over headline and summary combined."""
    text = headline if not summary else f"{headline}. {summary}"
    return extract_tickers(text)
