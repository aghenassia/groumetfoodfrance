import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, Text, Index
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    article_ref: Mapped[str] = mapped_column(String(18), unique=True, nullable=False)
    designation: Mapped[str | None] = mapped_column(String(255))
    family: Mapped[str | None] = mapped_column(String(35))
    sub_family: Mapped[str | None] = mapped_column(String(35))
    unit: Mapped[str | None] = mapped_column(String(10))
    sale_price: Mapped[float | None] = mapped_column(Numeric(15, 4))
    cost_price: Mapped[float | None] = mapped_column(Numeric(15, 4))
    weight: Mapped[float | None] = mapped_column(Numeric(15, 4))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_service: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    barcode: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)

    stock_quantity: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_reserved: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_ordered: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_preparing: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_available: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_forecast: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_min: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_max: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_value: Mapped[float | None] = mapped_column(Numeric(15, 2))
    stock_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("idx_product_family", "family"),
        Index("idx_product_ref", "article_ref"),
    )
