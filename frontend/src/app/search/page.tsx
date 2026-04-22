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

  // Expanded thumbnail modal
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
          attributes: { type: m.vehicle_class, color: m.dominant_color, make: m.make || "unknown", camera: m.camera_id, timestamp: `${Math.floor((m.timestamp_sec as number || 0) / 60)}:${(Math.floor((m.timestamp_sec as number || 0)) % 60).toString().padStart(2, "0")}` },
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
          attributes: { type: m.vehicle_class, color: m.dominant_color, make: m.make || "unknown", camera: m.camera_id, timestamp: `${Math.floor((m.timestamp_sec as number || 0) / 60)}:${(Math.floor((m.timestamp_sec as number || 0)) % 60).toString().padStart(2, "0")}` },
        }));
        setResults(mapped);
      }
    } catch { /* keep */ } finally { setSearching(false); }
  }, [vehicleFile]);

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
              {/* Thumbnail — clickable for fullscreen */}
              <div
                className="relative aspect-video rounded-sm bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center overflow-hidden mb-3 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (result.thumbnail_url) setExpandedImage(result.thumbnail_url);
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
      {/* Expanded image modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setExpandedImage(null)}
        >
          <img src={expandedImage} alt="Expanded" className="max-w-[85vw] max-h-[85vh] rounded-sm border border-[#00f0ff]/30 object-contain" />
          <span className="absolute top-4 right-4 font-heading text-xs text-[#4a6a8a]">CLICK TO CLOSE</span>
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
