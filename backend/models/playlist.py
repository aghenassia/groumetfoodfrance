import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Integer, Date, DateTime, Text, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class DailyPlaylist(Base):
    __tablename__ = "daily_playlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id"), nullable=False)
    generated_date: Mapped[date] = mapped_column(Date, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    reason_detail: Mapped[str | None] = mapped_column(Text)
    score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    call_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("calls.id"))

    user = relationship("User", back_populates="playlists")
    client = relationship("Client", back_populates="playlist_entries")

    __table_args__ = (
        UniqueConstraint("user_id", "client_id", "generated_date", name="uq_playlist_entry"),
        Index("idx_playlist_user_date", "user_id", "generated_date"),
        Index("idx_playlist_status", "user_id", "generated_date", "status"),
    )
