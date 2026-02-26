import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class PhoneIndex(Base):
    __tablename__ = "phone_index"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone_e164: Mapped[str] = mapped_column(String(20), nullable=False)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("contacts.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="sage")
    raw_phone: Mapped[str | None] = mapped_column(String(50))
    label: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="phone_numbers")
    contact = relationship("Contact", back_populates="phone_numbers")

    __table_args__ = (
        UniqueConstraint("phone_e164", "client_id", name="uq_phone_client"),
        Index("idx_phone_e164", "phone_e164"),
        Index("idx_phone_contact", "contact_id"),
    )
