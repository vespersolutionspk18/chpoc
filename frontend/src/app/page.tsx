"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Camera,
  Wifi,
  Bell,
  AlertTriangle,
  Users,
  Car,
} from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { AlertFeed } from "@/components/alert-feed";
import { CameraFeedCard } from "@/components/camera-feed-card";
import { ActivityChart } from "@/components/activity-chart";
import {
  MOCK_CAMERAS,
  MOCK_ALERTS,
  MOCK_DASHBOARD_STATS,
  MOCK_ACTIVITY_DATA,
} from "@/lib/mock-data";

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
  const stats = MOCK_DASHBOARD_STATS;

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* ── OPERATIONAL OVERVIEW ── */}
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

      {/* ── THREAT FEED + SURVEILLANCE GRID ── */}
      <motion.div variants={fadeUp}>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left column -- Threat Feed */}
          <div className="lg:col-span-1">
            <SectionTitle>THREAT FEED</SectionTitle>
            <AlertFeed
              alerts={MOCK_ALERTS}
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
              {MOCK_CAMERAS.slice(0, 6).map((camera) => (
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

      {/* ── ACTIVITY ANALYSIS + TACTICAL MAP ── */}
      <motion.div
        className="grid gap-4 lg:grid-cols-2"
        variants={fadeUp}
      >
        <div>
          <SectionTitle>ACTIVITY ANALYSIS</SectionTitle>
          <div className="hud-card p-4">
            <ActivityChart data={MOCK_ACTIVITY_DATA} height={350} />
          </div>
        </div>

        <div>
          <SectionTitle>TACTICAL MAP</SectionTitle>
          <div className="hud-card p-4">
            <CityMap cameras={MOCK_CAMERAS} height="350px" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
