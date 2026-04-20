import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Integer, DateTime, Date, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class UserLoginEvent(Base):
    """1 ligne par connexion réussie. Utilisé pour mesurer la fréquence d'utilisation."""
    __tablename__ = "user_login_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    logged_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(500))

    __table_args__ = (
        Index("idx_user_login_events_user", "user_id"),
        Index("idx_user_login_events_at", "logged_in_at"),
    )


class UserDailyActivity(Base):
    """Agrégat journalier de l'activité d'un user (1 ligne par user par jour)."""
    __tablename__ = "user_daily_activity"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    minutes_active: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    session_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "day", name="uq_user_daily_activity"),
        Index("idx_user_daily_activity_user", "user_id"),
        Index("idx_user_daily_activity_day", "day"),
    )
