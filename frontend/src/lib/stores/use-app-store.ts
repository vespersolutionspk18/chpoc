import { create } from "zustand";

interface AppState {
  wsConnected: boolean;
  sidebarOpen: boolean;
  setWsConnected: (connected: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  wsConnected: false,
  sidebarOpen: true,
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
