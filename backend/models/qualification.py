import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Integer, Date, DateTime, Text, ForeignKey, ARRAY, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class CallQualification(Base):
    __tablename__ = "call_qualifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id: Mapped[str] = mapped_column(String(36), ForeignKey("calls.id", ondelete="CASCADE"), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    mood: Mapped[str | None] = mapped_column(String(20))
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    outcome: Mapped[str | None] = mapped_column(String(30))
    next_step: Mapped[str | None] = mapped_column(Text)
    next_step_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    xp_earned: Mapped[int] = mapped_column(Integer, default=0)
    qualified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    call = relationship("Call", back_populates="qualification")
    user = relationship("User", back_populates="qualifications")

    __table_args__ = (
        Index("idx_qualif_user", "user_id"),
    )
