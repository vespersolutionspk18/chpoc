import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.core.redis import close_redis, init_redis, redis_client
from app.models.base import Base
from app.routers import alerts, analytics, cameras, events, frames, pipeline, search, video_serve, video_stream, ws
from app.services.ai_client import ai_client
from app.services.video_pipeline import VideoPipeline

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
    redis = await init_redis()
    logger.info("Redis connected")

    # Initialize video pipeline
    video_pipeline = VideoPipeline(
        ai_service_url=settings.AI_SERVICE_URL,
        db_session_factory=async_session_factory,
        redis_client=redis,
        ws_broadcast=ws.broadcast_alert,
    )
    app.state.pipeline = video_pipeline
    logger.info(
        "Video pipeline initialized (simulation_mode=%s)", settings.SIMULATION_MODE
    )

    # Auto-start the pipeline in simulation mode
    if settings.SIMULATION_MODE:
        try:
            result = await video_pipeline.start_all(fps=5)
            logger.info("Pipeline auto-started: %s", result)
        except Exception as e:
            logger.warning("Pipeline auto-start failed (will retry on /api/pipeline/start): %s", e)

    yield

    # Shutdown
    if hasattr(app.state, "pipeline"):
        await app.state.pipeline.stop_all()
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
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Static files for thumbnails/crops
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Routers
app.include_router(cameras.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(frames.router, prefix="/api")
app.include_router(video_serve.router, prefix="/api")
app.include_router(ws.router)
app.include_router(video_stream.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": settings.PROJECT_NAME}
