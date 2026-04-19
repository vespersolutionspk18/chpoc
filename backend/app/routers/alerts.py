import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.alert import Alert, AlertStatus
from app.schemas.common import Alert as AlertSchema
from app.schemas.common import AlertSeverityEnum, AlertStatusEnum, AlertTypeEnum

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/", response_model=list[AlertSchema])
async def list_alerts(
    alert_type: AlertTypeEnum | None = None,
    severity: AlertSeverityEnum | None = None,
    status: AlertStatusEnum | None = None,
    camera_id: uuid.UUID | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    query = select(Alert).order_by(Alert.timestamp.desc())
    if alert_type:
        query = query.where(Alert.alert_type == alert_type.value)
    if severity:
        query = query.where(Alert.severity == severity.value)
    if status:
        query = query.where(Alert.status == status.value)
    if camera_id:
        query = query.where(Alert.camera_id == camera_id)
    if start_time:
        query = query.where(Alert.timestamp >= start_time)
    if end_time:
        query = query.where(Alert.timestamp <= end_time)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{alert_id}", response_model=AlertSchema)
async def get_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.put("/{alert_id}/acknowledge", response_model=AlertSchema)
async def acknowledge_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.ACKNOWLEDGED
    await db.flush()
    await db.refresh(alert)
    return alert


@router.put("/{alert_id}/dismiss", response_model=AlertSchema)
async def dismiss_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.DISMISSED
    await db.flush()
    await db.refresh(alert)
    return alert


@router.put("/{alert_id}/escalate", response_model=AlertSchema)
async def escalate_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.ESCALATED
    await db.flush()
    await db.refresh(alert)
    return alert
