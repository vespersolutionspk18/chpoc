import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AlertType(str, enum.Enum):
    INTRUSION = "intrusion"
    LOITERING = "loitering"
    CROWD = "crowd"
    FIGHT = "fight"
    ABANDONED_OBJECT = "abandoned_object"
    TRAFFIC_VIOLATION = "traffic_violation"
    FIRE = "fire"
    WEAPON = "weapon"
    FALL = "fall"
    UNKNOWN = "unknown"


class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    DISMISSED = "dismissed"
    ESCALATED = "escalated"


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"

    alert_type: Mapped[AlertType] = mapped_column(Enum(AlertType), nullable=False)
    camera_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cameras.id"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    track_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracks.id"), nullable=True
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity), default=AlertSeverity.MEDIUM, nullable=False
    )
    status: Mapped[AlertStatus] = mapped_column(
        Enum(AlertStatus), default=AlertStatus.NEW, nullable=False
    )
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
