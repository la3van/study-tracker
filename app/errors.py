from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def error_response(request: Request, status: int, code: str, message: str, headers=None):
    return JSONResponse(
        status_code=status,
        content={
            "error": {"code": code, "message": message},
            "request_id": getattr(request.state, "request_id", ""),
        },
        headers=headers,
    )


def install_handlers(app):
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
        return error_response(request, exc.status, exc.code, exc.message, headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        fields = sorted({".".join(map(str, item["loc"])) for item in exc.errors()})
        return error_response(
            request, 422, "validation_error", "Некорректные поля: " + ", ".join(fields)
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_response(request, exc.status_code, "http_error", str(exc.detail), exc.headers)

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError):
        return error_response(
            request, 409, "conflict", "Операция нарушает целостность или уникальность данных"
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError):
        return error_response(
            request, 503, "database_unavailable", "База данных временно недоступна"
        )
