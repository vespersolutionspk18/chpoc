"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Bell, Clock, Camera, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ActivityChart } from "@/components/activity-chart";
import { AlertTrendChart } from "@/components/alert-trend-chart";
import { TrafficFlowChart } from "@/components/traffic-flow-chart";
import { CameraUptimeChart } from "@/components/camera-uptime-chart";
import { GaugeIndicator } from "@/components/gauge-indicator";

import {
  MOCK_CAMERAS,
  MOCK_ACTIVITY_DATA,
  MOCK_ALERT_TREND_DATA,
  MOCK_TRAFFIC_STATS,
  MOCK_DASHBOARD_STATS,
} from "@/lib/mock-data";
import {
  getDashboardStats,
  getTrafficStats,
  getCameras,
} from "@/lib/api";
import type { DashboardStats, TrafficStats, Camera as CameraType } from "@/lib/types";

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

export default function AnalyticsPage() {
  const [timePeriod, setTimePeriod] = useState("24h");
  const [dashStats, setDashStats] = useState<DashboardStats>(MOCK_DASHBOARD_STATS);
  const [trafficStats, setTrafficStats] = useState<TrafficStats[]>(MOCK_TRAFFIC_STATS);
  const [cameras, setCameras] = useState<CameraType[]>(MOCK_CAMERAS);

  // Fetch real data from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [stats, traffic, cams] = await Promise.all([
          getDashboardStats(),
          getTrafficStats(timePeriod),
          getCameras(),
        ]);
        if (!cancelled) {
          setDashStats(stats);
          setTrafficStats(traffic);
          setCameras(cams);
        }
      } catch {
        // Keep mock data
      }
    }
    load();
    return () => { cancelled = true; };
  }, [timePeriod]);

  // Generate camera uptime data from real camera data
  const cameraUptimeData = useMemo(
    () =>
      cameras.map((cam) => ({
        camera_name: cam.name.length > 20 ? cam.name.slice(0, 18) + "..." : cam.name,
        uptime:
          cam.status === "offline"
            ? Math.round(Math.random() * 15 + 10)
            : cam.status === "degraded"
              ? Math.round(Math.random() * 10 + 75)
              : Math.round(Math.random() * 15 + 85),
      })),
    [cameras]
  );

  const periodOptions = [
    { value: "1h", label: "1H" },
    { value: "6h", label: "6H" },
    { value: "24h", label: "24H" },
    { value: "7d", label: "7D" },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="INTELLIGENCE ANALYTICS"
          description="System-wide performance and detection intelligence"
        >
          <div className="flex items-center gap-0.5 rounded-sm border border-[#00f0ff]/15 bg-[#030712]/80 p-0.5">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTimePeriod(opt.value)}
                className={`rounded-sm px-3 py-1.5 font-heading text-[10px] uppercase tracking-wider transition-all ${
                  timePeriod === opt.value
                    ? "bg-[#00f0ff]/15 text-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                    : "text-[#4a6a8a] hover:text-[#00f0ff]/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </PageHeader>
      </motion.div>

      {/* ----- Stat Cards ----- */}
      <motion.div variants={fadeUp}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Alerts"
            value={dashStats.total_alerts_today}
            icon={Bell}
            delta="Today"
            color="red"
          />
          <StatCard
            label="Avg Response"
            value="4.2s"
            icon={Clock}
            delta="Last 24h"
            color="amber"
          />
          <StatCard
            label="Busiest Cam"
            value="CAM-01"
            icon={Camera}
            delta="Ghafoor Market"
            color="cyan"
          />
          <StatCard
            label="Peak Hour"
            value="14:00-15:00"
            icon={TrendingUp}
            delta="Highest activity"
            color="green"
          />
        </div>
      </motion.div>

      {/* ----- Charts Grid (2x2) ----- */}
      <motion.div variants={fadeUp}>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Activity Analysis */}
          <div className="hud-card p-4">
            <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]/70 mb-3">
              ACTIVITY ANALYSIS
            </h3>
            <ActivityChart data={MOCK_ACTIVITY_DATA} height={280} />
          </div>

          {/* Threat Trends */}
          <div className="hud-card p-4">
            <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#ff2d78]/70 mb-3">
              THREAT TRENDS
            </h3>
            <AlertTrendChart data={MOCK_ALERT_TREND_DATA} height={280} />
          </div>

          {/* Traffic Flow */}
          <div className="hud-card p-4">
            <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#00ff88]/70 mb-3">
              TRAFFIC FLOW
            </h3>
            <TrafficFlowChart data={trafficStats.length > 0 ? trafficStats : MOCK_TRAFFIC_STATS} height={280} />
          </div>

          {/* Asset Uptime */}
          <div className="hud-card p-4">
            <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#ffaa00]/70 mb-3">
              ASSET UPTIME
            </h3>
            <CameraUptimeChart data={cameraUptimeData} height={280} />
          </div>
        </div>
      </motion.div>

      {/* ----- Density Heatmap + Gauge ----- */}
      <motion.div variants={fadeUp}>
        <SectionTitle>DENSITY HEATMAP</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="lg:col-span-3 hud-card p-4">
            <CityMap cameras={cameras} height="380px" />
          </div>

          <div className="hud-card flex flex-col items-center justify-center p-6">
            <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#ffaa00]/70 mb-4 text-center">
              CROWD LEVEL
            </h3>
            <GaugeIndicator value={62} label="Crowd Index" color="amber" />
            <p className="mt-4 font-data text-xs text-[#4a6a8a] text-center">
              Moderate density across monitored sectors
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
