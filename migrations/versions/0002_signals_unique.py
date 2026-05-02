"""signals unique constraint

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-02

Backfill emitted duplicate (ticker, timestamp, signal_type) rows
because there was nothing preventing it from re-running on the same
historical window. Dedupe existing rows, then add a unique constraint
so future inserts are idempotent.

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM signals
        WHERE id NOT IN (
            SELECT MIN(id) FROM signals
            GROUP BY ticker, timestamp, signal_type
        )
        """
    )
    op.create_unique_constraint(
        "uq_signals_ticker_ts_type",
        "signals",
        ["ticker", "timestamp", "signal_type"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_signals_ticker_ts_type", "signals", type_="unique")
