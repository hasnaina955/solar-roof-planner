import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import { BatteryCharging, CircleAlert, CircleCheck, Sun, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinutes } from "@/lib/solar";
import { batteryBank, type SimulationConfig, type SimulationResult, type scheduleAdvice, type LoadReason } from "@/lib/simulator";

const REASONS: Record<LoadReason, string> = {
  off: "Not scheduled at this time",
  running: "Running",
  "inverter-watts": "Limited by inverter capacity",
  "inverter-va": "Limited by inverter capacity",
  "startup-surge": "Blocked by starting surge",
  "startup-source": "Insufficient power for start-up",
  "energy-shortfall": "Insufficient solar / stored energy",
  "grid-outage": "Grid outage, no backup",
  "voltage-mismatch": "Battery–inverter voltage mismatch",
};

export function Metric({ label, value, unit, hint, alert = false }: { label: string; value: string; unit?: string; hint: string; alert?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 ${alert ? "border-destructive/30 bg-destructive/[0.05]" : "border-border/70 bg-card"}`}>
      <span className={`absolute inset-x-0 top-0 h-[2px] ${alert ? "bg-destructive/50" : "bg-gradient-to-r from-amber-400/60 via-primary/50 to-transparent"}`} />
      <p className="eyebrow !text-[9px] text-muted-foreground">{label}</p>
      <p className="numeric mt-1.5 text-[1.45rem] font-semibold leading-none tracking-tight">{value}<span className="ml-1 font-sans text-xs font-normal text-muted-foreground">{unit}</span></p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

export function Results({ config, result, selectedMinute, onSelect, advice, onApply }: { config: SimulationConfig; result: SimulationResult; selectedMinute: number; onSelect: (minute: number) => void; advice: ReturnType<typeof scheduleAdvice>; onApply: (config: SimulationConfig) => void }) {
  const bank = batteryBank(config);
  const batteryEnabled = config.grid.mode !== "grid-tied";
  const at = result.steps.find((step) => selectedMinute >= step.minute && selectedMinute < step.minute + step.duration) ?? result.steps[result.steps.length - 1];
  const servedRatio = result.demandKwh > 0 ? result.servedKwh / result.demandKwh * 100 : null;
  const chart = result.steps.map((step) => ({ ...step, soc: batteryEnabled ? step.soc : undefined }));
  const unmet = result.unmetKwh;
  const served = servedRatio;
  const verdict = result.demandKwh <= 0
    ? { tone: "idle" as const, title: "Add appliances to see results", body: "No appliances configured yet. Add loads in the Appliances section — the balance updates automatically." }
    : unmet <= 0.01
    ? { tone: "good" as const, title: `System covers the load · ${served?.toFixed(0)}% served`, body: `Across ${config.days} ${config.days > 1 ? "days" : "day"}, scheduled demand is met in this assessment. ${batteryEnabled ? `Battery ends at ${result.finalSoc.toFixed(0)}% (lowest ${result.minSoc.toFixed(0)}%).` : ""} Estimates only — actual sunshine, wiring and battery condition will differ.` }
    : result.overloadMinutes > 0 && result.overloadMinutes >= result.outageMinutes / 2
    ? { tone: "bad" as const, title: "Inverter capacity exceeded", body: `For about ${(result.overloadMinutes / 60).toFixed(1)} hours, simultaneous demand exceeds what the inverter can supply. Consider a larger inverter, or avoid running heavy loads together. Details below.` }
    : result.minSoc <= (config.battery.reserveSoc + 1) && batteryEnabled
    ? { tone: "bad" as const, title: "Storage runs out", body: `The battery reaches its ${config.battery.reserveSoc}% reserve floor, after which scheduled loads go unserved. Options: more storage, more daytime charging, or shifting some use to solar hours.` }
    : { tone: "bad" as const, title: "Load timing does not match solar hours", body: `Energy is available during the day, but demand falls at night (${(result.outageMinutes / 60).toFixed(1)} hours unserved). Shifting a load to midday can reduce the shortfall — see the suggestion below.` };
  return (
    <div className="space-y-4">
      <motion.div role="status" key={verdict.tone + verdict.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className={`flex items-start gap-3 rounded-2xl border p-4 ${verdict.tone === "good" ? "border-emerald-600/25 bg-emerald-500/[0.07]" : verdict.tone === "idle" ? "border-border/80 bg-card" : "border-destructive/25 bg-destructive/[0.05]"}`}>
        {verdict.tone === "good" ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : verdict.tone === "idle" ? <Sun className="mt-0.5 size-5 shrink-0 text-primary" /> : <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />}
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-tight">{verdict.title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{verdict.body}</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Metric label="Solar generation" value={result.solarKwh.toFixed(1)} unit="kWh" hint={`Over ${config.days} ${config.days > 1 ? "days" : "day"}`} />
        <Metric label="Household demand" value={result.demandKwh.toFixed(1)} unit="kWh" hint="All scheduled loads" />
        <Metric label="Unserved energy" value={result.unmetKwh.toFixed(1)} unit="kWh" hint={`${(result.outageMinutes / 60).toFixed(1)} hours affected`} alert={result.unmetKwh > 0.01} />
        <Metric label={batteryEnabled ? "Battery remaining" : "Grid import"} value={batteryEnabled ? result.finalSoc.toFixed(0) : result.gridKwh.toFixed(1)} unit={batteryEnabled ? "%" : "kWh"} hint={batteryEnabled ? `Lowest ${result.minSoc.toFixed(0)}% in period` : "Grid-tied: no storage"} />
      </div>

      {result.warnings.map((warning) => <p key={warning} role="alert" className="flex items-start gap-2.5 rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3.5 text-[13px] leading-relaxed"><CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />{warning}</p>)}

      <details className="panel-surface group p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div className="max-w-lg">
            <p className="eyebrow text-muted-foreground">Detail · daily profile chart</p>
            <h2 className="mt-1.5 text-[15px] font-semibold tracking-tight">Solar by day, demand into the night <span className="ml-1 text-xs font-normal text-muted-foreground">(expand for chart)</span></h2>
          </div>
          <span className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${result.unmetKwh > 0.01 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{servedRatio === null ? "Awaiting loads" : `${servedRatio.toFixed(0)}% of demand met`}</span>
        </summary>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {[["#e07b2e", "Solar generation"], ["#33475e", "Household demand"], ["#1f8a70", "Battery charge"], ["#c0392b", "Unserved"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: color }} />{label}</span>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[{ label: "Midday · 12:00", minute: 720 }, ...(config.grid.outages.length > 0 ? [{ label: "Power cut start", minute: config.grid.outages[0].start }] : []), { label: "Evening peak · 19:00", minute: 1140 }].map((chip) => (
            <button key={chip.label} type="button" onClick={() => onSelect(Math.min(chip.minute, config.days * 1440 - 5))} className="rounded-full border border-border/80 bg-background/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:text-foreground hover:shadow-sm">{chip.label}</button>
          ))}
        </div>
        <div className="mt-4 h-52 w-full sm:h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 0, left: -12, bottom: 0 }} onClick={(state: unknown) => { const hour = (state as { activeLabel?: number } | null)?.activeLabel; if (typeof hour === "number" && Number.isFinite(hour)) onSelect(Math.max(0, Math.min(config.days * 1440 - 5, Math.round(hour * 60 / 5) * 5))); }}>
              <defs><linearGradient id="solar-sim-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e07b2e" stopOpacity={0.32} /><stop offset="100%" stopColor="#e07b2e" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="hour" type="number" domain={[0, config.days * 24]} tickFormatter={(hour: number) => config.days > 1 ? `D${Math.floor(hour / 24) + 1} ${String(Math.floor(hour % 24)).padStart(2, "0")}h` : `${Math.floor(hour)}h`} tick={{ fontSize: 10 }} minTickGap={32} />
              <YAxis yAxisId="power" tick={{ fontSize: 10 }} unit="W" width={62} />
              <YAxis yAxisId="soc" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} width={44} hide={!batteryEnabled} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} labelFormatter={(hour: number) => `Day ${Math.floor(hour / 24) + 1} · ${formatMinutes((hour % 24) * 60)} IST`} formatter={(value: number, name: string) => [`${value.toFixed(0)} ${name === "Battery charge" ? "%" : "W"}`, name]} />
              <Area yAxisId="power" dataKey="solarW" name="Solar generation" type="stepAfter" fill="url(#solar-sim-fill)" stroke="#e07b2e" strokeWidth={2.2} isAnimationActive={false} />
              <Line yAxisId="power" dataKey="demandW" name="Household demand" type="stepAfter" stroke="#33475e" dot={false} strokeWidth={1.8} isAnimationActive={false} />
              <Area yAxisId="power" dataKey="shortfallW" name="Unserved" type="stepAfter" fill="#c0392b" fillOpacity={0.12} stroke="#c0392b" isAnimationActive={false} />
              {batteryEnabled && <Line yAxisId="soc" dataKey="soc" name="Battery charge" stroke="#1f8a70" strokeWidth={1.8} dot={false} isAnimationActive={false} />}
              <ReferenceLine yAxisId="power" x={selectedMinute / 60} stroke="var(--color-foreground)" strokeDasharray="3 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <label className="mt-4 block">
          <span className="flex justify-between text-[13px]"><span className="text-muted-foreground">Inspect any time</span><span className="numeric font-semibold">Day {Math.floor(selectedMinute / 1440) + 1} · {formatMinutes(selectedMinute % 1440)} IST</span></span>
          <input className="mt-2.5 w-full" aria-label="Inspect any time" type="range" min={0} max={config.days * 1440 - 5} step={5} value={Math.min(selectedMinute, config.days * 1440 - 5)} onChange={(e) => onSelect(Number(e.target.value))} />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[{ icon: Sun, label: "Solar output", value: `${at.solarW.toFixed(0)} W` }, { icon: Zap, label: "Household load", value: `${at.demandW.toFixed(0)} W` }, { icon: BatteryCharging, label: batteryEnabled ? (at.batteryW >= 0 ? "Battery discharging" : "Battery charging") : "Grid supply", value: `${(batteryEnabled ? Math.abs(at.batteryW) : at.gridW).toFixed(0)} W` }, { icon: CircleAlert, label: "Shortfall", value: `${at.shortfallW.toFixed(0)} W` }].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl bg-muted/40 p-3.5"><p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Icon className="size-3.5" />{label}</p><p className="numeric mt-1.5 text-[15px] font-semibold">{value}</p></div>
          ))}
        </div>
        <div className="mt-5 divide-y divide-border/70">
          {config.loads.map((load) => {
            const status = at.loads.find((s) => s.id === load.id);
            const reason = status?.reason ?? "off";
            return (
              <div key={load.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                <span className="flex items-center gap-2.5"><span className={`size-1.5 rounded-full ${reason === "running" ? "bg-emerald-600" : reason === "off" ? "bg-border" : "bg-destructive"}`} />{load.name}{load.quantity > 1 ? ` × ${load.quantity}` : ""}</span>
                <span className={`text-right text-xs ${reason !== "running" && reason !== "off" ? "font-medium text-destructive" : "text-muted-foreground"}`}>{REASONS[reason]}</span>
              </div>
            );
          })}
        </div>
      </details>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel-surface p-6">
          <h3 className="text-[15px] font-semibold tracking-tight">Where does the shortfall come from?</h3>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {result.unmetKwh > 0.01
              ? `${result.unmetKwh.toFixed(1)} kWh of demand goes unserved. ${result.overloadMinutes > 0 ? `For ${(result.overloadMinutes / 60).toFixed(1)} hours, simultaneous load exceeds inverter capacity.` : "See the unserved bands in the profile above."}`
              : "Demand is met in this assessment. Real sunshine, wiring and battery ageing can still change the outcome."}
          </p>
          <div className="mt-4 space-y-2.5">
            {config.loads.filter((l) => result.perLoad[l.id].unmetKwh > 0.001).map((l) => <p className="flex justify-between gap-2 text-[13px]" key={l.id}><span>{l.name}</span><span className="numeric font-medium text-destructive">{result.perLoad[l.id].unmetKwh.toFixed(1)} kWh unserved</span></p>)}
          </div>
          <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">{batteryEnabled ? `Nominal storage ${(bank.wh / 1000).toFixed(1)} kWh · usable ${(bank.usableWh / 1000).toFixed(1)} kWh after the ${config.battery.reserveSoc}% reserve.` : "Without storage, a grid outage means no supply. Hybrid adds backup."}</p>
        </section>
        <section className="panel-surface p-6">
          <h3 className="text-[15px] font-semibold tracking-tight">Suggested schedule adjustment</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Tested by shifting load to midday solar hours. Same panels, same battery.</p>
          {advice.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">Shifting load to midday does not help much here. Consider more storage, a larger inverter, or reducing night-time use.</p>
          ) : advice.map((item) => (
            <div key={item.loadId} className="mt-3.5 rounded-2xl border border-primary/20 bg-primary/[0.05] p-4">
              <p className="text-[13px] font-semibold">Move {item.name} towards midday?</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Reduces unserved energy by {item.unmetReduction.toFixed(1)} kWh and grid import by {item.gridReduction.toFixed(1)} kWh.</p>
              <Button size="sm" variant="outline" className="mt-2.5 h-8 rounded-xl text-xs" onClick={() => onApply(item.moved)}>Apply this timing</Button>
            </div>
          ))}
          <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">Grid import: {result.gridKwh.toFixed(1)} kWh · ≈₹{(result.gridKwh * config.grid.tariff).toFixed(0)} energy charge. Fixed charges, taxes and subsidies excluded.</p>
        </section>
      </div>
    </div>
  );
}
