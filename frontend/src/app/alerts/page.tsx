"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, X, ArrowUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { MOCK_ALERTS, MOCK_CAMERAS } from "@/lib/mock-data";
import {
  getAlerts,
  getCameras,
  acknowledgeAlert,
  dismissAlert,
  escalateAlert,
} from "@/lib/api";
import { useAlertWebSocket } from "@/hooks/use-alert-websocket";
import { useAlertStore } from "@/lib/stores/use-alert-store";
import type { Alert, AlertType, AlertSeverity, AlertStatus, Camera } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALERT_TYPES: AlertType[] = [
  "intrusion",
  "loitering",
  "crowd",
  "fight",
  "abandoned_object",
  "traffic_violation",
  "fire",
  "weapon",
  "fall",
  "unknown",
];

const ALERT_SEVERITIES: AlertSeverity[] = ["low", "medium", "high", "critical"];

const ALERT_STATUSES: AlertStatus[] = [
  "new",
  "acknowledged",
  "dismissed",
  "escalated",
];

const statusBadgeVariant: Record<AlertStatus, string> = {
  new: "bg-[#00f0ff]/10 text-[#00f0ff] border-[#00f0ff]/20",
  acknowledged: "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20",
  dismissed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  escalated: "bg-[#ffaa00]/10 text-[#ffaa00] border-[#ffaa00]/20",
};

// ---------------------------------------------------------------------------
// Confidence color helper
// ---------------------------------------------------------------------------

