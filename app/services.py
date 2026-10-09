from datetime import timedelta
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import ChecklistItem, Subject, Task, TaskStatus, utcnow


def owned_subject(db: Session, user_id: UUID, subject_id: UUID) -> Subject:
    subject = db.scalar(select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id))
    if subject is None:
        raise AppError(404, "not_found", "Предмет не найден")
    return subject


def owned_task(db: Session, user_id: UUID, task_id: UUID, lock=False) -> Task:
    query = select(Task).where(Task.id == task_id, Task.user_id == user_id)
    if lock:
        query = query.with_for_update()
    task = db.scalar(query)
    if task is None:
        raise AppError(404, "not_found", "Задание не найдено")
    return task


def owned_item(db: Session, user_id: UUID, task_id: UUID, item_id: UUID) -> ChecklistItem:
    owned_task(db, user_id, task_id)
    item = db.scalar(
        select(ChecklistItem).where(ChecklistItem.id == item_id, ChecklistItem.task_id == task_id)
    )
    if item is None:
        raise AppError(404, "not_found", "Пункт чек-листа не найден")
    return item


def paginate(db: Session, statement, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery()))
    items = db.scalars(statement.offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def list_tasks(
    db,
    user_id,
    *,
    page,
    page_size,
    subject_id=None,
    status=None,
    priority=None,
    q=None,
    sort="due_at",
    order="asc",
    deadline=None,
    days=7,
):
    query = select(Task).where(Task.user_id == user_id)
    if subject_id is not None:
        owned_subject(db, user_id, subject_id)
        query = query.where(Task.subject_id == subject_id)
    if status is not None:
        query = query.where(Task.status == status)
    if priority is not None:
        query = query.where(Task.priority == priority)
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(
            or_(
                Task.title.ilike(pattern, escape="\\"), Task.description.ilike(pattern, escape="\\")
            )
        )
    now = utcnow()
    if deadline == "overdue":
        query = query.where(Task.status != TaskStatus.DONE, Task.due_at < now)
    if deadline == "upcoming":
        query = query.where(
            Task.status != TaskStatus.DONE,
            Task.due_at >= now,
            Task.due_at <= now + timedelta(days=days),
        )
    sort_column = {
        "due_at": Task.due_at,
        "priority": case((Task.priority == "low", 1), (Task.priority == "medium", 2), else_=3),
        "created_at": Task.created_at,
    }[sort]
    query = query.order_by(
        sort_column.desc() if order == "desc" else sort_column.asc(), Task.id.asc()
    )
    return paginate(db, query, page, page_size)


def set_status(task: Task, status: TaskStatus):
    if task.status != status:
        task.status = status
        task.completed_at = utcnow() if status == TaskStatus.DONE else None
        task.updated_at = utcnow()


def statistics(db: Session, user_id: UUID):
    now = utcnow()
    row = db.execute(
        select(
            func.count(Task.id),
            func.count().filter(Task.status == TaskStatus.TODO),
            func.count().filter(Task.status == TaskStatus.IN_PROGRESS),
            func.count().filter(Task.status == TaskStatus.DONE),
            func.count().filter(Task.status != TaskStatus.DONE, Task.due_at < now),
        ).where(Task.user_id == user_id)
    ).one()
    total, todo, in_progress, done, overdue = row
    return {
        "total": total,
        "todo": todo,
        "in_progress": in_progress,
        "done": done,
        "overdue": overdue,
        "completed_percent": round(done * 100 / total, 2) if total else 0.0,
        "as_of": now,
    }
