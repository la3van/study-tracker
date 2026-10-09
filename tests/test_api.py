from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import create_app
from app.models import AuthSession, ChecklistItem, Subject, Task, User, utcnow
from app.security import token_digest


def test_register_validation_and_password_hash(client, engine):
    payload = {"name": "  Анна  ", "email": "ANNA@example.com", "password": "password-12345"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["email"] == "anna@example.com"
    assert response.json()["name"] == "Анна"
    assert "password_hash" not in response.json()
    with Session(engine) as db:
        user = db.scalar(select(User))
        assert user.password_hash.startswith("$argon2id$")
        assert payload["password"] not in user.password_hash
    assert client.post("/api/v1/auth/register", json=payload).status_code == 409


@pytest.mark.parametrize(
    "changes", [{"email": "invalid"}, {"password": "short"}, {"name": "  "}, {"admin": True}]
)
def test_bad_registration(client, changes):
    payload = {"name": "Anna", "email": "anna@example.com", "password": "password-12345"} | changes
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert "password-12345" not in response.text
    assert "error" in response.json()


def test_login_logout_and_independent_sessions(client, user, engine):
    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": "student@example.com", "password": "incorrect-password"},
    )
    missing = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "incorrect-password"}
    )
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json()["error"] == missing.json()["error"]
    second = client.post(
        "/api/v1/auth/login",
        json={"email": "student@example.com", "password": "secure-password-123"},
    ).json()["access_token"]
    assert client.get("/api/v1/auth/me", headers=user["headers"]).status_code == 200
    with Session(engine) as db:
        sessions = db.scalars(select(AuthSession)).all()
        assert len(sessions) == 2
        assert all(s.token_hash != user["token"] for s in sessions)
    assert client.post("/api/v1/auth/logout", headers=user["headers"]).status_code == 204
    assert client.get("/api/v1/auth/me", headers=user["headers"]).status_code == 401
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + second}).status_code
        == 200
    )


def test_expired_token(client, user, engine):
    with Session(engine) as db:
        session = db.get(AuthSession, token_digest(user["token"]))
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/v1/tasks", headers=user["headers"]).status_code == 401


