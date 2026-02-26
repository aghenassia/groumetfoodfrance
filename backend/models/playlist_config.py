import uuid
from sqlalchemy import String, Integer, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class PlaylistConfig(Base):
    __tablename__ = "playlist_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    total_size: Mapped[int] = mapped_column(Integer, default=15)

    pct_callback: Mapped[int] = mapped_column(Integer, default=10)
    pct_dormant: Mapped[int] = mapped_column(Integer, default=30)
    pct_churn_risk: Mapped[int] = mapped_column(Integer, default=25)
    pct_upsell: Mapped[int] = mapped_column(Integer, default=20)
    pct_prospect: Mapped[int] = mapped_column(Integer, default=15)

    dormant_min_days: Mapped[int] = mapped_column(Integer, default=90)
    churn_min_score: Mapped[int] = mapped_column(Integer, default=40)
    upsell_min_score: Mapped[int] = mapped_column(Integer, default=30)

    # "own" = uniquement les entreprises assignées au sales
    # "sage_rep" = entreprises du rep Sage indiqué dans sage_rep_filter
    # "all" = comportement actuel (assigned_user_id OU sales_rep)
    client_scope: Mapped[str | None] = mapped_column(String(20), default="own")
    sage_rep_filter: Mapped[str | None] = mapped_column(String(70), default=None)

    user = relationship("User", backref="playlist_config")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_playlist_config_user"),
    )
