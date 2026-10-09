from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.database import DB
from app.models import Priority, Task, TaskStatus
from app.schemas import Page, StatusUpdate, TaskCreate, TaskOut, TaskPatch
from app.security import UserDep
from app.services import list_tasks, owned_subject, owned_task, set_status

router = APIRouter(prefix="/tasks", tags=["Задания"])


@router.get("", response_model=Page[TaskOut], summary="Поиск, фильтрация и сортировка заданий")
def get_tasks(
    db: DB,
    user: UserDep,
    page: Annotated[int, Query(ge=1, le=1000000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    subject_id: UUID | None = None,
    status: TaskStatus | None = None,
    priority: Priority | None = None,
    q: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    sort: Literal["due_at", "priority", "created_at"] = "due_at",
    order: Literal["asc", "desc"] = "asc",
    deadline: Literal["overdue", "upcoming"] | None = None,
    days: Annotated[int, Query(ge=1, le=30)] = 7,
):
    return list_tasks(
        db,
        user.id,
        page=page,
        page_size=page_size,
        subject_id=subject_id,
        status=status,
        priority=priority,
        q=q,
        sort=sort,
        order=order,
        deadline=deadline,
        days=days,
    )


@router.post("", response_model=TaskOut, status_code=201, summary="Создать задание")
def create_task(payload: TaskCreate, db: DB, user: UserDep):
    owned_subject(db, user.id, payload.subject_id)
    task = Task(user_id=user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    return task


@router.get("/{task_id}", response_model=TaskOut, summary="Получить задание")
def get_task(task_id: UUID, db: DB, user: UserDep):
    return owned_task(db, user.id, task_id)


@router.patch("/{task_id}", response_model=TaskOut, summary="Изменить поля задания")
def update_task(task_id: UUID, payload: TaskPatch, db: DB, user: UserDep):
    task = owned_task(db, user.id, task_id, lock=True)
    if payload.subject_id is not None:
        owned_subject(db, user.id, payload.subject_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/status", response_model=TaskOut, summary="Изменить статус задания")
def update_status(task_id: UUID, payload: StatusUpdate, db: DB, user: UserDep):
    task = owned_task(db, user.id, task_id, lock=True)
    set_status(task, payload.status)
    db.commit()
    return task


@router.delete("/{task_id}", status_code=204, summary="Удалить задание вместе с чек-листом")
def delete_task(task_id: UUID, db: DB, user: UserDep):
    task = owned_task(db, user.id, task_id, lock=True)
    db.delete(task)
    db.commit()
    return Response(status_code=204)
