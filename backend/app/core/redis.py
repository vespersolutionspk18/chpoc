from collections.abc import AsyncGenerator

import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    global redis_client
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return redis_client


async def close_redis() -> None:
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    if redis_client is None:
        raise RuntimeError("Redis not initialized")
    yield redis_client
