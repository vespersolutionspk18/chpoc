from pydantic import BaseModel
from enum import Enum
from datetime import datetime


class ObjectClass(str, Enum):
    person = "person"
    vehicle = "vehicle"
    bike = "bike"
    bag = "bag"
    other = "other"


class BoundingBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class Detection(BaseModel):
    track_id: int
    object_class: ObjectClass
    confidence: float
    bbox: BoundingBox
    camera_id: str
    timestamp: datetime
    is_new_track: bool = False


class FaceDetectionResult(BaseModel):
    face_bbox: BoundingBox
    quality_score: float
    embedding: list[float] | None = None


class PlateOCRResult(BaseModel):
    plate_text: str
    confidence: float
    plate_bbox: BoundingBox


class PoseKeypoints(BaseModel):
    keypoints: list[list[float]]  # [[x, y, confidence], ...]
    num_keypoints: int


class PersonAttributes(BaseModel):
    hat: bool | None = None
    glasses: bool | None = None
    mask: bool | None = None
    upper_color: str | None = None
    lower_color: str | None = None
    bag: bool | None = None
    backpack: bool | None = None


class VehicleAttributes(BaseModel):
    color: str | None = None
    vehicle_type: str | None = None
    brand: str | None = None


class ActionClassification(BaseModel):
    action: str
    confidence: float


class AnomalyResult(BaseModel):
    is_anomalous: bool
    anomaly_score: float
    anomaly_type: str | None = None
    description: str | None = None


class InferenceRequest(BaseModel):
    camera_id: str
    frame_index: int
    timestamp: datetime


class InferenceResponse(BaseModel):
    camera_id: str
    frame_index: int
    timestamp: datetime
    detections: list[Detection]
    processing_time_ms: float
