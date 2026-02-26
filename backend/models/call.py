import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Text, ForeignKey, Index, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ringover_cdr_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    call_id: Mapped[str | None] = mapped_column(String(100))
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    is_answered: Mapped[bool] = mapped_column(Boolean, default=False)
    last_state: Mapped[str | None] = mapped_column(String(20))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_duration: Mapped[int] = mapped_column(Integer, default=0)
    incall_duration: Mapped[int] = mapped_column(Integer, default=0)
    from_number: Mapped[str | None] = mapped_column(String(20))
    to_number: Mapped[str | None] = mapped_column(String(20))
    contact_number: Mapped[str | None] = mapped_column(String(20))
    contact_e164: Mapped[str | None] = mapped_column(String(20))
    hangup_by: Mapped[str | None] = mapped_column(String(20))
    voicemail_url: Mapped[str | None] = mapped_column(Text)
    record_url: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    user_name: Mapped[str | None] = mapped_column(String(100))
    user_email: Mapped[str | None] = mapped_column(String(255))
    client_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("clients.id"))
    contact_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("contacts.id", ondelete="SET NULL"))
    contact_name: Mapped[str | None] = mapped_column(String(100))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="calls")
    client = relationship("Client", back_populates="calls")
    contact = relationship("Contact", back_populates="calls")
    qualification = relationship("CallQualification", back_populates="call", uselist=False)
    ai_analysis = relationship("AiAnalysis", back_populates="call", uselist=False)

    __table_args__ = (
        Index("idx_calls_client", "client_id"),
        Index("idx_calls_contact", "contact_id"),
        Index("idx_calls_user", "user_id"),
        Index("idx_calls_start", "start_time"),
        Index("idx_calls_contact_e164", "contact_e164"),
    )
