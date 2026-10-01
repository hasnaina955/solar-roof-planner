import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  MODULE_PRESETS,
  SITE_PRESETS,
  formatDegrees,
  type ModulePreset,
  type Mounting,
  type SitePreset,
} from "@/lib/roof";
import { Compass, PanelTop, Ruler, Sun } from "lucide-react";
import { useRef } from "react";

interface ControlRailProps {
  site: SitePreset;
  onSiteChange: (id: string) => void;
  module: ModulePreset;
  onModuleChange: (id: string) => void;
  tilt: number;
  onTiltChange: (value: number) => void;
  azimuth: number;
  onAzimuthChange: (value: number) => void;
  orientation: "portrait" | "landscape";
  onOrientationChange: (value: "portrait" | "landscape") => void;
  mounting: Mounting;
  onMountingChange: (value: Mounting) => void;
  rackTilt: number;
  onRackTiltChange: (value: number) => void;
  setback: number;
  onSetbackChange: (value: number) => void;
  maxPanels: number;
  panelCount: number;
  onPanelCountChange: (value: number) => void;
  onUseMaxPanels: () => void;
  moduleWatts: number;
  onModuleWattsChange: (value: number) => void;
  showSun: boolean;
  onShowSunChange: (value: boolean) => void;
  showHeatmap: boolean;
  onShowHeatmapChange: (value: boolean) => void;
  /** Live headline numbers, surfaced at the top of the rail. */
  capacityKw: number;
  annualKwh: number;
}

