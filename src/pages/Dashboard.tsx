import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  BoxSelect,
  Check,
  Grid2x2,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  PlugZap,
  RotateCcw,
  ScanEye,
  Sun,
  ThermometerSun,
  Trash2,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useDesignHistory } from "@/hooks/use-design-history";
import { defaultProject, designFromProject, parseProject, readDraft, writeDraft, type PlannerProject, type PlannerDesign } from "@/lib/project";
import {
  DEFAULT_OBSTACLES,
  MODULE_PRESETS,
  SITE_PRESETS,
  buildShadingField,
  computeShading,
  dedupePolygon,
  layoutPanels,
  normalisePolygon,
  polygonArea,
  roofFrame,
  starterRoof,
  type Mounting,
  type Obstacle,
  type Point2,
} from "@/lib/roof";
import {
  acPowerWatts,
  clearSkyIrradiance,
  dayEvents,
  dailyProfile,
  formatMinutes,
  monthOfDay,
  dayOfYear as doyOf,
  planeOfArrayComponents,
  solarPosition,
  annualEnergy,
  type SystemSpec,
} from "@/lib/solar";

import { ControlRail } from "@/components/planner/ControlRail";
import { InsightRail } from "@/components/planner/InsightRail";
import { LoadCalculator } from "@/components/planner/LoadCalculator";
import {
  summariseUsage,
  type Appliance,
} from "@/lib/appliances";
import {
  RoofScene,
  type SceneMode,
  type SceneView,
} from "@/components/planner/RoofScene";
import {
  SavedDesigns,
  type SavedDesign,
} from "@/components/planner/SavedDesigns";
import { TimeBar } from "@/components/planner/TimeBar";

const GROUND_ALBEDO = 0.2;
const DC_AC_RATIO = 1.15;
const PANEL_GAP = 0.02;
const CONTINUOUS_KEYS = ["tilt", "azimuth", "rackTilt", "setback", "panelLimit", "moduleWatts"];

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return <div className="grid h-screen place-items-center text-muted-foreground">Loading project…</div>;
  return <Planner key={user._id} ownerId={user._id} />;
}

