from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.database import DB
from app.models import ChecklistItem
from app.schemas import ItemCreate, ItemOut, ItemPatch, Page
from app.security import UserDep
from app.services import owned_item, owned_task, paginate

router = APIRouter(prefix="/tasks/{task_id}/checklist", tags=["Чек-листы"])


@router.get("", response_model=Page[ItemOut], summary="Пункты чек-листа")
def get_items(
    task_id: UUID,
    db: DB,
    user: UserDep,
    page: Annotated[int, Query(ge=1, le=1000000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    owned_task(db, user.id, task_id)
    query = (
        select(ChecklistItem)
        .where(ChecklistItem.task_id == task_id)
        .order_by(ChecklistItem.position, ChecklistItem.created_at, ChecklistItem.id)
    )
    return paginate(db, query, page, page_size)


@router.post("", response_model=ItemOut, status_code=201, summary="Добавить пункт чек-листа")
def create_item(task_id: UUID, payload: ItemCreate, db: DB, user: UserDep):
    owned_task(db, user.id, task_id)
    item = ChecklistItem(task_id=task_id, **payload.model_dump())
    db.add(item)
    db.commit()
    return item


@router.patch(
    "/{item_id}", response_model=ItemOut, summary="Изменить пункт или отметить выполнение"
)
def update_item(task_id: UUID, item_id: UUID, payload: ItemPatch, db: DB, user: UserDep):
    item = owned_item(db, user.id, task_id, item_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    return item


@router.delete("/{item_id}", status_code=204, summary="Удалить пункт чек-листа")
def delete_item(task_id: UUID, item_id: UUID, db: DB, user: UserDep):
    item = owned_item(db, user.id, task_id, item_id)
    db.delete(item)
    db.commit()
    return Response(status_code=204)
