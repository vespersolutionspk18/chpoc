"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { StatusDot } from "@/components/status-dot";
import { CameraStatusBadge } from "@/components/camera-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MOCK_CAMERAS } from "@/lib/mock-data";
import type { CameraStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Unique zones for filter
// ---------------------------------------------------------------------------

const ALL_ZONES = Array.from(
  new Set(MOCK_CAMERAS.map((c) => c.zone_id).filter(Boolean))
) as string[];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CamerasPage() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formStreamUrl, setFormStreamUrl] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formZone, setFormZone] = useState("");
  const [formStatus, setFormStatus] = useState<CameraStatus>("online");

  // Filtered cameras
  const filteredCameras = useMemo(() => {
    return MOCK_CAMERAS.filter((cam) => {
      if (statusFilter !== "all" && cam.status !== statusFilter) return false;
      if (zoneFilter !== "all" && cam.zone_id !== zoneFilter) return false;
      return true;
    });
  }, [statusFilter, zoneFilter]);

  function clearFilters() {
    setStatusFilter("all");
    setZoneFilter("all");
  }

  function openAddDialog() {
    setEditingCameraId(null);
    setFormName("");
    setFormStreamUrl("");
    setFormLat("");
    setFormLng("");
    setFormZone("");
    setFormStatus("online");
    setDialogOpen(true);
  }

  function openEditDialog(cameraId: string) {
    const cam = MOCK_CAMERAS.find((c) => c.id === cameraId);
    if (!cam) return;
    setEditingCameraId(cameraId);
    setFormName(cam.name);
    setFormStreamUrl(cam.stream_url);
    setFormLat(String(cam.location_lat));
    setFormLng(String(cam.location_lng));
    setFormZone(cam.zone_id ?? "");
    setFormStatus(cam.status);
    setDialogOpen(true);
  }

  function handleSave() {
    console.log("Saving camera:", {
      id: editingCameraId,
      name: formName,
      stream_url: formStreamUrl,
      lat: formLat,
      lng: formLng,
      zone: formZone,
      status: formStatus,
    });
    setDialogOpen(false);
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" as const }}
    >
      {/* ---- Header ---- */}
      <PageHeader title="CAMERA ASSETS" description="Surveillance asset management and deployment">
        <Button
          size="sm"
          onClick={openAddDialog}
          className="gap-1.5 rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20 hover:shadow-[0_0_15px_rgba(0,240,255,0.2)]"
        >
          <Plus className="size-3.5" />
          DEPLOY ASSET
        </Button>
      </PageHeader>

      {/* ---- Filter bar ---- */}
      <FilterBar onClear={clearFilters}>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[160px] glass-deep border-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="degraded">Degraded</SelectItem>
          </SelectContent>
        </Select>

        <Select value={zoneFilter} onValueChange={(v) => v && setZoneFilter(v)}>
          <SelectTrigger className="w-[180px] glass-deep border-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider">
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {ALL_ZONES.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* ---- Camera table ---- */}
      <div className="hud-card overflow-hidden rounded-sm">
        <Table>
          <TableHeader>
            <TableRow className="glass-deep border-[#00f0ff]/10 hover:bg-transparent">
              <TableHead className="w-[40px] font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">STS</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Designation</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Asset ID</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Sector</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Coordinates</TableHead>
              <TableHead className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Status</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCameras.map((camera) => (
              <TableRow
                key={camera.id}
                className="border-white/5 transition-colors hover:bg-[#00f0ff]/[0.03]"
              >
                <TableCell>
                  <StatusDot status={camera.status} size="md" />
                </TableCell>
                <TableCell className="font-data text-sm text-slate-200">
                  {camera.name}
                </TableCell>
                <TableCell className="font-data text-xs text-[#00f0ff]/60">
                  {camera.id}
                </TableCell>
                <TableCell className="font-heading text-[10px] uppercase tracking-wider text-slate-400">
                  {camera.zone_id ?? "--"}
                </TableCell>
                <TableCell className="font-data text-xs text-slate-500">
                  {camera.location_lat.toFixed(4)},{" "}
                  {camera.location_lng.toFixed(4)}
                </TableCell>
                <TableCell>
                  <CameraStatusBadge status={camera.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="font-heading text-[10px] uppercase tracking-wider text-[#00f0ff]/50 hover:text-[#00f0ff] hover:bg-[#00f0ff]/5"
                    onClick={() => console.log("View camera:", camera.id)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {filteredCameras.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center font-heading text-xs uppercase tracking-wider text-[#4a6a8a]"
                >
                  No assets match current filter parameters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- Add / Edit Dialog ---- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="hud-card border-[#00f0ff]/20 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm uppercase tracking-wider text-[#00f0ff]">
              {editingCameraId ? "MODIFY ASSET" : "DEPLOY NEW ASSET"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">Designation</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Camera designation"
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
                Stream URL
              </label>
              <Input
                value={formStreamUrl}
                onChange={(e) => setFormStreamUrl(e.target.value)}
                placeholder="rtsp://..."
                className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
                  Latitude
                </label>
                <Input
                  type="number"
                  step="any"
                  value={formLat}
                  onChange={(e) => setFormLat(e.target.value)}
                  placeholder="34.15"
                  className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
                  Longitude
                </label>
                <Input
                  type="number"
                  step="any"
                  value={formLng}
                  onChange={(e) => setFormLng(e.target.value)}
                  placeholder="71.74"
                  className="glass-deep border-[#00f0ff]/10 font-data text-sm focus:border-[#00f0ff]/40"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
                  Sector
                </label>
                <Select value={formZone} onValueChange={(v) => v && setFormZone(v)}>
                  <SelectTrigger className="glass-deep border-[#00f0ff]/10 font-data text-sm">
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a]">
                  Status
                </label>
                <Select
                  value={formStatus}
                  onValueChange={(v) => v && setFormStatus(v as CameraStatus)}
                >
                  <SelectTrigger className="glass-deep border-[#00f0ff]/10 font-data text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="degraded">Degraded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialogOpen(false)}
                className="font-heading text-[10px] uppercase tracking-wider text-[#4a6a8a] hover:text-slate-200"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20"
              >
                {editingCameraId ? "UPDATE ASSET" : "DEPLOY"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
