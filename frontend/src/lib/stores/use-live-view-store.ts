import { create } from "zustand";

type GridLayout = "2x2" | "3x3" | "4x4";

interface LiveViewState {
  gridLayout: GridLayout;
  fullscreenCameraId: string | null;
  selectedCameraIds: string[];
  setGridLayout: (layout: GridLayout) => void;
  setFullscreenCamera: (cameraId: string | null) => void;
  setSelectedCameras: (cameraIds: string[]) => void;
}

export const useLiveViewStore = create<LiveViewState>((set) => ({
  gridLayout: "2x2",
  fullscreenCameraId: null,
  selectedCameraIds: [],
  setGridLayout: (gridLayout) => set({ gridLayout }),
  setFullscreenCamera: (fullscreenCameraId) => set({ fullscreenCameraId }),
  setSelectedCameras: (selectedCameraIds) => set({ selectedCameraIds }),
}));
