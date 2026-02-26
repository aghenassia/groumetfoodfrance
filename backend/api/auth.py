from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import hash_password, verify_password, create_access_token, get_current_user, require_admin
from models.user import User
from models.client import Client
from schemas.auth import LoginRequest, TokenResponse, UserResponse, CreateUserRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")

    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.get("/users/list")
async def list_users_simple(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Liste basique des utilisateurs actifs (id, name, role). Accessible à tous."""
    result = await db.execute(
        select(User.id, User.name, User.role)
        .where(User.is_active == True)
        .order_by(User.name)
    )
    return [{"id": r.id, "name": r.name, "role": r.role} for r in result.all()]


@router.get("/sage-reps")
async def list_sage_reps(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Liste des noms de rep Sage distincts présents dans la base clients."""
    result = await db.execute(
        select(Client.sales_rep)
        .where(Client.sales_rep.isnot(None), Client.sales_rep != "")
        .distinct()
        .order_by(Client.sales_rep)
    )
    return [r[0] for r in result.all()]


@router.post("/users", response_model=UserResponse)
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        ringover_user_id=body.ringover_user_id,
        ringover_number=body.ringover_number,
        ringover_email=body.ringover_email,
        sage_collaborator_id=body.sage_collaborator_id,
        sage_rep_name=body.sage_rep_name,
        phone=body.phone,
        target_ca_monthly=body.target_ca_monthly,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
