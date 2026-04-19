"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Save, Plug } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusDot } from "@/components/status-dot";
import { ConnectionStatus } from "@/components/connection-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  // Camera defaults
  const [confidenceThreshold, setConfidenceThreshold] = useState("0.5");
  const [analyticsProfile, setAnalyticsProfile] = useState("full");
  const [streamProtocol, setStreamProtocol] = useState("RTSP");

  // Alert thresholds
  const [crowdThreshold, setCrowdThreshold] = useState("50");
  const [loiteringDuration, setLoiteringDuration] = useState("300");
  const [abandonedDuration, setAbandonedDuration] = useState("120");
  const [speedThreshold, setSpeedThreshold] = useState("60");

  // Display preferences
  const [timeFormat, setTimeFormat] = useState("24h");
  const [mapZoom, setMapZoom] = useState("13");
  const [gridLayout, setGridLayout] = useState("2x2");
  const [refreshInterval, setRefreshInterval] = useState("30");

  function handleSave(section: string) {
    console.log(`[Settings] Saved section: ${section}`);
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          title="SYSTEM CONFIGURATION"
          description="System parameters, thresholds, and interface preferences"
        />
      </motion.div>

      {/* ----- Section 1: System Status ----- */}
      <motion.div variants={fadeUp}>
        <div className="hud-card p-5">
          <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]/70 mb-4">
            SYSTEM STATUS
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {/* AI Service */}
            <div className="flex items-center gap-3 rounded-sm border border-[#00f0ff]/10 glass-deep px-3 py-2.5">
              <StatusDot status="online" />
              <div className="min-w-0">
                <p className="font-heading text-[9px] uppercase tracking-wider text-slate-300">AI Service</p>
                <p className="font-data text-[11px] text-[#4a6a8a] truncate">
                  http://vast-ai:8001
                </p>
                <p className="font-data text-[10px] text-[#00ff88]">Connected</p>
              </div>
            </div>

            {/* Database */}
            <div className="flex items-center gap-3 rounded-sm border border-[#00f0ff]/10 glass-deep px-3 py-2.5">
              <StatusDot status="online" />
              <div className="min-w-0">
                <p className="font-heading text-[9px] uppercase tracking-wider text-slate-300">Database</p>
                <p className="font-data text-[11px] text-[#4a6a8a]">
                  PostgreSQL
                </p>
                <p className="font-data text-[10px] text-[#00ff88]">Connected</p>
              </div>
            </div>

            {/* Redis */}
            <div className="flex items-center gap-3 rounded-sm border border-[#00f0ff]/10 glass-deep px-3 py-2.5">
              <StatusDot status="online" />
              <div className="min-w-0">
                <p className="font-heading text-[9px] uppercase tracking-wider text-slate-300">Redis</p>
                <p className="font-data text-[11px] text-[#4a6a8a]">
                  Cache Layer
                </p>
                <p className="font-data text-[10px] text-[#00ff88]">Connected</p>
              </div>
            </div>

            {/* WebSocket */}
            <div className="flex items-center gap-3 rounded-sm border border-[#00f0ff]/10 glass-deep px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-heading text-[9px] uppercase tracking-wider text-slate-300 mb-1">WebSocket</p>
                <ConnectionStatus />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-sm border-[#00f0ff]/20 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/10"
              onClick={() => console.log("[Settings] Testing connections...")}
            >
              <Plug className="size-3.5" />
              TEST CONNECTION
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ----- Section 2: Asset Defaults ----- */}
      <motion.div variants={fadeUp}>
        <div className="hud-card p-5">
          <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#00f0ff]/70 mb-4">
            ASSET DEFAULTS
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Confidence Threshold
              </label>
              <Input
                type="number"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(e.target.value)}
                step={0.05}
                min={0}
                max={1}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Analytics Profile
              </label>
              <Select
                value={analyticsProfile}
                onValueChange={(v) => v && setAnalyticsProfile(v)}
              >
                <SelectTrigger className="w-full glass-deep border-[#00f0ff]/10 font-data text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="traffic-only">Traffic Only</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Stream Protocol
              </label>
              <Select
                value={streamProtocol}
                onValueChange={(v) => v && setStreamProtocol(v)}
              >
                <SelectTrigger className="w-full glass-deep border-[#00f0ff]/10 font-data text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RTSP">RTSP</SelectItem>
                  <SelectItem value="HTTP">HTTP</SelectItem>
                  <SelectItem value="RTMP">RTMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5 rounded-sm border border-[#00ff88]/30 bg-[#00ff88]/10 font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/20"
              onClick={() => handleSave("asset-defaults")}
            >
              <Save className="size-3.5" />
              SAVE
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ----- Section 3: Threat Thresholds ----- */}
      <motion.div variants={fadeUp}>
        <div className="hud-card p-5">
          <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#ff2d78]/70 mb-4">
            THREAT THRESHOLDS
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Crowd Size
              </label>
              <Input
                type="number"
                value={crowdThreshold}
                onChange={(e) => setCrowdThreshold(e.target.value)}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Loitering Duration (s)
              </label>
              <Input
                type="number"
                value={loiteringDuration}
                onChange={(e) => setLoiteringDuration(e.target.value)}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Abandoned Object (s)
              </label>
              <Input
                type="number"
                value={abandonedDuration}
                onChange={(e) => setAbandonedDuration(e.target.value)}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Speed Violation (km/h)
              </label>
              <Input
                type="number"
                value={speedThreshold}
                onChange={(e) => setSpeedThreshold(e.target.value)}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5 rounded-sm border border-[#00ff88]/30 bg-[#00ff88]/10 font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/20"
              onClick={() => handleSave("threat-thresholds")}
            >
              <Save className="size-3.5" />
              SAVE
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ----- Section 4: Interface Preferences ----- */}
      <motion.div variants={fadeUp}>
        <div className="hud-card p-5">
          <h3 className="font-heading text-[10px] uppercase tracking-[0.2em] text-[#ffaa00]/70 mb-4">
            INTERFACE PREFERENCES
          </h3>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Time Format
              </label>
              <Select value={timeFormat} onValueChange={(v) => v && setTimeFormat(v)}>
                <SelectTrigger className="w-full glass-deep border-[#00f0ff]/10 font-data text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">12h</SelectItem>
                  <SelectItem value="24h">24h</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Map Default Zoom
              </label>
              <Input
                type="number"
                value={mapZoom}
                onChange={(e) => setMapZoom(e.target.value)}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Default Grid Layout
              </label>
              <Select value={gridLayout} onValueChange={(v) => v && setGridLayout(v)}>
                <SelectTrigger className="w-full glass-deep border-[#00f0ff]/10 font-data text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2x2">2x2</SelectItem>
                  <SelectItem value="3x3">3x3</SelectItem>
                  <SelectItem value="4x4">4x4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
                Auto-refresh (s)
              </label>
              <Input
                type="number"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="gap-1.5 rounded-sm border border-[#00ff88]/30 bg-[#00ff88]/10 font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/20"
              onClick={() => handleSave("interface-preferences")}
            >
              <Save className="size-3.5" />
              SAVE
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
