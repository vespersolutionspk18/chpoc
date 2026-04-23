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

import {
  getCameras,
  searchByFace,
  searchByPlate,
  searchByAttributes,
} from "@/lib/api";
import type { Camera, SearchResult } from "@/lib/types";

const CityMap = dynamic(() => import("@/components/city-map"), { ssr: false });

const COLOR_OPTIONS = ["red", "blue", "black", "white", "green", "grey", "brown", "yellow", "orange", "beige", "none"] as const;
const YES_NO_ANY = ["yes", "no", "any"] as const;

// Person-specific attribute options (matches VLM output)
const GENDER_OPTIONS = ["male", "female", "any"] as const;
const AGE_OPTIONS = ["child", "young_adult", "adult", "elderly", "any"] as const;
const CLOTHING_STYLE_OPTIONS = ["traditional Pakistani", "western", "uniform", "casual", "any"] as const;
const UPPER_CLOTHING_OPTIONS = ["kurta/kameez", "shirt", "t-shirt", "jacket", "sweater", "abaya/burqa", "any"] as const;
const LOWER_CLOTHING_OPTIONS = ["shalwar", "trousers", "jeans", "skirt/dress", "shorts", "any"] as const;

// Vehicle-specific attribute options (matches VLM output)
const VEHICLE_TYPES = ["sedan", "SUV", "hatchback", "truck", "van", "bus", "motorcycle", "auto-rickshaw", "chingchi", "pickup", "wagon", "minivan", "any"] as const;
const VEHICLE_MAKES = ["Toyota", "Suzuki", "Honda", "Hyundai", "Kia", "Sazgar", "any"] as const;
const CONDITION_OPTIONS = ["new", "good", "old", "damaged", "any"] as const;

