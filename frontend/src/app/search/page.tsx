"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Search,
  ScanFace,
  RectangleHorizontal,
  SlidersHorizontal,
  User,
  Car,
  Loader2,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ImageUploadZone } from "@/components/image-upload-zone";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MOCK_CAMERAS, MOCK_SEARCH_RESULTS } from "@/lib/mock-data";
import {
  getCameras,
  searchByFace,
  searchByPlate,
  searchByAttributes,
} from "@/lib/api";
import type { Camera, SearchResult } from "@/lib/types";

const CityMap = dynamic(() => import("@/components/city-map"), { ssr: false });

const COLOR_OPTIONS = [
  "red",
  "blue",
  "black",
  "white",
  "green",
  "grey",
  "brown",
  "yellow",
  "none",
] as const;

const YES_NO_OPTIONS = ["yes", "no", "any"] as const;
const VEHICLE_TYPES = [
  "car",
  "motorcycle",
  "rickshaw",
  "truck",
  "van",
  "any",
] as const;

// Simulated track path points for a selected result
function getTrackPath(result: SearchResult, cameras: Camera[]) {
  const cam = cameras.find((c) => c.id === result.camera_id);
  if (!cam) return [];
  return [
    { lat: cam.location_lat - 0.002, lng: cam.location_lng - 0.003 },
    { lat: cam.location_lat - 0.001, lng: cam.location_lng - 0.001 },
    { lat: cam.location_lat, lng: cam.location_lng },
    { lat: cam.location_lat + 0.001, lng: cam.location_lng + 0.002 },
  ];
}

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

