import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Text, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class ClientSupplier(Base):
    __tablename__ = "client_suppliers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    supplier_id: Mapped[str] = mapped_column(String(36), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    added_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="supplier_associations")
    supplier = relationship("Supplier", back_populates="client_associations")

    __table_args__ = (
        UniqueConstraint("client_id", "supplier_id", name="uq_client_supplier"),
        Index("idx_client_suppliers_client", "client_id"),
    )


class ClientCompetitor(Base):
    __tablename__ = "client_competitors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    competitor_id: Mapped[str] = mapped_column(String(36), ForeignKey("competitors.id", ondelete="CASCADE"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    added_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="competitor_associations")
    competitor = relationship("Competitor", back_populates="client_associations")

    __table_args__ = (
        UniqueConstraint("client_id", "competitor_id", name="uq_client_competitor"),
        Index("idx_client_competitors_client", "client_id"),
    )


class ClientProductInterest(Base):
    __tablename__ = "client_product_interests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    article_ref: Mapped[str | None] = mapped_column(String(50))
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    added_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    client = relationship("Client", back_populates="product_interests")

    __table_args__ = (
        Index("idx_client_products_client", "client_id"),
        Index("idx_client_products_ref", "article_ref"),
    )
