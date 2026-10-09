import hashlib
import secrets
from datetime import timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.database import DB
from app.errors import AppError
from app.models import AuthSession, User, utcnow

hasher = PasswordHasher()
dummy_hash = hasher.hash(secrets.token_urlsafe(32))
bearer = HTTPBearer(auto_error=False)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_password(encoded: str, password: str) -> bool:
    try:
        return hasher.verify(encoded, password)
    except VerificationError:
        return False


def issue_session(db, user: User, ttl_hours: int):
    token = secrets.token_urlsafe(32)
    session = AuthSession(
        token_hash=token_digest(token),
        user_id=user.id,
        expires_at=utcnow() + timedelta(hours=ttl_hours),
    )
    db.add(session)
    return token, session


def current_session(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> AuthSession:
    if credentials is None or len(credentials.credentials) > 256:
        raise AppError(401, "unauthorized", "Требуется действующий токен доступа")
    session = db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_digest(credentials.credentials),
            AuthSession.expires_at > utcnow(),
        )
    )
    if session is None:
        raise AppError(401, "unauthorized", "Токен недействителен или истёк")
    return session


SessionDep = Annotated[AuthSession, Depends(current_session)]


def current_user(db: DB, session: SessionDep) -> User:
    user = db.get(User, session.user_id)
    if user is None:
        raise AppError(401, "unauthorized", "Пользователь не найден")
    return user


UserDep = Annotated[User, Depends(current_user)]
