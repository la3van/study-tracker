from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://tracker:tracker@localhost:5432/study_tracker"
    session_ttl_hours: int = Field(default=168, ge=1, le=720)
    cors_origins: list[str] = ["http://localhost:5173"]
    log_level: str = "INFO"
