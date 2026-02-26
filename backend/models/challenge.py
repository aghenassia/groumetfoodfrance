import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Integer, Date, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    article_ref: Mapped[str | None] = mapped_column(String(18))
    article_name: Mapped[str | None] = mapped_column(String(100))
    metric: Mapped[str] = mapped_column(String(30), nullable=False)  # quantity_kg, quantity_units, ca, margin_gross
    target_value: Mapped[float | None] = mapped_column(Numeric(15, 2))
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reward: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="draft")  # draft, active, completed
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    creator = relationship("User", foreign_keys=[created_by])
    rankings = relationship("ChallengeRanking", back_populates="challenge", cascade="all, delete-orphan")


class ChallengeRanking(Base):
    __tablename__ = "challenge_rankings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    challenge_id: Mapped[str] = mapped_column(String(36), ForeignKey("challenges.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    current_value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    challenge = relationship("Challenge", back_populates="rankings")
    user = relationship("User", foreign_keys=[user_id])
