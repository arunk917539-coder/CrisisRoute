"""Responder authentication; credentials are provisioned explicitly, never seeded."""
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import re
import secrets
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import SessionLocal, get_db
from .models import AuthSession, User

router = APIRouter()
current_actor = ContextVar("current_actor", default=None)
_failures = {}
_failure_lock = threading.Lock()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password, encoded):
    try:
        algorithm, salt, digest = encoded.split("$")
        return algorithm == "scrypt" and hmac.compare_digest(
            hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex(), digest)
    except (ValueError, TypeError):
        return False


def user_response(user):
    return {"id": user.id, "username": user.username, "display_name": user.display_name, "role": user.role}


def bearer_user(db, authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to access responder tools", headers={"WWW-Authenticate": "Bearer"})
    token = authorization[7:]
    if len(token) > 200:
        raise HTTPException(401, "Invalid session")
    session = db.query(AuthSession).filter_by(token_hash=token_hash(token)).first()
    if not session or session.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired or invalid", headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Session user no longer exists")
    return user


def install_auth(app):
    @app.middleware("http")
    async def enforce_auth(request: Request, call_next):
        path = request.url.path
        public = path in {"/health", "/auth/status", "/auth/login", "/docs", "/redoc", "/openapi.json"} or path.startswith("/public/") or (path.startswith("/photos/") and path.endswith("/content"))
        actor_token = current_actor.set(None)
        try:
            if request.method != "OPTIONS" and not public:
                with SessionLocal() as db:
                    user = bearer_user(db, request.headers.get("authorization"))
                    if (path == "/users" or path.startswith("/users/")) and user.role != "admin":
                        raise HTTPException(403, "Administrator role required")
                    if request.method not in {"GET", "HEAD"} and path != "/auth/logout" and user.role not in {"admin", "responder"}:
                        raise HTTPException(403, "Responder or administrator role required")
                    request.state.user = user_response(user)
                    current_actor.set(user.display_name)
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-store"
            return response
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers={**(exc.headers or {}), "Cache-Control": "no-store"})
        finally:
            current_actor.reset(actor_token)


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class UserCreate(Login):
    display_name: str = Field(min_length=1, max_length=100)
    role: str

    @field_validator("username")
    @classmethod
    def valid_username(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9_.-]{3,80}", value):
            raise ValueError("Username must use 3-80 letters, digits, dots, underscores or hyphens")
        return value

    @field_validator("display_name")
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError("Display name cannot be blank")
        return value.strip()

    @field_validator("password")
    @classmethod
    def valid_password(cls, value):
        if len(value) < 12 or not value.strip():
            raise ValueError("Password must contain at least 12 characters")
        return value

    @field_validator("role")
    @classmethod
    def valid_role(cls, value):
        if value not in {"admin", "responder", "viewer"}:
            raise ValueError("Role must be admin, responder or viewer")
        return value


def create_user(db, payload):
    user = User(username=payload.username, display_name=payload.display_name,
                password_hash=hash_password(payload.password), role=payload.role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Username already exists")
    db.refresh(user)
    return user_response(user)


@router.get("/auth/status")
def auth_status(db: Session = Depends(get_db)):
    return {"setup_required": db.query(User).filter_by(role="admin").first() is None, "auth_required": True}


@router.post("/auth/login")
def login(payload: Login, request: Request, db: Session = Depends(get_db)):
    name = payload.username.strip().lower()
    key = (request.client.host if request.client else "unknown", name)
    now = time.monotonic()
    with _failure_lock:
        recent = [stamp for stamp in _failures.get(key, []) if now - stamp < 300]
        if len(recent) >= 5:
            raise HTTPException(429, "Too many login attempts; try again in five minutes", headers={"Retry-After": "300"})
        # Reserve the attempt while holding the lock so parallel requests cannot
        # all pass the limit before password verification finishes.
        if len(_failures) >= 5000 and key not in _failures:
            expired = [item for item, stamps in _failures.items() if not stamps or now - max(stamps) >= 300]
            for item in expired:
                _failures.pop(item, None)
            if len(_failures) >= 5000:
                raise HTTPException(429, "Login capacity reached; try again in five minutes", headers={"Retry-After": "300"})
        _failures[key] = recent + [now]
    user = db.query(User).filter_by(username=name).first()
    # A fixed dummy hash keeps unknown-user verification on the same slow path.
    encoded = user.password_hash if user else "scrypt$" + "00" * 16 + "$" + "00" * 64
    if not check_password(payload.password, encoded) or user is None:
        raise HTTPException(401, "Incorrect username or password")
    with _failure_lock:
        _failures.pop(key, None)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=8)
    db.query(AuthSession).filter(AuthSession.expires_at < datetime.now(timezone.utc)).delete()
    db.add(AuthSession(user_id=user.id, token_hash=token_hash(token), expires_at=expires_at))
    db.commit()
    return {"access_token": token, "token_type": "bearer", "expires_at": expires_at.isoformat(), "user": user_response(user)}


@router.get("/auth/me")
def me(request: Request):
    return request.state.user


@router.post("/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    db.query(AuthSession).filter_by(token_hash=token_hash(request.headers["authorization"][7:])).delete()
    db.commit()
    return {"logged_out": True}


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    return [user_response(user) for user in db.query(User).order_by(User.id).all()]


@router.post("/users")
def add_user(payload: UserCreate, db: Session = Depends(get_db)):
    return create_user(db, payload)
