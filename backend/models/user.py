import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="sales")
    ringover_user_id: Mapped[str | None] = mapped_column(String(50))
    ringover_number: Mapped[str | None] = mapped_column(String(20))
    ringover_email: Mapped[str | None] = mapped_column(String(255))
    sage_collaborator_id: Mapped[int | None] = mapped_column(Integer)
    sage_rep_name: Mapped[str | None] = mapped_column(String(70))
    phone: Mapped[str | None] = mapped_column(String(20))
    target_ca_monthly: Mapped[float | None] = mapped_column(Numeric(15, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    calls = relationship("Call", back_populates="user")
    contacts = relationship("Contact", back_populates="assigned_user")
    qualifications = relationship("CallQualification", back_populates="user")
    playlists = relationship("DailyPlaylist", back_populates="user")
    gamification_entries = relationship("Gamification", back_populates="user")
