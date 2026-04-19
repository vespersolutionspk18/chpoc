import enum
import uuid

from sqlalchemy import Enum, Float, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CameraStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class Camera(TimestampMixin, Base):
    __tablename__ = "cameras"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location_lat: Mapped[float] = mapped_column(Float, nullable=False)
    location_lng: Mapped[float] = mapped_column(Float, nullable=False)
    zone_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stream_url: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[CameraStatus] = mapped_column(
        Enum(CameraStatus), default=CameraStatus.OFFLINE, nullable=False
    )
    analytics_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