@pytest.mark.parametrize("path", ["/subjects", "/tasks", "/stats", "/auth/me"])
def test_auth_required(client, path):
    response = client.get("/api/v1" + path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_subject_crud_and_deletion_guard(client, user, subject, task):
    headers = user["headers"]
    base = "/api/v1/subjects/" + subject["id"]
    assert client.get(base, headers=headers).json()["id"] == subject["id"]
    assert (
        client.patch(
            base, headers=headers, json={"name": "Алгебра", "description": "Первый курс"}
        ).json()["name"]
        == "Алгебра"
    )
    assert client.get("/api/v1/subjects", headers=headers).json()["total"] == 1
    assert client.delete(base, headers=headers).status_code == 409
    assert client.delete("/api/v1/tasks/" + task["id"], headers=headers).status_code == 204
    assert client.delete(base, headers=headers).status_code == 204
    assert client.get(base, headers=headers).status_code == 404


def test_task_update_and_status_lifecycle(client, user, subject, task):
    headers = user["headers"]
    base = "/api/v1/tasks/" + task["id"]
    assert task["status"] == "todo"
    assert task["due_at"] == "2030-05-10T15:00:00Z"
    changed = client.patch(
        base,
        headers=headers,
        json={"title": "Сдать работу", "priority": "high", "due_at": "2031-01-02T01:00:00+03:00"},
    )
    assert changed.status_code == 200
    assert changed.json()["due_at"] == "2031-01-01T22:00:00Z"
    done = client.patch(base + "/status", headers=headers, json={"status": "done"}).json()
    assert done["completed_at"] is not None
    again = client.patch(base + "/status", headers=headers, json={"status": "done"}).json()
    assert again["completed_at"] == done["completed_at"]
    reopened = client.patch(
        base + "/status", headers=headers, json={"status": "in_progress"}
    ).json()
    assert reopened["completed_at"] is None
    other = client.post("/api/v1/subjects", headers=headers, json={"name": "Физика"}).json()
    moved = client.patch(base, headers=headers, json={"subject_id": other["id"]})
    assert moved.json()["subject_id"] == other["id"]
    assert client.delete("/api/v1/subjects/" + subject["id"], headers=headers).status_code == 204


@pytest.mark.parametrize(
    "patch",
    [
        {},
        {"title": None},
        {"title": "   "},
        {"title": "x" * 201},
        {"description": "x" * 10001},
        {"due_at": "2028-01-01T12:00:00"},
        {"due_at": "2028-02-30T12:00:00Z"},
        {"priority": "urgent"},
        {"status": "done"},
        {"user_id": str(uuid4())},
    ],
)
def test_invalid_task_updates_do_not_change_task(client, user, task, patch):
    path = "/api/v1/tasks/" + task["id"]
    assert client.patch(path, headers=user["headers"], json=patch).status_code == 422
    assert client.get(path, headers=user["headers"]).json()["title"] == task["title"]


def test_checklist_and_cascade(client, user, task, engine):
    headers = user["headers"]
    base = "/api/v1/tasks/" + task["id"]
    response = client.post(
        base + "/checklist", headers=headers, json={"title": "Прочитать условие", "position": 1}
    )
    assert response.status_code == 201
    item_id = response.json()["id"]
    response = client.patch(
        base + "/checklist/" + item_id,
        headers=headers,
        json={"is_completed": True, "title": "Готово"},
    )
    assert response.json()["is_completed"] is True
    assert client.get(base + "/checklist", headers=headers).json()["total"] == 1
    assert client.get(base, headers=headers).json()["status"] == "todo"
    assert client.delete(base, headers=headers).status_code == 204
    with Session(engine) as db:
        assert db.scalar(select(func.count(ChecklistItem.id))) == 0


def test_checklist_item_delete(client, user, task):
    path = "/api/v1/tasks/" + task["id"] + "/checklist"
    item = client.post(path, headers=user["headers"], json={"title": "Шаг"}).json()
    assert client.delete(path + "/" + item["id"], headers=user["headers"]).status_code == 204
    assert client.get(path, headers=user["headers"]).json()["total"] == 0


def test_cross_user_access_all_resources(client, user, subject, task):
    item_path = "/api/v1/tasks/" + task["id"] + "/checklist"
    item = client.post(item_path, headers=user["headers"], json={"title": "Пункт"}).json()
    client.post(
        "/api/v1/auth/register",
        json={"name": "Другой", "email": "other@example.com", "password": "another-password"},
    )
    token = client.post(
        "/api/v1/auth/login", json={"email": "other@example.com", "password": "another-password"}
    ).json()["access_token"]
    headers = {"Authorization": "Bearer " + token}
    for resource in ("subjects/" + subject["id"], "tasks/" + task["id"]):
        assert client.get("/api/v1/" + resource, headers=headers).status_code == 404
        assert client.delete("/api/v1/" + resource, headers=headers).status_code == 404
    assert (
        client.patch(
            "/api/v1/subjects/" + subject["id"], headers=headers, json={"name": "Чужое"}
        ).status_code
        == 404
    )
    assert (
        client.patch(
            "/api/v1/tasks/" + task["id"], headers=headers, json={"title": "Чужое"}
        ).status_code
        == 404
    )
    assert (
        client.patch(
            "/api/v1/tasks/" + task["id"] + "/status", headers=headers, json={"status": "done"}
        ).status_code
        == 404
    )
    assert client.get(item_path, headers=headers).status_code == 404
    assert client.post(item_path, headers=headers, json={"title": "Чужое"}).status_code == 404
    assert (
        client.patch(
            item_path + "/" + item["id"], headers=headers, json={"is_completed": True}
        ).status_code
        == 404
    )
    assert client.delete(item_path + "/" + item["id"], headers=headers).status_code == 404
    assert (
        client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"subject_id": subject["id"], "title": "Чужое", "due_at": "2030-01-01T12:00:00Z"},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/tasks", headers=headers).json()["total"] == 0
    assert client.get("/api/v1/stats", headers=headers).json()["total"] == 0
    assert (
        client.get(
            "/api/v1/tasks", headers=headers, params={"subject_id": subject["id"]}
        ).status_code
        == 404
    )


def test_foreign_subject_assignment_rejected_atomically(client, user, task, engine):
    with Session(engine) as db:
        owner = User(name="Other", email="other@example.com", password_hash="unused")
        db.add(owner)
        db.flush()
        subject = Subject(user_id=owner.id, name="Private")
        db.add(subject)
        db.commit()
        subject_id = str(subject.id)
    response = client.patch(
        "/api/v1/tasks/" + task["id"],
        headers=user["headers"],
        json={"title": "Changed", "subject_id": subject_id},
    )
    assert response.status_code == 404
    assert (
        client.get("/api/v1/tasks/" + task["id"], headers=user["headers"]).json()["title"]
        == task["title"]
    )


def test_search_filters_order_pagination_and_statistics(client, user, subject):
    headers = user["headers"]
    now = utcnow()
    created = []
    for title, priority, offset in [
        ("Алгебра 100%", "low", -2),
        ("Physics", "high", 2),
        ("History", "medium", 40),
    ]:
        response = client.post(
            "/api/v1/tasks",
            headers=headers,
            json={
                "subject_id": subject["id"],
                "title": title,
                "description": "Описание",
                "priority": priority,
                "due_at": (now + timedelta(days=offset)).isoformat(),
            },
        )
        assert response.status_code == 201
        created.append(response.json())
    result = client.get(
        "/api/v1/tasks",
        headers=headers,
        params={"sort": "priority", "order": "desc", "page_size": 1},
    ).json()
    assert result["total"] == 3
    assert result["items"][0]["title"] == "Physics"
    assert (
        client.get("/api/v1/tasks", headers=headers, params={"page_size": 1, "page": 2}).json()[
            "items"
        ][0]["title"]
        == "Physics"
    )
    assert client.get("/api/v1/tasks", headers=headers, params={"q": "%"}).json()["total"] == 1
    assert (
        client.get("/api/v1/tasks", headers=headers, params={"q": "алгебра"}).json()["total"] == 1
    )
    assert (
        client.get("/api/v1/tasks", headers=headers, params={"q": "описание"}).json()["total"] == 3
    )
    assert (
        client.get(
            "/api/v1/tasks",
            headers=headers,
            params={"subject_id": subject["id"], "priority": "high", "status": "todo"},
        ).json()["total"]
        == 1
    )
    assert (
        client.get("/api/v1/tasks", headers=headers, params={"deadline": "overdue"}).json()["total"]
        == 1
    )
    assert (
        client.get(
            "/api/v1/tasks", headers=headers, params={"deadline": "upcoming", "days": 7}
        ).json()["total"]
        == 1
    )
    client.patch(
        "/api/v1/tasks/" + created[0]["id"] + "/status", headers=headers, json={"status": "done"}
    )
    stats = client.get("/api/v1/stats", headers=headers).json()
    assert stats["total"] == 3
    assert stats["done"] == 1
    assert stats["todo"] == 2
    assert stats["overdue"] == 0
    assert stats["completed_percent"] == 33.33
    assert (
        client.get("/api/v1/tasks", headers=headers, params={"deadline": "overdue"}).json()["total"]
        == 0
    )


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page_size": 101},
        {"days": 31},
        {"days": 0},
        {"sort": "DROP TABLE tasks"},
        {"status": "wrong"},
    ],
)
def test_bad_list_parameters(client, user, params):
    assert client.get("/api/v1/tasks", headers=user["headers"], params=params).status_code == 422


