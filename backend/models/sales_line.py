import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, SmallInteger, Integer, Date, DateTime, Numeric, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class SalesLine(Base):
    __tablename__ = "sales_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sage_piece_id: Mapped[str] = mapped_column(String(13), nullable=False)
    sage_doc_type: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=6)
    client_sage_id: Mapped[str] = mapped_column(String(17), nullable=False)
    client_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("clients.id"))
    client_name: Mapped[str | None] = mapped_column(String(100))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    article_ref: Mapped[str | None] = mapped_column(String(18))
    designation: Mapped[str | None] = mapped_column(String(100))
    quantity: Mapped[float | None] = mapped_column(Numeric(15, 4))
    unit_price: Mapped[float | None] = mapped_column(Numeric(15, 4))
    net_weight: Mapped[float | None] = mapped_column(Numeric(15, 4))
    discount: Mapped[float | None] = mapped_column(Numeric(15, 4), default=0)
    net_unit_price: Mapped[float | None] = mapped_column(Numeric(15, 4))
    cost_price: Mapped[float | None] = mapped_column(Numeric(15, 4))
    amount_ht: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    sales_rep: Mapped[str | None] = mapped_column(String(70))
    sage_collaborator_id: Mapped[int | None] = mapped_column(Integer)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    margin_value: Mapped[float | None] = mapped_column(Numeric(15, 2))
    margin_percent: Mapped[float | None] = mapped_column(Numeric(8, 2))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="sales_lines")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("sage_piece_id", "article_ref", "client_sage_id", "date", name="uq_sales_line"),
        Index("idx_sales_client", "client_sage_id"),
        Index("idx_sales_client_id", "client_id"),
        Index("idx_sales_date", "date"),
        Index("idx_sales_rep", "sales_rep"),
        Index("idx_sales_user_id", "user_id"),
    )
