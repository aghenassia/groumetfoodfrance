import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.margin_rule import MarginRule
from models.sales_line import SalesLine
from models.client import Client

router = APIRouter(prefix="/api/admin/margin-rules", tags=["margin-rules"])


class MarginRuleCreate(BaseModel):
    name: str
    description: str | None = None
    calc_type: str  # per_kg | percent_ca
    value: float
    applies_to: str = "all"
    effective_from: date
    effective_to: date | None = None


class MarginRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    value: float | None = None
    applies_to: str | None = None
    effective_to: date | None = None


class MarginRuleResponse(BaseModel):
    id: str
    name: str
    description: str | None
    calc_type: str
    value: float
    applies_to: str
    effective_from: date
    effective_to: date | None
    created_at: datetime | None
    updated_at: datetime | None


def _require_admin(user: User):
    if user.role not in ("admin", "manager"):
        raise HTTPException(403, "Admin/manager requis")


@router.get("", response_model=list[MarginRuleResponse])
async def list_rules(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    stmt = select(MarginRule).order_by(MarginRule.effective_from.desc())
    if active_only:
        today = date.today()
        stmt = stmt.where(
            MarginRule.effective_from <= today,
            (MarginRule.effective_to.is_(None)) | (MarginRule.effective_to >= today),
        )
    result = await db.execute(stmt)
    return [MarginRuleResponse.model_validate(r, from_attributes=True) for r in result.scalars().all()]


@router.post("", response_model=MarginRuleResponse)
async def create_rule(
    body: MarginRuleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    if body.calc_type not in ("per_kg", "percent_ca"):
        raise HTTPException(400, "calc_type doit être 'per_kg' ou 'percent_ca'")
    rule = MarginRule(
        id=str(uuid.uuid4()),
        name=body.name,
        description=body.description,
        calc_type=body.calc_type,
        value=body.value,
        applies_to=body.applies_to,
        effective_from=body.effective_from,
        effective_to=body.effective_to,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return MarginRuleResponse.model_validate(rule, from_attributes=True)


@router.put("/{rule_id}", response_model=MarginRuleResponse)
async def update_rule(
    rule_id: str,
    body: MarginRuleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    rule = await db.get(MarginRule, rule_id)
    if not rule:
        raise HTTPException(404, "Règle non trouvée")
    if body.name is not None:
        rule.name = body.name
    if body.description is not None:
        rule.description = body.description
    if body.value is not None:
        rule.value = body.value
    if body.applies_to is not None:
        rule.applies_to = body.applies_to
    if body.effective_to is not None:
        rule.effective_to = body.effective_to
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rule)
    return MarginRuleResponse.model_validate(rule, from_attributes=True)


@router.delete("/{rule_id}")
async def deactivate_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    rule = await db.get(MarginRule, rule_id)
    if not rule:
        raise HTTPException(404, "Règle non trouvée")
    rule.effective_to = date.today()
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


def rule_applies_to_client(rule: MarginRule, client_margin_group: str | None, line_date: date) -> bool:
    if rule.effective_from > line_date:
        return False
    if rule.effective_to and rule.effective_to < line_date:
        return False
    if rule.applies_to == "all":
        return True
    if not client_margin_group:
        return False
    groups = [g.replace("group:", "").strip() for g in rule.applies_to.split(",")]
    return client_margin_group.lower() in [g.lower() for g in groups]


@router.get("/net-margin-stats")
async def net_margin_stats(
    user_id: str | None = None,
    start: date | None = None,
    end: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Calcul agrégé marge brute et nette par commercial."""
    _require_admin(user)

    rules_stmt = select(MarginRule)
    rules_result = await db.execute(rules_stmt)
    all_rules = rules_result.scalars().all()

    stmt = (
        select(
            SalesLine.user_id,
            User.name.label("user_name"),
            SalesLine.client_id,
            Client.margin_group,
            SalesLine.date,
            SalesLine.amount_ht,
            SalesLine.margin_value,
            SalesLine.net_weight,
        )
        .outerjoin(User, User.id == SalesLine.user_id)
        .outerjoin(Client, Client.id == SalesLine.client_id)
    )
    if user_id:
        stmt = stmt.where(SalesLine.user_id == user_id)
    if start:
        stmt = stmt.where(SalesLine.date >= start)
    if end:
        stmt = stmt.where(SalesLine.date <= end)

    result = await db.execute(stmt)
    rows = result.all()

    user_stats: dict[str, dict] = {}
    for row in rows:
        uid = row.user_id or "__none__"
        if uid not in user_stats:
            user_stats[uid] = {
                "user_id": row.user_id,
                "user_name": row.user_name or "Non attribué",
                "total_ca": 0,
                "total_margin_gross": 0,
                "total_margin_net": 0,
                "total_weight_kg": 0,
            }
        s = user_stats[uid]
        ca = float(row.amount_ht or 0)
        mg = float(row.margin_value or 0)
        weight_kg = float(row.net_weight or 0) / 1000  # Sage stores grams
        s["total_ca"] += ca
        s["total_margin_gross"] += mg
        s["total_weight_kg"] += weight_kg

        net = mg
        for rule in all_rules:
            if not rule_applies_to_client(rule, row.margin_group, row.date):
                continue
            if rule.calc_type == "per_kg":
                net -= weight_kg * float(rule.value)
            elif rule.calc_type == "percent_ca":
                net -= ca * float(rule.value) / 100
        s["total_margin_net"] += net

    return sorted(user_stats.values(), key=lambda x: x["total_ca"], reverse=True)