def test_empty_stats(client, user):
    stats = client.get("/api/v1/stats", headers=user["headers"]).json()
    assert stats["total"] == 0
    assert stats["completed_percent"] == 0


def test_health_docs_and_error_format(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").status_code == 200
    assert client.get("/docs").status_code == 200
    spec = client.get("/openapi.json").json()
    assert "/api/v1/tasks/{task_id}/status" in spec["paths"]
    assert spec["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    response = client.get("/missing")
    assert response.status_code == 404
    assert response.json()["request_id"] == response.headers["x-request-id"]
    assert float(response.headers["x-process-time-ms"]) >= 0


def test_persistence_after_app_restart(client, user, task, engine):
    from fastapi.testclient import TestClient

    from app.config import Settings

    with TestClient(create_app(Settings(_env_file=None), engine=engine)) as second:
        response = second.get("/api/v1/tasks/" + task["id"], headers=user["headers"])
        assert response.status_code == 200
        assert response.json()["title"] == task["title"]


def test_database_transaction_rollback(engine, user, subject):
    from sqlalchemy.exc import IntegrityError

    with Session(engine) as db:
        try:
            db.add(
                Task(
                    user_id=UUID(user["id"]),
                    subject_id=UUID(subject["id"]),
                    title="Valid",
                    due_at=utcnow(),
                )
            )
            db.flush()
            db.add(
                Task(user_id=UUID(user["id"]), subject_id=uuid4(), title="Invalid", due_at=utcnow())
            )
            db.commit()
        except IntegrityError:
            db.rollback()
        else:
            pytest.fail("Foreign key constraint was not enforced")
        assert db.scalar(select(func.count(Task.id))) == 0
