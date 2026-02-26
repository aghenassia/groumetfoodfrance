import uuid
from datetime import datetime, timezone
from sqlalchemy import String, SmallInteger, Integer, DateTime, Text, Numeric, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.database import Base


class AiAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id: Mapped[str] = mapped_column(String(36), ForeignKey("calls.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Transcription brute
    transcript: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)

    # Feedback Sales (coaching)
    sales_feedback: Mapped[str | None] = mapped_column(Text)
    client_sentiment: Mapped[str | None] = mapped_column(String(20))
    detected_opportunities: Mapped[str | None] = mapped_column(Text)
    next_actions: Mapped[str | None] = mapped_column(Text)
    key_topics: Mapped[dict | None] = mapped_column(JSONB)

    # Feedback Admin (scoring qualité)
    politeness_score: Mapped[int | None] = mapped_column(SmallInteger)
    objection_handling: Mapped[int | None] = mapped_column(SmallInteger)
    closing_attempt: Mapped[int | None] = mapped_column(SmallInteger)
    product_knowledge: Mapped[int | None] = mapped_column(SmallInteger)
    listening_quality: Mapped[int | None] = mapped_column(SmallInteger)
    overall_score: Mapped[int | None] = mapped_column(SmallInteger)
    admin_feedback: Mapped[str | None] = mapped_column(Text)
    admin_scores_raw: Mapped[dict | None] = mapped_column(JSONB)

    # Classification
    is_voicemail: Mapped[bool] = mapped_column(default=False, server_default="false")

    # Méta
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    cost_transcription: Mapped[float | None] = mapped_column(Numeric(6, 4))
    cost_analysis: Mapped[float | None] = mapped_column(Numeric(6, 4))
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    call = relationship("Call", back_populates="ai_analysis")

    __table_args__ = (
        Index("idx_ai_call", "call_id"),
        Index("idx_ai_overall_score", "overall_score"),
    )