export default function SearchPage() {
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [plateText, setPlateText] = useState("");
  const [cameraFilter, setCameraFilter] = useState("all");
  const [startDate, setStartDate] = useState("2026-04-19");
  const [endDate, setEndDate] = useState("2026-04-19");
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(
    null
  );
  const [results, setResults] = useState<SearchResult[]>(MOCK_SEARCH_RESULTS);
  const [cameras, setCameras] = useState<Camera[]>(MOCK_CAMERAS);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Attribute search state
  const [upperColor, setUpperColor] = useState("none");
  const [lowerColor, setLowerColor] = useState("none");
  const [hat, setHat] = useState("any");
  const [glasses, setGlasses] = useState("any");
  const [bag, setBag] = useState("any");
  const [backpack, setBackpack] = useState("any");
  const [vehicleType, setVehicleType] = useState("any");
  const [vehicleColor, setVehicleColor] = useState("none");

  // Fetch cameras from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const camerasData = await getCameras();
        if (!cancelled) setCameras(camerasData);
      } catch {
        // Keep mock cameras
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const trackPath = useMemo(() => {
    if (!selectedResult) return [];
    return getTrackPath(selectedResult, cameras);
  }, [selectedResult, cameras]);

  function handleFaceFileSelect(file: File) {
    const url = URL.createObjectURL(file);
    setFacePreview(url);
    setFaceFile(file);
  }

  // Build camera IDs array for API
  function getSelectedCameraIds(): string[] | undefined {
    if (cameraFilter === "all") return undefined;
    return [cameraFilter];
  }

  const handleFaceSearch = useCallback(async () => {
    if (!faceFile) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await searchByFace(
        faceFile,
        getSelectedCameraIds(),
        `${startDate}T00:00:00Z`,
        `${endDate}T23:59:59Z`
      );
      setResults(res);
    } catch {
      // Keep current results
    } finally {
      setSearching(false);
    }
  }, [faceFile, cameraFilter, startDate, endDate]);

  const handlePlateSearch = useCallback(async () => {
    if (!plateText.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const res = await searchByPlate({
        plate_text: plateText.trim(),
        camera_ids: getSelectedCameraIds(),
        start_time: `${startDate}T00:00:00Z`,
        end_time: `${endDate}T23:59:59Z`,
      });
      setResults(res);
    } catch {
      // Keep current results
    } finally {
      setSearching(false);
    }
  }, [plateText, cameraFilter, startDate, endDate]);

  const handleAttributeSearch = useCallback(async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      const attrs: Record<string, unknown> = {};
      if (upperColor !== "none") attrs.upper_color = upperColor;
      if (lowerColor !== "none") attrs.lower_color = lowerColor;
      if (hat !== "any") attrs.hat = hat === "yes";
      if (glasses !== "any") attrs.glasses = glasses === "yes";
      if (bag !== "any") attrs.bag = bag === "yes";
      if (backpack !== "any") attrs.backpack = backpack === "yes";
      if (vehicleType !== "any") attrs.vehicle_type = vehicleType;
      if (vehicleColor !== "none") attrs.color = vehicleColor;

      const res = await searchByAttributes({
        attributes: attrs,
        camera_ids: getSelectedCameraIds(),
        start_time: `${startDate}T00:00:00Z`,
        end_time: `${endDate}T23:59:59Z`,
      });
      setResults(res);
    } catch {
      // Keep current results
    } finally {
      setSearching(false);
    }
  }, [upperColor, lowerColor, hat, glasses, bag, backpack, vehicleType, vehicleColor, cameraFilter, startDate, endDate]);

  function renderObjectTypeBadge(type: string) {
    const config: Record<string, { className: string; icon: typeof User }> = {
      person: {
        className: "bg-[#00f0ff]/15 text-[#00f0ff] border-[#00f0ff]/20",
        icon: User,
      },
      vehicle: {
        className: "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/20",
        icon: Car,
      },
      bike: {
        className: "bg-[#ffaa00]/15 text-[#ffaa00] border-[#ffaa00]/20",
        icon: Car,
      },
    };
    const c = config[type] ?? config.person;
    const Icon = c.icon;
    return (
      <Badge variant="outline" className={`${c.className} font-heading text-[9px] uppercase tracking-wider`}>
        <Icon className="mr-1 size-3" />
        {type}
      </Badge>
    );
  }

  function renderAttributes(attrs: Record<string, unknown> | null) {
    if (!attrs) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {Object.entries(attrs).map(([key, val]) => (
          <span
            key={key}
            className="rounded-sm bg-white/5 px-1.5 py-0.5 font-data text-[10px] text-[#4a6a8a]"
          >
            {key}: {String(val)}
          </span>
        ))}
      </div>
    );
  }

  // Tab trigger style
  const tabTriggerClass =
    "rounded-none border border-[#00f0ff]/15 bg-transparent px-4 py-2 font-heading text-[10px] uppercase tracking-[0.15em] text-[#4a6a8a] transition-all data-[state=active]:bg-[#00f0ff]/10 data-[state=active]:text-[#00f0ff] data-[state=active]:border-[#00f0ff]/40 data-[state=active]:shadow-[0_0_10px_rgba(0,240,255,0.15)] hover:text-[#00f0ff]/60";

  const cameraFilterRow = (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1.5">
        <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">Camera</label>
        <Select value={cameraFilter} onValueChange={(v) => v && setCameraFilter(v)}>
          <SelectTrigger className="w-[220px] glass-deep border-[#00f0ff]/10 font-data text-sm">
            <SelectValue placeholder="All cameras" />
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
      </div>
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartChange={setStartDate}
        onEndChange={setEndDate}
      />
    </div>
  );

  const displayResults = hasSearched ? results : MOCK_SEARCH_RESULTS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" as const }}
      className="space-y-6"
    >
      <PageHeader
        title="INVESTIGATION TERMINAL"
        description="Cross-camera forensic search and tracking"
      />

      {/* ----- Tabs ----- */}
      <Tabs defaultValue={0}>
        <TabsList className="h-auto gap-0 rounded-none bg-transparent p-0">
          <TabsTrigger value={0} className={tabTriggerClass}>
            <ScanFace className="mr-1.5 size-3.5" />
            FACE MATCH
          </TabsTrigger>
          <TabsTrigger value={1} className={tabTriggerClass}>
            <RectangleHorizontal className="mr-1.5 size-3.5" />
            PLATE TRACE
          </TabsTrigger>
          <TabsTrigger value={2} className={tabTriggerClass}>
            <SlidersHorizontal className="mr-1.5 size-3.5" />
            ATTRIBUTE SCAN
          </TabsTrigger>
        </TabsList>

        {/* --- Face Search --- */}
        <TabsContent value={0} className="space-y-4 pt-4">
          <ImageUploadZone
            onFileSelect={handleFaceFileSelect}
            preview={facePreview}
          />
          {cameraFilterRow}
          <Button
            disabled={searching || !faceFile}
            onClick={handleFaceSearch}
            className="gap-2 rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20 hover:shadow-[0_0_15px_rgba(0,240,255,0.2)]"
          >
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? "SCANNING..." : "INITIATE SCAN"}
          </Button>
        </TabsContent>

        {/* --- Plate Search --- */}
        <TabsContent value={1} className="space-y-4 pt-4">
          <div className="max-w-md">
            <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a] mb-1.5 block">
              License Plate
            </label>
            <Input
              placeholder="ENTER PLATE DESIGNATION"
              value={plateText}
              onChange={(e) => setPlateText(e.target.value)}
              className="glass-deep border-[#00f0ff]/10 font-data text-sm uppercase tracking-wider focus:border-[#00f0ff]/40"
            />
          </div>
          {cameraFilterRow}
          <Button
            disabled={searching || !plateText.trim()}
            onClick={handlePlateSearch}
            className="gap-2 rounded-sm border border-[#ffaa00]/30 bg-[#ffaa00]/10 font-heading text-[10px] uppercase tracking-wider text-[#ffaa00] hover:bg-[#ffaa00]/20 hover:shadow-[0_0_15px_rgba(255,170,0,0.2)]"
          >
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? "TRACING..." : "TRACE"}
          </Button>
        </TabsContent>

        {/* --- Attribute Search --- */}
        <TabsContent value={2} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4 max-w-2xl lg:grid-cols-4">
            <SelectField label="UPPER COLOR" value={upperColor} onChange={setUpperColor} options={[...COLOR_OPTIONS]} />
            <SelectField label="LOWER COLOR" value={lowerColor} onChange={setLowerColor} options={[...COLOR_OPTIONS]} />
            <SelectField label="HAT" value={hat} onChange={setHat} options={[...YES_NO_OPTIONS]} />
            <SelectField label="GLASSES" value={glasses} onChange={setGlasses} options={[...YES_NO_OPTIONS]} />
            <SelectField label="BAG" value={bag} onChange={setBag} options={[...YES_NO_OPTIONS]} />
            <SelectField label="BACKPACK" value={backpack} onChange={setBackpack} options={[...YES_NO_OPTIONS]} />
            <SelectField label="VEHICLE TYPE" value={vehicleType} onChange={setVehicleType} options={[...VEHICLE_TYPES]} />
            <SelectField label="VEHICLE COLOR" value={vehicleColor} onChange={setVehicleColor} options={[...COLOR_OPTIONS]} />
          </div>
          {cameraFilterRow}
          <Button
            disabled={searching}
            onClick={handleAttributeSearch}
            className="gap-2 rounded-sm border border-[#00ff88]/30 bg-[#00ff88]/10 font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/20 hover:shadow-[0_0_15px_rgba(0,255,136,0.2)]"
          >
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? "SEARCHING..." : "SEARCH"}
          </Button>
        </TabsContent>
      </Tabs>

      {/* ----- Results ----- */}
      <SectionTitle>SEARCH RESULTS</SectionTitle>

      {displayResults.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayResults.map((result) => (
            <div
              key={result.track_id}
              className={`hud-card cursor-pointer p-4 transition-all hover:border-[#00f0ff]/30 ${
                selectedResult?.track_id === result.track_id
                  ? "border-[#00f0ff]/50 shadow-[0_0_20px_rgba(0,240,255,0.1)]"
                  : ""
              }`}
              onClick={() =>
                setSelectedResult(
                  selectedResult?.track_id === result.track_id ? null : result
                )
              }
            >
              {/* Thumbnail placeholder with scan-line overlay */}
              <div className="relative aspect-video rounded-sm bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center overflow-hidden mb-3">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.04]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)",
                  }}
                />
                {result.object_type === "person" ? (
                  <User className="size-10 text-[#4a6a8a]/30" />
                ) : (
                  <Car className="size-10 text-[#4a6a8a]/30" />
                )}
              </div>

              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-data text-sm text-slate-200 truncate">
                    {result.camera_name}
                  </p>
                  <p className="font-data text-[10px] text-[#4a6a8a]">
                    {result.timestamp}
                  </p>
                </div>
                <span className={`font-data text-xs shrink-0 ${confidenceColor(result.confidence)}`}>
                  {(result.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {renderObjectTypeBadge(result.object_type)}
              {renderAttributes(result.attributes)}
            </div>
          ))}
        </div>
      ) : (
        <div className="hud-card flex flex-col items-center justify-center py-16">
          <Search className="size-8 text-[#4a6a8a]/40 mb-3" />
          <span className="font-heading text-xs uppercase tracking-wider text-[#4a6a8a]">
            NO MATCHES FOUND
          </span>
          <span className="font-data text-xs text-[#4a6a8a]/60 mt-1">
            Adjust search parameters and try again
          </span>
        </div>
      )}

      {/* ----- Track Path Map ----- */}
      {selectedResult && trackPath.length > 0 && (
        <div className="space-y-3">
          <SectionTitle>TRACK PATH</SectionTitle>
          <div className="hud-card p-4">
            <CityMap
              cameras={cameras.filter(
                (c) => c.id === selectedResult.camera_id
              )}
              center={[trackPath[0].lat, trackPath[0].lng]}
              zoom={16}
              height="350px"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Reusable select field for attributes
// ---------------------------------------------------------------------------

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a]">
        {label}
      </label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="glass-deep border-[#00f0ff]/10 font-data text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
