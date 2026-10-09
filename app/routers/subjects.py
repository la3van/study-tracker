from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.database import DB
from app.errors import AppError
from app.models import Subject, Task
from app.schemas import Page, SubjectCreate, SubjectOut, SubjectPatch
from app.security import UserDep
from app.services import owned_subject, paginate

router = APIRouter(prefix="/subjects", tags=["Предметы"])


@router.post("", response_model=SubjectOut, status_code=201, summary="Создать предмет")
def create_subject(payload: SubjectCreate, db: DB, user: UserDep):
    subject = Subject(user_id=user.id, **payload.model_dump())
    db.add(subject)
    db.commit()
    return subject


@router.get("", response_model=Page[SubjectOut], summary="Список предметов")
def list_subjects(
    db: DB,
    user: UserDep,
    page: Annotated[int, Query(ge=1, le=1000000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    query = select(Subject).where(Subject.user_id == user.id).order_by(Subject.name, Subject.id)
    return paginate(db, query, page, page_size)


@router.get("/{subject_id}", response_model=SubjectOut, summary="Получить предмет")
def get_subject(subject_id: UUID, db: DB, user: UserDep):
    return owned_subject(db, user.id, subject_id)


@router.patch("/{subject_id}", response_model=SubjectOut, summary="Изменить предмет")
def update_subject(subject_id: UUID, payload: SubjectPatch, db: DB, user: UserDep):
    subject = owned_subject(db, user.id, subject_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, field, value)
    db.commit()
    return subject


@router.delete("/{subject_id}", status_code=204, summary="Удалить предмет без заданий")
def delete_subject(subject_id: UUID, db: DB, user: UserDep):
    subject = owned_subject(db, user.id, subject_id)
    if db.scalar(select(Task.id).where(Task.subject_id == subject_id).limit(1)):
        raise AppError(
            409,
            "subject_not_empty",
            "Сначала удалите задания предмета или перенесите их в другой предмет",
        )
    db.delete(subject)
    db.commit()
    return Response(status_code=204)
