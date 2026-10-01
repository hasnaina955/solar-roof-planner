import { motion } from "framer-motion";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Gauge,
  LayoutGrid,
  Zap,
  Sun,
  TrendingUp,
} from "lucide-react";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface InsightRailProps {
  panelCount: number;
  capacityKw: number;
  roofArea: number;
  coveredArea: number;
  annualKwh: number;
  specificYield: number;
  shadingDerate: number;
  monthlyKwh: number[];
  dayCurve: { hour: number; kwh: number; altitude: number }[];
  currentHour: number;
  liveAcWatts: number;
  poa: number;
  sunAltitude: number;
  sunAzimuth: number;
  maxPanels: number;
  rowPitch: number;
  designAltitude: number;
  mounting: "flush" | "racked";
  moduleTilt: number;
  moduleAlongSlope: number;
  annualUsage: number;
}

function Kpi({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card
      className={`gap-0 p-3.5 ${accent ? "border-primary/30 bg-primary/[0.06]" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <p className="numeric mt-2 text-2xl leading-none font-semibold tracking-tight">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold tracking-tight">{children}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function InsightRail(props: InsightRailProps) {
  const {
    panelCount,
    capacityKw,
    roofArea,
    coveredArea,
    annualKwh,
    specificYield,
    shadingDerate,
    monthlyKwh,
    dayCurve,
    currentHour,
    liveAcWatts,
    poa,
    sunAltitude,
    sunAzimuth,
    maxPanels,
    rowPitch,
    designAltitude,
    mounting,
    moduleTilt,
    moduleAlongSlope,
    annualUsage,
  } = props;

  const coverage = roofArea > 0 ? (coveredArea / roofArea) * 100 : 0;
  const ratio = annualUsage > 0 ? (annualKwh / annualUsage) * 100 : 0;
  const dayTotal = dayCurve.reduce((sum, point) => sum + point.kwh, 0);
  const monthlyData = MONTHS.map((month, index) => ({
    month,
    kwh: Math.round(monthlyKwh[index] ?? 0),
  }));
  const peak = dayCurve.reduce((max, point) => Math.max(max, point.kwh), 0);

  const [chartTab, setChartTab] = useState<"day" | "year">("day");
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="panel-surface relative overflow-hidden p-4">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400/70 via-primary/60 to-transparent" />
        <p className="eyebrow text-primary">Verdict</p>
        <p className="display mt-1 text-[1.35rem] font-semibold leading-tight">{capacityKw.toFixed(2)} kWp · {Math.round(annualKwh).toLocaleString("en-IN")} kWh/yr</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{panelCount} of {maxPanels} modules fit · {specificYield.toFixed(0)} kWh per kWp{annualUsage > 0 ? ` · covers ${ratio.toFixed(0)}% of modeled annual use (energy ratio, not savings)` : ""} · {(shadingDerate * 100).toFixed(1)}% beam shade at selected time.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Kpi
          label="Capacity"
          value={capacityKw.toFixed(2)}
          unit="kWp"
          sub={
            panelCount < maxPanels
              ? `${panelCount} of ${maxPanels} modules · ${maxPanels - panelCount} spare`
              : `${panelCount} modules · roof full`
          }
          icon={Gauge}
          accent
        />
        <Kpi
          label="Per year"
          value={Math.round(annualKwh).toLocaleString("en-IN")}
          unit="kWh"
          sub={`${specificYield.toFixed(0)} kWh per kWp`}
          icon={TrendingUp}
        />
        <Kpi
          label="Roof used"
          value={coverage.toFixed(0)}
          unit="%"
          sub={`${coveredArea.toFixed(1)} of ${roofArea.toFixed(1)} m²`}
          icon={LayoutGrid}
        />
        <Kpi
          label="Generation / use"
          value={annualUsage > 0 ? ratio.toFixed(0) : "—"}
          unit="%"
          sub="Annual energy ratio, not savings"
          icon={Zap}
        />
      </div>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Output at selected time
            </p>
            <p className="numeric mt-1.5 text-3xl leading-none font-semibold tracking-tight">
              {(liveAcWatts / 1000).toFixed(2)}
              <span className="ml-1 text-base font-medium text-muted-foreground">
                kW AC
              </span>
            </p>
          </div>
          <Activity className="size-5 text-primary" />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Irradiance</dt>
            <dd className="numeric mt-0.5 font-semibold">{Math.round(poa)} W/m²</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sun altitude</dt>
            <dd className="numeric mt-0.5 font-semibold">
              {sunAltitude.toFixed(1)}°
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sun azimuth</dt>
            <dd className="numeric mt-0.5 font-semibold">
              {sunAzimuth.toFixed(0)}°
            </dd>
          </div>
        </dl>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2"><SectionTitle hint={chartTab === "day" ? `${dayTotal.toFixed(1)} kWh on the selected day` : "Illustrative monthly presets"}>{chartTab === "day" ? "Selected day’s estimate" : "Monthly output"}</SectionTitle><div role="tablist" aria-label="Output charts" className="flex shrink-0 gap-0.5 rounded-full border border-border bg-muted/60 p-0.5">{(["day", "year"] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={chartTab === t} onClick={() => setChartTab(t)} className={`relative rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${chartTab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{chartTab === t && <motion.span layoutId="insight-chart-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-full bg-card shadow-sm" />}<span className="relative z-10">{t === "day" ? "Day" : "Year"}</span></button>)}</div></div>
        {chartTab === "day" ? <>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={dayCurve}
              margin={{ top: 6, right: 4, bottom: 0, left: -22 }}
            >
              <defs>
                <linearGradient id="dayFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="hour"
                type="number"
                domain={[0, 24]}
                ticks={[0, 6, 12, 18, 24]}
                tickFormatter={(value: number) => `${value}h`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-border)" }}
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value.toFixed(2)} kWh`, "Output"]}
                labelFormatter={(hour: number) =>
                  `${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 === 0 ? "00" : "30"}`
                }
              />
              <ReferenceLine
                x={currentHour}
                stroke="var(--color-primary)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="kwh"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#dayFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="numeric mt-1 text-xs text-muted-foreground">
          Peak {peak.toFixed(2)} kWh per half hour
        </p>
        </>
        : <>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                interval={1}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
              <Tooltip
                cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} kWh`, "Monthly"]}
              />
              <Bar dataKey="kwh" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </>}
      </div>

      <div>
        <SectionTitle hint="How the layout was solved">Layout maths</SectionTitle>
        <Card className="divide-y divide-border p-0">
          {[
            {
              icon: Sun,
              label: "Design day",
              value: `${designAltitude.toFixed(1)}° profile`,
              hint: "Winter solstice noon sun",
            },
            mounting === "racked"
              ? {
                  icon: LayoutGrid,
                  label: "Row pitch",
                  value: `${rowPitch.toFixed(2)} m`,
                  hint: `${moduleTilt.toFixed(0)}° module surface; winter-noon spacing estimate, not all-day clearance`,
                }
              : {
                  icon: LayoutGrid,
                  label: "Row gap",
                  value: `${Math.max(0, rowPitch - moduleAlongSlope).toFixed(2)} m`,
                  hint: "Flush rows are coplanar, so nothing shadows them",
                },
            {
              icon: Activity,
              label: "Shading loss",
              value: `${(shadingDerate * 100).toFixed(1)}%`,
              hint: "Sampled beam shadow at selected time, not annual loss",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-start gap-3 p-3.5">
              <row.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">{row.label}</span>
                  <span className="numeric text-xs font-semibold">{row.value}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.hint}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
