import uuid
from datetime import date
from sqlalchemy import String, Integer, Date, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class Gamification(Base):
    __tablename__ = "gamification"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_type: Mapped[str] = mapped_column(String(10), nullable=False, default="daily")

    xp_effort: Mapped[int] = mapped_column(Integer, default=0)
    calls_made: Mapped[int] = mapped_column(Integer, default=0)
    calls_qualified: Mapped[int] = mapped_column(Integer, default=0)
    playlist_completed: Mapped[int] = mapped_column(Integer, default=0)
    playlist_total: Mapped[int] = mapped_column(Integer, default=0)

    xp_cash: Mapped[int] = mapped_column(Integer, default=0)
    revenue_generated: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    orders_count: Mapped[int] = mapped_column(Integer, default=0)
    new_clients_count: Mapped[int] = mapped_column(Integer, default=0)

    total_xp: Mapped[int] = mapped_column(Integer, default=0)

    user = relationship("User", back_populates="gamification_entries")

    __table_args__ = (
        UniqueConstraint("user_id", "period_start", "period_type", name="uq_gamif_period"),
        Index("idx_gamif_leaderboard", "period_start", "period_type", "total_xp"),
    )
