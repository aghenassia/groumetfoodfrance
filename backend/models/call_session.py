import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Date, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class CallSession(Base):
    """Pre-qualification data captured during a call via the Call Companion widget."""
    __tablename__ = "call_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20))

    mood: Mapped[str | None] = mapped_column(String(20))
    outcome: Mapped[str | None] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text)
    next_step: Mapped[str | None] = mapped_column(Text)
    next_step_date: Mapped[date | None] = mapped_column(Date)

    matched_call_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("calls.id", ondelete="SET NULL"))

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    client = relationship("Client", back_populates="call_sessions")
    user = relationship("User")
    matched_call = relationship("Call")

    __table_args__ = (
        Index("idx_call_sessions_client", "client_id"),
        Index("idx_call_sessions_user", "user_id"),
        Index("idx_call_sessions_unmatched", "matched_call_id"),
    )