function Planner({ ownerId }: { ownerId: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  /* ------------------------------------------------------------ *
   * Design state
   * ------------------------------------------------------------ */
  const [initial] = useState(() => {
    try { return readDraft(window.localStorage, ownerId) ?? defaultProject(); }
    catch { return defaultProject(); }
  });
  const history = useDesignHistory<PlannerDesign>(designFromProject(initial), CONTINUOUS_KEYS);
  const { design, edit, undo, redo, canUndo, canRedo } = history;
  const { siteId, moduleId, tilt, azimuth, orientation, mounting, rackTilt,
    setback, polygon, obstacles, appliances, panelLimit, moduleWatts } = design;
  const setField = useCallback(<K extends keyof PlannerDesign>(key: K, value: SetStateAction<PlannerDesign[K]>) => {
    edit((current) => ({ [key]: typeof value === "function"
      ? (value as (previous: PlannerDesign[K]) => PlannerDesign[K])(current[key]) : value } as Partial<PlannerDesign>));
  }, [edit]);
  const setSiteId = (value: string) => setField("siteId", value);
  const setModuleId = (value: string) => {
    const preset = MODULE_PRESETS.find((p) => p.id === value);
    if (preset) edit({ moduleId: value, moduleWatts: preset.wattage });
  };
  const setTilt = (value: number) => setField("tilt", value);
  const setAzimuth = (value: number) => setField("azimuth", value);
  const setOrientation = (value: "portrait" | "landscape") => setField("orientation", value);
  const setMounting = (value: Mounting) => setField("mounting", value);
  const setRackTilt = (value: number) => setField("rackTilt", value);
  const setSetback = (value: number) => setField("setback", value);
  const setPolygon = useCallback((value: Point2[]) => setField("polygon", value), [setField]);
  const setObstacles = useCallback((value: SetStateAction<Obstacle[]>) => setField("obstacles", value), [setField]);
  const setAppliances = (value: Appliance[]) => setField("appliances", value);
  const setPanelLimit = (value: number | null) => setField("panelLimit", value);
  const setModuleWatts = (value: number) => setField("moduleWatts", value);

  const [dayOfYear, setDayOfYear] = useState(initial.dayOfYear);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [isPlaying, setIsPlaying] = useState(false);
  const project = useMemo<PlannerProject>(() => ({ ...design, version: 1, dayOfYear, minutes }), [design, dayOfYear, minutes]);
  const latestProject = useRef(project);
  const storageWarning = useRef(false);
  useEffect(() => {
    latestProject.current = project;
    const persist = () => {
      try {
        if (!writeDraft(window.localStorage, ownerId, project) && !storageWarning.current) {
          storageWarning.current = true;
          toast.warning("Local draft recovery is unavailable. Save an option to keep your work.");
        }
      } catch {
        if (!storageWarning.current) {
          storageWarning.current = true;
          toast.warning("Local draft recovery is unavailable. Save an option to keep your work.");
        }
      }
    };
    const timer = window.setTimeout(persist, 300);
    window.addEventListener("pagehide", persist);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", persist);
    };
  }, [ownerId, project]);
  useEffect(() => () => {
    try { writeDraft(window.localStorage, ownerId, latestProject.current); }
    catch { /* No recovery when storage is disabled. */ }
  }, [ownerId]);

  const [mode, setMode] = useState<SceneMode>("orbit");
  const [drawPoints, setDrawPoints] = useState<Point2[]>([]);
  const [hoveredPanel, setHoveredPanel] = useState<string | null>(null);
  const [showSun, setShowSun] = useState(true);
  // Off by default: the first thing a homeowner should see is what the roof will
  // actually look like, not an analytic colour ramp.
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [view, setView] = useState<SceneView>("perspective");

  const site = useMemo(
    () => SITE_PRESETS.find((preset) => preset.id === siteId) ?? SITE_PRESETS[0],
    [siteId],
  );
  const modulePreset = useMemo(
    () =>
      MODULE_PRESETS.find((preset) => preset.id === moduleId) ?? MODULE_PRESETS[0],
    [moduleId],
  );

  /* ------------------------------------------------------------ *
   * Geometry: layout is recomputed only when the design changes
   * ------------------------------------------------------------ */
  const frame = useMemo(() => roofFrame(tilt, azimuth), [tilt, azimuth]);

  const layout = useMemo(
    () =>
      layoutPanels({
        polygon,
        tilt,
        azimuth,
        latitude: site.latitude,
        moduleLength: modulePreset.length,
        moduleWidth: modulePreset.width,
        orientation,
        mounting,
        rackTilt,
        setback,
        gap: PANEL_GAP,
        obstacles,
      }),
    [
      polygon,
      tilt,
      azimuth,
      site.latitude,
      modulePreset.length,
      modulePreset.width,
      orientation,
      mounting,
      rackTilt,
      setback,
      obstacles,
    ],
  );

  const usage = useMemo(() => summariseUsage(appliances), [appliances]);
  const maxPanels = layout.panels.length;
  const panelCount =
    panelLimit === null ? maxPanels : Math.max(0, Math.min(panelLimit, maxPanels));
  const installedPanels = useMemo(
    () => layout.panels.slice(0, panelCount),
    [layout.panels, panelCount],
  );
  const capacityW = panelCount * moduleWatts;

  const system = useMemo<SystemSpec>(
    () => ({
      module: {
        length: modulePreset.length,
        width: modulePreset.width,
        wattage: moduleWatts,
        tempCoefficient: modulePreset.tempCoefficient,
      },
      inverterWatts: Math.max(1, capacityW / DC_AC_RATIO),
      latitude: site.latitude,
      longitude: site.longitude,
      utcOffset: site.utcOffset,
      monthlyClearness: site.clearness,
      monthlyTemperature: site.temperature,
      losses: 0.14,
      noct: 45,
      albedo: GROUND_ALBEDO,
    }),
    [
      modulePreset,
      moduleWatts,
      capacityW,
      site.latitude,
      site.longitude,
      site.utcOffset,
      site.clearness,
      site.temperature,
    ],
  );

  const surface = useMemo(() => ({ tilt: layout.moduleTilt, azimuth }), [layout.moduleTilt, azimuth]);
  const date = useMemo(() => new Date(Date.UTC(2023, 0, dayOfYear)), [dayOfYear]);

  const sun = useMemo(
    () =>
      solarPosition(
        site.latitude,
        site.longitude,
        site.utcOffset,
        date,
        minutes,
      ),
    [site.latitude, site.longitude, site.utcOffset, date, minutes],
  );

  // Instantaneous beam shading from obstructions and, on a rack, from the row
  // in front. Flush modules lie in the roof plane so they cast nothing.
  const shades = useMemo(
    () =>
      computeShading(
        installedPanels,
        obstacles,
        frame,
        layout.moduleHeight,
        layout.rowsCanShade,
        sun.direction,
      ),
    [
      installedPanels,
      layout.moduleHeight,
      layout.rowsCanShade,
      obstacles,
      frame,
      sun.direction,
    ],
  );

  const derate = useMemo(() => {
    if (installedPanels.length === 0) return 1;
    const total = shades.reduce((sum, value) => sum + value, 0);
    return 1 - total / installedPanels.length;
  }, [shades, installedPanels.length]);

  // Shading resolved across the whole year rather than at the current instant.
  // It depends only on the design, never on `minutes`, so the annual figure
  // stays put while the sun is scrubbed.
  const annualShading = useMemo(
    () =>
      buildShadingField({
        panels: installedPanels,
        obstacles,
        frame,
        moduleHeight: layout.moduleHeight,
        rowsCanShade: layout.rowsCanShade,
        latitude: site.latitude,
        longitude: site.longitude,
        utcOffset: site.utcOffset,
      }),
    [
      installedPanels,
      obstacles,
      frame,
      layout.moduleHeight,
      layout.rowsCanShade,
      site.latitude,
      site.longitude,
      site.utcOffset,
    ],
  );

  const shadeAt = useMemo(
    () => (at: Date, atMinutes: number) => annualShading.at(doyOf(at), atMinutes),
    [annualShading],
  );

  const energy = useMemo(
    () => annualEnergy(system, panelCount, surface.tilt, surface.azimuth, shadeAt),
    [system, panelCount, surface, shadeAt],
  );

  const monthIndex = monthOfDay(doyOf(date));

  const live = useMemo(() => {
    const sky = clearSkyIrradiance(sun.altitude, site.clearness[monthIndex]);
    const parts = planeOfArrayComponents(sky, sun, surface, GROUND_ALBEDO);
    const effective = parts.beam * derate + parts.diffuse + parts.ground;
    const { ac } = acPowerWatts(
      system,
      effective,
      site.temperature[monthIndex],
      panelCount,
    );
    return { poa: effective, ac, parts };
  }, [sun, site.clearness, site.temperature, monthIndex, surface, derate, system, panelCount]);

  const dayCurve = useMemo(
    () => dailyProfile(system, panelCount, surface, date, shadeAt),
    [system, panelCount, surface, date, shadeAt],
  );

  const events = useMemo(() => dayEvents(system, date), [system, date]);

  const sunArc = useMemo(() => {
    const points = [];
    for (let m = events.sunrise; m <= events.sunset; m += 12) {
      points.push(
        solarPosition(
          site.latitude,
          site.longitude,
          site.utcOffset,
          date,
          m,
        ).direction,
      );
    }
    return points;
  }, [events, site.latitude, site.longitude, site.utcOffset, date]);

  const arcLabels = useMemo(() => {
    const labels: { direction: ReturnType<typeof solarPosition>["direction"]; text: string }[] = [];
    const firstHour = Math.ceil(events.sunrise / 60);
    const lastHour = Math.floor(events.sunset / 60);
    for (let hour = firstHour; hour <= lastHour; hour += 3) {
      labels.push({
        direction: solarPosition(
          site.latitude,
          site.longitude,
          site.utcOffset,
          date,
          hour * 60,
        ).direction,
        text: `${String(hour).padStart(2, "0")}h`,
      });
    }
    return labels;
  }, [events, site.latitude, site.longitude, site.utcOffset, date]);

  /* ------------------------------------------------------------ *
   * Day sweep animation
   * ------------------------------------------------------------ */
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const delta = now - last;
      last = now;
      setMinutes((current) => {
        const next = current + delta * 0.09;
        return next > 1440 ? 0 : next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  /* ------------------------------------------------------------ *
   * Keyboard shortcuts
   * ------------------------------------------------------------ */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      // Never hijack a key while the user is typing, or while a button holds
      // focus — otherwise space would re-trigger the last button clicked.
      if (
        target &&
        (target.isContentEditable ||
          target.getAttribute("role") === "button" ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) {
        return;
      }

      const scrub = (delta: number) => {
        event.preventDefault();
        setIsPlaying(false);
        setMinutes((current) => (current + delta + 1440) % 1440);
      };

      switch (event.key) {
        case " ":
          event.preventDefault();
          setIsPlaying((value) => !value);
          break;
        case "ArrowLeft":
          scrub(event.shiftKey ? -60 : -15);
          break;
        case "ArrowRight":
          scrub(event.shiftKey ? 60 : 15);
          break;
        case "1":
          setView("perspective");
          break;
        case "2":
          setView("top");
          break;
        case "3":
          setView("sun");
          break;
        case "h":
        case "H":
          setShowHeatmap((value) => !value);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------------------------------------ *
   * Undo / redo shortcuts
   *
   * Separate from the transport handler because Cmd/Ctrl must reach the
   * browser's own editing bindings on text fields, which the guard above
   * deliberately lets through.
   * ------------------------------------------------------------ */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select, [contenteditable], [role='textbox']")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  /* ------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------ */
  const addDrawPoint = useCallback((point: Point2) => {
    setDrawPoints((current) => {
      const last = current[current.length - 1];
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.2) return current;
      return [...current, { x: point.x, y: point.y }];
    });
  }, []);

  const closeShape = useCallback(() => {
    const cleaned = dedupePolygon(drawPoints, 0.2);
    if (cleaned.length < 3) {
      toast.error("Add at least three points to close the roof.");
      return;
    }
    setPolygon(normalisePolygon(cleaned));
    setDrawPoints([]);
    setMode("orbit");
    toast.success("Roof updated — modules relaid out.");
  }, [drawPoints, setPolygon]);

  const cancelDraw = useCallback(() => {
    setDrawPoints([]);
    setMode("orbit");
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || target?.isContentEditable || target?.closest("input, textarea, select, button, [contenteditable], [role='textbox']")) return;
      if (event.key === "Escape" && mode === "draw") cancelDraw();
      if (event.key === "Enter" && mode === "draw") closeShape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, cancelDraw, closeShape]);

  const addObstacle = useCallback(
    (point: Point2) => {
      const snap = (value: number) => Math.round(value * 10) / 10;
      setObstacles((current) => [
        ...current,
        {
          id: `obs-${current.length + 1}-${Date.now()}`,
          x: snap(point.x) - 0.3,
          y: snap(point.y) - 0.3,
          w: 0.6,
          h: 0.6,
          height: 0.9,
          label: "Vent",
        },
      ]);
      setMode("orbit");
      toast.success("Vent added — shadows and yield updated.");
    },
    [setObstacles],
  );

  /* ------------------------------------------------------------ *
   * Saved designs
   * ------------------------------------------------------------ */
  const designs = useQuery(api.designs.list, {}) ?? [];
  const saveDesign = useMutation(api.designs.save);
  const deleteDesign = useMutation(api.designs.remove);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (name: string) => {
    try {
      setIsSaving(true);
      await saveDesign({
        name,
        siteId: site.id,
        latitude: site.latitude,
        longitude: site.longitude,
        utcOffset: site.utcOffset,
        tilt,
        azimuth,
        polygon,
        obstacles,
        moduleId: modulePreset.id,
        orientation,
        setback,
        moduleLength: modulePreset.length,
        moduleWidth: modulePreset.width,
        wattage: moduleWatts,
        panelCount,
        capacityKw: capacityW / 1000,
        annualKwh: energy.annualKwh,
        specificYield: energy.specificYield,
        project,
      });
      toast.success(`Saved “${name}”.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (design: SavedDesign) => {
    const restored = parseProject(design.project ?? {
      ...defaultProject(), siteId: design.siteId, moduleId: design.moduleId,
      tilt: design.tilt, azimuth: design.azimuth, orientation: design.orientation,
      setback: design.setback, polygon: design.polygon, obstacles: design.obstacles,
      moduleWatts: design.wattage, panelLimit: design.panelCount,
    });
    if (!restored) {
      toast.error("This saved project is invalid or uses an unsupported version.");
      return;
    }
    history.replace(designFromProject(restored));
    setDayOfYear(restored.dayOfYear);
    setMinutes(restored.minutes);
    setIsPlaying(false);
    setMode("orbit");
    setDrawPoints([]);
    if (!design.project) toast.warning("Legacy option: mounting and appliances were not saved. Default values were used.");
    toast.success(`Loaded “${design.name}”.`);
  };

  const handleDelete = async (id: SavedDesign["_id"]) => {
    try {
      await deleteDesign({ id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    }
  };

  /* ------------------------------------------------------------ *
   * Derived view values
   * ------------------------------------------------------------ */
  const roofArea = Math.abs(polygonArea(polygon));
  const moduleArea = modulePreset.length * modulePreset.width;
  const coveredArea = panelCount * moduleArea * Math.cos((layout.moduleTilt - tilt) * Math.PI / 180);
  // Preview uses the raw points: normalising would shift the outline away from
  // where the user actually clicked. Normalisation happens on commit instead.
  const ghostPolygon =
    mode === "draw" && drawPoints.length >= 3 ? drawPoints : [];

  const hovered = installedPanels.find((panel) => panel.id === hoveredPanel);
  const hoveredLabel = hovered
    ? `Module ${hovered.row + 1}-${hovered.column + 1} · row ${hovered.row + 1}, column ${hovered.column + 1} · ${Math.round((1 - (shades[installedPanels.indexOf(hovered)] ?? 0)) * 100)}% lit`
    : null;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/70 px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            <BoxSelect className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {site.name} rooftop
            </h1>
            <p className="numeric truncate text-xs text-muted-foreground">
              {panelCount} modules · {layout.rowPitch.toFixed(2)} m rows ·{" "}
              {Math.round(azimuth)}° facing
            </p>
          </div>
        </div>

        {/* Headline numbers, so the answer is legible before you touch anything */}
        <div className="hidden items-center gap-1 rounded-xl border border-border bg-background/60 p-1 xl:flex">
          {[
            [`${(capacityW / 1000).toFixed(2)}`, "kWp installed"],
            [Math.round(energy.annualKwh).toLocaleString(), "kWh per year"],
            [energy.specificYield.toFixed(0), "kWh per kWp"],
            [
              usage.annualKwh > 0
                ? `${Math.round((energy.annualKwh / usage.annualKwh) * 100)}%`
                : "—",
              "generation / use",
            ],
          ].map(([value, label]) => (
            <div key={label} className="px-3 py-1 text-center">
              <p className="numeric text-sm leading-tight font-semibold tabular-nums">
                {value}
              </p>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="cursor-pointer">
                <PlugZap className="size-4" />
                <span className="hidden sm:inline">Usage</span>
                <span className="numeric rounded-full bg-muted px-1.5 text-xs">
                  {Math.round(usage.annualKwh).toLocaleString()}
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Household energy estimate</DialogTitle>
                <DialogDescription>
                  Estimate daily consumption and compare annual energy totals.
                  This is not yet an operational appliance simulator.
                </DialogDescription>
              </DialogHeader>
              <LoadCalculator
                appliances={appliances}
                onChange={setAppliances}
                solarAnnualKwh={energy.annualKwh}
                inverterWatts={capacityW > 0 ? system.inverterWatts : 0}
              />
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="cursor-pointer">
                <Layers className="size-4" />
                <span className="hidden sm:inline">Options</span>
                <span className="numeric rounded-full bg-muted px-1.5 text-xs">
                  {designs.length}
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Saved roof options</DialogTitle>
                <DialogDescription>
                  Compare layouts for the same roof before you commit to one.
                </DialogDescription>
              </DialogHeader>
              <SavedDesigns
                designs={designs}
                saving={isSaving}
                onSave={handleSave}
                onLoad={handleLoad}
                onDelete={handleDelete}
              />
            </DialogContent>
          </Dialog>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 cursor-pointer p-0"
              disabled={!canUndo}
              onClick={undo}
              title="Undo (Cmd/Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 cursor-pointer p-0"
              disabled={!canRedo}
              onClick={redo}
              title="Redo (Cmd/Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 className="size-4" />
            </Button>
          </div>

          <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground md:inline">
            {user?.name || user?.email || "Guest"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {/* Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="hidden min-h-0 border-r border-border bg-card/40 lg:block">
          <ControlRail
            site={site}
            onSiteChange={setSiteId}
            module={modulePreset}
            onModuleChange={setModuleId}
            tilt={tilt}
            onTiltChange={setTilt}
            azimuth={azimuth}
            onAzimuthChange={setAzimuth}
            orientation={orientation}
            onOrientationChange={setOrientation}
            mounting={mounting}
            onMountingChange={setMounting}
            rackTilt={rackTilt}
            onRackTiltChange={setRackTilt}
            setback={setback}
            onSetbackChange={setSetback}
            maxPanels={maxPanels}
            panelCount={panelCount}
            onPanelCountChange={setPanelLimit}
            onUseMaxPanels={() => setPanelLimit(null)}
            moduleWatts={moduleWatts}
            onModuleWattsChange={setModuleWatts}
            showSun={showSun}
            onShowSunChange={setShowSun}
            showHeatmap={showHeatmap}
            onShowHeatmapChange={setShowHeatmap}
            capacityKw={capacityW / 1000}
            annualKwh={energy.annualKwh}
          />
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-none bg-[#eaeef2]">
            <RoofScene
              polygon={polygon}
              panels={installedPanels}
              shades={shades}
              obstacles={obstacles}
              tilt={tilt}
              azimuth={azimuth}
              rackTilt={layout.moduleTilt - tilt}
              sunDirection={sun.direction}
              clearness={site.clearness[monthIndex]}
              sunArc={sunArc}
              arcLabels={arcLabels}
              mode={mode}
              drawPoints={drawPoints}
              ghostPolygon={ghostPolygon}
              hoveredPanel={hoveredPanel}
              onAddDrawPoint={addDrawPoint}
              onHoverPanel={setHoveredPanel}
              onPickObstacle={addObstacle}
              showSun={showSun}
              showHeatmap={showHeatmap}
              view={view}
            />

            {/* Drawing toolbar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="pointer-events-auto flex flex-wrap items-center gap-1.5"
              >
                {mode !== "draw" ? (
                  <>
                    <Button
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => {
                        setDrawPoints([]);
                        setMode("draw");
                      }}
                    >
                      <Pencil className="size-4" />
                      Trace my roof
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => {
                        setMode("obstacle");
                      }}
                    >
                      <BoxSelect className="size-4" />
                      Add vent
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer"
                      onClick={() => setObstacles([])}
                      disabled={obstacles.length === 0}
                    >
                      <Trash2 className="size-4" />
                      Clear vents
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer"
                      onClick={() => {
                        setPolygon(starterRoof());
                        setObstacles(DEFAULT_OBSTACLES);
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Sample roof
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card/90 p-1.5 shadow-sm backdrop-blur">
                    <span className="px-2 text-xs font-medium text-muted-foreground">
                      Click the roof plane to trace its edge · {drawPoints.length} points
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 cursor-pointer"
                      onClick={() => setDrawPoints((current) => current.slice(0, -1))}
                      disabled={drawPoints.length === 0}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 cursor-pointer"
                      onClick={cancelDraw}
                    >
                      <X className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 cursor-pointer"
                      onClick={closeShape}
                      disabled={drawPoints.length < 3}
                    >
                      <Check className="size-4" />
                      Close shape
                    </Button>
                  </div>
                )}
              </motion.div>

              {mode === "obstacle" && (
                <div className="pointer-events-auto rounded-lg border border-primary/30 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
                  Click where the vent sits on the roof.
                </div>
              )}
            </div>

            {/* View presets */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="pointer-events-auto absolute bottom-4 left-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-1 rounded-full border border-border bg-card/85 p-1 shadow-sm backdrop-blur">
                {([
                  ["perspective", "Roof", ScanEye],
                  ["top", "Plan", Grid2x2],
                  ["sun", "Sun's eye", Sun],
                ] as [SceneView, string, typeof Sun][]).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      view === id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowHeatmap((value) => !value)}
                className={`flex cursor-pointer items-center gap-2 self-start rounded-full border border-border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition-colors ${
                  showHeatmap
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/85 text-muted-foreground hover:text-foreground"
                }`}
              >
                <ThermometerSun className="size-3.5" />
                {showHeatmap ? "Beam shade map" : "Realistic view"}
              </button>
            </motion.div>

            {/* Live readout */}
            <div className="pointer-events-none absolute right-4 bottom-4 flex items-center gap-2">
              <div className="rounded-xl border border-border bg-card/90 px-3 py-2 text-right shadow-sm backdrop-blur">
                <p className="numeric text-lg leading-none font-semibold">
                  {formatMinutes(minutes)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {sun.altitude > 0
                    ? `${sun.altitude.toFixed(1)}° above horizon`
                    : "Sun below horizon"}
                </p>
                <p className="hidden text-[10px] text-muted-foreground/70 xl:block">
                  Space to play · ← → to scrub
                </p>
              </div>
            </div>

            {hoveredLabel && mode === "orbit" && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                {hoveredLabel}
              </div>
            )}
          </div>

          <div className="shrink-0 p-3">
            <TimeBar
              dayOfYear={dayOfYear}
              onDayChange={setDayOfYear}
              minutes={minutes}
              onMinutesChange={(value) => {
                setIsPlaying(false);
                setMinutes(value);
              }}
              sunrise={events.sunrise}
              sunset={events.sunset}
              solarNoon={events.noon}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((value) => !value)}
            />
          </div>
        </section>

        <aside className="hidden min-h-0 border-l border-border bg-card/40 lg:block">
          <InsightRail
            panelCount={panelCount}
            capacityKw={capacityW / 1000}
            roofArea={roofArea}
            coveredArea={coveredArea}
            annualKwh={energy.annualKwh}
            specificYield={energy.specificYield}
            shadingDerate={1 - derate}
            monthlyKwh={energy.monthlyKwh}
            dayCurve={dayCurve}
            currentHour={minutes / 60}
            liveAcWatts={live.ac}
            poa={live.poa}
            sunAltitude={sun.altitude}
            sunAzimuth={sun.azimuth}
            maxPanels={maxPanels}
            rowPitch={layout.rowPitch}
            designAltitude={layout.designAltitude}
            mounting={mounting}
            moduleTilt={layout.moduleTilt}
            moduleAlongSlope={layout.moduleAlongSlope}
            annualUsage={usage.annualKwh}
          />
        </aside>
      </div>

      {/* Mobile controls */}
      <div className="shrink-0 border-t border-border bg-card/60 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {SITE_PRESETS.slice(0, 6).map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant={preset.id === siteId ? "default" : "outline"}
              className="shrink-0 cursor-pointer"
              onClick={() => setSiteId(preset.id)}
            >
              {preset.name}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <p className="numeric">
            {panelCount} modules · {(capacityW / 1000).toFixed(2)} kWp
          </p>
          <p className="numeric text-right">
            {Math.round(energy.annualKwh).toLocaleString()} kWh/yr
          </p>
        </div>
      </div>

      {isSaving && (
        <span className="pointer-events-none fixed bottom-4 left-4 hidden items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur lg:flex">
          <Loader2 className="size-3.5 animate-spin" />
          Saving
        </span>
      )}
    </main>
  );
}
