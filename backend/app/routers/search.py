import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.camera import Camera
from app.models.plate import PlateRead
from app.models.track import Track
from app.schemas.common import (
    AttributeSearchQuery,
    PlateSearchQuery,
    SearchResult,
    TrackPathPoint,
)
from app.services.ai_client import ai_client

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/face", response_model=list[SearchResult])
async def search_by_face(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
):
    """Upload a face image to search for matching tracks across cameras."""
    contents = await file.read()
    matches = await ai_client.search_face_by_image(contents)

    results = []
    for match in matches:
        track_id = match.get("track_id")
        if not track_id:
            continue
        result = await db.execute(select(Track).where(Track.id == track_id))
        track = result.scalar_one_or_none()
        if not track:
            continue
        cam_result = await db.execute(select(Camera).where(Camera.id == track.camera_id))
        cam = cam_result.scalar_one_or_none()
        results.append(
            SearchResult(
                track_id=track.id,
                camera_id=track.camera_id,
                camera_name=cam.name if cam else None,
                timestamp=track.start_time,
                object_type=track.object_type,
                confidence=match.get("confidence", 0.0),
                thumbnail_url=match.get("thumbnail_url"),
                attributes=track.attributes,
            )
        )
    return results


@router.post("/plate", response_model=list[SearchResult])
async def search_by_plate(
    query: PlateSearchQuery,
    db: AsyncSession = Depends(get_db),
):
    """Search for plate reads matching the given plate text."""
    stmt = select(PlateRead).where(
        PlateRead.plate_text.ilike(f"%{query.plate_text}%")
    )
    if query.camera_ids:
        stmt = stmt.where(PlateRead.camera_id.in_(query.camera_ids))
    if query.start_time:
        stmt = stmt.where(PlateRead.timestamp >= query.start_time)
    if query.end_time:
        stmt = stmt.where(PlateRead.timestamp <= query.end_time)
    stmt = stmt.order_by(PlateRead.timestamp.desc()).limit(query.limit)

    result = await db.execute(stmt)
    plates = result.scalars().all()

    results = []
    for plate in plates:
        cam_result = await db.execute(select(Camera).where(Camera.id == plate.camera_id))
        cam = cam_result.scalar_one_or_none()
        results.append(
            SearchResult(
                track_id=plate.track_id or plate.id,
                camera_id=plate.camera_id,
                camera_name=cam.name if cam else None,
                timestamp=plate.timestamp,
                object_type="vehicle",
                confidence=plate.confidence,
                attributes={
                    "plate_text": plate.plate_text,
                    "vehicle_color": plate.vehicle_color,
                    "vehicle_type": plate.vehicle_type,
                },
            )
        )
    return results


@router.post("/attributes", response_model=list[SearchResult])
async def search_by_attributes(
    query: AttributeSearchQuery,
    db: AsyncSession = Depends(get_db),
):
    """Search tracks by person/vehicle attributes stored in the JSON attributes column.

    Searches the PostgreSQL JSONB field directly. Supported attribute keys include:
    upper_color, lower_color, hat, glasses, bag, backpack, vehicle_color, vehicle_type.
    """
    stmt = select(Track).where(Track.attributes.isnot(None))

    if query.object_type:
        stmt = stmt.where(Track.object_type == query.object_type.value)
    if query.camera_ids:
        stmt = stmt.where(Track.camera_id.in_(query.camera_ids))
    if query.start_time:
        stmt = stmt.where(Track.start_time >= query.start_time)
    if query.end_time:
        stmt = stmt.where(Track.start_time <= query.end_time)

    # Filter by each attribute key/value in the JSON column
    for key, value in query.attributes.items():
        if isinstance(value, str):
            # Use JSON containment for string values
            stmt = stmt.where(Track.attributes[key].as_string() == value)
        elif isinstance(value, bool):
            stmt = stmt.where(Track.attributes[key].as_boolean() == value)

    stmt = stmt.order_by(Track.start_time.desc()).limit(query.limit)

    result = await db.execute(stmt)
    tracks = result.scalars().all()

    results = []
    for track in tracks:
        cam_result = await db.execute(select(Camera).where(Camera.id == track.camera_id))
        cam = cam_result.scalar_one_or_none()
        results.append(
            SearchResult(
                track_id=track.id,
                camera_id=track.camera_id,
                camera_name=cam.name if cam else None,
                timestamp=track.start_time,
                object_type=track.object_type,
                confidence=track.attributes.get("confidence", 0.0) if track.attributes else 0.0,
                attributes=track.attributes,
            )
        )
    return results


@router.get("/track/{track_id}/path", response_model=list[TrackPathPoint])
async def get_track_path(
    track_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the path of a track across multiple cameras (re-identification)."""
    result = await db.execute(
        select(Track).where(Track.id == track_id)
    )
    track = result.scalar_one_or_none()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Find related tracks via embedding similarity (same person across cameras)
    related_tracks = [track]
    if track.embedding_ref:
        result = await db.execute(
            select(Track)
            .where(Track.embedding_ref == track.embedding_ref)
            .where(Track.id != track.id)
            .order_by(Track.start_time)
        )
        related_tracks.extend(result.scalars().all())

    path = []
    for t in related_tracks:
        cam_result = await db.execute(select(Camera).where(Camera.id == t.camera_id))
        cam = cam_result.scalar_one_or_none()
        if cam:
            path.append(
                TrackPathPoint(
                    camera_id=t.camera_id,
                    camera_name=cam.name,
                    timestamp=t.start_time,
                    location_lat=cam.location_lat,
                    location_lng=cam.location_lng,
                )
            )
    return sorted(path, key=lambda p: p.timestamp)
