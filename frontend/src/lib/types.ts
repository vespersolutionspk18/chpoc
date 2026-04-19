// ---------------------------------------------------------------------------
// Safe City -- shared TypeScript types (mirrors backend Pydantic schemas)
// ---------------------------------------------------------------------------

// Enums matching backend exactly
export type CameraStatus = "online" | "offline" | "degraded";
export type AlertType = "intrusion" | "loitering" | "crowd" | "fight" | "abandoned_object" | "traffic_violation" | "fire" | "weapon" | "fall" | "unknown";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "new" | "acknowledged" | "dismissed" | "escalated";
export type ObjectType = "person" | "vehicle" | "bike" | "bag" | "other";
export type EventType = "RELIGIOUS_PROCESSION" | "PRAYER_GATHERING" | "TRIBAL_GATHERING" | "EID_CELEBRATION" | "NORMAL";
export type EventStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED";
export type SearchQueryType = "face" | "plate" | "attributes";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Camera {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  zone_id: string | null;
  stream_url: string;
  status: CameraStatus;
  analytics_profile: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Detection {
  id: string;
  object_type: ObjectType;
  confidence: number;
  bbox: BoundingBox;
  track_id: string | null;
  attributes: Record<string, unknown> | null;
}

export interface Alert {
  id: string;
  alert_type: AlertType;
  camera_id: string;
  timestamp: string;
  track_id: string | null;
  confidence: number;
  severity: AlertSeverity;
  status: AlertStatus;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PathPoint {
  lat: number;
  lng: number;
  timestamp: string;
}

export interface Track {
  id: string;
  camera_id: string;
  start_time: string;
  end_time: string | null;
  object_type: ObjectType;
  attributes: Record<string, unknown> | null;
  embedding_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlateRead {
  id: string;
  track_id: string | null;
  plate_text: string;
  confidence: number;
  camera_id: string;
  timestamp: string;
  vehicle_color: string | null;
  vehicle_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventProfile {
  id: string;
  name: string;
  event_type: EventType;
  start_time: string;
  end_time: string;
  affected_camera_ids: string[] | null;
  threshold_overrides: Record<string, unknown> | null;
  suppressed_alert_types: AlertType[] | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_cameras: number;
  online_cameras: number;
  total_alerts_today: number;
  critical_alerts: number;
  active_tracks: number;
  total_plates_today: number;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
}

export interface TrafficStats {
  camera_id: string;
  camera_name: string;
  vehicle_count: number;
  person_count: number;
  avg_speed: number | null;
  period: string;
}

export interface TrackPathPoint {
  camera_id: string;
  camera_name: string | null;
  timestamp: string;
  location_lat: number;
  location_lng: number;
}

export interface PersonAttributes {
  hat: boolean | null;
  glasses: boolean | null;
  mask: boolean | null;
  upper_color: string | null;
  lower_color: string | null;
  bag: boolean | null;
  backpack: boolean | null;
}

export interface VehicleAttributes {
  color: string | null;
  vehicle_type: string | null;
  brand: string | null;
}

export interface SearchQuery {
  query_type: SearchQueryType;
  face_image?: File;
  plate_text?: string;
  attributes?: Record<string, unknown>;
  camera_ids?: string[];
  start_time?: string;
  end_time?: string;
  min_confidence?: number;
  limit?: number;
}

export interface SearchResult {
  track_id: string;
  camera_id: string;
  camera_name: string | null;
  timestamp: string;
  object_type: ObjectType;
  confidence: number;
  thumbnail_url: string | null;
  attributes: Record<string, unknown> | null;
}

export interface PlateSearchQuery {
  plate_text: string;
  camera_ids?: string[];
  start_time?: string;
  end_time?: string;
  limit?: number;
}

export interface AttributeSearchQuery {
  attributes: Record<string, unknown>;
  camera_ids?: string[];
  start_time?: string;
  end_time?: string;
  object_type?: ObjectType;
  limit?: number;
}

// Chart data types
export interface ActivityDataPoint {
  time: string;
  people: number;
  vehicles: number;
}

export interface AlertTrendDataPoint {
  time: string;
  intrusion: number;
  loitering: number;
  crowd: number;
  fight: number;
  fire: number;
  other: number;
}
