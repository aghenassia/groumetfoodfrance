import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class ContactPhone(Base):
    __tablename__ = "contact_phones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    contact_id: Mapped[str] = mapped_column(String(36), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    phone_e164: Mapped[str | None] = mapped_column(String(20))
    label: Mapped[str | None] = mapped_column(String(30))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    contact = relationship("Contact", back_populates="phones")

    __table_args__ = (
        Index("idx_contact_phones_contact", "contact_id"),
        Index("idx_contact_phones_e164", "phone_e164"),
    )
