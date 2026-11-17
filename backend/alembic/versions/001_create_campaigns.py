"""create campaigns table

Revision ID: 001
Revises:
Create Date: 2026-11-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("keitaro_campaign_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("alias", sa.String(length=255), nullable=False),
        sa.Column("geo", sa.String(length=255), nullable=False),
        sa.Column("offer_stream_id", sa.Integer(), nullable=True),
        sa.Column("geo_stream_id", sa.Integer(), nullable=True),
        sa.Column("campaign_url", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_campaigns_keitaro_campaign_id", "campaigns", ["keitaro_campaign_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_campaigns_keitaro_campaign_id", table_name="campaigns")
    op.drop_table("campaigns")
