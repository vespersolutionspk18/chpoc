import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine
from app.core.redis import close_redis, init_redis
from app.models.base import Base
from app.routers import alerts, analytics, cameras, events, search, ws
from app.services.ai_client import ai_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting %s...", settings.PROJECT_NAME)

    # Create tables (dev convenience -- use Alembic migrations in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready")

    # Init Redis
    await init_redis()
    logger.info("Redis connected")

    yield

    # Shutdown
    await ai_client.close()
    await close_redis()
    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for thumbnails/crops
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Routers
app.include_router(cameras.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(ws.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": settings.PROJECT_NAME}
