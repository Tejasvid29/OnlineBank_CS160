from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from supabase import Client, create_client
from supabase_auth.errors import AuthApiError

from config import settings
from db import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])

PROFILE_COLUMNS = "id, first_name, last_name, email, phone_number, role, status, created_at"
INVALID_LOGIN = "Invalid email or password."


class RegisterRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ()\-]{7,20}$")
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


def _profile_out(row: dict) -> dict:
    # The frontend calls the column "phone".
    return {**{k: v for k, v in row.items() if k != "phone_number"}, "phone": row.get("phone_number")}


def _load_profile(db: Client, user_id: str) -> dict:
    rows = db.table("users").select(PROFILE_COLUMNS).eq("id", user_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No profile exists for this account.")
    if rows[0]["status"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is inactive.")
    return rows[0]


def _session_out(session, profile: dict) -> dict:
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "profile": _profile_out(profile),
    }


def _bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")
    return token


def get_current_user(token: str = Depends(_bearer_token), db: Client = Depends(get_supabase)) -> dict:
    """Authentication: validate the Supabase access token and return the user's active profile."""
    try:
        result = db.auth.get_user(token)
    except AuthApiError:
        result = None
    if result is None or result.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    return _load_profile(db, result.user.id)


def require_role(*roles: str):
    """Authorization: allow only users whose role is in `roles`."""

    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to do that.")
        return user

    return checker


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Client = Depends(get_supabase)):
    try:
        created = db.auth.admin.create_user(
            {"email": body.email, "password": body.password, "email_confirm": True}
        )
    except AuthApiError as error:
        if "already" in str(error).lower() or "registered" in str(error).lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create the account.")

    user_id = created.user.id
    try:
        # Role and status are never taken from the client: new sign-ups are always active customers.
        db.table("users").insert({
            "id": user_id,
            "first_name": body.first_name.strip(),
            "last_name": body.last_name.strip(),
            "email": body.email.lower(),
            "phone_number": body.phone,
            "role": "customer",
            "status": "active",
        }).execute()
    except Exception:
        db.auth.admin.delete_user(user_id)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not create the account.")

    return login(LoginRequest(email=body.email, password=body.password), db)


@router.post("/login")
def login(body: LoginRequest, db: Client = Depends(get_supabase)):
    # A throwaway client keeps the user's session off the shared admin client.
    auth_client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    try:
        result = auth_client.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except AuthApiError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_LOGIN)
    if result.session is None or result.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, INVALID_LOGIN)
    return _session_out(result.session, _load_profile(db, result.user.id))


@router.post("/refresh")
def refresh(body: RefreshRequest, db: Client = Depends(get_supabase)):
    auth_client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    try:
        result = auth_client.auth.refresh_session(body.refresh_token)
    except AuthApiError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    if result.session is None or result.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Please sign in again.")
    return _session_out(result.session, _load_profile(db, result.user.id))


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"profile": _profile_out(user)}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(_bearer_token), db: Client = Depends(get_supabase)):
    try:
        db.auth.admin.sign_out(token)
    except AuthApiError:
        pass  # Already invalid; nothing to revoke.


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(body: ForgotPasswordRequest):
    auth_client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    try:
        auth_client.auth.reset_password_for_email(body.email)
    except AuthApiError:
        pass  # Same response whether or not the address is registered.
