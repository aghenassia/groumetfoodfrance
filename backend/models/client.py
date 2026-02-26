import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Boolean, Integer, Date, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base

VALID_STATUSES = ("prospect", "lead", "client", "at_risk", "dormant", "dead")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sage_id: Mapped[str] = mapped_column(String(17), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(35))
    quality: Mapped[str | None] = mapped_column(String(17))
    contact_name: Mapped[str | None] = mapped_column(String(100))  # deprecated: use contacts table
    address: Mapped[str | None] = mapped_column(String(100))
    address_complement: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(9))
    city: Mapped[str | None] = mapped_column(String(50))
    region: Mapped[str | None] = mapped_column(String(25))
    country: Mapped[str | None] = mapped_column(String(35), default="France")
    phone: Mapped[str | None] = mapped_column(String(30))
    phone_e164: Mapped[str | None] = mapped_column(String(20))
    fax: Mapped[str | None] = mapped_column(String(21))
    email: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    siret: Mapped[str | None] = mapped_column(String(20))
    vat_number: Mapped[str | None] = mapped_column(String(30))
    naf_code: Mapped[str | None] = mapped_column(String(7))
    sales_rep: Mapped[str | None] = mapped_column(String(70))
    assigned_user_id: Mapped[str | None] = mapped_column(String(36))
    tariff_category: Mapped[str | None] = mapped_column(String(50))
    margin_group: Mapped[str | None] = mapped_column(String(50))
    accounting_category: Mapped[str | None] = mapped_column(String(20))

    # Legacy booleans kept for backward compat, but status is the source of truth
    is_prospect: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dormant: Mapped[bool] = mapped_column(Boolean, default=False)

    # Lead lifecycle status
    status: Mapped[str] = mapped_column(String(20), default="prospect")
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Dormant contact tracking
    contact_cooldown_until: Mapped[date | None] = mapped_column(Date)
    dormant_contact_count: Mapped[int] = mapped_column(Integer, default=0)
    dormant_first_contact_at: Mapped[date | None] = mapped_column(Date)

    # Qualification feedback aggregation
    last_qualification_mood: Mapped[str | None] = mapped_column(String(20))
    last_qualification_outcome: Mapped[str | None] = mapped_column(String(30))
    last_qualification_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    qualification_hot_count: Mapped[int] = mapped_column(Integer, default=0)
    qualification_cold_count: Mapped[int] = mapped_column(Integer, default=0)

    sage_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    contacts = relationship("Contact", back_populates="company", cascade="all, delete-orphan")
    phone_numbers = relationship("PhoneIndex", back_populates="client", cascade="all, delete-orphan")
    sales_lines = relationship("SalesLine", back_populates="client")
    calls = relationship("Call", back_populates="client")
    score = relationship("ClientScore", back_populates="client", uselist=False)
    playlist_entries = relationship("DailyPlaylist", back_populates="client")

    __table_args__ = (
        Index("idx_clients_phone_e164", "phone_e164"),
        Index("idx_clients_assigned_user", "assigned_user_id"),
        Index("idx_clients_sales_rep", "sales_rep"),
        Index("idx_clients_status", "status"),
    )
