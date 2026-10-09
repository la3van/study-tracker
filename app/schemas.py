from datetime import datetime, timezone
from typing import Annotated, Generic, TypeVar
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import Priority, TaskStatus

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(max_length=10000)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
    request_id: str


class Credentials(Input):
    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class Register(Credentials):
    name: Name


class UserOut(Output):
    id: UUID
    name: str
    email: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut


class SubjectCreate(Input):
    name: Name
    description: Description = ""


class PatchInput(Input):
    @model_validator(mode="after")
    def require_values(self):
        if not self.model_fields_set:
            raise ValueError("Передайте хотя бы одно поле")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Поля не могут быть null")
        return self


class SubjectPatch(PatchInput):
    name: Name | None = None
    description: Description | None = None


class SubjectOut(Output):
    id: UUID
    name: str
    description: str
    created_at: datetime


class TaskCreate(Input):
    subject_id: UUID
    title: Title
    description: Description = ""
    due_at: AwareDatetime
    priority: Priority = Priority.MEDIUM

    @field_validator("due_at")
    @classmethod
    def normalize_date(cls, value: datetime) -> datetime:
        return value.astimezone(timezone.utc)


class TaskPatch(PatchInput):
    subject_id: UUID | None = None
    title: Title | None = None
    description: Description | None = None
    due_at: AwareDatetime | None = None
    priority: Priority | None = None


class StatusUpdate(Input):
    status: TaskStatus


class TaskOut(Output):
    id: UUID
    subject_id: UUID
    title: str
    description: str
    due_at: datetime
    priority: Priority
    status: TaskStatus
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ItemCreate(Input):
    title: Title
    position: int = Field(default=0, ge=0, le=1000000)


class ItemPatch(PatchInput):
    title: Title | None = None
    position: int | None = Field(default=None, ge=0, le=1000000)
    is_completed: bool | None = None


class ItemOut(Output):
    id: UUID
    task_id: UUID
    title: str
    is_completed: bool
    position: int
    created_at: datetime


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class StatsOut(BaseModel):
    total: int
    todo: int
    in_progress: int
    done: int
    overdue: int
    completed_percent: float
    as_of: datetime
