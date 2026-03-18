import uuid
from datetime import date, datetime, timezone
from sqlalchemy import String, Boolean, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class UserObjective(Base):
    __tablename__ = "user_objectives"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    metric: Mapped[str] = mapped_column(String(30), nullable=False)
    period_type: Mapped[str] = mapped_column(String(15), nullable=False, default="monthly")  # monthly, quarterly, yearly, custom
    target_value: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    filter_client_category: Mapped[str | None] = mapped_column(String(50))
    filter_region: Mapped[str | None] = mapped_column(String(50))
    filter_product_family: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])
