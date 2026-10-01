import { Battery, ChevronDown, MapPin, PanelTop, PlugZap } from "lucide-react";
import type { CSSProperties } from "react";
import { INDIA_SITES } from "@/lib/india";
import { BATTERY_PRESETS, batteryBank, type SimulationConfig } from "@/lib/simulator";
import { formatMinutes } from "@/lib/solar";
import type { ReactNode } from "react";

function toTime(minute: number) {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function fromTime(v: string): number | null {
  const [h, m] = v.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function NumericField({ label, value, onChange, min = 0, max = 100000, step = 1, unit, hint, slider = true, sliderMin, sliderMax }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string; hint?: string; slider?: boolean; sliderMin?: number; sliderMax?: number }) {
  const clamp = (next: number) => onChange(Math.min(max, Math.max(min, step >= 1 ? Math.round(next) : Math.round(next / step) * step)));
  const sMin = sliderMin ?? min;
  const sMax = sliderMax ?? max;
  const showSlider = slider && sMax > sMin;
  const sliderValue = Math.min(sMax, Math.max(sMin, value));
  const fill = sMax > sMin ? ((sliderValue - sMin) / (sMax - sMin)) * 100 : 50;
  return (
    <div className="group/ctrl rounded-xl px-1 py-1 transition-colors duration-150 hover:bg-muted/30 focus-within:bg-muted/30">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold tracking-tight text-foreground">{label}</span>
        <span className="flex shrink-0 items-baseline gap-1 rounded-lg border border-transparent bg-primary/[0.08] px-2.5 py-1 transition-all duration-150 group-hover/ctrl:border-primary/20 focus-within:border-primary/50 focus-within:bg-primary/[0.12]">
          <input type="number" inputMode="decimal" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => { const next = Number(e.target.value); if (Number.isFinite(next)) clamp(next); }} className="numeric w-16 bg-transparent text-right text-[15px] font-bold tracking-tight text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          {unit && <span className="text-[10px] font-bold text-primary">{unit}</span>}
        </span>
      </div>
      {showSlider && (
        <input type="range" aria-label={label} min={sMin} max={sMax} step={step} value={sliderValue} onChange={(e) => clamp(Number(e.target.value))} style={{ "--fill": `${fill}%` } as CSSProperties} className="w-full" />
      )}
      {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function TimeField({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[13px] font-semibold tracking-tight text-foreground">{label}</span>
      <input type="time" aria-label={label} value={toTime(value)} onChange={(e) => { const next = fromTime(e.target.value); if (next !== null) onChange(Math.min(1439, Math.max(0, next))); }} className="numeric mt-2.5 h-12 w-full rounded-2xl border border-border/80 bg-background px-3.5 text-[15px] font-semibold shadow-[inset_0_1px_2px_oklch(0.3_0.05_58/0.05)] outline-none transition-all duration-200 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15" />
      {hint && <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Choice({ label, value, onChange, children, hint }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-[13px] font-semibold tracking-tight text-foreground">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2.5 h-12 w-full cursor-pointer appearance-none rounded-2xl border border-border/80 bg-background px-4 text-[14px] font-medium shadow-[inset_0_1px_2px_oklch(0.3_0.05_58/0.05)] outline-none transition-all duration-200 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15">
        {children}
      </select>
      {hint && <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: { value: T; title: string; hint?: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="text-sm">
      <span className="text-[13px] font-semibold tracking-tight text-foreground">{label}</span>
      <div className="mt-2.5 grid gap-2.5">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button key={opt.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(opt.value)} className={`flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.99] ${active ? "border-primary/60 bg-primary/[0.06] shadow-[0_10px_24px_-14px_oklch(0.585_0.16_44/0.55)]" : "border-border/80 bg-card hover:border-muted-foreground/40 hover:shadow-sm"}`}>
              <span className={`grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors duration-200 ${active ? "border-primary" : "border-muted-foreground/35"}`}>{active && <span className="size-[7px] rounded-full bg-primary" />}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight">{opt.title}</span>
                {opt.hint && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{opt.hint}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Block({ number, title, subtitle, icon, children, defaultOpen = true }: { number: string; title: string; subtitle?: string; icon: ReactNode; summary?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <section className="panel-surface relative overflow-hidden rounded-3xl">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400/50 via-primary/45 to-transparent" />
      <details open={defaultOpen} className="group px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl outline-none select-none [&::-webkit-details-marker]:hidden">
          <span className="numeric rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{number}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
            {subtitle && <span className="block text-xs leading-snug text-muted-foreground">{subtitle}</span>}
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/70 text-muted-foreground transition-colors duration-200 group-hover:text-foreground">{icon}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
        </summary>
        <div className="space-y-3.5 pt-4">{children}</div>
      </details>
    </section>
  );
}

export function Equipment({ config, onChange }: { config: SimulationConfig; onChange: (config: SimulationConfig) => void }) {
  const s = config.solar, b = config.battery, i = config.inverter, bank = batteryBank(config);
  const solar = (patch: Partial<typeof s>) => onChange({ ...config, solar: { ...s, ...patch } });
  const battery = (patch: Partial<typeof b>) => onChange({ ...config, battery: { ...b, ...patch } });
  const inverter = (patch: Partial<typeof i>) => onChange({ ...config, inverter: { ...i, ...patch } });
  const siteId = INDIA_SITES.find((site) => site.latitude === config.location.latitude && site.longitude === config.location.longitude)?.id ?? "custom";
  const batteryEnabled = config.grid.mode !== "grid-tied";
  return (
    <div className="space-y-3.5">
      <Block number="01" title="Location & connection" subtitle="City, supply type and outages" icon={<MapPin className="size-4" />}>
        <Choice label="City" hint="Schedules and solar use Indian Standard Time." value={siteId} onChange={(id) => { const site = INDIA_SITES.find((p) => p.id === id); if (site) onChange({ ...config, location: { name: site.name, latitude: site.latitude, longitude: site.longitude } }); }}>
          {INDIA_SITES.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          <option value="custom">Custom location</option>
        </Choice>
        <Segmented label="System type" value={config.grid.mode} onChange={(mode) => onChange({ ...config, grid: { ...config.grid, mode } })} options={[
          { value: "off-grid", title: "Off-grid", hint: "Solar and battery only. For sites without grid supply." },
          { value: "hybrid", title: "Hybrid", hint: "Solar with grid backup. Storage covers power cuts." },
          { value: "grid-tied", title: "Grid-tied", hint: "Solar without backup. No supply during cuts." },
        ]} />
        {config.grid.mode !== "off-grid" && (
          <div className="space-y-5 rounded-2xl border border-border/70 bg-muted/25 p-5">
            <NumericField label="Electricity tariff" value={config.grid.tariff} max={50} step={0.5} sliderMin={0} sliderMax={20} unit="₹/kWh" hint="Energy charge only. Fixed charges and taxes excluded." onChange={(tariff) => onChange({ ...config, grid: { ...config.grid, tariff } })} />
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={config.grid.outages.length > 0} onChange={(e) => onChange({ ...config, grid: { ...config.grid, outages: e.target.checked ? [{ start: 1080, duration: 120 }] : [] } })} className="size-[18px] accent-[var(--color-primary)]" />
              Include a daily power cut
            </label>
            {config.grid.outages.map((cut, index) => (
              <div className="grid grid-cols-2 gap-4" key={index}>
                <TimeField label="Cut starts" value={cut.start} hint={`Until ${formatMinutes(cut.start + cut.duration)}`} onChange={(start) => onChange({ ...config, grid: { ...config.grid, outages: config.grid.outages.map((w, j) => j === index ? { ...w, start } : w) } })} />
                <NumericField label="Duration" value={cut.duration} min={15} max={1440} step={15} sliderMin={15} sliderMax={360} unit="min" onChange={(duration) => onChange({ ...config, grid: { ...config.grid, outages: config.grid.outages.map((w, j) => j === index ? { ...w, duration } : w) } })} />
              </div>
            ))}
          </div>
        )}
        <details className="rounded-2xl bg-muted/25 px-5 py-4 text-sm">
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Study period & coordinates</summary>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <NumericField label="Duration" value={config.days} min={1} max={7} unit="days" hint="3 days shows overnight carry-over." onChange={(days) => onChange({ ...config, days })} />
            <NumericField label="Start day" value={config.startDay} min={1} max={365} unit="day" hint="Day of year for sun position." onChange={(startDay) => onChange({ ...config, startDay })} />
          </div>
        </details>
      </Block>

      <Block number="02" title="Solar array" subtitle="Panels on the roof" icon={<PanelTop className="size-4" />}>
        <div className="space-y-6">
          <NumericField slider sliderMin={1} sliderMax={12} label="Number of panels" value={s.count} min={1} max={40} hint="Most homes use 2–6 panels." onChange={(count) => solar({ count })} />
          <NumericField slider sliderMin={100} sliderMax={550} label="Panel rating" value={s.watts} min={50} max={800} step={5} unit="W" hint="Rating on the panel nameplate." onChange={(watts) => solar({ watts })} />
        </div>
        <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] px-5 py-4 text-sm">
          <strong className="numeric text-lg font-semibold tracking-tight">{(s.count * s.watts / 1000).toFixed(2)} kW</strong>
          <span className="text-muted-foreground"> installed · output varies through the day</span>
        </div>
        <details className="rounded-2xl bg-muted/25 px-5 py-4 text-sm">
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Orientation & sunlight</summary>
          <div className="mt-5 space-y-6">
            <NumericField slider label="Tilt from horizontal" value={s.tilt} max={70} unit="°" hint="Around 25° suits most of India." onChange={(tilt) => solar({ tilt })} />
            <NumericField slider label="Facing direction" value={s.azimuth} max={360} step={5} unit="°" hint="180° faces south. 90° east, 270° west." onChange={(azimuth) => solar({ azimuth })} />
            {batteryEnabled && (
              <div className="space-y-6 border-t border-border/60 pt-5">
                <NumericField label="Charge controller limit" value={s.controllerAmps} max={200} sliderMin={10} sliderMax={100} unit="A" hint={`At ${bank.volts} V the solar input is capped. Check the MPPT rating.`} onChange={(controllerAmps) => solar({ controllerAmps })} />
                <NumericField label="Sky clarity" value={s.clearness} min={0.3} max={1} step={0.05} hint="0.7 is a typical clear day. An assumption, not a forecast." onChange={(clearness) => solar({ clearness })} />
              </div>
            )}
          </div>
        </details>
      </Block>

      <Block number="03" title="Battery bank" subtitle="Backup for evenings and power cuts" icon={<Battery className="size-4" />} defaultOpen={batteryEnabled}>
        {!batteryEnabled ? (
          <p className="rounded-2xl bg-muted/40 px-5 py-4 text-sm leading-relaxed text-muted-foreground">Grid-tied systems have no backup. Switch to hybrid or off-grid to configure storage.</p>
        ) : (
          <>
            <Choice label="Battery type" value={b.chemistry} onChange={(chemistry) => { const preset = BATTERY_PRESETS[chemistry as keyof typeof BATTERY_PRESETS]; battery({ chemistry: chemistry as typeof b.chemistry, reserveSoc: preset.reserveSoc, chargeEfficiency: preset.chargeEfficiency, dischargeEfficiency: preset.dischargeEfficiency, ratedHours: preset.ratedHours, peukertExponent: preset.peukertExponent }); }}>
              {Object.entries(BATTERY_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
            </Choice>
            <div className="space-y-6">
              <NumericField slider sliderMin={40} sliderMax={220} label="Capacity per battery" value={b.unitAh} min={20} max={500} step={5} unit="Ah" hint="Common sizes: 150–200 Ah." onChange={(unitAh) => battery({ unitAh })} />
              <NumericField slider sliderMin={1} sliderMax={8} label="Number of batteries" value={b.series * b.parallel} min={1} max={16} unit="nos" hint="Total units in the bank." onChange={(total) => { const t = Math.max(1, Math.round(total)); battery({ series: t, parallel: 1 }); }} />
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-5">
              <p className="numeric text-base font-semibold tracking-tight">{(bank.wh / 1000).toFixed(2)} kWh total · {(bank.usableWh / 1000).toFixed(2)} kWh usable</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Reserve is kept aside to protect battery life. {bank.units} {bank.units === 1 ? "battery" : "batteries"} at {bank.volts} V.</p>
            </div>
            <details className="rounded-2xl bg-muted/25 px-5 py-4 text-sm">
              <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Wiring & reserve</summary>
              <div className="mt-5 grid grid-cols-2 gap-5">
                <NumericField label="Battery voltage" value={b.unitVolts} min={2} max={60} step={1} sliderMin={6} sliderMax={48} unit="V" onChange={(unitVolts) => battery({ unitVolts })} />
                <NumericField slider label="In series" value={b.series} min={1} max={8} hint="Raises voltage." onChange={(series) => battery({ series })} />
                <NumericField slider label="In parallel" value={b.parallel} min={1} max={8} hint="Raises capacity." onChange={(parallel) => battery({ parallel })} />
                <NumericField label="Reserve floor" value={b.reserveSoc} max={95} sliderMin={10} sliderMax={80} unit="%" hint="50% lead-acid · 20% lithium." onChange={(reserveSoc) => battery({ reserveSoc })} />
              </div>
            </details>
          </>
        )}
      </Block>

      <Block number="04" title="Inverter" subtitle="How much can run at once" icon={<PlugZap className="size-4" />}>
        {batteryEnabled && Math.abs(bank.volts - i.dcVolts) > 0.01 && (
          <p role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/[0.06] px-5 py-4 text-[13px] leading-relaxed">Battery bank is {bank.volts} V but the inverter expects {i.dcVolts} V. Adjust the series count or inverter voltage.</p>
        )}
        <NumericField slider sliderMin={500} sliderMax={5000} label="Inverter rating" value={i.va} min={200} max={10000} step={50} unit="VA" hint="900 VA covers fans, lights and TV." onChange={(va) => inverter({ va })} />
        <NumericField label="Surge rating" value={i.surgeWatts} min={1} max={20000} step={10} sliderMin={500} sliderMax={6000} unit="W" hint="Covers brief motor starting current." onChange={(surgeWatts) => inverter({ surgeWatts })} />
        <p className="rounded-2xl bg-muted/40 px-5 py-4 text-sm">Continuous limit ≈ <strong className="numeric text-base">≈{(i.va * i.ratedPowerFactor).toFixed(0)} W</strong> <span className="text-muted-foreground">· check both W and VA on the datasheet</span></p>
        <details className="rounded-2xl bg-muted/25 px-5 py-4 text-sm">
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Electrical details</summary>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <NumericField label="DC voltage" value={i.dcVolts} min={2} max={1000} step={1} sliderMin={12} sliderMax={96} unit="V" onChange={(dcVolts) => inverter({ dcVolts })} />
            <NumericField label="Efficiency" value={i.efficiency * 100} min={50} max={100} unit="%" step={0.5} onChange={(value) => inverter({ efficiency: value / 100 })} />
          </div>
        </details>
      </Block>
    </div>
  );
}
