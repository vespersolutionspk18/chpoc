"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  CalendarClock,
  Shield,
  ShieldOff,
  Camera,
  BellOff,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { TimelineBar } from "@/components/timeline-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { MOCK_EVENTS, MOCK_CAMERAS } from "@/lib/mock-data";
import {
  getEvents,
  getCameras,
  createEvent,
  activateEvent,
  deactivateEvent,
} from "@/lib/api";
import type {
  EventProfile,
  EventType,
  EventStatus,
  AlertType,
  Camera as CameraType,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPE_CONFIG: Record<
  EventType,
  { label: string; className: string }
> = {
  RELIGIOUS_PROCESSION: {
    label: "RELIGIOUS",
    className: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  },
  PRAYER_GATHERING: {
    label: "PRAYER",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  TRIBAL_GATHERING: {
    label: "TRIBAL",
    className: "bg-[#ffaa00]/15 text-[#ffaa00] border-[#ffaa00]/20",
  },
  EID_CELEBRATION: {
    label: "EID",
    className: "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/20",
  },
  NORMAL: {
    label: "NORMAL",
    className: "bg-white/5 text-slate-400 border-white/10",
  },
};

const STATUS_CONFIG: Record<EventStatus, { label: string; className: string }> =
  {
    SCHEDULED: {
      label: "SCHEDULED",
      className:
        "bg-[#00f0ff]/10 text-[#00f0ff] border-[#00f0ff]/30",
    },
    ACTIVE: {
      label: "ACTIVE",
      className:
        "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30 shadow-[0_0_8px_rgba(0,255,136,0.3)]",
    },
    COMPLETED: {
      label: "COMPLETED",
      className: "bg-white/5 text-[#4a6a8a] border-white/10",
    },
  };

const ALL_EVENT_TYPES: EventType[] = [
  "RELIGIOUS_PROCESSION",
  "PRAYER_GATHERING",
  "TRIBAL_GATHERING",
  "EID_CELEBRATION",
  "NORMAL",
];

const ALL_ALERT_TYPES: AlertType[] = [
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PK", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Section title decorator
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1 bg-gradient-to-r from-[#00f0ff]/40 to-transparent" />
      <span className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]/70 whitespace-nowrap">
        {children}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-[#00f0ff]/40 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EventsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [events, setEvents] = useState<EventProfile[]>(MOCK_EVENTS);
  const [cameras, setCameras] = useState<CameraType[]>(MOCK_CAMERAS);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<EventType>("NORMAL");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formCameraIds, setFormCameraIds] = useState<string[]>([]);
  const [formSuppressedTypes, setFormSuppressedTypes] = useState<AlertType[]>(
    []
  );
  const [formCrowdThreshold, setFormCrowdThreshold] = useState(50);
  const [formLoiteringDuration, setFormLoiteringDuration] = useState(300);

  // Fetch real data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [eventsData, camerasData] = await Promise.all([
          getEvents(),
          getCameras(),
        ]);
        if (!cancelled) {
          setEvents(eventsData);
          setCameras(camerasData);
        }
      } catch {
        // Keep mock data
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") return events;
    return events.filter((e) => e.status === statusFilter);
  }, [events, statusFilter]);

  const timelineEvents = useMemo(() => {
    return events.map((e) => ({
      id: e.id,
      label: e.name,
      start: e.start_time,
      end: e.end_time,
      type: e.event_type.toLowerCase(),
      active: e.status === "ACTIVE",
    }));
  }, [events]);

  function toggleCamera(camId: string) {
    setFormCameraIds((prev) =>
      prev.includes(camId)
        ? prev.filter((id) => id !== camId)
        : [...prev, camId]
    );
  }

  function toggleAlertType(alertType: AlertType) {
    setFormSuppressedTypes((prev) =>
      prev.includes(alertType)
        ? prev.filter((t) => t !== alertType)
        : [...prev, alertType]
    );
  }

  async function handleActivate(eventId: string) {
    try {
      const updated = await activateEvent(eventId);
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? updated : e))
      );
    } catch {
      // Optimistic fallback
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId ? { ...e, status: "ACTIVE" as EventStatus } : e
        )
      );
    }
  }

  async function handleDeactivate(eventId: string) {
    try {
      const updated = await deactivateEvent(eventId);
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? updated : e))
      );
    } catch {
      // Optimistic fallback
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId ? { ...e, status: "COMPLETED" as EventStatus } : e
        )
      );
    }
  }

  async function handleCreateEvent() {
    const newEventData: Partial<EventProfile> = {
      name: formName || "Untitled Event",
      event_type: formType,
      start_time: formStartTime
        ? new Date(formStartTime).toISOString()
        : new Date().toISOString(),
      end_time: formEndTime
        ? new Date(formEndTime).toISOString()
        : new Date(Date.now() + 86400000).toISOString(),
      affected_camera_ids: formCameraIds.length > 0 ? formCameraIds : null,
      threshold_overrides: {
        crowd_threshold: formCrowdThreshold,
        loitering_seconds: formLoiteringDuration,
      },
      suppressed_alert_types:
        formSuppressedTypes.length > 0 ? formSuppressedTypes : null,
    };

    try {
      const created = await createEvent(newEventData);
      setEvents((prev) => [created, ...prev]);
    } catch {
      // Fallback: create local event
      const localEvent: EventProfile = {
        id: `evt-${Date.now()}`,
        name: newEventData.name!,
        event_type: newEventData.event_type!,
        start_time: newEventData.start_time!,
        end_time: newEventData.end_time!,
        affected_camera_ids: newEventData.affected_camera_ids ?? null,
        threshold_overrides: newEventData.threshold_overrides ?? null,
        suppressed_alert_types: newEventData.suppressed_alert_types ?? null,
        status: "SCHEDULED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setEvents((prev) => [localEvent, ...prev]);
    }

    setDialogOpen(false);
    // Reset form
    setFormName("");
    setFormType("NORMAL");
    setFormStartTime("");
    setFormEndTime("");
    setFormCameraIds([]);
    setFormSuppressedTypes([]);
    setFormCrowdThreshold(50);
    setFormLoiteringDuration(300);
  }

  // Status filter toggle buttons
  const statusOptions = [
    { value: "all", label: "ALL" },
    { value: "SCHEDULED", label: "SCHEDULED" },
    { value: "ACTIVE", label: "ACTIVE" },
    { value: "COMPLETED", label: "COMPLETED" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" as const }}
      className="space-y-6"
    >
      <PageHeader
        title="EVENT OPERATIONS"
        description="Manage alert profiles for events, gatherings, and special operations"
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="gap-2 rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20 hover:shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <Plus className="size-3.5" />
                CREATE PROFILE
              </Button>
            }
          />
          <DialogContent className="hud-card border-[#00f0ff]/20 sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-sm uppercase tracking-wider text-[#00f0ff]">
                CREATE EVENT PROFILE
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                  Event Designation
                </label>
                <Input
                  placeholder="e.g. Muharram 10th Procession"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
                />
              </div>

              {/* Event Type */}
              <div className="space-y-1.5">
                <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                  Event Type
                </label>
                <Select
                  value={formType}
                  onValueChange={(v) => v && setFormType(v as EventType)}
                >
                  <SelectTrigger className="w-full glass-deep border-[#00f0ff]/10 font-data text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_EVENT_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {EVENT_TYPE_CONFIG[et].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start / End datetime */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                    Start Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="glass-deep border-[#00f0ff]/10 font-data text-sm [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                    End Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="glass-deep border-[#00f0ff]/10 font-data text-sm [color-scheme:dark]"
                  />
                </div>
              </div>

              <Separator className="bg-[#00f0ff]/10" />

              {/* Affected Cameras */}
              <div className="space-y-1.5">
                <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                  Affected Cameras
                </label>
                <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto rounded-sm border border-[#00f0ff]/10 glass-deep p-2">
                  {cameras.map((cam) => (
                    <label
                      key={cam.id}
                      className="flex items-center gap-2 font-data text-xs cursor-pointer hover:bg-[#00f0ff]/5 rounded-sm px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={formCameraIds.includes(cam.id)}
                        onChange={() => toggleCamera(cam.id)}
                        className="accent-[#00f0ff]"
                      />
                      <span className="truncate text-slate-300">{cam.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Suppressed Alert Types */}
              <div className="space-y-1.5">
                <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                  Suppressed Alert Types
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ALERT_TYPES.map((at) => (
                    <label
                      key={at}
                      className="flex items-center gap-1.5 font-data text-xs cursor-pointer text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={formSuppressedTypes.includes(at)}
                        onChange={() => toggleAlertType(at)}
                        className="accent-[#00f0ff]"
                      />
                      <span>{at.replace("_", " ")}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator className="bg-[#00f0ff]/10" />

              {/* Threshold Overrides */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                    Crowd Threshold
                  </label>
                  <Input
                    type="number"
                    value={formCrowdThreshold}
                    onChange={(e) =>
                      setFormCrowdThreshold(Number(e.target.value))
                    }
                    className="glass-deep border-[#00f0ff]/10 font-data text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                    Loitering Duration (s)
                  </label>
                  <Input
                    type="number"
                    value={formLoiteringDuration}
                    onChange={(e) =>
                      setFormLoiteringDuration(Number(e.target.value))
                    }
                    className="glass-deep border-[#00f0ff]/10 font-data text-sm"
                  />
                </div>
              </div>

              <Button
                onClick={handleCreateEvent}
                className="w-full rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20"
              >
                CREATE PROFILE
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* ----- Status Filter Toggle ----- */}
      <div className="flex items-center gap-1 rounded-sm border border-[#00f0ff]/15 bg-[#030712]/80 p-0.5 w-fit">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-sm px-4 py-1.5 font-heading text-[10px] uppercase tracking-wider transition-all ${
              statusFilter === opt.value
                ? "bg-[#00f0ff]/15 text-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                : "text-[#4a6a8a] hover:text-[#00f0ff]/60"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ----- Event Cards ----- */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredEvents.map((event) => {
          const typeConfig = EVENT_TYPE_CONFIG[event.event_type];
          const statusConfig = STATUS_CONFIG[event.status];
          const affectedCount = event.affected_camera_ids?.length ?? 0;
          const isActive = event.status === "ACTIVE";
          const isScheduled = event.status === "SCHEDULED";
          const isCompleted = event.status === "COMPLETED";

          return (
            <div
              key={event.id}
              className={`hud-card p-5 transition-all ${
                isActive
                  ? "border-[#00ff88]/30 shadow-[0_0_20px_rgba(0,255,136,0.08)]"
                  : isScheduled
                    ? "border-[#00f0ff]/20"
                    : "opacity-60"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className={`font-heading text-sm uppercase tracking-wider ${isCompleted ? "text-[#4a6a8a]" : "text-slate-200"}`}>
                  {event.name}
                </h3>
                <Badge
                  variant="outline"
                  className={`font-heading text-[9px] uppercase tracking-wider shrink-0 ${statusConfig.className}`}
                >
                  {statusConfig.label}
                </Badge>
              </div>

              {/* Event type badge */}
              <Badge
                variant="outline"
                className={`font-heading text-[9px] uppercase tracking-wider mb-3 ${typeConfig.className}`}
              >
                {typeConfig.label}
              </Badge>

              {/* Date range */}
              <div className="flex items-center gap-2 text-xs text-[#4a6a8a] mb-2">
                <CalendarClock className="size-3.5 shrink-0" />
                <span className="font-data">
                  {formatDateTime(event.start_time)} &mdash;{" "}
                  {formatDateTime(event.end_time)}
                </span>
              </div>

              {/* Affected cameras */}
              <div className="flex items-center gap-2 text-xs text-[#4a6a8a] mb-2">
                <Camera className="size-3.5 shrink-0" />
                <span className="font-data">
                  {affectedCount > 0
                    ? `${affectedCount} asset${affectedCount > 1 ? "s" : ""} affected`
                    : "All assets"}
                </span>
              </div>

              {/* Suppressed types */}
              {event.suppressed_alert_types &&
                event.suppressed_alert_types.length > 0 && (
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-[#4a6a8a]">
                      <BellOff className="size-3.5 shrink-0" />
                      <span className="font-heading text-[9px] uppercase tracking-wider">Suppressed</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {event.suppressed_alert_types.map((at) => (
                        <span
                          key={at}
                          className="rounded-sm bg-white/5 px-1.5 py-0.5 font-data text-[10px] text-[#4a6a8a]"
                        >
                          {at.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2">
                {isScheduled && (
                  <Button
                    size="sm"
                    onClick={() => handleActivate(event.id)}
                    className="gap-1.5 rounded-sm border border-[#00ff88]/30 bg-transparent font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/10"
                  >
                    <Shield className="size-3.5" />
                    ACTIVATE
                  </Button>
                )}
                {isActive && (
                  <Button
                    size="sm"
                    onClick={() => handleDeactivate(event.id)}
                    className="gap-1.5 rounded-sm border border-[#ff2d78]/30 bg-transparent font-heading text-[10px] uppercase tracking-wider text-[#ff2d78] hover:bg-[#ff2d78]/10"
                  >
                    <ShieldOff className="size-3.5" />
                    DEACTIVATE
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ----- Timeline ----- */}
      <SectionTitle>EVENT TIMELINE</SectionTitle>
      <TimelineBar events={timelineEvents} />
    </motion.div>
  );
}
