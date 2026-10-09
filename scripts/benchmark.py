"""Проверяет НФ6 на запущенном API с временным пользователем и 1000 заданиями."""

import argparse
import json
import math
import os
import platform
import secrets
from datetime import timedelta
from statistics import median
from uuid import uuid4

import httpx
from sqlalchemy import delete, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.database import make_engine
from app.models import AuthSession, Subject, Task, User, utcnow
from app.security import hasher


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--requests", type=int, default=200)
    args = parser.parse_args()
    if args.requests < 100:
        parser.error("Use at least 100 requests")
    engine = make_engine(Settings().database_url)
    user_id, subject_id = uuid4(), uuid4()
    email = f"benchmark-{user_id.hex}@example.com"
    password = secrets.token_urlsafe(24)
    now = utcnow()
    try:
        with Session(engine) as db:
            database_version = db.scalar(text("SELECT version()"))
            db.add(
                User(id=user_id, name="Benchmark", email=email, password_hash=hasher.hash(password))
            )
            db.flush()
            db.add(Subject(id=subject_id, user_id=user_id, name="Benchmark"))
            db.flush()
            for index in range(1000):
                db.add(
                    Task(
                        user_id=user_id,
                        subject_id=subject_id,
                        title=f"Task {index:04}",
                        description="A study assignment",
                        due_at=now + timedelta(days=index % 60 - 30),
                        priority=("low", "medium", "high")[index % 3],
                    )
                )
                if index % 25 == 24:
                    db.flush()
            db.commit()
        engine.dispose()
        cases = [
            {},
            {"priority": "high"},
            {"deadline": "overdue"},
            {"q": "Task 00"},
            {"sort": "priority", "order": "desc", "page_size": 100},
        ]
        samples = []
        with httpx.Client(base_url=args.base_url, timeout=30, trust_env=False) as client:
            response = client.post(
                "/api/v1/auth/login", json={"email": email, "password": password}
            )
            response.raise_for_status()
            client.headers["Authorization"] = "Bearer " + response.json()["access_token"]
            for index in range(args.requests + 20):
                response = client.get("/api/v1/tasks", params=cases[index % len(cases)])
                response.raise_for_status()
                if index >= 20:
                    samples.append(float(response.headers["X-Process-Time-Ms"]))
            client.post("/api/v1/auth/logout").raise_for_status()
        p95 = sorted(samples)[math.ceil(0.95 * len(samples)) - 1]
        result = {
            "tasks": 1000,
            "users": 1,
            "concurrency": 1,
            "requests": len(samples),
            "warmup_requests": 20,
            "metric": "X-Process-Time-Ms; server processing, excluding network transfer",
            "median_ms": round(median(samples), 3),
            "p95_ms": p95,
            "max_ms": max(samples),
            "threshold_ms": 500,
            "passed": p95 <= 500,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "logical_cpus_reported": os.cpu_count(),
            "database": database_version,
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result["passed"] else 1
    finally:
        with Session(engine) as db:
            db.execute(delete(Task).where(Task.user_id == user_id))
            db.execute(delete(Subject).where(Subject.user_id == user_id))
            db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
            db.execute(delete(User).where(User.id == user_id))
            db.commit()
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
