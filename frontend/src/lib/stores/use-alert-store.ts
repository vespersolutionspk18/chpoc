import { create } from "zustand";
import type { Alert, AlertType, AlertSeverity, AlertStatus } from "@/lib/types";

interface AlertFilters {
  alertType: AlertType | null;
  severity: AlertSeverity | null;
  status: AlertStatus | null;
  cameraId: string | null;
  timeRange: [string, string] | null;
}

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  filters: AlertFilters;
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  setFilters: (filters: Partial<AlertFilters>) => void;
  clearFilters: () => void;
  markRead: (alertId: string) => void;
}

const defaultFilters: AlertFilters = {
  alertType: null,
  severity: null,
  status: null,
  cameraId: null,
  timeRange: null,
};

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  unreadCount: 0,
  filters: { ...defaultFilters },
  setAlerts: (alerts) =>
    set({
      alerts,
      unreadCount: alerts.filter((a) => a.status === "new").length,
    }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
      unreadCount:
        alert.status === "new"
          ? state.unreadCount + 1
          : state.unreadCount,
    })),
  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),
  clearFilters: () => set({ filters: { ...defaultFilters } }),
  markRead: (alertId) =>
    set((state) => {
      const alert = state.alerts.find((a) => a.id === alertId);
      const wasNew = alert?.status === "new";
      return {
        alerts: state.alerts.map((a) =>
          a.id === alertId
            ? { ...a, status: "acknowledged" as AlertStatus }
            : a
        ),
        unreadCount: wasNew
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };
    }),
}));
