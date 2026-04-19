"""
Video processing pipeline for Safe City.

Orchestrates frame reading, AI detection, tracking, alerting, and broadcasting.
Supports both real video processing (via OpenCV) and simulation mode for local dev.
"""

import asyncio
import json
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Coroutine

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.alert import Alert as AlertModel, AlertSeverity, AlertStatus, AlertType
from app.models.camera import Camera as CameraModel, CameraStatus
from app.models.plate import PlateRead as PlateModel
from app.models.track import Track as TrackModel, ObjectType

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pakistani plate & name generators for realistic simulation data
# ---------------------------------------------------------------------------

_PAKISTAN_CITIES = ["LHR", "ISB", "KHI", "PSH", "RWP", "FSD", "MUL", "QTA", "CHR", "ABT"]
_PLATE_FORMATS = [
    lambda: f"{random.choice(_PAKISTAN_CITIES)}-{random.randint(100,9999)}",
    lambda: f"{random.choice(['A','B','C','D','E','F','G'])}{random.choice(['A','B','C','D'])}-{random.randint(1000,9999)}",
    lambda: f"{random.choice(_PAKISTAN_CITIES[:5])}{random.choice(['A','B','C'])}-{random.randint(100,999)}",
]

_UPPER_COLORS = ["white", "black", "blue", "red", "green", "brown", "grey", "beige"]
_LOWER_COLORS = ["black", "blue", "grey", "brown", "beige", "white", "khaki"]
_VEHICLE_TYPES = ["sedan", "suv", "truck", "bus", "rickshaw", "motorcycle", "van", "pickup"]
_VEHICLE_COLORS = ["white", "black", "silver", "red", "blue", "green", "grey", "brown"]

# Default camera configs for simulation when no DB cameras exist
DEFAULT_CAMERAS = [
    {"name": "Peshawar GT Road", "lat": 34.0151, "lng": 71.5249, "zone": "zone-A"},
    {"name": "Peshawar Saddar Bazaar", "lat": 34.0123, "lng": 71.5785, "zone": "zone-A"},
    {"name": "Peshawar Hayatabad", "lat": 34.0013, "lng": 71.4434, "zone": "zone-B"},
    {"name": "Rawalpindi Murree Road", "lat": 33.5651, "lng": 73.0169, "zone": "zone-C"},
    {"name": "Charsadda Main Road", "lat": 34.1482, "lng": 71.7406, "zone": "zone-D"},
]


def _compute_iou(box_a: dict, box_b: dict) -> float:
    """Compute IoU between two bounding boxes {x, y, w, h}."""
    ax1, ay1 = box_a["x"], box_a["y"]
    ax2, ay2 = ax1 + box_a["w"], ay1 + box_a["h"]
    bx1, by1 = box_b["x"], box_b["y"]
    bx2, by2 = bx1 + box_b["w"], by1 + box_b["h"]

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_area = max(0, inter_x2 - inter_x1) * max(0, inter_y2 - inter_y1)

    area_a = box_a["w"] * box_a["h"]
    area_b = box_b["w"] * box_b["h"]
    union = area_a + area_b - inter_area
    return inter_area / union if union > 0 else 0.0


