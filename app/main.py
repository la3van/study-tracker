import logging
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import Settings
from app.database import DB, make_engine, make_session_factory
from app.errors import error_response, install_handlers
from app.routers import auth, checklist, overview, subjects, tasks
from app.schemas import ErrorResponse

logger = logging.getLogger("study_tracker")


def create_app(settings: Settings | None = None, engine=None) -> FastAPI:
    """Создаёт приложение с независимыми настройками и подключением к базе."""
    settings = settings or Settings()
    engine = engine if engine is not None else make_engine(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        engine.dispose()

    app = FastAPI(
        title="Study Tracker API",
        version="1.0.0",
        description="Личный трекер учебных заданий. Все даты передаются с часовым поясом; ответы используют UTC.",
        lifespan=lifespan,
        responses={code: {"model": ErrorResponse} for code in (401, 404, 409, 422, 500, 503)},
    )
    app.state.settings = settings
    app.state.session_factory = make_session_factory(engine)
    app.state.engine = engine
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
    )
    install_handlers(app)

    @app.middleware("http")
    async def track_request(request: Request, call_next):
        start = perf_counter()
        request.state.request_id = uuid4().hex
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error(
                "request_id=%s failure_type=%s", request.state.request_id, type(exc).__name__
            )
            response = error_response(request, 500, "internal_error", "Внутренняя ошибка сервера")
        elapsed = (perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Process-Time-Ms"] = f"{elapsed:.3f}"
        response.headers["Cache-Control"] = "no-store"
        logger.info(
            "request_id=%s method=%s status=%s duration_ms=%.3f",
            request.state.request_id,
            request.method,
            response.status_code,
            elapsed,
        )
        return response

    @app.get("/health", tags=["Состояние"], summary="Проверка процесса сервера")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["Состояние"], summary="Проверка доступности базы")
    def ready(db: DB) -> dict[str, str]:
        db.execute(text("SELECT 1"))
        return {"status": "ready"}

    for router in (auth.router, subjects.router, tasks.router, checklist.router, overview.router):
        app.include_router(router, prefix="/api/v1")
    return app


settings = Settings()
logging.basicConfig(
    level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
app = create_app(settings)
