from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.alert import Alert, AlertSeverity
from app.models.camera import Camera, CameraStatus
from app.models.plate import PlateRead
from app.models.track import Track
from app.schemas.common import DashboardStats, HeatmapPoint, TrafficStats

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Summary stats for the main dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_cameras = (await db.execute(select(func.count(Camera.id)))).scalar() or 0
    online_cameras = (
        await db.execute(
            select(func.count(Camera.id)).where(Camera.status == CameraStatus.ONLINE)
        )
    ).scalar() or 0

    total_alerts_today = (
        await db.execute(
            select(func.count(Alert.id)).where(Alert.timestamp >= today_start)
        )
    ).scalar() or 0

    critical_alerts = (
        await db.execute(
            select(func.count(Alert.id)).where(
                Alert.timestamp >= today_start,
                Alert.severity == AlertSeverity.CRITICAL,
            )
        )
    ).scalar() or 0

    # Active tracks = tracks with no end_time or ended in last 5 minutes
    active_tracks = (
        await db.execute(
            select(func.count(Track.id)).where(
                (Track.end_time.is_(None))
                | (Track.end_time >= now - timedelta(minutes=5))
            )
        )
    ).scalar() or 0

    total_plates_today = (
        await db.execute(
            select(func.count(PlateRead.id)).where(PlateRead.timestamp >= today_start)
        )
    ).scalar() or 0

    return DashboardStats(
        total_cameras=total_cameras,
        online_cameras=online_cameras,
        total_alerts_today=total_alerts_today,
        critical_alerts=critical_alerts,
        active_tracks=active_tracks,
        total_plates_today=total_plates_today,
    )


@router.get("/heatmap", response_model=list[HeatmapPoint])
async def heatmap_data(
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Crowd density heatmap based on track counts per camera location."""
    now = datetime.now(timezone.utc)
    if not start_time:
        start_time = now - timedelta(hours=1)
    if not end_time:
        end_time = now

    # Count tracks per camera in the time window
    stmt = (
        select(Track.camera_id, func.count(Track.id).label("count"))
        .where(Track.start_time >= start_time, Track.start_time <= end_time)
        .group_by(Track.camera_id)
    )
    result = await db.execute(stmt)
    counts = result.all()

    # Map camera locations to intensity
    max_count = max((c[1] for c in counts), default=1)
    points = []
    for camera_id, count in counts:
        cam_result = await db.execute(select(Camera).where(Camera.id == camera_id))
        cam = cam_result.scalar_one_or_none()
        if cam:
            points.append(
                HeatmapPoint(
                    lat=cam.location_lat,
                    lng=cam.location_lng,
                    intensity=count / max_count,
                )
            )
    return points


@router.get("/traffic", response_model=list[TrafficStats])
async def traffic_stats(
    period: str = Query(default="1h", regex="^(1h|6h|24h|7d)$"),
    db: AsyncSession = Depends(get_db),
):
    """Traffic flow stats per camera."""
    now = datetime.now(timezone.utc)
    delta_map = {"1h": timedelta(hours=1), "6h": timedelta(hours=6), "24h": timedelta(hours=24), "7d": timedelta(days=7)}
    since = now - delta_map.get(period, timedelta(hours=1))

    # Get all cameras
    cameras_result = await db.execute(select(Camera))
    cameras = cameras_result.scalars().all()

    stats = []
    for cam in cameras:
        vehicle_count = (
            await db.execute(
                select(func.count(Track.id)).where(
                    Track.camera_id == cam.id,
                    Track.start_time >= since,
                    Track.object_type.in_(["vehicle", "bike"]),
                )
            )
        ).scalar() or 0

        person_count = (
            await db.execute(
                select(func.count(Track.id)).where(
                    Track.camera_id == cam.id,
                    Track.start_time >= since,
                    Track.object_type == "person",
                )
            )
        ).scalar() or 0

        stats.append(
            TrafficStats(
                camera_id=cam.id,
                camera_name=cam.name,
                vehicle_count=vehicle_count,
                person_count=person_count,
                avg_speed=None,
                period=period,
            )
        )
    return stats
