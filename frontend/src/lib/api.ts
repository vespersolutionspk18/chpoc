// ---------------------------------------------------------------------------
// Safe City -- API client (covers all backend endpoints with /api prefix)
// ---------------------------------------------------------------------------

import type {
  ActivityDataPoint,
  Alert,
  AlertTrendDataPoint,
  AttributeSearchQuery,
  Camera,
  DashboardStats,
  Detection,
  EventProfile,
  HeatmapPoint,
  PlateSearchQuery,
  SearchResult,
  TrackPathPoint,
  TrafficStats,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------

export const getCameras = (status?: string, zone_id?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (zone_id) params.set("zone_id", zone_id);
  const qs = params.toString();
  return request<Camera[]>(`/api/cameras${qs ? `?${qs}` : ""}`);
};

export const getCamera = (id: string) =>
  request<Camera>(`/api/cameras/${id}`);

export const createCamera = (data: Partial<Camera>) =>
  request<Camera>("/api/cameras", { method: "POST", body: JSON.stringify(data) });

export const updateCamera = (id: string, data: Partial<Camera>) =>
  request<Camera>(`/api/cameras/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteCamera = (id: string) =>
  request<void>(`/api/cameras/${id}`, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const getAlerts = (params?: {
  alert_type?: string;
  severity?: string;
  status?: string;
  camera_id?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}) => {
  const qs = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) qs.set(k, String(v));
    });
  }
  const q = qs.toString();
  return request<Alert[]>(`/api/alerts${q ? `?${q}` : ""}`);
};

export const getAlert = (id: string) =>
  request<Alert>(`/api/alerts/${id}`);

export const acknowledgeAlert = (id: string) =>
  request<Alert>(`/api/alerts/${id}/acknowledge`, { method: "PUT" });

export const dismissAlert = (id: string) =>
  request<Alert>(`/api/alerts/${id}/dismiss`, { method: "PUT" });

export const escalateAlert = (id: string) =>
  request<Alert>(`/api/alerts/${id}/escalate`, { method: "PUT" });

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchByFace = async (file: File): Promise<SearchResult[]> => {
  const form = new FormData();
  form.append("image", file);
  form.append("top_k", "30");
  try {
    const resp = await fetch(`${BASE_URL}/api/video/search-face-by-image`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.matches ?? []).map((m: Record<string, unknown>, i: number) => ({
      track_id: `match-${i}`,
      camera_id: (m.camera_id as string) ?? "",
      camera_name: ((m.video_file as string) ?? "").replace("clip_", "").replace(".mp4", "").replace(/_/g, " "),
      timestamp: new Date(((m.timestamp_sec as number) ?? 0) * 1000).toISOString(),
      object_type: "person",
      confidence: (m.similarity as number) ?? 0,
      thumbnail_url: m.thumbnail_b64 ? `data:image/jpeg;base64,${m.thumbnail_b64}` : undefined,
      attributes: { video_file: m.video_file, frame: m.frame_num },
    }));
  } catch { return []; }
};

export const searchByPlate = (query: PlateSearchQuery) =>
  request<SearchResult[]>("/api/search/plate", { method: "POST", body: JSON.stringify(query) });

export const searchByAttributes = (query: AttributeSearchQuery) =>
  request<SearchResult[]>("/api/search/attributes", { method: "POST", body: JSON.stringify(query) });

export const getTrackPath = (trackId: string) =>
  request<TrackPathPoint[]>(`/api/search/track/${trackId}/path`);

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const getDashboardStats = () =>
  request<DashboardStats>("/api/analytics/dashboard");

export const getHeatmapData = (startTime?: string, endTime?: string) => {
  const params = new URLSearchParams();
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);
  const qs = params.toString();
  return request<HeatmapPoint[]>(`/api/analytics/heatmap${qs ? `?${qs}` : ""}`);
};

export const getTrafficStats = (period: string = "24h") =>
  request<TrafficStats[]>(`/api/analytics/traffic?period=${period}`);

export const getActivityData = (hours: number = 24) =>
  request<ActivityDataPoint[]>(`/api/analytics/activity?hours=${hours}`);

export const getAlertTrends = (hours: number = 24) =>
  request<AlertTrendDataPoint[]>(`/api/analytics/alert-trends?hours=${hours}`);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const getEvents = (status?: string) =>
  request<EventProfile[]>(`/api/events${status ? `?status=${status}` : ""}`);

export const createEvent = (data: Partial<EventProfile>) =>
  request<EventProfile>("/api/events", { method: "POST", body: JSON.stringify(data) });

export const updateEvent = (id: string, data: Partial<EventProfile>) =>
  request<EventProfile>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const activateEvent = (id: string) =>
  request<EventProfile>(`/api/events/${id}/activate`, { method: "POST" });

export const deactivateEvent = (id: string) =>
  request<EventProfile>(`/api/events/${id}/deactivate`, { method: "POST" });

// ---------------------------------------------------------------------------
// Pipeline control
// ---------------------------------------------------------------------------

export const startPipeline = () =>
  request<{ status: string; cameras: number }>("/api/pipeline/start", { method: "POST" });

export const stopPipeline = () =>
  request<{ status: string }>("/api/pipeline/stop", { method: "POST" });

export const getPipelineStatus = () =>
  request<Record<string, { running: boolean }>>("/api/pipeline/status");

// ---------------------------------------------------------------------------
// Live frame data
// ---------------------------------------------------------------------------

export interface FrameData {
  camera_id: string;
  frame_index: number;
  timestamp: string;
  detection_count: number;
  detections: Detection[];
}

export const getFrameData = (cameraId: string) =>
  request<FrameData>(`/api/frames/${cameraId}`);

export const getAllFrames = () =>
  request<Record<string, FrameData>>("/api/frames");

// ---------------------------------------------------------------------------
// Video analysis (interactive camera viewer)
// ---------------------------------------------------------------------------

export const detectFrame = (blob: Blob, cameraId: string) => {
  const form = new FormData();
  form.append("image", blob, "frame.jpg");
  form.append("camera_id", cameraId);
  return postForm<Detection[]>("/api/video/detect-frame", form);
};

export const analyzePerson = (blob: Blob) => {
  const form = new FormData();
  form.append("image", blob, "crop.jpg");
  return postForm<Record<string, unknown>>("/api/video/analyze-person", form);
};

export const analyzeVehicle = (blob: Blob) => {
  const form = new FormData();
  form.append("image", blob, "crop.jpg");
  return postForm<Record<string, unknown>>("/api/video/analyze-vehicle", form);
};