/** Numbered step headers so the long rail reads as 3 guided steps. */
function Section({ step, title, caption }: { step: string; title: string; caption?: string }) {
  return (
    <div className="flex gap-3 border-t border-border/70 pt-4">
      <span className="numeric grid size-6 shrink-0 place-items-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{step}</span>
      <div className="space-y-1">
        <h3 className="text-[0.8rem] font-semibold tracking-tight">{title}</h3>
        {caption ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  children,
}: {
  label: string;
  hint?: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </Label>
        {value && (
          <span className="numeric text-xs font-semibold tabular-nums">{value}</span>
        )}
      </div>
      {hint ? (
        <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

function AzimuthDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onChange((deg + 360) % 360);
  };

  const rad = ((value - 90) * Math.PI) / 180;

  return (
    <div className="flex items-center gap-4">
      <svg
        ref={ref}
        viewBox="-50 -50 100 100"
        className="size-24 shrink-0 cursor-grab touch-none select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          handlePointer(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) handlePointer(event);
        }}
      >
        <circle r="44" className="fill-muted stroke-border" strokeWidth="1" />
        {[0, 90, 180, 270].map((tick) => {
          const a = ((tick - 90) * Math.PI) / 180;
          return (
            <line
              key={tick}
              x1={Math.cos(a) * 36}
              y1={Math.sin(a) * 36}
              x2={Math.cos(a) * 42}
              y2={Math.sin(a) * 42}
              className="stroke-muted-foreground"
              strokeWidth="1.5"
            />
          );
        })}
        <text x="0" y="-30" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          N
        </text>
        <text x="30" y="3.5" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          E
        </text>
        <text x="0" y="36" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          S
        </text>
        <text x="-30" y="3.5" textAnchor="middle" className="fill-muted-foreground text-[9px]">
          W
        </text>
        <line
          x1={0}
          y1={0}
          x2={Math.cos(rad) * 34}
          y2={Math.sin(rad) * 34}
          className="stroke-primary"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={0} cy={0} r="4" className="fill-primary" />
        <circle
          cx={Math.cos(rad) * 34}
          cy={Math.sin(rad) * 34}
          r="4.5"
          className="fill-primary"
        />
      </svg>
      <div className="space-y-1.5">
        <p className="numeric text-sm font-semibold">{Math.round(value)}°</p>
        <p className="text-xs text-muted-foreground">{formatDegrees(value)}</p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 cursor-pointer px-2 text-xs"
          onClick={() => onChange(180)}
        >
          Face south
        </Button>
      </div>
    </div>
  );
}

export function ControlRail(props: ControlRailProps) {
  const {
    site,
    onSiteChange,
    module,
    onModuleChange,
    tilt,
    onTiltChange,
    azimuth,
    onAzimuthChange,
    orientation,
    onOrientationChange,
    mounting,
    onMountingChange,
    rackTilt,
    onRackTiltChange,
    setback,
    onSetbackChange,
    maxPanels,
    panelCount,
    onPanelCountChange,
    onUseMaxPanels,
    moduleWatts,
    onModuleWattsChange,
    showSun,
    onShowSunChange,
    showHeatmap,
    onShowHeatmapChange,
    capacityKw,
    annualKwh,
  } = props;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      {/* Live headline, so the answer stays on screen while you scroll inputs. */}
      <div className="panel-surface relative overflow-hidden p-3.5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="numeric text-2xl leading-none font-semibold tracking-tight">
              {Math.round(annualKwh).toLocaleString("en-IN")}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              kWh a year from {panelCount} modules
            </p>
          </div>
          <div className="text-right">
            <p className="numeric text-sm font-semibold">
              {capacityKw.toFixed(2)}
            </p>
            <p className="text-[11px] text-muted-foreground">kWp DC</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Section
          step="1"
          title="The roof"
          caption="Trace the outline on the model, then set how it faces the sun."
        />

        <Field label="Location">
        <Select value={site.id} onValueChange={onSiteChange}>
          <SelectTrigger className="w-full cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SITE_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name} · {preset.region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="numeric text-xs text-muted-foreground">
          {site.latitude.toFixed(2)}°, {site.longitude.toFixed(2)}° · UTC
          {site.utcOffset >= 0 ? "+" : ""}
          {site.utcOffset}
        </p>
      </Field>

      <Field label="Roof pitch" value={`${Math.round(tilt)}°`}>
        <Slider
          value={[tilt]}
          min={0}
          max={55}
          step={1}
          onValueChange={([value]) => onTiltChange(value)}
        />
      </Field>

      <Field label="Roof facing" value={formatDegrees(azimuth)}>
        <AzimuthDial value={azimuth} onChange={onAzimuthChange} />
      </Field>

      </div>

      <div className="space-y-4">
        <Section
          step="2"
          title="The array"
          caption="Everything here feeds the solar model directly. Change any value and the layout, shadows and yield update instantly."
        />

        <Field label="Module">
        <Select value={module.id} onValueChange={onModuleChange}>
          <SelectTrigger className="w-full cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODULE_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="numeric text-xs text-muted-foreground">
          {(module.length * 1000).toFixed(0)} × {(module.width * 1000).toFixed(0)} mm ·{" "}
          {module.wattage} W
        </p>
      </Field>

      <Field label="Orientation">
        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-secondary/60 p-1">
          {(["portrait", "landscape"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onOrientationChange(value)}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                orientation === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Mounting"
        hint={
          mounting === "flush"
            ? "Modules lie flat on the roof, so rows cannot shade each other and the array packs densely."
            : "Modules stand on rails; spacing is estimated for winter noon, not all-day shade avoidance."
        }
      >
        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-secondary/60 p-1">
          {(["flush", "racked"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onMountingChange(value)}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                mounting === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </Field>

      {mounting === "racked" && (
        <Field
          label="Rack tilt above roof"
          value={`${Math.round(Math.min(rackTilt, 70 - tilt))}° effective`}
        >
          <Slider
            value={[Math.min(rackTilt, 70 - tilt)]}
            min={0}
            max={Math.min(35, 70 - tilt)}
            step={1}
            onValueChange={([value]) => onRackTiltChange(value)}
          />
        </Field>
      )}

      <Field
        label="Edge setback"
        hint="Clearance kept at roof edges, walkways and fire access."
        value={`${setback.toFixed(2)} m`}
      >
        <Slider
          value={[setback]}
          min={0}
          max={1.5}
          step={0.05}
          onValueChange={([value]) => onSetbackChange(value)}
        />
      </Field>

      <Field
        label="Module output"
        hint="Nameplate watts. Sets the capacity of every panel."
        value={`${moduleWatts} W`}
      >
        <Slider
          value={[moduleWatts]}
          min={100}
          max={1000}
          step={5}
          onValueChange={([value]) => onModuleWattsChange(value)}
        />
      </Field>

      <Field
        label="Array size"
        hint={
          panelCount < maxPanels
            ? `${maxPanels - panelCount} more fit on this roof.`
            : "Using every position that fits this roof."
        }
        value={`${panelCount} panels`}
      >
        <Slider
          value={[panelCount]}
          min={0}
          max={Math.max(1, maxPanels)}
          step={1}
          onValueChange={([value]) => onPanelCountChange(value)}
        />
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="numeric text-xs text-muted-foreground">
            {((panelCount * moduleWatts) / 1000).toFixed(2)} kWp DC
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 cursor-pointer px-2 text-xs"
            onClick={onUseMaxPanels}
            disabled={panelCount >= maxPanels}
          >
            Use maximum
          </Button>
        </div>
      </Field>

      </div>

      <div className="space-y-4">
        <Section step="3" title="Display" caption="How the model is drawn — never affects yield." />

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <Sun className="size-4 text-muted-foreground" />
              Sun path
            </span>
            <Switch checked={showSun} onCheckedChange={onShowSunChange} />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <PanelTop className="size-4 text-muted-foreground" />
              Beam shade map
            </span>
            <Switch
              checked={showHeatmap}
              onCheckedChange={onShowHeatmapChange}
            />
          </label>
        </div>
      </div>

      <div className="mt-auto space-y-2 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Ruler className="size-3.5" />
          Metres, true surface area
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Compass className="size-3.5" />
          Azimuth from true north
        </div>
        <Badge variant="secondary" className="w-fit">
          NOAA solar geometry
        </Badge>
      </div>
    </div>
  );
}
