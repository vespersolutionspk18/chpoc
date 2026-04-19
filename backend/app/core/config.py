from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Safe City"
    DATABASE_URL: str = "postgresql+asyncpg://postgres@localhost:5432/safecity"
    REDIS_URL: str = "redis://localhost:6379/0"
    AI_SERVICE_URL: str = "http://localhost:8001"
    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    VIDEO_DIR: str = "../test-data/pakistani"
    SIMULATION_MODE: bool = True  # Set to False when running on vast.ai with real videos

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