class SimpleTracker:
    """IoU-based tracker that maintains track IDs across frames."""

    def __init__(self, iou_threshold: float = 0.3, max_age: int = 30):
        self.tracks: dict[int, dict] = {}  # track_id -> track info
        self.next_id: int = 0
        self.iou_threshold = iou_threshold
        self.max_age = max_age

    def update(self, detections: list[dict]) -> list[tuple[int, dict, bool]]:
        """Match detections to existing tracks, create new ones, retire old ones.

        Returns list of (track_id, detection, is_new) tuples.
        """
        now = datetime.now(timezone.utc)
        results: list[tuple[int, dict, bool]] = []

        # Build cost matrix (negative IoU) between existing tracks and detections
        track_ids = list(self.tracks.keys())
        matched_tracks: set[int] = set()
        matched_dets: set[int] = set()

        # Greedy IoU matching (simple but effective for POC)
        pairs: list[tuple[float, int, int]] = []
        for ti, tid in enumerate(track_ids):
            t = self.tracks[tid]
            for di, det in enumerate(detections):
                det_bbox = det.get("bbox", {})
                iou = _compute_iou(t["bbox"], det_bbox)
                if iou >= self.iou_threshold:
                    # Only match same class
                    if t.get("object_class") == det.get("object_class"):
                        pairs.append((iou, ti, di))

        # Sort by IoU descending and greedily assign
        pairs.sort(key=lambda x: x[0], reverse=True)
        for iou, ti, di in pairs:
            tid = track_ids[ti]
            if tid in matched_tracks or di in matched_dets:
                continue
            matched_tracks.add(tid)
            matched_dets.add(di)
            # Update existing track
            det = detections[di]
            self.tracks[tid]["bbox"] = det.get("bbox", {})
            self.tracks[tid]["age"] = 0
            self.tracks[tid]["last_seen"] = now
            self.tracks[tid]["confidence"] = det.get("confidence", 0)
            results.append((tid, det, False))

        # Create new tracks for unmatched detections
        for di, det in enumerate(detections):
            if di in matched_dets:
                continue
            tid = self.next_id
            self.next_id += 1
            self.tracks[tid] = {
                "bbox": det.get("bbox", {}),
                "object_class": det.get("object_class", "other"),
                "age": 0,
                "first_seen": now,
                "last_seen": now,
                "confidence": det.get("confidence", 0),
            }
            results.append((tid, det, True))

        # Age unmatched tracks and retire old ones
        to_remove = []
        for tid in track_ids:
            if tid not in matched_tracks:
                self.tracks[tid]["age"] += 1
                if self.tracks[tid]["age"] > self.max_age:
                    to_remove.append(tid)
        for tid in to_remove:
            del self.tracks[tid]

        return results

    def get_track_duration(self, track_id: int) -> float:
        """Return track duration in seconds."""
        t = self.tracks.get(track_id)
        if not t:
            return 0.0
        return (t["last_seen"] - t["first_seen"]).total_seconds()


