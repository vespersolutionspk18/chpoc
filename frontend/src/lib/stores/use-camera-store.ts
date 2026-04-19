import { create } from "zustand";
import type { Camera, CameraStatus } from "@/lib/types";

interface CameraState {
  cameras: Camera[];
  selectedCameraId: string | null;
  statusFilter: CameraStatus | "all";
  zoneFilter: string | "all";
  setCameras: (cameras: Camera[]) => void;
  selectCamera: (cameraId: string | null) => void;
  setStatusFilter: (filter: CameraStatus | "all") => void;
  setZoneFilter: (filter: string | "all") => void;
  updateCameraStatus: (cameraId: string, status: CameraStatus) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: [],
  selectedCameraId: null,
  statusFilter: "all",
  zoneFilter: "all",
  setCameras: (cameras) => set({ cameras }),
  selectCamera: (selectedCameraId) => set({ selectedCameraId }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setZoneFilter: (zoneFilter) => set({ zoneFilter }),
  updateCameraStatus: (cameraId, status) =>
    set((state) => ({
      cameras: state.cameras.map((cam) =>
        cam.id === cameraId ? { ...cam, status } : cam
      ),
    })),
}));
