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
    plate_image_b64: str | None = None


class PoseKeypoints(BaseModel):
    keypoints: list[list[float]]  # [[x, y, confidence], ...]
    num_keypoints: int


class PersonAttributes(BaseModel):
    gender: str | None = None
    gender_confidence: float | None = None
    age_group: str | None = None
    precise_age: int | None = None
    emotion: str | None = None
    ethnicity: str | None = None
    hair: str | None = None
    upper_clothing: str | None = None
    upper_color: str | None = None
    lower_clothing: str | None = None
    lower_color: str | None = None
    sleeve_length: str | None = None
    clothing_style: str | None = None
    hat: bool | None = None
    glasses: bool | None = None
    bag: bool | None = None
    backpack: bool | None = None
    upscaled_image_b64: str | None = None


class VehicleAttributes(BaseModel):
    make_model: str | None = None
    make_model_confidence: float | None = None
    color: str | None = None
    color_confidence: float | None = None
    vehicle_type: str | None = None
    vehicle_type_confidence: float | None = None
    direction: str | None = None
    condition: str | None = None
    damage_visible: bool | None = None
    vehicle_class: str | None = None
    upscaled_image_b64: str | None = None


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
