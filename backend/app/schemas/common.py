import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# --- Enums ---

class CameraStatusEnum(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class AlertTypeEnum(str, Enum):
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


class AlertSeverityEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatusEnum(str, Enum):
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    DISMISSED = "dismissed"
    ESCALATED = "escalated"


class ObjectTypeEnum(str, Enum):
    PERSON = "person"
    VEHICLE = "vehicle"
    BIKE = "bike"
    BAG = "bag"
    OTHER = "other"


class EventTypeEnum(str, Enum):
    RELIGIOUS_PROCESSION = "RELIGIOUS_PROCESSION"
    PRAYER_GATHERING = "PRAYER_GATHERING"
    TRIBAL_GATHERING = "TRIBAL_GATHERING"
    EID_CELEBRATION = "EID_CELEBRATION"
    NORMAL = "NORMAL"


class EventStatusEnum(str, Enum):
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


# --- Camera Schemas ---

class CameraBase(BaseModel):
    name: str
    location_lat: float
    location_lng: float
    zone_id: str | None = None
    stream_url: str
    status: CameraStatusEnum = CameraStatusEnum.OFFLINE
    analytics_profile: dict | None = None


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    zone_id: str | None = None
    stream_url: str | None = None
    status: CameraStatusEnum | None = None
    analytics_profile: dict | None = None


class Camera(CameraBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Detection Schema ---

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class Detection(BaseModel):
    id: str
    object_type: ObjectTypeEnum
    confidence: float
    bbox: BoundingBox
    track_id: str | None = None
    attributes: dict | None = None


# --- Alert Schemas ---

class AlertBase(BaseModel):
    alert_type: AlertTypeEnum
    camera_id: uuid.UUID
    timestamp: datetime
    track_id: uuid.UUID | None = None
    confidence: float
    severity: AlertSeverityEnum = AlertSeverityEnum.MEDIUM
    status: AlertStatusEnum = AlertStatusEnum.NEW
    thumbnail_url: str | None = None
    metadata: dict | None = Field(default=None, validation_alias="metadata_")


class AlertCreate(AlertBase):
    pass


class Alert(AlertBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Track Schemas ---

class TrackBase(BaseModel):
    camera_id: uuid.UUID
    start_time: datetime
    end_time: datetime | None = None
    object_type: ObjectTypeEnum
    attributes: dict | None = None
    embedding_ref: str | None = None


class Track(TrackBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- PlateRead Schemas ---

class PlateReadBase(BaseModel):
    track_id: uuid.UUID | None = None
    plate_text: str
    confidence: float
    camera_id: uuid.UUID
    timestamp: datetime
    vehicle_color: str | None = None
    vehicle_type: str | None = None


class PlateRead(PlateReadBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Event Profile Schemas ---

class EventProfileBase(BaseModel):
    name: str
    event_type: EventTypeEnum
    start_time: datetime
    end_time: datetime
    affected_camera_ids: list | None = None
    threshold_overrides: dict | None = None
    suppressed_alert_types: list[str] | None = None
    status: EventStatusEnum = EventStatusEnum.SCHEDULED


class EventProfileCreate(EventProfileBase):
    pass


class EventProfileUpdate(BaseModel):
    name: str | None = None
    event_type: EventTypeEnum | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    affected_camera_ids: list[uuid.UUID] | None = None
    threshold_overrides: dict | None = None
    suppressed_alert_types: list[str] | None = None


class EventProfile(EventProfileBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Search Schemas ---

class SearchQuery(BaseModel):
    query: str | None = None
    camera_ids: list[uuid.UUID] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    object_type: ObjectTypeEnum | None = None
    min_confidence: float = 0.5
    limit: int = Field(default=50, le=200)


class PlateSearchQuery(BaseModel):
    plate_text: str
    camera_ids: list[uuid.UUID] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    limit: int = Field(default=50, le=200)


class AttributeSearchQuery(BaseModel):
    attributes: dict
    camera_ids: list[uuid.UUID] | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    object_type: ObjectTypeEnum | None = None
    limit: int = Field(default=50, le=200)


class SearchResult(BaseModel):
    track_id: uuid.UUID
    camera_id: uuid.UUID
    camera_name: str | None = None
    timestamp: datetime
    object_type: ObjectTypeEnum
    confidence: float
    thumbnail_url: str | None = None
    attributes: dict | None = None


class TrackPathPoint(BaseModel):
    camera_id: uuid.UUID
    camera_name: str | None = None
    timestamp: datetime
    location_lat: float
    location_lng: float


# --- Dashboard / Analytics Schemas ---

class DashboardStats(BaseModel):
    total_cameras: int
    online_cameras: int
    total_alerts_today: int
    critical_alerts: int
    active_tracks: int
    total_plates_today: int


class HeatmapPoint(BaseModel):
    lat: float
    lng: float
    intensity: float


class TrafficStats(BaseModel):
    camera_id: uuid.UUID
    camera_name: str
    vehicle_count: int
    person_count: int
    avg_speed: float | None = None
    period: str


class ActivityDataPoint(BaseModel):
    time: str
    people: int
    vehicles: int


class AlertTrendDataPoint(BaseModel):
    time: str
    intrusion: int = 0
    loitering: int = 0
    crowd: int = 0
    fight: int = 0
    fire: int = 0
    other: int = 0
