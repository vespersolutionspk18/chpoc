import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EventType(str, enum.Enum):
    RELIGIOUS_PROCESSION = "RELIGIOUS_PROCESSION"
    PRAYER_GATHERING = "PRAYER_GATHERING"
    TRIBAL_GATHERING = "TRIBAL_GATHERING"
    EID_CELEBRATION = "EID_CELEBRATION"
    NORMAL = "NORMAL"


class EventStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class EventProfile(TimestampMixin, Base):
    __tablename__ = "event_profiles"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    affected_camera_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    threshold_overrides: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    suppressed_alert_types: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus), default=EventStatus.SCHEDULED, nullable=False
    )