// Track path from camera location (real camera coords, not simulated offsets)
function getTrackPath(result: SearchResult, cameras: Camera[]) {
  const cam = cameras.find((c) => c.id === result.camera_id);
  if (!cam) return [];
  return [{ lat: cam.location_lat, lng: cam.location_lng }];
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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Person attribute search state
  const [pGender, setPGender] = useState("any");
  const [pAge, setPAge] = useState("any");
  const [pUpperClothing, setPUpperClothing] = useState("any");
  const [pUpperColor, setPUpperColor] = useState("none");
  const [pLowerClothing, setPLowerClothing] = useState("any");
  const [pLowerColor, setPLowerColor] = useState("none");
  const [pClothingStyle, setPClothingStyle] = useState("any");
  const [pBeard, setPBeard] = useState("any");
  const [pGlasses, setPGlasses] = useState("any");
  const [pHeadwear, setPHeadwear] = useState("any");
  const [pFaceCovered, setPFaceCovered] = useState("any");

  // Vehicle attribute search state
  const [vType, setVType] = useState("any");
  const [vColor, setVColor] = useState("none");
  const [vMake, setVMake] = useState("any");
  const [vCondition, setVCondition] = useState("any");

  // Vehicle image search state
  const [vehicleFile, setVehicleFile] = useState<File | null>(null);
  const [vehiclePreview, setVehiclePreview] = useState<string | null>(null);

  // Alert search state
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());

  // Detail modal state
  const [detailResult, setDetailResult] = useState<SearchResult | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<"crop" | "full" | "video">("crop");
  const [detailFullFrameUrl, setDetailFullFrameUrl] = useState<string | null>(null);
  const [detailCropUrl, setDetailCropUrl] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
      const res = await searchByFace(faceFile);
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

  const handlePersonSearch = useCallback(async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      const attrs: Record<string, unknown> = {};
      if (pGender !== "any") attrs.gender = pGender;
      if (pAge !== "any") attrs.approximate_age = pAge;
      if (pUpperClothing !== "any") attrs.upper_body = pUpperClothing;
      if (pUpperColor !== "none") attrs.upper_color = pUpperColor;
      if (pLowerClothing !== "any") attrs.lower_body = pLowerClothing;
      if (pLowerColor !== "none") attrs.lower_color = pLowerColor;
      if (pClothingStyle !== "any") attrs.clothing_style = pClothingStyle;
      if (pBeard !== "any") attrs.beard = pBeard === "yes" ? "yes" : "clean-shaven";
      if (pGlasses !== "any") attrs.glasses = pGlasses;
      if (pHeadwear !== "any") attrs.headwear = pHeadwear;
      if (pFaceCovered !== "any") attrs.face_visible = pFaceCovered === "yes" ? "no" : "yes";

      const res = await searchByAttributes({
        object_type: "person",
        attributes: attrs,
        camera_ids: getSelectedCameraIds(),
        start_time: `${startDate}T00:00:00Z`,
        end_time: `${endDate}T23:59:59Z`,
      });
      setResults(res);
    } catch { /* keep */ } finally { setSearching(false); }
  }, [pGender, pAge, pUpperClothing, pUpperColor, pLowerClothing, pLowerColor, pClothingStyle, pBeard, pGlasses, pHeadwear, pFaceCovered, cameraFilter, startDate, endDate]);

  const handleVehicleSearch = useCallback(async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      // Search the vehicle index (9,877 CLIP embeddings) with color/type filters
      // Uses a dummy embedding search with filters — the index filters by metadata
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const resp = await fetch(`${API_URL}/api/video/search-vehicle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          top_k: 50,
          filter_type: vType !== "any" ? vType : null,
          filter_color: vColor !== "none" ? vColor : null,
          filter_make: vMake !== "any" ? vMake : null,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const mapped = (data.matches ?? []).map((m: Record<string, unknown>, i: number) => ({
          track_id: `vattr-${i}`,
          camera_id: (m.camera_id as string) ?? "",
          camera_name: ((m.video_file as string) ?? "").replace("clip_", "").replace(".mp4", "").replace(/_/g, " "),
          timestamp: new Date(((m.timestamp_sec as number) ?? 0) * 1000).toISOString(),
          object_type: "vehicle",
          confidence: (m.similarity as number) ?? 0,
          thumbnail_url: m.thumbnail_b64 ? `data:image/jpeg;base64,${m.thumbnail_b64}` : null,
          attributes: { ...m, thumbnail_b64: undefined },
        }));
        setResults(mapped);
      }
    } catch { /* keep */ } finally { setSearching(false); }
  }, [vType, vColor, vMake, vCondition, cameraFilter, startDate, endDate]);

  const handleVehicleImageSearch = useCallback(async () => {
    if (!vehicleFile) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const form = new FormData();
      form.append("image", vehicleFile);
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const resp = await fetch(`${API_URL}/api/video/search-vehicle-by-image`, {
        method: "POST",
        body: form,
      });
      if (resp.ok) {
        const data = await resp.json();
        const mapped = (data.matches ?? []).map((m: Record<string, unknown>, i: number) => ({
          track_id: `vmatch-${i}`,
          camera_id: (m.camera_id as string) ?? "",
          camera_name: ((m.video_file as string) ?? "").replace("clip_", "").replace(".mp4", "").replace(/_/g, " "),
          timestamp: new Date(((m.timestamp_sec as number) ?? 0) * 1000).toISOString(),
          object_type: "vehicle",
          confidence: (m.similarity as number) ?? 0,
          thumbnail_url: m.thumbnail_b64 ? `data:image/jpeg;base64,${m.thumbnail_b64}` : null,
          attributes: { ...m, thumbnail_b64: undefined },
        }));
        setResults(mapped);
      }
    } catch { /* keep */ } finally { setSearching(false); }
  }, [vehicleFile]);

  async function openDetailModal(result: SearchResult) {
    setDetailResult(result);
    setDetailViewMode("crop");
    setDetailCropUrl(result.thumbnail_url ?? null);

    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const attrs = result.attributes ?? {};
    const vf = (attrs.video_file as string) ?? "";
    const sec = (attrs.timestamp_sec as number) ?? 0;
    const bbox = attrs.bbox as Record<string, number> | undefined;

    if (vf) {
      // Full 4K frame URL
      setDetailFullFrameUrl(`${API}/api/video/extract-frame?video_file=${encodeURIComponent(vf)}&timestamp=${sec}`);

      // 4K crop URL (with bbox)
      if (bbox && bbox.x != null) {
        setDetailCropUrl(`${API}/api/video/extract-frame?video_file=${encodeURIComponent(vf)}&timestamp=${sec}&x=${bbox.x}&y=${bbox.y}&w=${bbox.w}&h=${bbox.h}`);
      }
    } else {
      setDetailFullFrameUrl(null);
    }
  }

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
    const HIDE = ["thumbnail_b64", "bbox", "similarity", "frame_num"];
    const filtered = Object.entries(attrs).filter(([k, v]) =>
      !HIDE.includes(k) && v != null && v !== "" && v !== "unknown" && typeof v !== "object"
    );
    if (filtered.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {filtered.map(([key, val]) => (
          <span
            key={key}
            className="rounded-sm bg-white/5 px-1.5 py-0.5 font-data text-[10px] text-[#4a6a8a]"
          >
            {key.replace(/_/g, " ")}: {typeof val === "number" && key.includes("confidence") ? `${(val * 100).toFixed(0)}%` : String(val)}
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

  const displayResults = results;

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
        <TabsList className="h-auto gap-0 rounded-none bg-transparent p-0 flex-wrap">
          <TabsTrigger value={0} className={tabTriggerClass}>
            <ScanFace className="mr-1.5 size-3.5" />
            FACE MATCH
          </TabsTrigger>
          <TabsTrigger value={1} className={tabTriggerClass}>
            <RectangleHorizontal className="mr-1.5 size-3.5" />
            PLATE TRACE
          </TabsTrigger>
          <TabsTrigger value={2} className={tabTriggerClass}>
            <User className="mr-1.5 size-3.5" />
            PERSON SEARCH
          </TabsTrigger>
          <TabsTrigger value={3} className={tabTriggerClass}>
            <Car className="mr-1.5 size-3.5" />
            VEHICLE SEARCH
          </TabsTrigger>
          <TabsTrigger value={4} className={tabTriggerClass}>
            <SlidersHorizontal className="mr-1.5 size-3.5" />
            ALERT SEARCH
          </TabsTrigger>
        </TabsList>

        {/* ─── Face Search ─── */}
        <TabsContent value={0} className="space-y-4 pt-4">
          <ImageUploadZone onFileSelect={handleFaceFileSelect} preview={facePreview} />
          {cameraFilterRow}
          <Button disabled={searching || !faceFile} onClick={handleFaceSearch}
            className="gap-2 rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? "SCANNING..." : "INITIATE FACE SCAN"}
          </Button>
        </TabsContent>

        {/* ─── Plate Search ─── */}
        <TabsContent value={1} className="space-y-4 pt-4">
          <div className="max-w-md">
            <label className="font-heading text-[9px] uppercase tracking-[0.2em] text-[#4a6a8a] mb-1.5 block">License Plate</label>
            <Input placeholder="ENTER PLATE NUMBER" value={plateText} onChange={(e) => setPlateText(e.target.value)}
              className="glass-deep border-[#00f0ff]/10 font-data text-sm uppercase tracking-wider focus:border-[#00f0ff]/40" />
          </div>
          {cameraFilterRow}
          <Button disabled={searching || !plateText.trim()} onClick={handlePlateSearch}
            className="gap-2 rounded-sm border border-[#ffaa00]/30 bg-[#ffaa00]/10 font-heading text-[10px] uppercase tracking-wider text-[#ffaa00] hover:bg-[#ffaa00]/20">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? "TRACING..." : "TRACE PLATE"}
          </Button>
        </TabsContent>

        {/* ─── Person Attribute Search ─── */}
        <TabsContent value={2} className="space-y-4 pt-4">
          <h3 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]/70">IDENTITY</h3>
          <div className="grid grid-cols-2 gap-3 max-w-3xl lg:grid-cols-4">
            <SelectField label="GENDER" value={pGender} onChange={setPGender} options={[...GENDER_OPTIONS]} />
            <SelectField label="AGE GROUP" value={pAge} onChange={setPAge} options={[...AGE_OPTIONS]} />
            <SelectField label="BEARD" value={pBeard} onChange={setPBeard} options={[...YES_NO_ANY]} />
            <SelectField label="GLASSES" value={pGlasses} onChange={setPGlasses} options={[...YES_NO_ANY]} />
          </div>

          <h3 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]/70 pt-2">APPEARANCE</h3>
          <div className="grid grid-cols-2 gap-3 max-w-3xl lg:grid-cols-4">
            <SelectField label="HEADWEAR" value={pHeadwear} onChange={setPHeadwear} options={["topi", "turban", "cap", "helmet", "any"]} />
            <SelectField label="FACE COVERED" value={pFaceCovered} onChange={setPFaceCovered} options={[...YES_NO_ANY]} />
            <SelectField label="CLOTHING STYLE" value={pClothingStyle} onChange={setPClothingStyle} options={[...CLOTHING_STYLE_OPTIONS]} />
          </div>

          <h3 className="font-heading text-[10px] uppercase tracking-widest text-[#00f0ff]/70 pt-2">CLOTHING</h3>
          <div className="grid grid-cols-2 gap-3 max-w-3xl lg:grid-cols-4">
            <SelectField label="UPPER BODY" value={pUpperClothing} onChange={setPUpperClothing} options={[...UPPER_CLOTHING_OPTIONS]} />
            <SelectField label="UPPER COLOR" value={pUpperColor} onChange={setPUpperColor} options={[...COLOR_OPTIONS]} />
            <SelectField label="LOWER BODY" value={pLowerClothing} onChange={setPLowerClothing} options={[...LOWER_CLOTHING_OPTIONS]} />
            <SelectField label="LOWER COLOR" value={pLowerColor} onChange={setPLowerColor} options={[...COLOR_OPTIONS]} />
          </div>

          {cameraFilterRow}
          <Button disabled={searching} onClick={handlePersonSearch}
            className="gap-2 rounded-sm border border-[#00f0ff]/30 bg-[#00f0ff]/10 font-heading text-[10px] uppercase tracking-wider text-[#00f0ff] hover:bg-[#00f0ff]/20">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <User className="size-3.5" />}
            {searching ? "SEARCHING..." : "SEARCH PERSONS"}
          </Button>
        </TabsContent>

        {/* ─── Vehicle Search ─── */}
        <TabsContent value={3} className="space-y-4 pt-4">
          <h3 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]/70">REVERSE IMAGE SEARCH</h3>
          <ImageUploadZone
            onFileSelect={(file: File) => { setVehicleFile(file); setVehiclePreview(URL.createObjectURL(file)); }}
            preview={vehiclePreview}
          />
          <Button disabled={searching || !vehicleFile} onClick={handleVehicleImageSearch}
            className="gap-2 rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 font-heading text-[10px] uppercase tracking-wider text-[#ff2d78] hover:bg-[#ff2d78]/20">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? "SEARCHING..." : "FIND SIMILAR VEHICLES"}
          </Button>

          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-2" />

          <h3 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]/70">ATTRIBUTE SEARCH</h3>
          <div className="grid grid-cols-2 gap-3 max-w-3xl lg:grid-cols-4">
            <SelectField label="VEHICLE TYPE" value={vType} onChange={setVType} options={[...VEHICLE_TYPES]} />
            <SelectField label="COLOR" value={vColor} onChange={setVColor} options={[...COLOR_OPTIONS]} />
            <SelectField label="MAKE" value={vMake} onChange={setVMake} options={[...VEHICLE_MAKES]} />
            <SelectField label="CONDITION" value={vCondition} onChange={setVCondition} options={[...CONDITION_OPTIONS]} />
          </div>

          {cameraFilterRow}
          <Button disabled={searching} onClick={handleVehicleSearch}
            className="gap-2 rounded-sm border border-[#00ff88]/30 bg-[#00ff88]/10 font-heading text-[10px] uppercase tracking-wider text-[#00ff88] hover:bg-[#00ff88]/20">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Car className="size-3.5" />}
            {searching ? "SEARCHING..." : "SEARCH VEHICLES"}
          </Button>
        </TabsContent>

        {/* ─── Alert Search ─── */}
        <TabsContent value={4} className="space-y-4 pt-4">
          <p className="font-data text-xs text-[#4a6a8a]">
            Select violations to scan for, then click SCAN to analyze video frames with AI.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-2xl lg:grid-cols-3">
            {[
              { id: "triple_sawari", label: "TRIPLE SAWARI", desc: "3+ people on a motorcycle", color: "#ff2d78" },
              { id: "no_helmet", label: "NO HELMET", desc: "Bike rider without helmet", color: "#ff8800" },
              { id: "wrong_way", label: "WRONG WAY", desc: "Vehicle going wrong direction", color: "#ff2d78" },
              { id: "no_seatbelt", label: "NO SEATBELT", desc: "Driver without seatbelt", color: "#ffaa00" },
              { id: "overloaded", label: "OVERLOADED", desc: "Excess passengers/load", color: "#ff8800" },
              { id: "phone_usage", label: "PHONE USAGE", desc: "Driver using mobile phone", color: "#ffaa00" },
            ].map((alert) => {
              const active = selectedAlerts.has(alert.id);
              return (
                <button
                  key={alert.id}
                  onClick={() => {
                    const next = new Set(selectedAlerts);
                    if (active) next.delete(alert.id); else next.add(alert.id);
                    setSelectedAlerts(next);
                  }}
                  className="flex flex-col items-start gap-1 rounded-sm border p-3 transition-all"
                  style={{
                    borderColor: active ? `${alert.color}80` : `${alert.color}20`,
                    background: active ? `${alert.color}20` : `${alert.color}05`,
                    boxShadow: active ? `0 0 12px ${alert.color}30` : "none",
                  }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="size-3 rounded-sm border" style={{
                      borderColor: alert.color,
                      background: active ? alert.color : "transparent",
                    }} />
                    <span className="font-heading text-[10px] uppercase tracking-wider" style={{ color: alert.color }}>{alert.label}</span>
                  </div>
                  <span className="font-data text-[9px] text-[#4a6a8a]">{alert.desc}</span>
                </button>
              );
            })}
          </div>
          {cameraFilterRow}
          <Button
            disabled={searching || selectedAlerts.size === 0}
            onClick={async () => {
              setSearching(true);
              setHasSearched(true);
              try {
                // Search the INDEXED vehicle data for alerts (already analyzed by VLM during indexing)
                const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
                const resp = await fetch(`${API}/api/video/search-vehicle`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ top_k: 9999 }),  // Get ALL vehicles to filter for alerts
                });
                if (resp.ok) {
                  const data = await resp.json();
                  // Filter matches that have the selected alert attributes
                  const alertMatches = (data.matches ?? []).filter((m: Record<string, unknown>) => {
                    const attrs = (m.attributes as Record<string, unknown>) ?? {};
                    for (const alertType of selectedAlerts) {
                      const check = (key: string) => {
                        const v = String(attrs[key] ?? m[key] ?? "").toLowerCase();
                        return v === "yes" || v === "true";
                      };
                      if (alertType === "triple_sawari" && check("triple_sawari")) return true;
                      if (alertType === "no_helmet" && check("no_helmet")) return true;
                      if (alertType === "overloaded" && check("overloaded")) return true;
                      // Passengers count check for triple sawari
                      if (alertType === "triple_sawari" && m.vehicle_class === "motorcycle") {
                        const pv = parseInt(String(attrs.passengers_visible ?? m.passengers_visible ?? "0"));
                        if (pv >= 3) return true;
                      }
                    }
                    return false;
                  });
                  const mapped = alertMatches.map((m: Record<string, unknown>, i: number) => ({
                    track_id: `alert-${i}`,
                    camera_id: (m.camera_id as string) ?? "D01",
                    camera_name: String(m.video_file ?? ""),
                    timestamp: new Date(((m.timestamp_sec as number) ?? 0) * 1000).toISOString(),
                    object_type: "vehicle",
                    confidence: (m.similarity as number) ?? 1,
                    thumbnail_url: m.thumbnail_b64 ? `data:image/jpeg;base64,${m.thumbnail_b64}` : null,
                    attributes: { ...m, thumbnail_b64: undefined },
                  }));
                  setResults(mapped);
                }
              } catch { /* keep */ } finally { setSearching(false); }
            }}
            className="gap-2 rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 font-heading text-[10px] uppercase tracking-wider text-[#ff2d78] hover:bg-[#ff2d78]/20"
          >
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {searching ? `SCANNING ${selectedAlerts.size} ALERTS...` : `SCAN FOR ${selectedAlerts.size} ALERT${selectedAlerts.size !== 1 ? "S" : ""}`}
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
              {/* Thumbnail — click to open detail modal */}
              <div
                className="relative aspect-video rounded-sm bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center overflow-hidden mb-3 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  openDetailModal(result);
                }}
              >
                {result.thumbnail_url ? (
                  <img src={result.thumbnail_url} alt="match" className="absolute inset-0 w-full h-full object-cover" />
                ) : result.object_type === "person" ? (
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
                    {result.attributes?.video_file
                      ? `${String(result.attributes.video_file).replace("clip_","").replace(".mp4","").replace(/_/g," ")} @ ${
                          result.attributes.frame != null
                            ? `frame ${result.attributes.frame}`
                            : result.timestamp
                        }`
                      : result.timestamp}
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
      {/* Detail modal — video clip + sidebar with all info */}
      {detailResult && (() => {
        const a = detailResult.attributes ?? {};
        const HIDE = new Set(["thumbnail_b64", "bbox", "similarity", "track_id"]);
        const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
        const videoFile = a.video_file as string;
        const startSec = (a.start_sec as number) ?? 0;
        const endSec = (a.end_sec as number) ?? 0;
        const hasVideo = !!videoFile && endSec > startSec;

        // Flatten nested attributes object
        const flatAttrs: [string, string][] = [];
        for (const [k, v] of Object.entries(a)) {
          if (HIDE.has(k) || v == null || v === "" || v === "unknown") continue;
          if (k === "attributes" && typeof v === "object") {
            for (const [ak, av] of Object.entries(v as Record<string, unknown>)) {
              if (av != null && av !== "" && av !== "unknown")
                flatAttrs.push([ak, String(av)]);
            }
          } else if (typeof v === "object") {
            continue; // skip bbox etc
          } else {
            flatAttrs.push([k, typeof v === "number"
              ? (k.includes("confidence") ? `${(v * 100).toFixed(0)}%` : String(v))
              : String(v)]);
          }
        }

        return (
        <div className="fixed inset-0 z-[9999] flex bg-black/90" onClick={() => setDetailResult(null)}>
          {/* Left: image/video area */}
          <div className="flex-1 flex flex-col min-w-0" onClick={(e) => e.stopPropagation()}>
            {/* View toggle bar */}
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#00f0ff]/15 bg-[#020a18] px-3">
              {["crop", "full", ...(hasVideo ? ["video"] : [])].map((mode) => (
                <button key={mode} onClick={() => setDetailViewMode(mode as "crop" | "full")}
                  className={`rounded-sm border px-3 py-1 font-heading text-[9px] uppercase tracking-wider transition-colors ${
                    detailViewMode === mode ? "border-[#00f0ff]/40 bg-[#00f0ff]/15 text-[#00f0ff]" : "border-white/10 text-[#4a6a8a] hover:text-white"
                  }`}>
                  {mode === "crop" ? "VEHICLE CROP" : mode === "full" ? "4K FULL FRAME" : "VIDEO CLIP"}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-4 bg-black">
              {detailViewMode === "video" && hasVideo ? (
                <video
                  src={`${API}/api/video/extract-clip?video_file=${encodeURIComponent(videoFile)}&start=${startSec}&end=${Math.min(endSec, startSec + 30)}`}
                  crossOrigin="anonymous"
                  controls
                  autoPlay
                  loop
                  muted
                  className="max-w-full max-h-full object-contain rounded-sm"
                />
              ) : (
                <img
                  key={detailViewMode}
                  src={detailViewMode === "crop" ? (detailCropUrl ?? detailResult.thumbnail_url ?? "") : (detailFullFrameUrl ?? "")}
                  alt="Detail"
                  className="max-w-full max-h-full object-contain rounded-sm"
                  onError={(e) => {
                    if (detailViewMode === "full" && detailResult.thumbnail_url)
                      (e.target as HTMLImageElement).src = detailResult.thumbnail_url;
                  }}
                />
              )}
            </div>
          </div>

          {/* Right sidebar — property:value table */}
          <div className="w-[400px] shrink-0 border-l border-[#00f0ff]/15 bg-[#020a18] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#00f0ff]/15 px-4 py-3">
              <h3 className="font-heading text-xs uppercase tracking-widest text-[#00f0ff]">VEHICLE DETAIL</h3>
              <button onClick={() => setDetailResult(null)} className="rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 px-2 py-1 text-[#ff2d78] font-heading text-[9px] hover:bg-[#ff2d78]/20">CLOSE</button>
            </div>

            {/* License Plate */}
            {(a.plate_text as string) && (
              <div className="border-b border-white/5 px-4 py-3 space-y-2">
                <h4 className="font-heading text-[10px] uppercase tracking-widest text-[#00ff88]">LICENSE PLATE</h4>
                {(a.plate_image_b64 as string) && (
                  <img
                    src={`data:image/jpeg;base64,${a.plate_image_b64 as string}`}
                    alt="Plate"
                    className="mx-auto max-w-full rounded-sm border border-[#00ff88]/20 object-contain max-h-24"
                  />
                )}
                <div className="rounded-sm border border-[#00ff88]/20 bg-[#00ff88]/5 p-2 text-center">
                  <span className="font-data text-xl tracking-wider text-[#00ff88]">{String(a.plate_text)}</span>
                </div>
                {(a.plate_confidence as number) > 0 && (
                  <p className="font-data text-[10px] text-[#4a6a8a] text-center">
                    OCR Confidence: {((a.plate_confidence as number) * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            )}

            {/* Description */}
            {(a.description as string) && (
              <div className="border-b border-white/5 px-4 py-3">
                <p className="font-data text-[12px] leading-relaxed text-slate-300">{String(a.description ?? "")}</p>
              </div>
            )}

            {/* All attributes as property:value rows */}
            <div className="divide-y divide-white/5">
              {flatAttrs.map(([key, val]) => (
                <div key={key} className="flex items-start px-4 py-2">
                  <span className="w-[140px] shrink-0 font-heading text-[8px] uppercase tracking-[0.15em] text-[#4a6a8a] pt-0.5">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="flex-1 font-data text-[12px] text-[#e0f0ff] break-words">
                    {val}
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="p-4 space-y-2 border-t border-white/5">
              <button
                onClick={() => { setDetailResult(null); /* TODO: trigger reverse search */ }}
                className="w-full rounded-sm border border-[#ff2d78]/30 bg-[#ff2d78]/10 py-2.5 font-heading text-[9px] uppercase tracking-wider text-[#ff2d78] hover:bg-[#ff2d78]/20"
              >
                FIND SIMILAR VEHICLES
              </button>
            </div>
          </div>
        </div>
        );
      })()}
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
