"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-01

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "articles",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("headline", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("source", sa.String(128), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("url", "ticker", name="uq_articles_url_ticker"),
    )
    op.create_index("idx_articles_ticker_pub", "articles", ["ticker", sa.text("published_at DESC")])

    op.create_table(
        "sentiment_scores",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column(
            "article_id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            sa.ForeignKey("articles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("sentiment_label", sa.String(16), nullable=False),
        sa.Column("sentiment_score", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_sentiment_article", "sentiment_scores", ["article_id"])
    op.create_index(
        "idx_sentiment_ticker_created", "sentiment_scores", ["ticker", sa.text("created_at DESC")]
    )

    op.create_table(
        "prices",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Numeric(12, 4), nullable=False),
        sa.Column("high", sa.Numeric(12, 4), nullable=False),
        sa.Column("low", sa.Numeric(12, 4), nullable=False),
        sa.Column("close", sa.Numeric(12, 4), nullable=False),
        sa.Column("volume", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.UniqueConstraint("ticker", "timestamp", name="uq_prices_ticker_ts"),
    )
    op.create_index("idx_prices_ticker_ts", "prices", ["ticker", sa.text("timestamp DESC")])

    op.create_table(
        "signals",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("signal_type", sa.String(8), nullable=False),
        sa.Column("strength", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
    )
    op.create_index("idx_signals_ticker_ts", "signals", ["ticker", sa.text("timestamp DESC")])

    op.create_table(
        "backtest_results",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
        sa.Column("strategy_name", sa.String(64), nullable=False),
        sa.Column("ticker", sa.String(16), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("return_pct", sa.Float(), nullable=False),
        sa.Column("sharpe_ratio", sa.Float(), nullable=True),
        sa.Column("max_drawdown", sa.Float(), nullable=True),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column("trade_count", sa.Integer(), nullable=True),
        sa.Column("holding_window", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("backtest_results")
    op.drop_index("idx_signals_ticker_ts", table_name="signals")
    op.drop_table("signals")
    op.drop_index("idx_prices_ticker_ts", table_name="prices")
    op.drop_table("prices")
    op.drop_index("idx_sentiment_ticker_created", table_name="sentiment_scores")
    op.drop_index("idx_sentiment_article", table_name="sentiment_scores")
    op.drop_table("sentiment_scores")
    op.drop_index("idx_articles_ticker_pub", table_name="articles")
    op.drop_table("articles")
