from datetime import datetime, date
from pydantic import BaseModel


class AiAnalysisBrief(BaseModel):
    overall_score: int | None = None
    client_sentiment: str | None = None
    summary: str | None = None
    is_voicemail: bool = False

    model_config = {"from_attributes": True}


class CallResponse(BaseModel):
    id: str
    ringover_cdr_id: int
    direction: str
    is_answered: bool = False
    last_state: str | None = None
    start_time: datetime
    end_time: datetime | None = None
    total_duration: int = 0
    incall_duration: int = 0
    from_number: str | None = None
    to_number: str | None = None
    contact_number: str | None = None
    contact_e164: str | None = None
    record_url: str | None = None
    user_name: str | None = None
    client_id: str | None = None
    contact_id: str | None = None
    contact_name: str | None = None
    contact_role: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    company_id: str | None = None
    company_name: str | None = None
    client_name: str | None = None
    client_city: str | None = None
    client_ca_total: float | None = None
    client_last_order: date | None = None
    qualification: "QualificationResponse | None" = None
    ai_analysis: AiAnalysisBrief | None = None

    model_config = {"from_attributes": True}


class QualificationResponse(BaseModel):
    id: str
    mood: str | None = None
    tags: list[str] | None = None
    outcome: str | None = None
    next_step: str | None = None
    next_step_date: date | None = None
    notes: str | None = None
    xp_earned: int = 0
    qualified_at: datetime

    model_config = {"from_attributes": True}


class QualifyCallRequest(BaseModel):
    call_id: str
    mood: str | None = None
    tags: list[str] | None = None
    outcome: str | None = None
    next_step: str | None = None
    next_step_date: date | None = None
    notes: str | None = None
