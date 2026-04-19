import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ObjectType(str, enum.Enum):
    PERSON = "person"
    VEHICLE = "vehicle"
    BIKE = "bike"
    BAG = "bag"
    OTHER = "other"


class Track(TimestampMixin, Base):
    __tablename__ = "tracks"

    camera_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cameras.id"), nullable=False
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    object_type: Mapped[ObjectType] = mapped_column(Enum(ObjectType), nullable=False)
    attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    embedding_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
