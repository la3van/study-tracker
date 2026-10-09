import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from alembic import command
from app.config import Settings
from app.main import create_app
from app.models import Base


@pytest.fixture(scope="session")
def engine():
    """Изолирует тестовые таблицы в отдельной схеме PostgreSQL."""
    url = os.environ.get("TEST_DATABASE_URL", Settings().database_url)
    if not url.startswith("postgresql"):
        raise RuntimeError("Tests require a PostgreSQL TEST_DATABASE_URL")
    schema = "test_" + uuid4().hex
    admin = create_engine(url, poolclass=NullPool, hide_parameters=True)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    test_engine = create_engine(
        url,
        pool_size=1,
        max_overflow=0,
        hide_parameters=True,
        connect_args={"options": f"-csearch_path={schema}", "connect_timeout": 5},
    )
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    try:
        with test_engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield test_engine
    finally:
        test_engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture(autouse=True)
def clean_database(engine):
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture
def client(engine):
    app = create_app(Settings(_env_file=None), engine=engine)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def user(client):
    payload = {"name": "Студент", "email": "student@example.com", "password": "secure-password-123"}
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    response = client.post(
        "/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    return {
        "id": data["user"]["id"],
        "token": data["access_token"],
        "headers": {"Authorization": "Bearer " + data["access_token"]},
    }


@pytest.fixture
def subject(client, user):
    response = client.post("/api/v1/subjects", headers=user["headers"], json={"name": "Математика"})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def task(client, user, subject):
    response = client.post(
        "/api/v1/tasks",
        headers=user["headers"],
        json={
            "subject_id": subject["id"],
            "title": "Решить задачи",
            "due_at": "2030-05-10T18:00:00+03:00",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
