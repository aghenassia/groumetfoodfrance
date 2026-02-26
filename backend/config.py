from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_env: str = "development"
    app_secret_key: str = "dev-secret-key"

    database_url: str = "postgresql+asyncpg://crm_user:crm_password@localhost:5432/crm_db"
    database_url_sync: str = "postgresql://crm_user:crm_password@localhost:5432/crm_db"
    redis_url: str = "redis://localhost:6379/0"

    sage_odbc_driver: str = "{ODBC Driver 17 for SQL Server}"
    sage_odbc_server: str = ""
    sage_odbc_database: str = ""
    sage_odbc_user: str = ""
    sage_odbc_password: str = ""

    ringover_api_key: str = ""
    ringover_webhook_secret: str = ""
    ringover_base_url: str = "https://public-api.ringover.com/v2"

    openai_api_key: str = ""
    google_places_api_key: str = ""

    jwt_secret: str = "dev-jwt-secret"
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24
    jwt_refresh_days: int = 7

    model_config = {
        "env_file": [".env", "../.env"],
        "env_file_encoding": "utf-8",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
