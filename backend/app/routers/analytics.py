from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.alert import Alert, AlertSeverity, AlertType
from app.models.camera import Camera, CameraStatus
from app.models.plate import PlateRead
from app.models.track import Track
from app.models.track import ObjectType
from app.schemas.common import ActivityDataPoint, AlertTrendDataPoint, DashboardStats, HeatmapPoint, TrafficStats

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
    period: str = Query(default="1h", pattern="^(1h|6h|24h|7d)$"),
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


@router.get("/activity", response_model=list[ActivityDataPoint])
async def activity_data(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Return hourly person/vehicle counts for the activity chart."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)

    # Query tracks grouped by hour and object type
    stmt = (
        select(
            func.date_trunc("hour", Track.start_time).label("hour"),
            Track.object_type,
            func.count(Track.id).label("cnt"),
        )
        .where(Track.start_time >= since)
        .group_by("hour", Track.object_type)
        .order_by("hour")
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Build a dict keyed by hour string
    hour_map: dict[str, dict[str, int]] = {}
    for h in range(hours):
        t = since + timedelta(hours=h)
        key = t.strftime("%H:00")
        hour_map[key] = {"people": 0, "vehicles": 0}

    for hour_dt, obj_type, cnt in rows:
        key = hour_dt.strftime("%H:00")
        if key not in hour_map:
            hour_map[key] = {"people": 0, "vehicles": 0}
        if obj_type in (ObjectType.PERSON,):
            hour_map[key]["people"] += cnt
        elif obj_type in (ObjectType.VEHICLE, ObjectType.BIKE):
            hour_map[key]["vehicles"] += cnt

    return [
        ActivityDataPoint(time=k, people=v["people"], vehicles=v["vehicles"])
        for k, v in hour_map.items()
    ]


@router.get("/alert-trends", response_model=list[AlertTrendDataPoint])
async def alert_trends(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    """Return hourly alert counts by type for the trend chart."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)

    stmt = (
        select(
            func.date_trunc("hour", Alert.timestamp).label("hour"),
            Alert.alert_type,
            func.count(Alert.id).label("cnt"),
        )
        .where(Alert.timestamp >= since)
        .group_by("hour", Alert.alert_type)
        .order_by("hour")
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Map alert types to trend categories
    TYPE_MAP = {
        AlertType.INTRUSION: "intrusion",
        AlertType.LOITERING: "loitering",
        AlertType.CROWD: "crowd",
        AlertType.FIGHT: "fight",
        AlertType.FIRE: "fire",
    }

    hour_map: dict[str, dict[str, int]] = {}
    for h in range(hours):
        t = since + timedelta(hours=h)
        key = t.strftime("%H:00")
        hour_map[key] = {"intrusion": 0, "loitering": 0, "crowd": 0, "fight": 0, "fire": 0, "other": 0}

    for hour_dt, alert_type, cnt in rows:
        key = hour_dt.strftime("%H:00")
        if key not in hour_map:
            hour_map[key] = {"intrusion": 0, "loitering": 0, "crowd": 0, "fight": 0, "fire": 0, "other": 0}
        category = TYPE_MAP.get(alert_type, "other")
        hour_map[key][category] += cnt

    return [
        AlertTrendDataPoint(time=k, **v)
        for k, v in hour_map.items()
    ]
