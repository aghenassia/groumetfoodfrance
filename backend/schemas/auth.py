from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    ringover_user_id: str | None = None
    ringover_number: str | None = None
    ringover_email: str | None = None
    sage_collaborator_id: int | None = None
    sage_rep_name: str | None = None
    phone: str | None = None
    target_ca_monthly: float | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = "sales"
    ringover_user_id: str | None = None
    ringover_number: str | None = None
    ringover_email: str | None = None
    sage_collaborator_id: int | None = None
    sage_rep_name: str | None = None
    phone: str | None = None
    target_ca_monthly: float | None = None


class UpdateUserRequest(BaseModel):
    email: str | None = None
    name: str | None = None
    password: str | None = None
    role: str | None = None
    ringover_user_id: str | None = None
    ringover_number: str | None = None
    ringover_email: str | None = None
    sage_collaborator_id: int | None = None
    sage_rep_name: str | None = None
    phone: str | None = None
    target_ca_monthly: float | None = None
    is_active: bool | None = None