class VideoPipeline:
    """Main video processing pipeline orchestrator."""

    def __init__(
        self,
        ai_service_url: str,
        db_session_factory: async_sessionmaker[AsyncSession],
        redis_client: Any,
        ws_broadcast: Callable[[dict], Coroutine] | None = None,
    ):
        self.ai_url = ai_service_url.rstrip("/")
        self.db_factory = db_session_factory
        self.redis = redis_client
        self.ws_broadcast = ws_broadcast
        self.processors: dict[str, asyncio.Task] = {}  # camera_id -> Task
        self.trackers: dict[str, SimpleTracker] = {}
        self.http_client: httpx.AsyncClient | None = None
        self._running = True
        self._camera_uuids: dict[str, uuid.UUID] = {}  # cam short id -> DB UUID
        self._simulation = settings.SIMULATION_MODE
        self._frame_counts: dict[str, int] = {}
        self._alert_cooldowns: dict[str, datetime] = {}  # type:cam -> last alert time

    async def _get_client(self) -> httpx.AsyncClient:
        if self.http_client is None or self.http_client.is_closed:
            self.http_client = httpx.AsyncClient(timeout=30.0)
        return self.http_client

    # ------------------------------------------------------------------
    # Camera management
    # ------------------------------------------------------------------

    async def ensure_cameras_exist(self) -> list[dict]:
        """Ensure demo cameras exist in the DB, return list of camera info dicts.

        Uses the actual database UUID as the camera key everywhere (Redis, tracker, etc.)
        so that the frontend can look up detection data by camera UUID directly.
        """
        cameras_info = []
        async with self.db_factory() as session:
            result = await session.execute(select(CameraModel))
            existing = result.scalars().all()

            if existing:
                for cam in existing:
                    cam_key = str(cam.id)  # Use UUID as the key
                    cameras_info.append({
                        "key": cam_key,
                        "id": cam.id,
                        "name": cam.name,
                        "stream_url": cam.stream_url,
                    })
                    self._camera_uuids[cam_key] = cam.id
            else:
                # Create default cameras
                for i, cfg in enumerate(DEFAULT_CAMERAS):
                    cam = CameraModel(
                        id=uuid.uuid4(),
                        name=cfg["name"],
                        location_lat=cfg["lat"],
                        location_lng=cfg["lng"],
                        zone_id=cfg["zone"],
                        stream_url=f"file://{settings.VIDEO_DIR}/video_{i+1}.mp4",
                        status=CameraStatus.ONLINE,
                    )
                    session.add(cam)
                    cam_key = str(cam.id)
                    cameras_info.append({
                        "key": cam_key,
                        "id": cam.id,
                        "name": cam.name,
                        "stream_url": cam.stream_url,
                    })
                    self._camera_uuids[cam_key] = cam.id
                await session.commit()
                logger.info("Created %d default cameras", len(DEFAULT_CAMERAS))

        return cameras_info

    # ------------------------------------------------------------------
    # Pipeline control
    # ------------------------------------------------------------------

    async def start_all(self, fps: int = 5) -> dict:
        """Start processing all cameras."""
        cameras = await self.ensure_cameras_exist()
        started = []
        for cam in cameras:
            cam_key = cam["key"]
            if cam_key not in self.processors or self.processors[cam_key].done():
                await self.start_camera(cam_key, cam.get("stream_url", ""), fps=fps)
                started.append(cam_key)
        return {"started": started, "total": len(cameras)}

    async def start_camera(self, camera_id: str, video_path: str = "", fps: int = 5):
        """Start processing a single camera feed."""
        if camera_id in self.processors and not self.processors[camera_id].done():
            logger.warning("Camera %s already processing", camera_id)
            return

        use_simulation = self._simulation
        if not use_simulation and video_path:
            # Check if video file actually exists
            clean_path = video_path.replace("file://", "")
            if not Path(clean_path).exists():
                logger.info("Video file not found for %s (%s), using simulation", camera_id, clean_path)
                use_simulation = True

        if use_simulation:
            task = asyncio.create_task(self._simulate_camera(camera_id, fps))
        else:
            task = asyncio.create_task(self._process_video(camera_id, video_path, fps))

        self.processors[camera_id] = task
        self.trackers[camera_id] = SimpleTracker()
        self._frame_counts[camera_id] = 0
        logger.info("Started camera %s (simulation=%s)", camera_id, use_simulation)

    async def stop_camera(self, camera_id: str):
        """Stop processing a single camera."""
        task = self.processors.pop(camera_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.trackers.pop(camera_id, None)
        logger.info("Stopped camera %s", camera_id)

    async def stop_all(self):
        """Stop all camera processors."""
        self._running = False
        for cam_id in list(self.processors.keys()):
            await self.stop_camera(cam_id)
        if self.http_client and not self.http_client.is_closed:
            await self.http_client.aclose()
        logger.info("All pipeline processors stopped")

    def get_status(self) -> dict:
        """Get status of all processors."""
        status = {}
        for cam_id, task in self.processors.items():
            status[cam_id] = {
                "running": not task.done(),
                "frames_processed": self._frame_counts.get(cam_id, 0),
                "active_tracks": len(self.trackers[cam_id].tracks) if cam_id in self.trackers else 0,
                "camera_db_id": str(self._camera_uuids.get(cam_id, "")),
            }
        return status

    # ------------------------------------------------------------------
    # Real video processing (for vast.ai with actual video files)
    # ------------------------------------------------------------------

    async def _process_video(self, camera_id: str, video_path: str, fps: int):
        """Main processing loop for one camera using real video."""
        try:
            import cv2
        except ImportError:
            logger.warning("OpenCV not available, falling back to simulation for %s", camera_id)
            await self._simulate_camera(camera_id, fps)
            return

        clean_path = video_path.replace("file://", "")
        cap = cv2.VideoCapture(clean_path)
        if not cap.isOpened():
            logger.error("Cannot open video: %s", clean_path)
            return

        source_fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_skip = max(1, int(source_fps / fps))
        tracker = self.trackers.get(camera_id, SimpleTracker())
        self.trackers[camera_id] = tracker
        frame_count = 0

        try:
            while self._running:
                ret, frame = cap.read()
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop video
                    continue

                frame_count += 1
                if frame_count % frame_skip != 0:
                    continue

                self._frame_counts[camera_id] = frame_count

                # 1. Detect objects via AI service
                detections = await self._detect_real(frame, camera_id)

                # 2. Update tracker
                tracked = tracker.update(detections)

                # 3. Process new tracks
                for track_id, det, is_new in tracked:
                    if is_new:
                        await self._process_new_track_real(camera_id, track_id, det, frame)

                # 4. Check alerts
                await self._check_alerts(camera_id, detections, tracker)

                # 5. Broadcast frame results
                await self._broadcast_frame(camera_id, frame_count, detections, tracked)

                # 6. Update Redis stats
                await self._update_stats(camera_id, detections)

                await asyncio.sleep(1.0 / fps)
        except asyncio.CancelledError:
            pass
        finally:
            cap.release()

    async def _detect_real(self, frame, camera_id: str) -> list[dict]:
        """Send frame to AI service for detection."""
        try:
            import cv2
            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            client = await self._get_client()
            files = {"image": ("frame.jpg", buf.tobytes(), "image/jpeg")}
            data = {"camera_id": camera_id}
            resp = await client.post(f"{self.ai_url}/detect", files=files, data=data)
            if resp.status_code == 200:
                result = resp.json()
                return result.get("detections", result) if isinstance(result, dict) else result
        except Exception as e:
            logger.warning("Detection failed for %s: %s", camera_id, e)
        return []

    async def _process_new_track_real(self, camera_id: str, track_id: int, detection: dict, frame):
        """Process a new track from real video -- face/plate extraction + DB storage."""
        try:
            import cv2
        except ImportError:
            return

        obj_type = detection.get("object_class", "other")
        bbox = detection.get("bbox", {})
        x = int(bbox.get("x", 0))
        y = int(bbox.get("y", 0))
        w = int(bbox.get("w", 50))
        h = int(bbox.get("h", 50))
        x, y = max(0, x), max(0, y)
        crop = frame[y:y+h, x:x+w]
        if crop.size == 0:
            return

        _, crop_buf = cv2.imencode('.jpg', crop)
        crop_bytes = crop_buf.tobytes()

        cam_uuid = self._camera_uuids.get(camera_id, uuid.uuid4())
        attributes: dict[str, Any] = {"confidence": detection.get("confidence", 0)}

        async with self.db_factory() as session:
            # Map string to enum
            obj_enum = self._map_object_type(obj_type)
            track = TrackModel(
                id=uuid.uuid4(),
                camera_id=cam_uuid,
                start_time=datetime.now(timezone.utc),
                object_type=obj_enum,
                attributes=attributes,
            )
            session.add(track)

            if obj_type == "person":
                await self._extract_face_real(track, crop_bytes)
            elif obj_type == "vehicle":
                await self._extract_plate_real(session, track, crop_bytes, cam_uuid)

            await session.commit()

    async def _extract_face_real(self, track: TrackModel, crop_bytes: bytes):
        """Call AI face detection on a person crop."""
        try:
            client = await self._get_client()
            resp = await client.post(
                f"{self.ai_url}/face/detect",
                files={"image": ("crop.jpg", crop_bytes, "image/jpeg")},
            )
            if resp.status_code == 200:
                faces = resp.json()
                if faces:
                    face_info = faces[0] if isinstance(faces, list) else faces
                    track.attributes = {
                        **(track.attributes or {}),
                        "face_detected": True,
                        "face_quality": face_info.get("quality_score", 0),
                    }
                    # Try to get embedding
                    try:
                        resp2 = await client.post(
                            f"{self.ai_url}/face/embed",
                            files={"image": ("crop.jpg", crop_bytes, "image/jpeg")},
                        )
                        if resp2.status_code == 200:
                            emb_data = resp2.json()
                            if emb_data.get("embedding"):
                                track.embedding_ref = f"face:{track.id}"
                    except Exception:
                        pass
        except Exception as e:
            logger.debug("Face detection failed: %s", e)

    async def _extract_plate_real(
        self, session: AsyncSession, track: TrackModel, crop_bytes: bytes, cam_uuid: uuid.UUID
    ):
        """Call AI plate reading on a vehicle crop."""
        try:
            client = await self._get_client()
            resp = await client.post(
                f"{self.ai_url}/plate/read",
                files={"image": ("crop.jpg", crop_bytes, "image/jpeg")},
            )
            if resp.status_code == 200:
                plate_data = resp.json()
                if plate_data.get("plate_text"):
                    plate = PlateModel(
                        id=uuid.uuid4(),
                        track_id=track.id,
                        plate_text=plate_data["plate_text"],
                        confidence=plate_data.get("confidence", 0),
                        camera_id=cam_uuid,
                        timestamp=datetime.now(timezone.utc),
                        vehicle_color=plate_data.get("vehicle_color"),
                        vehicle_type=plate_data.get("vehicle_type"),
                    )
                    session.add(plate)
        except Exception as e:
            logger.debug("Plate reading failed: %s", e)

    # ------------------------------------------------------------------
    # Simulation mode (no video files needed)
    # ------------------------------------------------------------------

    async def _simulate_camera(self, camera_id: str, fps: int):
        """Generate simulated detections for a camera without real video."""
        tracker = self.trackers.get(camera_id, SimpleTracker())
        self.trackers[camera_id] = tracker
        frame_count = 0
        logger.info("Starting simulation for camera %s at %d FPS", camera_id, fps)

        # Initialize persistent scene objects that move smoothly across frames
        scene = self._init_scene(camera_id)

        try:
            while self._running:
                frame_count += 1
                self._frame_counts[camera_id] = frame_count

                # Generate detections from the persistent scene
                detections = self._step_scene(scene, camera_id, frame_count)

                # Update tracker
                tracked = tracker.update(detections)

                # Process new tracks (simulated) -- only store every Nth new track to avoid DB flood
                for track_id, det, is_new in tracked:
                    if is_new and random.random() < 0.15:
                        await self._process_new_track_simulated(camera_id, track_id, det)

                # Check alerts
                await self._check_alerts(camera_id, detections, tracker)

                # Broadcast frame results
                await self._broadcast_frame(camera_id, frame_count, detections, tracked)

                # Update Redis stats
                await self._update_stats(camera_id, detections)

                await asyncio.sleep(1.0 / fps)

        except asyncio.CancelledError:
            logger.info("Simulation cancelled for camera %s", camera_id)

    def _init_scene(self, camera_id: str) -> dict:
        """Create persistent scene objects for a camera simulation."""
        # Camera ID is now a UUID string. Extract a stable number from it.
        # For deterministic UUIDs like "00000000-0000-4000-8000-000000000001" the
        # last segment gives us 1-16.  For random UUIDs we hash to get a number.
        try:
            cam_num = int(camera_id.split("-")[-1]) or 1
        except (ValueError, IndexError):
            cam_num = hash(camera_id) % 5 + 1
        base_people = [8, 12, 5, 10, 3][min(cam_num - 1, 4)]
        base_vehicles = [4, 2, 1, 8, 2][min(cam_num - 1, 4)]

        scene: dict = {"people": [], "vehicles": [], "bikes": []}

        for _ in range(base_people):
            scene["people"].append({
                "x": random.uniform(50, 1800),
                "y": random.uniform(200, 900),
                "w": random.uniform(40, 100),
                "h": random.uniform(80, 200),
                "vx": random.uniform(-5, 5),  # velocity
                "vy": random.uniform(-2, 2),
                "ttl": random.randint(30, 300),  # time-to-live in frames
            })

        for _ in range(base_vehicles):
            scene["vehicles"].append({
                "x": random.uniform(100, 1600),
                "y": random.uniform(300, 800),
                "w": random.uniform(100, 300),
                "h": random.uniform(60, 180),
                "vx": random.uniform(-10, 10),
                "vy": random.uniform(-1, 1),
                "ttl": random.randint(20, 200),
            })

        if random.random() < 0.5:
            scene["bikes"].append({
                "x": random.uniform(100, 1700),
                "y": random.uniform(300, 800),
                "w": random.uniform(60, 120),
                "h": random.uniform(50, 100),
                "vx": random.uniform(-8, 8),
                "vy": random.uniform(-2, 2),
                "ttl": random.randint(30, 150),
            })

        return scene

    def _step_scene(self, scene: dict, camera_id: str, frame_index: int) -> list[dict]:
        """Advance scene by one frame and return detections."""
        detections = []

        for category, obj_class in [("people", "person"), ("vehicles", "vehicle"), ("bikes", "bike")]:
            to_remove = []
            for i, obj in enumerate(scene[category]):
                # Decrease TTL
                obj["ttl"] -= 1
                if obj["ttl"] <= 0:
                    to_remove.append(i)
                    continue

                # Move object with small random perturbation
                obj["x"] += obj["vx"] + random.gauss(0, 1)
                obj["y"] += obj["vy"] + random.gauss(0, 0.5)

                # Bounce off edges
                if obj["x"] < 0 or obj["x"] + obj["w"] > 1920:
                    obj["vx"] *= -1
                    obj["x"] = max(0, min(obj["x"], 1920 - obj["w"]))
                if obj["y"] < 0 or obj["y"] + obj["h"] > 1080:
                    obj["vy"] *= -1
                    obj["y"] = max(0, min(obj["y"], 1080 - obj["h"]))

                detections.append({
                    "object_class": obj_class,
                    "confidence": round(random.uniform(0.65, 0.98), 3),
                    "bbox": {"x": obj["x"], "y": obj["y"], "w": obj["w"], "h": obj["h"]},
                })

            # Remove expired objects (iterate in reverse)
            for i in reversed(to_remove):
                scene[category].pop(i)

            # Occasionally spawn new objects
            try:
                cam_num = int(camera_id.split("-")[-1]) or 1
            except (ValueError, IndexError):
                cam_num = hash(camera_id) % 5 + 1
            if category == "people" and random.random() < 0.08:
                scene["people"].append({
                    "x": random.choice([0, 1920]) + random.gauss(0, 50),
                    "y": random.uniform(200, 900),
                    "w": random.uniform(40, 100),
                    "h": random.uniform(80, 200),
                    "vx": random.uniform(-5, 5),
                    "vy": random.uniform(-2, 2),
                    "ttl": random.randint(30, 300),
                })
            elif category == "vehicles" and random.random() < 0.05:
                scene["vehicles"].append({
                    "x": random.choice([0, 1920]) + random.gauss(0, 30),
                    "y": random.uniform(300, 800),
                    "w": random.uniform(100, 300),
                    "h": random.uniform(60, 180),
                    "vx": random.uniform(-10, 10),
                    "vy": random.uniform(-1, 1),
                    "ttl": random.randint(20, 200),
                })
            elif category == "bikes" and random.random() < 0.02:
                scene["bikes"].append({
                    "x": random.choice([0, 1920]) + random.gauss(0, 30),
                    "y": random.uniform(300, 800),
                    "w": random.uniform(60, 120),
                    "h": random.uniform(50, 100),
                    "vx": random.uniform(-8, 8),
                    "vy": random.uniform(-2, 2),
                    "ttl": random.randint(30, 150),
                })

        return detections

    async def _process_new_track_simulated(self, camera_id: str, track_id: int, detection: dict):
        """Create DB records for a simulated new track."""
        obj_type = detection.get("object_class", "other")
        cam_uuid = self._camera_uuids.get(camera_id)
        if not cam_uuid:
            return

        obj_enum = self._map_object_type(obj_type)
        attributes: dict[str, Any] = {
            "confidence": detection.get("confidence", 0),
            "simulated": True,
        }

        try:
            async with self.db_factory() as session:
                db_track = TrackModel(
                    id=uuid.uuid4(),
                    camera_id=cam_uuid,
                    start_time=datetime.now(timezone.utc),
                    object_type=obj_enum,
                    attributes=attributes,
                )

                if obj_type == "person":
                    # Simulate person attributes
                    has_face = random.random() < 0.4
                    person_attrs = {
                        "face_detected": has_face,
                        "upper_color": random.choice(_UPPER_COLORS),
                        "lower_color": random.choice(_LOWER_COLORS),
                        "hat": random.random() < 0.15,
                        "glasses": random.random() < 0.2,
                        "bag": random.random() < 0.3,
                        "backpack": random.random() < 0.2,
                    }
                    if has_face:
                        person_attrs["face_quality"] = round(random.uniform(0.3, 0.95), 2)
                        db_track.embedding_ref = f"face:{db_track.id}"
                    attributes.update(person_attrs)
                    db_track.attributes = attributes

                elif obj_type == "vehicle":
                    veh_color = random.choice(_VEHICLE_COLORS)
                    veh_type = random.choice(_VEHICLE_TYPES)
                    attributes.update({
                        "vehicle_color": veh_color,
                        "vehicle_type": veh_type,
                    })
                    db_track.attributes = attributes

                session.add(db_track)
                await session.flush()  # flush track first so FK exists for plate_reads

                # Simulate plate read for vehicles (30% chance)
                if obj_type == "vehicle" and random.random() < 0.3:
                    plate_text = random.choice(_PLATE_FORMATS)()
                    plate = PlateModel(
                        id=uuid.uuid4(),
                        track_id=db_track.id,
                        plate_text=plate_text,
                        confidence=round(random.uniform(0.6, 0.98), 2),
                        camera_id=cam_uuid,
                        timestamp=datetime.now(timezone.utc),
                        vehicle_color=attributes.get("vehicle_color"),
                        vehicle_type=attributes.get("vehicle_type"),
                    )
                    session.add(plate)

                await session.commit()

        except Exception as e:
            logger.warning("Failed to store simulated track for %s: %s", camera_id, e)

    # ------------------------------------------------------------------
    # Alert checking (shared between real and simulation modes)
    # ------------------------------------------------------------------

    async def _check_alerts(self, camera_id: str, detections: list[dict], tracker: SimpleTracker):
        """Check rule-based alerts."""
        person_count = sum(1 for d in detections if d.get("object_class") == "person")
        alerts_to_create: list[dict] = []

        # Crowd alert: >15 persons in a single frame
        if person_count > 15:
            cooldown_key = f"crowd:{camera_id}"
            if self._can_alert(cooldown_key, cooldown_seconds=30):
                alerts_to_create.append({
                    "alert_type": "crowd",
                    "severity": "critical" if person_count > 25 else ("high" if person_count > 20 else "medium"),
                    "confidence": min(0.95, person_count / 30),
                    "metadata": {"person_count": person_count},
                })

        # Loitering: person track > 60 seconds
        for tid, tinfo in tracker.tracks.items():
            if tinfo.get("object_class") == "person":
                duration = tracker.get_track_duration(tid)
                if duration > 60:
                    cooldown_key = f"loitering:{camera_id}:{tid}"
                    if self._can_alert(cooldown_key, cooldown_seconds=120):
                        alerts_to_create.append({
                            "alert_type": "loitering",
                            "severity": "medium",
                            "confidence": min(0.9, duration / 120),
                            "metadata": {"track_id": tid, "duration_seconds": round(duration, 1)},
                        })

        # Random low-frequency alerts for demo realism
        if random.random() < 0.003:
            alert_type = random.choice(["intrusion", "abandoned_object", "traffic_violation"])
            cooldown_key = f"{alert_type}:{camera_id}"
            if self._can_alert(cooldown_key, cooldown_seconds=60):
                alerts_to_create.append({
                    "alert_type": alert_type,
                    "severity": random.choice(["low", "medium", "high"]),
                    "confidence": round(random.uniform(0.6, 0.95), 2),
                    "metadata": {},
                })

        # Very rare high-severity alerts
        if random.random() < 0.0005:
            alert_type = random.choice(["fire", "weapon", "fight"])
            cooldown_key = f"{alert_type}:{camera_id}"
            if self._can_alert(cooldown_key, cooldown_seconds=300):
                alerts_to_create.append({
                    "alert_type": alert_type,
                    "severity": "critical",
                    "confidence": round(random.uniform(0.7, 0.92), 2),
                    "metadata": {},
                })

        # Store and broadcast alerts
        for alert_data in alerts_to_create:
            await self._create_alert(camera_id, alert_data)

    def _can_alert(self, key: str, cooldown_seconds: int = 30) -> bool:
        """Prevent alert spam with per-type cooldowns."""
        now = datetime.now(timezone.utc)
        last = self._alert_cooldowns.get(key)
        if last and (now - last).total_seconds() < cooldown_seconds:
            return False
        self._alert_cooldowns[key] = now
        return True

    async def _create_alert(self, camera_id: str, alert_data: dict):
        """Store an alert in DB and broadcast via WebSocket."""
        cam_uuid = self._camera_uuids.get(camera_id)
        if not cam_uuid:
            return

        try:
            alert_type_str = alert_data["alert_type"]
            # Map string to AlertType enum
            try:
                alert_type_enum = AlertType(alert_type_str)
            except ValueError:
                alert_type_enum = AlertType.UNKNOWN

            try:
                severity_enum = AlertSeverity(alert_data.get("severity", "medium"))
            except ValueError:
                severity_enum = AlertSeverity.MEDIUM

            async with self.db_factory() as session:
                alert = AlertModel(
                    id=uuid.uuid4(),
                    alert_type=alert_type_enum,
                    camera_id=cam_uuid,
                    timestamp=datetime.now(timezone.utc),
                    confidence=alert_data["confidence"],
                    severity=severity_enum,
                    status=AlertStatus.NEW,
                    metadata_=alert_data.get("metadata"),
                )
                session.add(alert)
                await session.commit()

                alert_dict = {
                    "type": "alert",
                    "id": str(alert.id),
                    "alert_type": alert_type_str,
                    "camera_id": str(cam_uuid),
                    "camera_key": camera_id,
                    "timestamp": alert.timestamp.isoformat(),
                    "confidence": alert.confidence,
                    "severity": alert_data.get("severity", "medium"),
                    "status": "new",
                    "metadata": alert_data.get("metadata", {}),
                }

                # Broadcast via WebSocket
                if self.ws_broadcast:
                    try:
                        await self.ws_broadcast(alert_dict)
                    except Exception as e:
                        logger.debug("WS broadcast failed: %s", e)

                # Also store latest alert in Redis for polling
                if self.redis:
                    try:
                        await self.redis.lpush("alerts:recent", json.dumps(alert_dict, default=str))
                        await self.redis.ltrim("alerts:recent", 0, 99)  # keep last 100
                    except Exception:
                        pass

                logger.info(
                    "ALERT [%s] %s on %s (confidence=%.2f)",
                    alert_data.get("severity", "?").upper(),
                    alert_type_str,
                    camera_id,
                    alert.confidence,
                )

        except Exception as e:
            logger.warning("Failed to create alert for %s: %s", camera_id, e)

    # ------------------------------------------------------------------
    # Broadcasting and stats
    # ------------------------------------------------------------------

    async def _broadcast_frame(
        self, camera_id: str, frame_index: int, detections: list[dict], tracked: list
    ):
        """Store frame detection data in Redis for frontend consumption."""
        if not self.redis:
            return

        person_count = sum(1 for d in detections if d.get("object_class") == "person")
        vehicle_count = sum(1 for d in detections if d.get("object_class") == "vehicle")
        tracker = self.trackers.get(camera_id)

        frame_data = {
            "camera_id": camera_id,
            "camera_db_id": str(self._camera_uuids.get(camera_id, "")),
            "frame_index": frame_index,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "detection_count": len(detections),
            "person_count": person_count,
            "vehicle_count": vehicle_count,
            "active_tracks": len(tracker.tracks) if tracker else 0,
            "detections": detections[:25],  # limit for bandwidth
        }

        try:
            await self.redis.set(
                f"frame:{camera_id}",
                json.dumps(frame_data, default=str),
                ex=10,  # expire after 10 seconds
            )
            # Also add to the set of active cameras
            await self.redis.sadd("active_cameras", camera_id)
            await self.redis.expire("active_cameras", 30)
        except Exception as e:
            logger.debug("Redis frame store failed: %s", e)

    async def _update_stats(self, camera_id: str, detections: list[dict]):
        """Update real-time aggregate stats in Redis."""
        if not self.redis:
            return

        try:
            person_count = sum(1 for d in detections if d.get("object_class") == "person")
            vehicle_count = sum(1 for d in detections if d.get("object_class") == "vehicle")
            bike_count = sum(1 for d in detections if d.get("object_class") == "bike")

            pipe = self.redis.pipeline()
            pipe.hincrby("stats:total_people", camera_id, person_count)
            pipe.hincrby("stats:total_vehicles", camera_id, vehicle_count)
            pipe.hincrby("stats:total_bikes", camera_id, bike_count)
            pipe.hset("stats:current_people", camera_id, person_count)
            pipe.hset("stats:current_vehicles", camera_id, vehicle_count)
            pipe.hincrby("stats:frames_processed", camera_id, 1)
            await pipe.execute()
        except Exception as e:
            logger.debug("Redis stats update failed: %s", e)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _map_object_type(type_str: str) -> ObjectType:
        """Map a string object type to the SQLAlchemy enum."""
        mapping = {
            "person": ObjectType.PERSON,
            "vehicle": ObjectType.VEHICLE,
            "bike": ObjectType.BIKE,
            "bag": ObjectType.BAG,
        }
        return mapping.get(type_str, ObjectType.OTHER)
