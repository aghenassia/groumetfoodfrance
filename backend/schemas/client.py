from datetime import datetime, date
from pydantic import BaseModel


class PhoneNumberResponse(BaseModel):
    id: str
    phone_e164: str
    raw_phone: str | None = None
    label: str | None = None
    source: str = "sage"

    model_config = {"from_attributes": True}


class ClientResponse(BaseModel):
    id: str
    sage_id: str
    name: str
    short_name: str | None = None
    contact_name: str | None = None
    address: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str | None = None
    phone: str | None = None
    phone_e164: str | None = None
    email: str | None = None
    sales_rep: str | None = None
    assigned_user_name: str | None = None
    tariff_category: str | None = None
    is_prospect: bool = False
    is_dormant: bool = False
    status: str = "prospect"

    model_config = {"from_attributes": True}


class ClientListItem(ClientResponse):
    total_revenue_all: float | None = None
    total_revenue_12m: float | None = None
    order_count_total: int | None = None
    order_count_12m: int | None = None
    last_order_date: date | None = None
    avg_basket: float | None = None
    avg_margin_percent: float | None = None
    churn_risk_score: int | None = None
    upsell_score: int | None = None
    global_priority_score: int | None = None


class TopProduct(BaseModel):
    article_ref: str | None = None
    designation: str | None = None
    total_qty: float = 0
    total_ht: float = 0
    order_count: int = 0


class MonthlySales(BaseModel):
    month: str
    total_ht: float = 0
    order_count: int = 0
    margin_avg: float | None = None


class ContactBrief(BaseModel):
    id: str
    name: str
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    phone: str | None = None
    phone_e164: str | None = None
    email: str | None = None
    is_primary: bool = False
    source: str = "manual"
    assigned_user_id: str | None = None
    assigned_user_name: str | None = None

    model_config = {"from_attributes": True}


class ContactResponse(ContactBrief):
    company_id: str | None = None
    company_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ClientDetailResponse(ClientResponse):
    website: str | None = None
    siret: str | None = None
    vat_number: str | None = None
    naf_code: str | None = None
    sage_created_at: datetime | None = None
    phone_numbers: list[PhoneNumberResponse] = []
    contacts: list[ContactBrief] = []
    score: "ClientScoreResponse | None" = None
    sales_summary: "SalesSummary | None" = None
    top_products: list[TopProduct] = []
    monthly_sales: list[MonthlySales] = []
    recent_sales: list["SalesLineBrief"] = []
    recent_calls: list["CallBrief"] = []
    last_qualification_mood: str | None = None
    last_qualification_outcome: str | None = None
    last_qualification_at: datetime | None = None
    qualification_hot_count: int = 0
    qualification_cold_count: int = 0


class SalesSummary(BaseModel):
    total_orders: int = 0
    total_ht: float = 0
    total_margin: float = 0
    avg_basket: float = 0
    avg_margin_percent: float = 0
    first_order_date: date | None = None
    last_order_date: date | None = None
    distinct_products: int = 0


class ClientScoreResponse(BaseModel):
    last_order_date: date | None = None
    days_since_last_order: int | None = None
    order_count_12m: int = 0
    order_count_total: int = 0
    avg_frequency_days: float | None = None
    avg_basket: float = 0
    total_revenue_12m: float = 0
    total_revenue_all: float = 0
    total_margin_12m: float = 0
    avg_margin_percent: float = 0
    churn_risk_score: int = 0
    upsell_score: int = 0
    global_priority_score: int = 0

    model_config = {"from_attributes": True}


class SalesLineBrief(BaseModel):
    date: date
    sage_piece_id: str
    designation: str | None = None
    article_ref: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    amount_ht: float
    margin_percent: float | None = None
    margin_value: float | None = None
    sales_rep: str | None = None

    model_config = {"from_attributes": True}


class CallQualificationBrief(BaseModel):
    mood: str | None = None
    outcome: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    next_step: str | None = None
    next_step_date: date | None = None
    qualified_at: datetime | None = None

    model_config = {"from_attributes": True}


class CallAiAnalysisBrief(BaseModel):
    overall_score: int | None = None
    summary: str | None = None
    client_sentiment: str | None = None
    sales_feedback: str | None = None
    detected_opportunities: str | None = None
    listening_quality: int | None = None

    model_config = {"from_attributes": True}


class CallBrief(BaseModel):
    id: str
    direction: str
    start_time: datetime
    incall_duration: int = 0
    is_answered: bool = False
    user_name: str | None = None
    contact_name: str | None = None
    contact_id: str | None = None
    record_url: str | None = None
    qualification: CallQualificationBrief | None = None
    ai_analysis: CallAiAnalysisBrief | None = None

    model_config = {"from_attributes": True}