function confidenceColor(conf: number): string {
  if (conf >= 0.9) return "text-[#00ff88]";
  if (conf >= 0.75) return "text-[#00f0ff]";
  if (conf >= 0.6) return "text-[#ffaa00]";
  return "text-[#ff2d78]";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  // Filter state
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cameraFilter, setCameraFilter] = useState<string>("all");

  // Data state
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS);
  const [cameras, setCameras] = useState<Camera[]>(MOCK_CAMERAS);
  const [loading, setLoading] = useState(true);

  // Selected alert for detail sheet
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  // Connect WebSocket for real-time alerts
  useAlertWebSocket();
  const wsAlerts = useAlertStore((s) => s.alerts);

  // Merge: use WS alerts if populated, else use fetched
  const allAlerts = wsAlerts.length > 0 ? wsAlerts : alerts;

  // Fetch real data on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [alertsData, camerasData] = await Promise.all([
          getAlerts(),
          getCameras(),
        ]);
        if (!cancelled) {
          setAlerts(alertsData);
          setCameras(camerasData);
          // Seed alert store if WS alerts are empty
          if (useAlertStore.getState().alerts.length === 0) {
            useAlertStore.getState().setAlerts(alertsData);
          }
        }
      } catch {
        // Keep mock data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    return allAlerts.filter((alert) => {
      if (typeFilter !== "all" && alert.alert_type !== typeFilter) return false;
      if (severityFilter !== "all" && alert.severity !== severityFilter)
        return false;
      if (statusFilter !== "all" && alert.status !== statusFilter) return false;
      if (cameraFilter !== "all" && alert.camera_id !== cameraFilter)
        return false;
      return true;
    });
  }, [allAlerts, typeFilter, severityFilter, statusFilter, cameraFilter]);

  function clearFilters() {
    setTypeFilter("all");
    setSeverityFilter("all");
    setStatusFilter("all");
    setCameraFilter("all");
  }

  async function handleAcknowledge(alertId: string) {
    try {
      await acknowledgeAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "acknowledged" as AlertStatus } : a))
      );
    } catch {
      console.warn("Acknowledge failed for:", alertId);
    }
  }

  async function handleDismiss(alertId: string) {
    try {
      await dismissAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "dismissed" as AlertStatus } : a))
      );
    } catch {
      console.warn("Dismiss failed for:", alertId);
    }
  }

  async function handleEscalate(alertId: string) {
    try {
      await escalateAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: "escalated" as AlertStatus } : a))
      );
    } catch {
      console.warn("Escalate failed for:", alertId);
    }
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" as const }}
    >
      {/* ---- Header ---- */}
      <PageHeader title="THREAT MANAGEMENT" description="Security threat classification, triage, and response">
        <Badge
          variant="outline"
          className="border-[#ff2d78]/30 bg-[#ff2d78]/10 font-data text-xs tabular-nums text-[#ff2d78]"
        >
          {allAlerts.length} THREATS
        </Badge>
      </PageHeader>

      {/* ---- Filter bar ---- */}
      <FilterBar onClear={clearFilters}>
        <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
          <SelectTrigger className="w-[170px] glass-deep border-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ALERT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={(v) => v && setSeverityFilter(v)}>
          <SelectTrigger className="w-[150px] glass-deep border-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            {ALERT_SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[160px] glass-deep border-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ALERT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cameraFilter} onValueChange={(v) => v && setCameraFilter(v)}>
          <SelectTrigger className="w-[200px] glass-deep border-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider">
            <SelectValue placeholder="Camera" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cameras</SelectItem>
            {cameras.map((cam) => (
              <SelectItem key={cam.id} value={cam.id}>
                {cam.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* ---- Alerts table ---- */}
      <div className="hud-card overflow-hidden rounded-sm">
        <Table>
          <TableHeader>
            <TableRow className="glass-deep border-[#00f0ff]/10 hover:bg-transparent">
              <TableHead className="w-[100px] font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Severity</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Classification</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Source</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Timestamp</TableHead>
              <TableHead className="w-[80px] font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Confidence</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Status</TableHead>
              <TableHead className="text-right font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAlerts.map((alert) => {
              const isHighSeverity = alert.severity === "critical" || alert.severity === "high";
              return (
                <TableRow
                  key={alert.id}
                  className={`border-white/5 cursor-pointer transition-colors hover:bg-[#00f0ff]/[0.03] ${
                    isHighSeverity ? "bg-[#ff2d78]/[0.03]" : ""
                  }`}
                  onClick={() => setSelectedAlert(alert)}
                >
                  <TableCell>
                    <SeverityBadge severity={alert.severity} />
                  </TableCell>
                  <TableCell className="font-heading text-xs uppercase tracking-wider text-slate-300">
                    {alert.alert_type.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="font-data text-xs text-[#00f0ff]/60">
                    {alert.camera_id}
                  </TableCell>
                  <TableCell className="font-data text-xs text-slate-500">
                    {alert.timestamp}
                  </TableCell>
                  <TableCell className={`font-data text-xs ${confidenceColor(alert.confidence)}`}>
                    {(alert.confidence * 100).toFixed(0)}%
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-heading text-[9px] uppercase tracking-wider ${statusBadgeVariant[alert.status]}`}
                    >
                      {alert.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-[#00ff88]/60 hover:text-[#00ff88] hover:bg-[#00ff88]/10"
                        onClick={() => handleAcknowledge(alert.id)}
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-slate-500 hover:text-slate-300 hover:bg-white/5"
                        onClick={() => handleDismiss(alert.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-[#ffaa00]/60 hover:text-[#ffaa00] hover:bg-[#ffaa00]/10"
                        onClick={() => handleEscalate(alert.id)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {filteredAlerts.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center font-heading text-xs uppercase tracking-wider text-[#4a6a8a]"
                >
                  No threats match current filter parameters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- Alert detail sheet ---- */}
      <Sheet
        open={!!selectedAlert}
        onOpenChange={(open) => {
          if (!open) setSelectedAlert(null);
        }}
      >
        <SheetContent className="hud-card border-[#00f0ff]/10 w-[400px] sm:w-[480px] overflow-y-auto">
          {selectedAlert && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-heading text-sm uppercase tracking-wider text-[#00f0ff]">
                  THREAT DETAIL
                  <SeverityBadge severity={selectedAlert.severity} />
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                {/* Thumbnail placeholder with scan-line */}
                <div className="relative flex h-48 items-center justify-center rounded-sm border border-[#00f0ff]/10 bg-[#030712]">
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.04]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)",
                    }}
                  />
                  <span className="font-data text-xs text-[#4a6a8a]">
                    [ CAPTURE FRAME ]
                  </span>
                </div>

                {/* Details definition list */}
                <dl className="space-y-3">
                  <DetailRow label="ALERT ID" value={selectedAlert.id} />
                  <DetailRow label="CLASSIFICATION" value={selectedAlert.alert_type.replace(/_/g, " ").toUpperCase()} />
                  <DetailRow label="SEVERITY" value={selectedAlert.severity.toUpperCase()} />
                  <DetailRow label="SOURCE" value={selectedAlert.camera_id} />
                  <DetailRow label="TIMESTAMP" value={selectedAlert.timestamp} />
                  <DetailRow label="CONFIDENCE" value={`${(selectedAlert.confidence * 100).toFixed(1)}%`} />
                  <DetailRow label="TRACK ID" value={selectedAlert.track_id ?? "N/A"} />
                  <DetailRow label="STATUS" value={selectedAlert.status.toUpperCase()} />

                  {selectedAlert.metadata && (
                    <>
                      <Separator className="bg-[#00f0ff]/10" />
                      <div>
                        <dt className="mb-1 font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                          METADATA
                        </dt>
                        <dd className="space-y-1">
                          {Object.entries(selectedAlert.metadata).map(
                            ([key, val]) => (
                              <div key={key} className="flex items-start justify-between gap-4">
                                <span className="shrink-0 font-heading text-[9px] uppercase tracking-wider text-[#4a6a8a]">
                                  {key.replace(/_/g, " ")}
                                </span>
                                <span className="text-right font-data text-xs text-slate-300">
                                  {String(val)}
                                </span>
                              </div>
                            )
                          )}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>

                <Separator className="bg-[#00f0ff]/10" />

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 rounded-sm border-[#00ff88]/20 font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/10"
                    onClick={() => handleAcknowledge(selectedAlert.id)}
                  >
                    <Check className="size-3.5" />
                    ACK
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 rounded-sm border-slate-500/20 font-heading text-[10px] uppercase tracking-wider text-slate-400 hover:bg-white/5"
                    onClick={() => handleDismiss(selectedAlert.id)}
                  >
                    <X className="size-3.5" />
                    DISMISS
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 rounded-sm border-[#ffaa00]/20 font-heading text-[10px] uppercase tracking-wider text-[#ffaa00] hover:bg-[#ffaa00]/10"
                    onClick={() => handleEscalate(selectedAlert.id)}
                  >
                    <ArrowUp className="size-3.5" />
                    ESCALATE
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
        {label}
      </dt>
      <dd className="text-right font-data text-xs text-slate-300">
        {value}
      </dd>
    </div>
  );
}
