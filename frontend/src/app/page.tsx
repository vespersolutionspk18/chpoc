"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Camera,
  Wifi,
  Bell,
  AlertTriangle,
  Users,
  Car,
  Play,
  Square,
} from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { AlertFeed } from "@/components/alert-feed";
import { CameraFeedCard } from "@/components/camera-feed-card";
import { ActivityChart } from "@/components/activity-chart";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { useAlertWebSocket } from "@/hooks/use-alert-websocket";
import { useAlertStore } from "@/lib/stores/use-alert-store";
import {
  getDashboardStats,
  getCameras,
  getAlerts,
  getActivityData,
  startPipeline,
  stopPipeline,
  getPipelineStatus,
} from "@/lib/api";
import type {
  ActivityDataPoint,
  Alert as AlertType,
  Camera as CameraType,
  DashboardStats,
} from "@/lib/types";

const CityMap = dynamic(() => import("@/components/city-map"), { ssr: false });

// ---------------------------------------------------------------------------
// Stagger animation variants
// ---------------------------------------------------------------------------

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    total_cameras: 0,
    online_cameras: 0,
    total_alerts_today: 0,
    critical_alerts: 0,
    active_tracks: 0,
    total_plates_today: 0,
  });
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [activityData, setActivityData] = useState<ActivityDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  // Connect WebSocket for live alerts
  const { isConnected: wsConnected } = useAlertWebSocket();
  const wsAlerts = useAlertStore((s) => s.alerts);

  // Merge WS alerts with fetched alerts: WS alerts take priority (newest first)
  const displayAlerts = wsAlerts.length > 0 ? wsAlerts : alerts;

  // Initial data fetch
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [statsData, camerasData, alertsData, actData] = await Promise.all([
          getDashboardStats(),
          getCameras(),
          getAlerts(),
          getActivityData(24),
        ]);

        if (!cancelled) {
          setStats(statsData);
          setCameras(camerasData);
          setAlerts(alertsData);
          setActivityData(actData);
          // Seed the alert store with fetched alerts if no WS alerts exist yet
          useAlertStore.getState().setAlerts(alertsData);
        }
      } catch (err) {
        // API unavailable -- data stays empty
        console.warn("API fetch failed:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Check pipeline status on mount
  useEffect(() => {
    async function checkPipeline() {
      try {
        const status = await getPipelineStatus();
        const anyRunning = Object.values(status).some((s) => s.running);
        setPipelineRunning(anyRunning);
      } catch {
        // Pipeline status unavailable
      }
    }
    checkPipeline();
  }, []);

  // Auto-refresh dashboard stats every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [statsData, alertsData] = await Promise.all([
          getDashboardStats(),
          getAlerts({ limit: 50 }),
        ]);
        setStats(statsData);
        setAlerts(alertsData);
      } catch {
        // Keep current data on failure
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleTogglePipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      if (pipelineRunning) {
        await stopPipeline();
        setPipelineRunning(false);
      } else {
        await startPipeline();
        setPipelineRunning(true);
      }
    } catch (err) {
      console.warn("Pipeline toggle failed:", err);
    } finally {
      setPipelineLoading(false);
    }
  }, [pipelineRunning]);

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* ---- OPERATIONAL OVERVIEW ---- */}
      <motion.div variants={fadeUp}>
        <SectionTitle>OPERATIONAL OVERVIEW</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total Cameras"
            value={stats.total_cameras}
            icon={Camera}
            color="cyan"
          />
          <StatCard
            label="Online"
            value={stats.online_cameras}
            icon={Wifi}
            color="green"
          />
          <StatCard
            label="Alerts Today"
            value={stats.total_alerts_today}
            icon={Bell}
            delta={`${stats.critical_alerts} critical`}
            color="red"
          />
          <div className="animate-pulse">
            <StatCard
              label="Critical"
              value={stats.critical_alerts}
              icon={AlertTriangle}
              color="red"
            />
          </div>
          <StatCard
            label="Active Tracks"
            value={stats.active_tracks.toLocaleString()}
            icon={Users}
            color="cyan"
          />
          <StatCard
            label="Plates Today"
            value={stats.total_plates_today}
            icon={Car}
            color="green"
          />
        </div>
      </motion.div>

      {/* ---- Pipeline Control ---- */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-4">
          <Button
            size="sm"
            disabled={pipelineLoading}
            onClick={handleTogglePipeline}
            className={`gap-1.5 rounded-sm border font-heading text-[10px] uppercase tracking-wider ${
              pipelineRunning
                ? "border-[#ff2d78]/30 bg-[#ff2d78]/10 text-[#ff2d78] hover:bg-[#ff2d78]/20"
                : "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20"
            }`}
          >
            {pipelineRunning ? (
              <Square className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {pipelineLoading
              ? "PROCESSING..."
              : pipelineRunning
                ? "STOP PIPELINE"
                : "START PIPELINE"}
          </Button>
          <span className="font-data text-[10px] text-[#4a6a8a]">
            WS: {wsConnected ? "CONNECTED" : "DISCONNECTED"}
          </span>
          {pipelineRunning && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 animate-pulse rounded-full bg-[#00ff88] shadow-[0_0_6px_#00ff88]" />
              <span className="font-heading text-[10px] uppercase tracking-wider text-[#00ff88]">
                PIPELINE ACTIVE
              </span>
            </span>
          )}
        </div>
      </motion.div>

      {/* ---- THREAT FEED + SURVEILLANCE GRID ---- */}
      <motion.div variants={fadeUp}>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left column -- Threat Feed */}
          <div className="lg:col-span-1">
            <SectionTitle>THREAT FEED</SectionTitle>
            <AlertFeed
              alerts={displayAlerts}
              maxItems={10}
              onAlertClick={(alert) =>
                console.log("Alert clicked:", alert.id)
              }
            />
          </div>

          {/* Right columns -- Surveillance Grid (2x3) */}
          <div className="lg:col-span-2">
            <SectionTitle>SURVEILLANCE GRID</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cameras.slice(0, 6).map((camera) => (
                <CameraFeedCard
                  key={camera.id}
                  camera={camera}
                  compact
                  onClick={(cam) =>
                    console.log("Camera clicked:", cam.id)
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ---- ACTIVITY ANALYSIS + TACTICAL MAP ---- */}
      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={fadeUp}
      >
        <div>
          <SectionTitle>ACTIVITY ANALYSIS</SectionTitle>
          <div className="hud-card p-4">
            <ActivityChart data={activityData} height={350} />
          </div>
        </div>

        <div>
          <SectionTitle>TACTICAL MAP</SectionTitle>
          <div className="hud-card p-4">
            <CityMap cameras={cameras} height="350px" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
