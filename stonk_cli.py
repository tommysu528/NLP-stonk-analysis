"""Single CLI entry point for ingestion, NLP, signals, and backtests."""
from __future__ import annotations

import logging

import click


def _setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@click.group()
def cli() -> None:
    """nlp-stonk-analysis pipeline commands."""
    _setup_logging()


@cli.command("fetch-prices")
@click.option("--period", default="2y", help="yfinance period: 1mo, 6mo, 1y, 2y, max")
@click.option("--interval", default="1d", help="yfinance interval: 1d, 1h, ...")
def fetch_prices(period: str, interval: str) -> None:
    from ingestion.prices import ingest_all

    counts = ingest_all(period=period, interval=interval)
    click.echo(counts)


@cli.command("fetch-news")
@click.option("--page-size", default=20, type=int)
def fetch_news(page_size: int) -> None:
    from ingestion.news import ingest_all

    counts = ingest_all(page_size=page_size)
    click.echo(counts)


@cli.command("score")
@click.option("--limit", default=200, type=int, help="Max pending articles to score")
def score(limit: int) -> None:
    from nlp.pipeline import process_pending

    n = process_pending(limit=limit)
    click.echo(f"wrote {n} sentiment rows")


@cli.command("signals")
@click.option(
    "--backfill", is_flag=True, help="Replay historical sentiment to emit signals at each timestamp"
)
@click.option("--step-hours", default=1, type=int, help="Step size for backfill")
def signals(backfill: bool, step_hours: int) -> None:
    if backfill:
        from strategy.signals import backfill_all

        n = backfill_all(step_hours=step_hours)
        click.echo(f"backfilled {n} signals")
    else:
        from strategy.signals import evaluate_all

        n = evaluate_all()
        click.echo(f"emitted {n} signals")


@cli.command("backtest")
def backtest() -> None:
    from strategy.backtest import run

    summary = run()
    click.echo(summary)


@cli.command("export")
def export() -> None:
    """Export DB tables to JSON snapshots in frontend/public/data."""
    from scripts.export_snapshots import export as do_export

    do_export()


@cli.command("dividends")
def dividends() -> None:
    """Fetch dividend yield + price for the Dividend Maxxing watchlist."""
    from ingestion.dividends import run as do_run

    do_run()


@cli.command("earnings")
def earnings() -> None:
    """Fetch upcoming earnings calendar for tracked tickers."""
    from ingestion.earnings import run as do_run

    do_run()


@cli.command("trade")
def trade() -> None:
    """Execute recent signals against Alpaca paper trading (no-op if unconfigured)."""
    from trading.executor import run as do_run

    do_run()


@cli.command("pipeline")
@click.option("--score-limit", default=200, type=int)
def pipeline(score_limit: int) -> None:
    """Run news + score + signals end-to-end (skip prices and backtest)."""
    from ingestion.news import ingest_all as news_ingest
    from nlp.pipeline import process_pending
    from strategy.signals import evaluate_all

    click.echo(f"news: {news_ingest()}")
    click.echo(f"scored: {process_pending(limit=score_limit)}")
    n = evaluate_all()
    click.echo(f"signals: {n}")


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
