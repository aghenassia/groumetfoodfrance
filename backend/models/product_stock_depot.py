import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Numeric, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from core.database import Base


class ProductStockDepot(Base):
    __tablename__ = "product_stock_depots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    article_ref: Mapped[str] = mapped_column(String(18), nullable=False)
    depot_id: Mapped[int] = mapped_column(Integer, nullable=False)
    depot_name: Mapped[str | None] = mapped_column(String(70))
    stock_quantity: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_reserved: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_ordered: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_preparing: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_available: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_min: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_max: Mapped[float | None] = mapped_column(Numeric(15, 4))
    stock_value: Mapped[float | None] = mapped_column(Numeric(15, 2))
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("idx_stock_depot_ref", "article_ref"),
        Index("idx_stock_depot_unique", "article_ref", "depot_id", unique=True),
    )
