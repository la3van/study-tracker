from collections.abc import Generator
from datetime import timezone
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import DateTime, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("A timezone is required")
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def make_engine(url: str):
    options = {"pool_pre_ping": True, "hide_parameters": True}
    if url.startswith("postgresql"):
        options["connect_args"] = {"connect_timeout": 5}
    return create_engine(url, **options)


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_db(request: Request) -> Generator[Session, None, None]:
    """Одна сессия БД на запрос, незавершённая транзакция откатывается при закрытии."""
    with request.app.state.session_factory() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]
