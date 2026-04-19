import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.event_profile import EventProfile, EventStatus
from app.schemas.common import EventProfile as EventProfileSchema
from app.schemas.common import EventProfileCreate, EventProfileUpdate

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=list[EventProfileSchema])
async def list_events(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(EventProfile).order_by(EventProfile.start_time.desc())
    if status:
        query = query.where(EventProfile.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=EventProfileSchema, status_code=201)
async def create_event(data: EventProfileCreate, db: AsyncSession = Depends(get_db)):
    event = EventProfile(**data.model_dump())
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


@router.put("/{event_id}", response_model=EventProfileSchema)
async def update_event(
    event_id: uuid.UUID, data: EventProfileUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(EventProfile).where(EventProfile.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event profile not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    await db.flush()
    await db.refresh(event)
    return event


@router.post("/{event_id}/activate", response_model=EventProfileSchema)
async def activate_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EventProfile).where(EventProfile.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event profile not found")
    event.status = EventStatus.ACTIVE
    await db.flush()
    await db.refresh(event)
    return event


@router.post("/{event_id}/deactivate", response_model=EventProfileSchema)
async def deactivate_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EventProfile).where(EventProfile.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event profile not found")
    event.status = EventStatus.COMPLETED
    await db.flush()
    await db.refresh(event)
    return event
