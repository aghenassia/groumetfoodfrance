import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Date, DateTime, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class MarginRule(Base):
    __tablename__ = "margin_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    calc_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "per_kg" | "percent_ca"
    value: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    applies_to: Mapped[str] = mapped_column(String(200), nullable=False, default="all")  # "all" | "group:metro" | "group:csf,group:promocash"
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
