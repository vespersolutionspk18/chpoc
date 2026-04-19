"""
Seed script -- populates the safecity database with mock data matching
frontend/src/lib/mock-data.ts so the API serves realistic information.

Run:
    cd backend && python3.10 -m app.seed
"""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertType
from app.models.camera import Camera, CameraStatus
from app.models.event_profile import EventProfile, EventStatus, EventType
from app.models.plate import PlateRead
from app.models.track import ObjectType, Track

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ---------------------------------------------------------------------------
# Deterministic UUIDs so FK references stay consistent
# ---------------------------------------------------------------------------

def _uuid(n: int) -> uuid.UUID:
    return uuid.UUID(f"00000000-0000-4000-8000-{n:012d}")


CAM_IDS = {f"cam-{i:03d}": _uuid(i) for i in range(1, 17)}
TRK_IDS = {f"trk-{n}": _uuid(10000 + n) for n in [
    4421, 4415, 4410, 4405, 4398, 4390, 4385, 4380, 4375, 4370,
    4360, 4355, 4348, 4340, 4332, 4320, 4310, 4305, 4298, 4280, 4275, 4270,
]}


def dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ---------------------------------------------------------------------------
# Cameras (16)
# ---------------------------------------------------------------------------

CAMERAS = [
    dict(id=CAM_IDS["cam-001"], name="Ghafoor Market Main Gate", location_lat=34.1482, location_lng=71.7401, zone_id="zone-market", stream_url="rtsp://10.0.1.11:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"crowd_threshold": 50, "loitering_seconds": 30}),
    dict(id=CAM_IDS["cam-002"], name="Ghafoor Market South", location_lat=34.1475, location_lng=71.7408, zone_id="zone-market", stream_url="rtsp://10.0.1.12:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"crowd_threshold": 40}),
    dict(id=CAM_IDS["cam-003"], name="Bakhshi Pul Bridge", location_lat=34.1520, location_lng=71.7365, zone_id="zone-bridge", stream_url="rtsp://10.0.1.13:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"traffic_mode": True}),
    dict(id=CAM_IDS["cam-004"], name="Charsadda Road Checkpoint", location_lat=34.1555, location_lng=71.7320, zone_id="zone-highway", stream_url="rtsp://10.0.1.14:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"plate_recognition": True, "speed_detection": True}),
    dict(id=CAM_IDS["cam-005"], name="Bacha Khan University Gate", location_lat=34.1610, location_lng=71.7455, zone_id="zone-university", stream_url="rtsp://10.0.1.15:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"face_recognition": True, "crowd_threshold": 100}),
    dict(id=CAM_IDS["cam-006"], name="Bacha Khan University Parking", location_lat=34.1618, location_lng=71.7462, zone_id="zone-university", stream_url="rtsp://10.0.1.16:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"plate_recognition": True}),
    dict(id=CAM_IDS["cam-007"], name="DHQ Hospital Entrance", location_lat=34.1498, location_lng=71.7425, zone_id="zone-hospital", stream_url="rtsp://10.0.1.17:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"crowd_threshold": 30, "abandoned_object": True}),
    dict(id=CAM_IDS["cam-008"], name="DHQ Hospital Emergency", location_lat=34.1502, location_lng=71.7430, zone_id="zone-hospital", stream_url="rtsp://10.0.1.18:554/stream1", status=CameraStatus.DEGRADED, analytics_profile={"crowd_threshold": 20}),
    dict(id=CAM_IDS["cam-009"], name="Motorway Interchange East", location_lat=34.1440, location_lng=71.7280, zone_id="zone-motorway", stream_url="rtsp://10.0.1.19:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"speed_detection": True, "plate_recognition": True}),
    dict(id=CAM_IDS["cam-010"], name="Motorway Interchange West", location_lat=34.1435, location_lng=71.7260, zone_id="zone-motorway", stream_url="rtsp://10.0.1.20:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"speed_detection": True, "plate_recognition": True}),
    dict(id=CAM_IDS["cam-011"], name="Tehsil Bazaar North", location_lat=34.1510, location_lng=71.7390, zone_id="zone-bazaar", stream_url="rtsp://10.0.1.21:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"crowd_threshold": 60, "fight_detection": True}),
    dict(id=CAM_IDS["cam-012"], name="Tehsil Bazaar South", location_lat=34.1505, location_lng=71.7395, zone_id="zone-bazaar", stream_url="rtsp://10.0.1.22:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"crowd_threshold": 60}),
    dict(id=CAM_IDS["cam-013"], name="Shabqadar Road Junction", location_lat=34.1580, location_lng=71.7350, zone_id="zone-shabqadar", stream_url="rtsp://10.0.1.23:554/stream1", status=CameraStatus.DEGRADED, analytics_profile={"traffic_mode": True}),
    dict(id=CAM_IDS["cam-014"], name="Shabqadar Road Mosque", location_lat=34.1590, location_lng=71.7342, zone_id="zone-shabqadar", stream_url="rtsp://10.0.1.24:554/stream1", status=CameraStatus.ONLINE, analytics_profile={"crowd_threshold": 200}),
    dict(id=CAM_IDS["cam-015"], name="Bus Stand Terminal", location_lat=34.1465, location_lng=71.7415, zone_id="zone-transport", stream_url="rtsp://10.0.1.25:554/stream1", status=CameraStatus.OFFLINE, analytics_profile={"crowd_threshold": 80, "abandoned_object": True}),
    dict(id=CAM_IDS["cam-016"], name="District Courts Complex", location_lat=34.1530, location_lng=71.7440, zone_id="zone-courts", stream_url="rtsp://10.0.1.26:554/stream1", status=CameraStatus.OFFLINE, analytics_profile={"face_recognition": True, "weapon_detection": True}),
]

# ---------------------------------------------------------------------------
# Tracks (22) -- created before alerts so FKs are valid
# ---------------------------------------------------------------------------

TRACK_DATA = [
    ("trk-4421", "cam-001", "2026-04-19T11:50:00Z", None, ObjectType.PERSON, {"upper_color": "white", "lower_color": "grey", "bag": True, "glasses": False}),
    ("trk-4415", "cam-011", "2026-04-19T11:48:00Z", None, ObjectType.PERSON, {"upper_color": "black", "lower_color": "black"}),
    ("trk-4410", "cam-005", "2026-04-19T11:45:00Z", None, ObjectType.PERSON, {"upper_color": "green", "lower_color": "blue"}),
    ("trk-4405", "cam-007", "2026-04-19T11:40:00Z", None, ObjectType.PERSON, {"upper_color": "blue", "lower_color": "black", "mask": True, "backpack": True}),
    ("trk-4398", "cam-004", "2026-04-19T11:35:00Z", None, ObjectType.VEHICLE, {"color": "white", "vehicle_type": "sedan", "plate": "KPK-4521"}),
    ("trk-4390", "cam-006", "2026-04-19T11:25:00Z", "2026-04-19T11:30:00Z", ObjectType.PERSON, {"upper_color": "red", "lower_color": "blue"}),
    ("trk-4385", "cam-009", "2026-04-19T11:20:00Z", None, ObjectType.PERSON, {"upper_color": "grey", "lower_color": "black"}),
    ("trk-4380", "cam-007", "2026-04-19T11:18:00Z", "2026-04-19T11:22:00Z", ObjectType.PERSON, {"age_estimate": "elderly"}),
    ("trk-4375", "cam-009", "2026-04-19T11:15:00Z", None, ObjectType.VEHICLE, {"color": "blue", "vehicle_type": "sedan", "plate": "PES-1234"}),
    ("trk-4370", "cam-012", "2026-04-19T11:10:00Z", "2026-04-19T11:17:00Z", ObjectType.PERSON, {"upper_color": "brown", "lower_color": "white", "hat": True}),
    ("trk-4360", "cam-003", "2026-04-19T11:05:00Z", None, ObjectType.PERSON, {"description": "unusual_movement_pattern"}),
    ("trk-4355", "cam-010", "2026-04-19T11:00:00Z", None, ObjectType.VEHICLE, {"color": "black", "vehicle_type": "SUV", "plate": "KPK-7832"}),
    ("trk-4348", "cam-016", "2026-04-19T10:55:00Z", None, ObjectType.PERSON, {"zone": "court_perimeter", "after_hours": True}),
    ("trk-4340", "cam-012", "2026-04-19T10:50:00Z", "2026-04-19T10:57:00Z", ObjectType.PERSON, {"fighting": True}),
    ("trk-4332", "cam-005", "2026-04-19T10:40:00Z", "2026-04-19T10:45:00Z", ObjectType.PERSON, {"upper_color": "green", "lower_color": "blue", "backpack": True, "glasses": True}),
    ("trk-4320", "cam-004", "2026-04-19T09:50:00Z", None, ObjectType.VEHICLE, {"color": "red", "vehicle_type": "motorcycle", "plate": "PES-8876"}),
    ("trk-4310", "cam-006", "2026-04-19T08:55:00Z", "2026-04-19T09:03:00Z", ObjectType.VEHICLE, {"color": "silver", "vehicle_type": "pickup", "plate": "KPK-1156"}),
    ("trk-4305", "cam-008", "2026-04-19T08:50:00Z", None, ObjectType.PERSON, {"location": "hospital_corridor"}),
    ("trk-4298", "cam-009", "2026-04-19T07:55:00Z", "2026-04-19T08:05:00Z", ObjectType.PERSON, {"upper_color": "black", "lower_color": "black", "bag": True}),
    ("trk-4280", "cam-013", "2026-04-19T05:55:00Z", None, ObjectType.VEHICLE, {"color": "blue", "vehicle_type": "truck", "plate": "KPK-2290"}),
    ("trk-4275", "cam-003", "2026-04-19T05:25:00Z", None, ObjectType.BIKE, {"color": "green", "rider_helmet": False}),
    ("trk-4270", "cam-010", "2026-04-19T03:55:00Z", "2026-04-19T04:10:00Z", ObjectType.VEHICLE, {"color": "white", "vehicle_type": "van", "plate": "PES-3347"}),
]

# ---------------------------------------------------------------------------
# Alerts (30) -- matching mock-data.ts exactly
# ---------------------------------------------------------------------------

# helper to map camera string to uuid
def _cam(s: str) -> uuid.UUID:
    return CAM_IDS[s]

def _trk(s: str | None) -> uuid.UUID | None:
    return TRK_IDS.get(s) if s else None

ALERTS = [
    dict(id=_uuid(100001), alert_type=AlertType.CROWD, camera_id=_cam("cam-001"), timestamp=dt("2026-04-19T11:58:00Z"), track_id=None, confidence=0.94, severity=AlertSeverity.CRITICAL, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-001.jpg", metadata_={"count": 78, "threshold": 50}),
    dict(id=_uuid(100002), alert_type=AlertType.WEAPON, camera_id=_cam("cam-016"), timestamp=dt("2026-04-19T11:55:00Z"), track_id=_trk("trk-4421"), confidence=0.87, severity=AlertSeverity.CRITICAL, status=AlertStatus.ESCALATED, thumbnail_url="/thumbnails/alert-002.jpg", metadata_={"weapon_type": "firearm", "action_taken": "police_dispatched"}),
    dict(id=_uuid(100003), alert_type=AlertType.FIGHT, camera_id=_cam("cam-011"), timestamp=dt("2026-04-19T11:52:00Z"), track_id=_trk("trk-4415"), confidence=0.91, severity=AlertSeverity.CRITICAL, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-003.jpg", metadata_={"persons_involved": 4}),
    dict(id=_uuid(100004), alert_type=AlertType.INTRUSION, camera_id=_cam("cam-005"), timestamp=dt("2026-04-19T11:48:00Z"), track_id=_trk("trk-4410"), confidence=0.89, severity=AlertSeverity.HIGH, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-004.jpg", metadata_={"zone": "restricted_area_A"}),
    dict(id=_uuid(100005), alert_type=AlertType.LOITERING, camera_id=_cam("cam-007"), timestamp=dt("2026-04-19T11:45:00Z"), track_id=_trk("trk-4405"), confidence=0.82, severity=AlertSeverity.MEDIUM, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-005.jpg", metadata_={"duration_seconds": 340}),
    dict(id=_uuid(100006), alert_type=AlertType.ABANDONED_OBJECT, camera_id=_cam("cam-015"), timestamp=dt("2026-04-19T11:42:00Z"), track_id=None, confidence=0.78, severity=AlertSeverity.HIGH, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-006.jpg", metadata_={"object_description": "black bag", "duration_seconds": 600}),
    dict(id=_uuid(100007), alert_type=AlertType.TRAFFIC_VIOLATION, camera_id=_cam("cam-004"), timestamp=dt("2026-04-19T11:38:00Z"), track_id=_trk("trk-4398"), confidence=0.95, severity=AlertSeverity.MEDIUM, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-007.jpg", metadata_={"violation": "red_light", "plate": "KPK-4521"}),
    dict(id=_uuid(100008), alert_type=AlertType.FIRE, camera_id=_cam("cam-002"), timestamp=dt("2026-04-19T11:35:00Z"), track_id=None, confidence=0.72, severity=AlertSeverity.HIGH, status=AlertStatus.ESCALATED, thumbnail_url="/thumbnails/alert-008.jpg", metadata_={"smoke_detected": True, "flames_detected": False}),
    dict(id=_uuid(100009), alert_type=AlertType.CROWD, camera_id=_cam("cam-014"), timestamp=dt("2026-04-19T11:32:00Z"), track_id=None, confidence=0.88, severity=AlertSeverity.MEDIUM, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-009.jpg", metadata_={"count": 145, "event_related": True}),
    dict(id=_uuid(100010), alert_type=AlertType.LOITERING, camera_id=_cam("cam-006"), timestamp=dt("2026-04-19T11:28:00Z"), track_id=_trk("trk-4390"), confidence=0.76, severity=AlertSeverity.LOW, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-010.jpg", metadata_={"duration_seconds": 180}),
    dict(id=_uuid(100011), alert_type=AlertType.INTRUSION, camera_id=_cam("cam-009"), timestamp=dt("2026-04-19T11:25:00Z"), track_id=_trk("trk-4385"), confidence=0.91, severity=AlertSeverity.HIGH, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-011.jpg", metadata_={"zone": "motorway_shoulder"}),
    dict(id=_uuid(100012), alert_type=AlertType.FALL, camera_id=_cam("cam-007"), timestamp=dt("2026-04-19T11:22:00Z"), track_id=_trk("trk-4380"), confidence=0.84, severity=AlertSeverity.HIGH, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-012.jpg", metadata_={"age_estimate": "elderly"}),
    dict(id=_uuid(100013), alert_type=AlertType.TRAFFIC_VIOLATION, camera_id=_cam("cam-009"), timestamp=dt("2026-04-19T11:18:00Z"), track_id=_trk("trk-4375"), confidence=0.93, severity=AlertSeverity.MEDIUM, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-013.jpg", metadata_={"violation": "wrong_way", "plate": "PES-1234"}),
    dict(id=_uuid(100014), alert_type=AlertType.LOITERING, camera_id=_cam("cam-012"), timestamp=dt("2026-04-19T11:15:00Z"), track_id=_trk("trk-4370"), confidence=0.80, severity=AlertSeverity.LOW, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-014.jpg", metadata_={"duration_seconds": 210}),
    dict(id=_uuid(100015), alert_type=AlertType.CROWD, camera_id=_cam("cam-011"), timestamp=dt("2026-04-19T11:12:00Z"), track_id=None, confidence=0.86, severity=AlertSeverity.MEDIUM, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-015.jpg", metadata_={"count": 62, "threshold": 60}),
    dict(id=_uuid(100016), alert_type=AlertType.UNKNOWN, camera_id=_cam("cam-003"), timestamp=dt("2026-04-19T11:08:00Z"), track_id=_trk("trk-4360"), confidence=0.65, severity=AlertSeverity.LOW, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-016.jpg", metadata_={"description": "unusual_movement_pattern"}),
    dict(id=_uuid(100017), alert_type=AlertType.TRAFFIC_VIOLATION, camera_id=_cam("cam-010"), timestamp=dt("2026-04-19T11:05:00Z"), track_id=_trk("trk-4355"), confidence=0.97, severity=AlertSeverity.MEDIUM, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-017.jpg", metadata_={"violation": "speeding", "speed_kmh": 112, "limit_kmh": 80, "plate": "KPK-7832"}),
    dict(id=_uuid(100018), alert_type=AlertType.INTRUSION, camera_id=_cam("cam-016"), timestamp=dt("2026-04-19T11:00:00Z"), track_id=_trk("trk-4348"), confidence=0.88, severity=AlertSeverity.HIGH, status=AlertStatus.ESCALATED, thumbnail_url="/thumbnails/alert-018.jpg", metadata_={"zone": "court_perimeter", "after_hours": True}),
    dict(id=_uuid(100019), alert_type=AlertType.FIGHT, camera_id=_cam("cam-012"), timestamp=dt("2026-04-19T10:55:00Z"), track_id=_trk("trk-4340"), confidence=0.79, severity=AlertSeverity.HIGH, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-019.jpg", metadata_={"persons_involved": 2}),
    dict(id=_uuid(100020), alert_type=AlertType.ABANDONED_OBJECT, camera_id=_cam("cam-003"), timestamp=dt("2026-04-19T10:50:00Z"), track_id=None, confidence=0.74, severity=AlertSeverity.MEDIUM, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-020.jpg", metadata_={"object_description": "cardboard_box", "duration_seconds": 420}),
    dict(id=_uuid(100021), alert_type=AlertType.LOITERING, camera_id=_cam("cam-005"), timestamp=dt("2026-04-19T10:45:00Z"), track_id=_trk("trk-4332"), confidence=0.81, severity=AlertSeverity.LOW, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-021.jpg", metadata_={"duration_seconds": 195}),
    dict(id=_uuid(100022), alert_type=AlertType.CROWD, camera_id=_cam("cam-001"), timestamp=dt("2026-04-19T10:00:00Z"), track_id=None, confidence=0.90, severity=AlertSeverity.MEDIUM, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-022.jpg", metadata_={"count": 55, "threshold": 50}),
    dict(id=_uuid(100023), alert_type=AlertType.TRAFFIC_VIOLATION, camera_id=_cam("cam-004"), timestamp=dt("2026-04-19T09:55:00Z"), track_id=_trk("trk-4320"), confidence=0.92, severity=AlertSeverity.LOW, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-023.jpg", metadata_={"violation": "no_helmet", "vehicle": "motorcycle", "plate": "PES-8876"}),
    dict(id=_uuid(100024), alert_type=AlertType.FIRE, camera_id=_cam("cam-013"), timestamp=dt("2026-04-19T09:50:00Z"), track_id=None, confidence=0.68, severity=AlertSeverity.MEDIUM, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-024.jpg", metadata_={"smoke_detected": True, "likely_cooking": True}),
    dict(id=_uuid(100025), alert_type=AlertType.INTRUSION, camera_id=_cam("cam-006"), timestamp=dt("2026-04-19T09:00:00Z"), track_id=_trk("trk-4310"), confidence=0.85, severity=AlertSeverity.MEDIUM, status=AlertStatus.ACKNOWLEDGED, thumbnail_url="/thumbnails/alert-025.jpg", metadata_={"zone": "parking_restricted"}),
    dict(id=_uuid(100026), alert_type=AlertType.FALL, camera_id=_cam("cam-008"), timestamp=dt("2026-04-19T08:55:00Z"), track_id=_trk("trk-4305"), confidence=0.77, severity=AlertSeverity.MEDIUM, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-026.jpg", metadata_={"location": "hospital_corridor"}),
    dict(id=_uuid(100027), alert_type=AlertType.LOITERING, camera_id=_cam("cam-009"), timestamp=dt("2026-04-19T08:00:00Z"), track_id=_trk("trk-4298"), confidence=0.73, severity=AlertSeverity.LOW, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-027.jpg", metadata_={"duration_seconds": 160, "near_toll_booth": True}),
    dict(id=_uuid(100028), alert_type=AlertType.CROWD, camera_id=_cam("cam-014"), timestamp=dt("2026-04-19T07:00:00Z"), track_id=None, confidence=0.92, severity=AlertSeverity.LOW, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-028.jpg", metadata_={"count": 210, "event_type": "friday_prayer", "expected": True}),
    dict(id=_uuid(100029), alert_type=AlertType.TRAFFIC_VIOLATION, camera_id=_cam("cam-013"), timestamp=dt("2026-04-19T06:00:00Z"), track_id=_trk("trk-4280"), confidence=0.89, severity=AlertSeverity.LOW, status=AlertStatus.NEW, thumbnail_url="/thumbnails/alert-029.jpg", metadata_={"violation": "overloading", "vehicle": "truck", "plate": "KPK-2290"}),
    dict(id=_uuid(100030), alert_type=AlertType.UNKNOWN, camera_id=_cam("cam-010"), timestamp=dt("2026-04-19T04:00:00Z"), track_id=_trk("trk-4270"), confidence=0.61, severity=AlertSeverity.LOW, status=AlertStatus.DISMISSED, thumbnail_url="/thumbnails/alert-030.jpg", metadata_={"description": "camera_obstruction_partial"}),
]

# ---------------------------------------------------------------------------
# Event Profiles (8)
# ---------------------------------------------------------------------------

EVENTS = [
    dict(id=_uuid(200001), name="Muharram 9th Tasu'a Procession", event_type=EventType.RELIGIOUS_PROCESSION, start_time=dt("2026-07-16T06:00:00Z"), end_time=dt("2026-07-16T22:00:00Z"), affected_camera_ids=["cam-001", "cam-002", "cam-011", "cam-012", "cam-003"], threshold_overrides={"crowd_threshold": 500, "loitering_seconds": 120}, suppressed_alert_types=["crowd", "loitering"], status=EventStatus.SCHEDULED),
    dict(id=_uuid(200002), name="Muharram 10th Ashura Procession", event_type=EventType.RELIGIOUS_PROCESSION, start_time=dt("2026-07-17T05:00:00Z"), end_time=dt("2026-07-17T23:59:00Z"), affected_camera_ids=["cam-001", "cam-002", "cam-003", "cam-011", "cam-012", "cam-014"], threshold_overrides={"crowd_threshold": 1000, "loitering_seconds": 300}, suppressed_alert_types=["crowd", "loitering"], status=EventStatus.SCHEDULED),
    dict(id=_uuid(200003), name="Friday Juma Prayer", event_type=EventType.PRAYER_GATHERING, start_time=dt("2026-04-18T11:30:00Z"), end_time=dt("2026-04-18T14:00:00Z"), affected_camera_ids=["cam-014"], threshold_overrides={"crowd_threshold": 300}, suppressed_alert_types=["crowd"], status=EventStatus.COMPLETED),
    dict(id=_uuid(200004), name="Eid ul Fitr Day 1", event_type=EventType.EID_CELEBRATION, start_time=dt("2026-03-21T05:00:00Z"), end_time=dt("2026-03-21T22:00:00Z"), affected_camera_ids=["cam-001", "cam-002", "cam-011", "cam-012", "cam-014", "cam-015"], threshold_overrides={"crowd_threshold": 800}, suppressed_alert_types=["crowd", "loitering"], status=EventStatus.COMPLETED),
    dict(id=_uuid(200005), name="Eid ul Adha Day 1", event_type=EventType.EID_CELEBRATION, start_time=dt("2026-05-28T05:00:00Z"), end_time=dt("2026-05-28T22:00:00Z"), affected_camera_ids=["cam-001", "cam-002", "cam-011", "cam-012", "cam-014", "cam-015"], threshold_overrides={"crowd_threshold": 800}, suppressed_alert_types=["crowd", "loitering"], status=EventStatus.SCHEDULED),
    dict(id=_uuid(200006), name="Tribal Jirga at Hujra", event_type=EventType.TRIBAL_GATHERING, start_time=dt("2026-04-20T09:00:00Z"), end_time=dt("2026-04-20T18:00:00Z"), affected_camera_ids=["cam-013", "cam-014"], threshold_overrides={"crowd_threshold": 200}, suppressed_alert_types=["crowd"], status=EventStatus.SCHEDULED),
    dict(id=_uuid(200007), name="Independence Day Celebrations", event_type=EventType.NORMAL, start_time=dt("2026-08-14T06:00:00Z"), end_time=dt("2026-08-14T23:00:00Z"), affected_camera_ids=None, threshold_overrides={"crowd_threshold": 500}, suppressed_alert_types=["crowd"], status=EventStatus.SCHEDULED),
    dict(id=_uuid(200008), name="Normal Operations", event_type=EventType.NORMAL, start_time=dt("2026-04-19T00:00:00Z"), end_time=dt("2026-04-19T23:59:59Z"), affected_camera_ids=None, threshold_overrides=None, suppressed_alert_types=None, status=EventStatus.ACTIVE),
]

# ---------------------------------------------------------------------------
# Plate Reads (sample data from search results that have plates)
# ---------------------------------------------------------------------------

PLATES = [
    dict(id=_uuid(300001), track_id=TRK_IDS["trk-4398"], plate_text="KPK-4521", confidence=0.97, camera_id=_cam("cam-004"), timestamp=dt("2026-04-19T11:38:00Z"), vehicle_color="white", vehicle_type="sedan"),
    dict(id=_uuid(300002), track_id=TRK_IDS["trk-4355"], plate_text="KPK-7832", confidence=0.95, camera_id=_cam("cam-010"), timestamp=dt("2026-04-19T11:05:00Z"), vehicle_color="black", vehicle_type="SUV"),
    dict(id=_uuid(300003), track_id=TRK_IDS["trk-4375"], plate_text="PES-1234", confidence=0.93, camera_id=_cam("cam-009"), timestamp=dt("2026-04-19T11:18:00Z"), vehicle_color="blue", vehicle_type="sedan"),
    dict(id=_uuid(300004), track_id=TRK_IDS["trk-4320"], plate_text="PES-8876", confidence=0.91, camera_id=_cam("cam-004"), timestamp=dt("2026-04-19T09:55:00Z"), vehicle_color="red", vehicle_type="motorcycle"),
    dict(id=_uuid(300005), track_id=TRK_IDS["trk-4310"], plate_text="KPK-1156", confidence=0.86, camera_id=_cam("cam-006"), timestamp=dt("2026-04-19T09:00:00Z"), vehicle_color="silver", vehicle_type="pickup"),
    dict(id=_uuid(300006), track_id=TRK_IDS["trk-4280"], plate_text="KPK-2290", confidence=0.89, camera_id=_cam("cam-013"), timestamp=dt("2026-04-19T06:00:00Z"), vehicle_color="blue", vehicle_type="truck"),
    dict(id=_uuid(300007), track_id=TRK_IDS["trk-4270"], plate_text="PES-3347", confidence=0.77, camera_id=_cam("cam-010"), timestamp=dt("2026-04-19T04:00:00Z"), vehicle_color="white", vehicle_type="van"),
]


# ---------------------------------------------------------------------------
# Main seeding coroutine
# ---------------------------------------------------------------------------

async def seed() -> None:
    async with async_session() as session:
        # --- Cameras ---
        for c in CAMERAS:
            session.add(Camera(**c))
        await session.flush()
        print(f"  Inserted {len(CAMERAS)} cameras")

        # --- Tracks (must come before alerts due to FK) ---
        for trk_key, cam_key, start, end, obj_type, attrs in TRACK_DATA:
            session.add(Track(
                id=TRK_IDS[trk_key],
                camera_id=CAM_IDS[cam_key],
                start_time=dt(start),
                end_time=dt(end) if end else None,
                object_type=obj_type,
                attributes=attrs,
            ))
        await session.flush()
        print(f"  Inserted {len(TRACK_DATA)} tracks")

        # --- Alerts ---
        for a in ALERTS:
            session.add(Alert(**a))
        await session.flush()
        print(f"  Inserted {len(ALERTS)} alerts")

        # --- Event Profiles ---
        for e in EVENTS:
            session.add(EventProfile(**e))
        await session.flush()
        print(f"  Inserted {len(EVENTS)} event profiles")

        # --- Plate Reads ---
        for p in PLATES:
            session.add(PlateRead(**p))
        await session.flush()
        print(f"  Inserted {len(PLATES)} plate reads")

        await session.commit()
        print("Seed complete!")


if __name__ == "__main__":
    print("Seeding safecity database...")
    asyncio.run(seed())
