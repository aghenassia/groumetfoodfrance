import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Integer, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class ClientScore(Base):
    __tablename__ = "client_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), unique=True, nullable=False)

    last_order_date: Mapped[date | None] = mapped_column(Date)
    days_since_last_order: Mapped[int | None] = mapped_column(Integer)
    order_count_12m: Mapped[int] = mapped_column(Integer, default=0)
    order_count_total: Mapped[int] = mapped_column(Integer, default=0)
    avg_frequency_days: Mapped[float | None] = mapped_column(Numeric(8, 1))
    avg_basket: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total_revenue_12m: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total_revenue_all: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total_margin_12m: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    avg_margin_percent: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    churn_risk_score: Mapped[int] = mapped_column(Integer, default=0)
    upsell_score: Mapped[int] = mapped_column(Integer, default=0)
    global_priority_score: Mapped[int] = mapped_column(Integer, default=0)

    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="score")
