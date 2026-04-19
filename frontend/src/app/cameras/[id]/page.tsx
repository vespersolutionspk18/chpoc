"use client";

import { use, useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Car,
  Bell,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CameraFeedCard } from "@/components/camera-feed-card";
import { StatCard } from "@/components/stat-card";
import { AlertRow } from "@/components/alert-row";
import { CameraStatusBadge } from "@/components/camera-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getCamera, getAlerts } from "@/lib/api";
import type { Camera, Alert, Detection } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock detections for the camera view
// ---------------------------------------------------------------------------

const CAMERA_DETECTIONS: Detection[] = [
  {
    id: "det-101",
    object_type: "person",
    confidence: 0.93,
    bbox: { x: 50, y: 40, width: 55, height: 130 },
    track_id: "trk-6001",
    attributes: { upper_color: "blue" },
  },
  {
    id: "det-102",
    object_type: "vehicle",
    confidence: 0.88,
    bbox: { x: 220, y: 120, width: 130, height: 90 },
    track_id: "trk-6002",
    attributes: { color: "silver" },
  },
  {
    id: "det-103",
    object_type: "person",
    confidence: 0.81,
    bbox: { x: 150, y: 60, width: 45, height: 115 },
    track_id: "trk-6003",
    attributes: null,
  },
];

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

export default function CameraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [camera, setCamera] = useState<Camera | null>(null);
  const [cameraAlerts, setCameraAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cam, alerts] = await Promise.all([
          getCamera(id),
          getAlerts({ camera_id: id, limit: 20 }),
        ]);
        if (!cancelled) {
          setCamera(cam);
          setCameraAlerts(alerts);
        }
      } catch (err) {
        console.error("Failed to load camera:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (!camera) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-20"
      >
        <EmptyState
          icon={Bell}
          title="ASSET NOT FOUND"
          description={`No camera asset matches designation "${id}". Verify the asset ID or return to the asset registry.`}
        />
        <div className="mt-4 flex justify-center">
          <Link href="/cameras">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-sm border-[#00f0ff]/20 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/10"
            >
              <ArrowLeft className="size-4" />
              BACK TO ASSETS
            </Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" as const }}
    >
      {/* ---- Header ---- */}
      <PageHeader title={camera.name} description={`Asset ID: ${camera.id}`}>
        <Link href="/cameras">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-sm border-[#00f0ff]/20 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/10"
          >
            <ArrowLeft className="size-3.5" />
            BACK TO ASSETS
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-sm border-[#ffaa00]/20 font-heading text-[10px] uppercase tracking-wider text-[#ffaa00] hover:bg-[#ffaa00]/10"
          onClick={() => console.log("Edit camera:", camera.id)}
        >
          <Pencil className="size-3" />
          EDIT
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-sm border-[#ff2d78]/20 font-heading text-[10px] uppercase tracking-wider text-[#ff2d78] hover:bg-[#ff2d78]/10"
          onClick={() => console.log("Delete camera:", camera.id)}
        >
          <Trash2 className="size-3" />
          DELETE
        </Button>
      </PageHeader>

      {/* ---- Two-column: Camera feed + Info ---- */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left -- Large camera feed (60%) */}
        <div className="lg:col-span-3">
          <CameraFeedCard
            camera={camera}
            detections={CAMERA_DETECTIONS}
          />
        </div>

        {/* Right -- Asset info card (40%) */}
        <div className="lg:col-span-2">
          <div className="hud-card h-full p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]/70">
                ASSET INFORMATION
              </span>
              <CameraStatusBadge status={camera.status} />
            </div>

            <dl className="space-y-3">
              <InfoRow label="ASSET ID" value={camera.id} />
              <InfoRow label="DESIGNATION" value={camera.name} />
              <InfoRow label="SECTOR" value={camera.zone_id ?? "Unassigned"} />
              <InfoRow
                label="COORDINATES"
                value={`${camera.location_lat.toFixed(6)}, ${camera.location_lng.toFixed(6)}`}
              />
              <InfoRow label="STREAM" value={camera.stream_url} />
              <InfoRow label="STATUS" value={camera.status.toUpperCase()} />

              <Separator className="bg-[#00f0ff]/10" />

              <InfoRow
                label="DEPLOYED"
                value={new Date(camera.created_at).toLocaleDateString()}
              />
              <InfoRow
                label="LAST UPDATED"
                value={new Date(camera.updated_at).toLocaleString()}
              />

              {camera.analytics_profile && (
                <>
                  <Separator className="bg-[#00f0ff]/10" />
                  <div>
                    <dt className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                      ANALYTICS PROFILE
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(camera.analytics_profile).map(
                        ([key, val]) => (
                          <Badge
                            key={key}
                            variant="outline"
                            className="border-[#00f0ff]/15 font-data text-[10px] text-[#00f0ff]/60"
                          >
                            {key}: {String(val)}
                          </Badge>
                        )
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* ---- Mini stat cards row ---- */}
      <SectionTitle>ASSET METRICS</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="People Detected"
          value={237}
          icon={Users}
          color="cyan"
        />
        <StatCard
          label="Vehicles Detected"
          value={84}
          icon={Car}
          color="green"
        />
        <StatCard
          label="Alerts Today"
          value={cameraAlerts.length}
          icon={Bell}
          delta={`${cameraAlerts.filter((a) => a.severity === "critical").length} critical`}
          color="red"
        />
        <StatCard
          label="Uptime"
          value="98.7%"
          icon={Clock}
          color="green"
        />
      </div>

      {/* ---- Recent alerts for this camera ---- */}
      <SectionTitle>RECENT THREATS</SectionTitle>
      <div className="space-y-3">
        {cameraAlerts.length > 0 ? (
          <div className="space-y-1.5">
            {cameraAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onAcknowledge={(alertId) =>
                  console.log("Acknowledge:", alertId)
                }
                onDismiss={(alertId) => console.log("Dismiss:", alertId)}
                onEscalate={(alertId) => console.log("Escalate:", alertId)}
              />
            ))}
          </div>
        ) : (
          <div className="hud-card px-4 py-8 text-center">
            <span className="font-heading text-xs uppercase tracking-wider text-[#4a6a8a]">
              No threat records for this asset today.
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function InfoRow({
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
      <dd className="text-right font-data text-xs text-slate-300 break-all">
        {value}
      </dd>
    </div>
  );
}
