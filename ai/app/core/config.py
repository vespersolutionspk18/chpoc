from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MODEL_DIR: str = "/models"
    DEVICE: str = "cuda"
    BATCH_SIZE: int = 16
    CONFIDENCE_THRESHOLD: float = 0.5
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    USE_REAL_MODELS: bool = True
    VIDEO_DIR: str = "/data/videos"

    model_config = {"env_prefix": "", "env_file": ".env", "extra": "ignore"}


settings = Settings()
