from fastapi import APIRouter, Request, Response
from sqlalchemy import delete, select

from app.database import DB
from app.errors import AppError
from app.models import AuthSession, User, utcnow
from app.schemas import Credentials, Register, TokenOut, UserOut
from app.security import SessionDep, UserDep, dummy_hash, hasher, issue_session, verify_password

router = APIRouter(prefix="/auth", tags=["Авторизация"])


@router.post(
    "/register", response_model=UserOut, status_code=201, summary="Регистрация пользователя"
)
def register(payload: Register, db: DB):
    if db.scalar(select(User.id).where(User.email == payload.email)):
        raise AppError(409, "email_exists", "Пользователь с таким email уже существует")
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hasher.hash(payload.password.get_secret_value()),
    )
    db.add(user)
    db.commit()
    return user


@router.post("/login", response_model=TokenOut, summary="Вход и получение токена")
def login(payload: Credentials, request: Request, db: DB):
    user = db.scalar(select(User).where(User.email == payload.email))
    encoded = user.password_hash if user else dummy_hash
    valid = verify_password(encoded, payload.password.get_secret_value())
    if user is None or not valid:
        raise AppError(401, "invalid_credentials", "Неверный email или пароль")
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(payload.password.get_secret_value())
    db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user.id, AuthSession.expires_at <= utcnow()
        )
    )
    token, session = issue_session(db, user, request.app.state.settings.session_ttl_hours)
    db.commit()
    return {"access_token": token, "expires_at": session.expires_at, "user": user}


@router.post("/logout", status_code=204, summary="Выход с отзывом текущего токена")
def logout(db: DB, session: SessionDep):
    db.delete(session)
    db.commit()
    return Response(status_code=204)


@router.get("/me", response_model=UserOut, summary="Текущий пользователь")
def me(user: UserDep):
    return user
