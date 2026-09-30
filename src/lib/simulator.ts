import { z } from "zod";
import { acPowerWatts, clearSkyIrradiance, planeOfArray, solarPosition } from "./solar";
import { IST_OFFSET } from "./india";

const windowSchema = z.object({ start: z.number().int().min(0).max(1439), duration: z.number().int().min(1).max(1440) });
export const loadSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(100),
  watts: z.number().positive().max(30000), quantity: z.number().int().min(1).max(50),
  surgeMultiplier: z.number().min(1).max(10), powerFactor: z.number().min(0.2).max(1),
  priority: z.number().int().min(1).max(10), enabled: z.boolean(),
  windows: z.array(windowSchema).min(1).max(8),
  cycle: z.object({ period: z.number().int().min(1).max(1440), on: z.number().int().min(1).max(1440) }).refine((cycle) => cycle.on <= cycle.period, "On-time must not exceed cycle period").optional(),
});
export const simulationSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(100),
  location: z.object({ name: z.string().min(1).max(100), latitude: z.number().min(6).max(38), longitude: z.number().min(68).max(98) }),
  solar: z.object({ count: z.number().int().min(0).max(1000), watts: z.number().min(1).max(2000), tilt: z.number().min(0).max(70), azimuth: z.number().min(0).max(360), losses: z.number().min(0).max(0.8), clearness: z.number().min(0).max(1), temperature: z.number().min(-10).max(55), controllerAmps: z.number().min(0).max(1000) }),
  battery: z.object({ chemistry: z.enum(["tubular", "agm", "lifepo4"]), unitVolts: z.number().min(2).max(60), unitAh: z.number().min(1).max(3000), series: z.number().int().min(1).max(16), parallel: z.number().int().min(1).max(16), initialSoc: z.number().min(0).max(100), reserveSoc: z.number().min(0).max(95), chargeAmps: z.number().min(0).max(1000), dischargeAmps: z.number().min(0).max(1000), chargeEfficiency: z.number().min(0.5).max(1), dischargeEfficiency: z.number().min(0.5).max(1), ratedHours: z.number().min(1).max(100).optional(), peukertExponent: z.number().min(1).max(1.5).optional() }),
  inverter: z.object({ va: z.number().min(1).max(100000), ratedPowerFactor: z.number().min(0.2).max(1), surgeWatts: z.number().min(1).max(200000), dcVolts: z.number().min(2).max(1000), efficiency: z.number().min(0.5).max(1), idleWatts: z.number().min(0).max(500) }),
  grid: z.object({ mode: z.enum(["off-grid", "hybrid", "grid-tied"]), outages: z.array(windowSchema).max(8), tariff: z.number().min(0).max(50) }),
  startDay: z.number().int().min(1).max(365), days: z.number().int().min(1).max(7),
  loads: z.array(loadSchema).max(50),
}).superRefine((value, ctx) => {
  if (new Set(value.loads.map((load) => load.id)).size !== value.loads.length) ctx.addIssue({ code: "custom", path: ["loads"], message: "Appliance IDs must be unique." });
});
export type SimulationConfig = z.infer<typeof simulationSchema>;
export type ScheduledLoad = z.infer<typeof loadSchema>;
export type ScheduleWindow = z.infer<typeof windowSchema>;
export const BATTERY_PRESETS = {
  tubular: { label: "Tall tubular · lead-acid", reserveSoc: 50, chargeEfficiency: 0.85, dischargeEfficiency: 0.9, ratedHours: 20, peukertExponent: 1.15 },
  agm: { label: "AGM · lead-acid", reserveSoc: 50, chargeEfficiency: 0.9, dischargeEfficiency: 0.9, ratedHours: 20, peukertExponent: 1.1 },
  lifepo4: { label: "LiFePO₄ · lithium", reserveSoc: 20, chargeEfficiency: 0.96, dischargeEfficiency: 0.96, ratedHours: 20, peukertExponent: 1 },
};
export const INDIA_LOAD_PRESETS = [
  { name: "Ceiling fan", watts: 70, surgeMultiplier: 1.5, powerFactor: 0.8, start: 1080, duration: 480 },
  { name: "BLDC fan", watts: 28, surgeMultiplier: 1.2, powerFactor: 0.9, start: 1080, duration: 480 },
  { name: "LED bulb", watts: 9, surgeMultiplier: 1, powerFactor: 0.9, start: 1080, duration: 300 },
  { name: "Refrigerator (running draw)", watts: 120, surgeMultiplier: 4, powerFactor: 0.75, start: 0, duration: 1440 },
  { name: "TV", watts: 90, surgeMultiplier: 1.2, powerFactor: 0.95, start: 1140, duration: 180 },
  { name: "Wi-Fi router", watts: 12, surgeMultiplier: 1, powerFactor: 0.9, start: 0, duration: 1440 },
  { name: "Laptop", watts: 65, surgeMultiplier: 1.2, powerFactor: 0.95, start: 540, duration: 480 },
  { name: "Water pump · approx. ½ hp", watts: 550, surgeMultiplier: 3, powerFactor: 0.75, start: 1140, duration: 60 },
  { name: "Mixer grinder", watts: 500, surgeMultiplier: 2, powerFactor: 0.8, start: 480, duration: 15 },
  { name: "1.5 ton AC (fixed running estimate)", watts: 1500, surgeMultiplier: 3, powerFactor: 0.9, start: 1260, duration: 480 },
];
export function makeLoad(index: number, id: string): ScheduledLoad {
  const preset = INDIA_LOAD_PRESETS[index] ?? INDIA_LOAD_PRESETS[0];
  return { id, name: preset.name, watts: preset.watts, surgeMultiplier: preset.surgeMultiplier, powerFactor: preset.powerFactor, quantity: 1, priority: 5, enabled: true, windows: [{ start: preset.start, duration: preset.duration }], ...(index === 3 ? { cycle: { period: 60, on: 20 } } : {}) };
}
export function defaultSimulation(): SimulationConfig {
  return {
    version: 1, name: "My home · 440 W backup", location: { name: "New Delhi", latitude: 28.61, longitude: 77.21 },
    solar: { count: 2, watts: 220, tilt: 25, azimuth: 180, losses: 0.14, clearness: 0.7, temperature: 30, controllerAmps: 30 },
    battery: { chemistry: "tubular", unitVolts: 12, unitAh: 150, series: 1, parallel: 1, initialSoc: 100, reserveSoc: 50, chargeAmps: 15, dischargeAmps: 50, chargeEfficiency: 0.85, dischargeEfficiency: 0.9, ratedHours: 20, peukertExponent: 1.15 },
    inverter: { va: 900, ratedPowerFactor: 0.8, surgeWatts: 1440, dcVolts: 12, efficiency: 0.9, idleWatts: 8 },
    grid: { mode: "off-grid", outages: [], tariff: 8 }, startDay: 105, days: 3,
    loads: [makeLoad(1, "fan"), { ...makeLoad(2, "lights"), quantity: 4 }, makeLoad(4, "tv"), makeLoad(5, "router")],
  };
}
export function batteryBank(config: SimulationConfig) {
  const b = config.battery;
  const volts = b.unitVolts * b.series;
  const ah = b.unitAh * b.parallel;
  return { volts, ah, wh: volts * ah, usableWh: volts * ah * (1 - b.reserveSoc / 100), units: b.series * b.parallel };
}
export function inWindow(minute: number, window: ScheduleWindow): boolean {
  return ((minute - window.start) % 1440 + 1440) % 1440 < window.duration;
}
export function isScheduled(load: ScheduledLoad, minute: number): boolean {
  return load.enabled && load.windows.some((window) => {
    const elapsed = ((minute - window.start) % 1440 + 1440) % 1440;
    return inWindow(minute, window) && (!load.cycle || elapsed % load.cycle.period < load.cycle.on);
  });
}
export function scheduledDailyMinutes(load: ScheduledLoad): number {
  let minutes = 0;
  for (let minute = 0; minute < 1440; minute++) if (isScheduled(load, minute)) minutes++;
  return minutes;
}
export function estimatedSolarDc(config: SimulationConfig, absoluteMinute: number): number {
  const day = Math.floor(absoluteMinute / 1440);
  const date = new Date(Date.UTC(2023, 0, config.startDay + day));
  const s = config.solar;
  const sun = solarPosition(config.location.latitude, config.location.longitude, IST_OFFSET, date, absoluteMinute % 1440);
  const sky = clearSkyIrradiance(sun.altitude, s.clearness);
  const poa = planeOfArray(sky, sun, { tilt: s.tilt, azimuth: s.azimuth });
  return acPowerWatts({ module: { length: 1, width: 1, wattage: s.watts, tempCoefficient: -0.35 }, inverterWatts: Infinity, latitude: config.location.latitude, longitude: config.location.longitude, utcOffset: IST_OFFSET, monthlyClearness: [], monthlyTemperature: [], losses: s.losses, noct: 45, albedo: 0.2 }, poa, s.temperature, s.count).dc;
}
export type LoadReason = "off" | "running" | "inverter-watts" | "inverter-va" | "startup-surge" | "startup-source" | "energy-shortfall" | "grid-outage" | "voltage-mismatch";
export interface SimulationStep {
  minute: number; duration: number; hour: number; solarW: number; demandW: number; servedW: number;
  gridW: number; shortfallW: number; curtailedW: number; batteryW: number; soc: number;
  gridAvailable: boolean; loads: { id: string; reason: LoadReason; watts: number }[];
}
export interface SimulationResult {
  steps: SimulationStep[]; solarKwh: number; demandKwh: number; servedKwh: number; gridKwh: number;
  unmetKwh: number; curtailedKwh: number; finalSoc: number; minSoc: number; batteryDischargeKwh: number;
  outageMinutes: number; overloadMinutes: number; warnings: string[]; perLoad: Record<string, { demandKwh: number; unmetKwh: number }>;
}

/** Event-aligned ≤5 min energy dispatch. All loads are on the protected circuit;
 * grid bypass supplies them during mains availability (no battery grid charging).
 * Off-grid shortages shed whole appliances in user priority order, not fractions.
 * Surge is an admission check in watts/VA; its seconds of energy are not integrated.
 */
export function simulate(config: SimulationConfig, solarAt: (minute: number) => number = (minute) => estimatedSolarDc(config, minute)): SimulationResult {
  simulationSchema.parse(config);
  const bank = batteryBank(config);
  const batteryEnabled = config.grid.mode !== "grid-tied";
  const compatible = Math.abs(bank.volts - config.inverter.dcVolts) < 0.01;
  const floor = bank.wh * config.battery.reserveSoc / 100;
  let stored = bank.wh * config.battery.initialSoc / 100;
  const end = config.days * 1440;
  const boundaries = new Set<number>([0, end]);
  for (let m = 0; m <= end; m += 5) boundaries.add(m);
  for (let day = 0; day < config.days; day++) {
    const windows = [...config.loads.flatMap((load) => load.windows), ...config.grid.outages];
    for (const w of windows) {
      boundaries.add(day * 1440 + w.start);
      boundaries.add(day * 1440 + (w.start + w.duration) % 1440);
    }
  }
  // Align duty-cycle transitions, including overnight windows. Every
  // repeated start is checked against the inverter/source surge limits.
  for (const load of config.loads) {
    if (!load.cycle) continue;
    for (let day = -1; day < config.days; day++) {
      for (const window of load.windows) {
        for (let offset = 0; offset < window.duration; offset += load.cycle.period) {
          boundaries.add(day * 1440 + window.start + offset);
          boundaries.add(day * 1440 + window.start + Math.min(window.duration, offset + load.cycle.on));
        }
      }
    }
  }
  const times = [...boundaries].filter((m) => m >= 0 && m <= end).sort((a, b) => a - b);
  const result: SimulationResult = { steps: [], solarKwh: 0, demandKwh: 0, servedKwh: 0, gridKwh: 0, unmetKwh: 0, curtailedKwh: 0, finalSoc: config.battery.initialSoc, minSoc: config.battery.initialSoc, batteryDischargeKwh: 0, outageMinutes: 0, overloadMinutes: 0, warnings: [], perLoad: Object.fromEntries(config.loads.map((l) => [l.id, { demandKwh: 0, unmetKwh: 0 }])) };
  if (batteryEnabled && !compatible) result.warnings.push(`Battery bank is ${bank.volts} V but inverter expects ${config.inverter.dcVolts} V. Backup output is disabled.`);
  if (config.battery.initialSoc < config.battery.reserveSoc) result.warnings.push("Starting charge is below the reserve. Battery will not discharge until recharged above it.");
  if (config.grid.mode === "grid-tied") result.warnings.push("Grid-tied solar disconnects during mains cuts (anti-islanding). Battery inputs are not used.");
  if (batteryEnabled && config.solar.count * config.solar.watts > bank.volts * config.solar.controllerAmps) result.warnings.push(`Array nameplate exceeds the modeled ${Math.round(bank.volts * config.solar.controllerAmps)} W controller ceiling. Solar DC can be clipped before reaching loads or storage.`);
  if (config.inverter.surgeWatts < config.inverter.va * config.inverter.ratedPowerFactor) result.warnings.push("Startup watt ceiling is lower than the continuous watt rating. Confirm the inverter datasheet.");
  const rating = config.inverter.va * config.inverter.ratedPowerFactor;
  const exponent = config.battery.peukertExponent ?? 1;
  const referencePower = bank.wh / (config.battery.ratedHours ?? 20);
  const ratePenalty = (power: number) => Math.max(1, Math.pow(power / referencePower, exponent - 1));
  const loadOrder = [...config.loads].sort((a, b) => a.priority - b.priority); // stable ties preserve list order
  let previouslyRunning = new Set<string>();
  for (let index = 0; index < times.length - 1; index++) {
    const minute = times[index];
    const duration = times[index + 1] - minute;
    const hours = duration / 60;
    const localMinute = minute % 1440;
    const gridAvailable = config.grid.mode !== "off-grid" && !config.grid.outages.some((w) => inWindow(localMinute, w));
    const solarSample = solarAt(minute + duration / 2);
    if (!Number.isFinite(solarSample) || solarSample < 0) throw new Error("Invalid solar input.");
    const solarDc = batteryEnabled ? Math.min(solarSample, bank.volts * config.solar.controllerAmps) : gridAvailable ? solarSample : 0;
    let availableDc = 0;
    let startupAvailableDc = 0;
    let idleDc = 0;
    let batteryLimit = 0;
    if (batteryEnabled && compatible) {
      const energyPower = Math.max(0, stored - floor) * config.battery.dischargeEfficiency / hours;
      // Solve P × max(1,(P/P_ref)^(k−1)) ≤ usable_Wh × efficiency / dt.
      // Low currents receive no optimistic capacity bonus.
      const rateLimitedPower = energyPower <= referencePower ? energyPower : Math.pow(energyPower * Math.pow(referencePower, exponent - 1), 1 / exponent);
      batteryLimit = Math.min(bank.volts * config.battery.dischargeAmps, rateLimitedPower);
      idleDc = Math.min(config.inverter.idleWatts, solarDc + batteryLimit);
      availableDc = Math.max(0, solarDc + batteryLimit - config.inverter.idleWatts);
      // Startup is a brief power check, not the full timestep's energy demand.
      // Respect configured battery current; no unconfigured pulse-current boost.
      const batteryStartupDc = stored > floor + 1e-6 ? bank.volts * config.battery.dischargeAmps : 0;
      startupAvailableDc = Math.max(0, solarDc + batteryStartupDc - config.inverter.idleWatts);
    } else if (!batteryEnabled && gridAvailable) availableDc = solarDc;
    let servedW = 0;
    let usedVa = 0;
    let surgeExtraW = 0;
    let surgeExtraVa = 0;
    let demandW = 0;
    const running = new Set<string>();
    const statuses: SimulationStep["loads"] = [];
    for (const load of loadOrder) {
      const requested = isScheduled(load, localMinute);
      const watts = load.watts * load.quantity;
      const va = watts / load.powerFactor;
      let reason: LoadReason = "off";
      if (requested) {
        demandW += watts;
        result.perLoad[load.id].demandKwh += watts * hours / 1000;
        if (gridAvailable) reason = "running"; // mains bypass, not restricted by backup inverter
        else if (!batteryEnabled) reason = "grid-outage";
        else if (!compatible) reason = "voltage-mismatch";
        else {
          const starting = !previouslyRunning.has(load.id);
          const extraW = starting ? watts * (load.surgeMultiplier - 1) : 0;
          const extraVa = starting ? va * (load.surgeMultiplier - 1) : 0;
          if (servedW + watts > rating + 1e-8) reason = "inverter-watts";
          else if (usedVa + va > config.inverter.va + 1e-8) reason = "inverter-va";
          else if (servedW + watts + surgeExtraW + extraW > config.inverter.surgeWatts + 1e-8 || usedVa + va + surgeExtraVa + extraVa > config.inverter.surgeWatts / config.inverter.ratedPowerFactor + 1e-8) reason = "startup-surge";
          else if (servedW + watts > availableDc * config.inverter.efficiency + 1e-8) reason = "energy-shortfall";
          else if (servedW + watts + surgeExtraW + extraW > startupAvailableDc * config.inverter.efficiency + 1e-8) reason = "startup-source";
          else { reason = "running"; surgeExtraW += extraW; surgeExtraVa += extraVa; }
        }
        if (reason === "running") { servedW += watts; usedVa += va; running.add(load.id); }
        else result.perLoad[load.id].unmetKwh += watts * hours / 1000;
      }
      statuses.push({ id: load.id, reason, watts: requested ? watts : 0 });
    }
    let gridW = 0;
    let chargeDc = 0;
    let dischargeDc = 0;
    let curtailedDc = 0;
    if (batteryEnabled && compatible) {
      const dcLoad = gridAvailable ? Math.min(solarDc, servedW / config.inverter.efficiency, rating / config.inverter.efficiency) : servedW / config.inverter.efficiency;
      if (gridAvailable) gridW = Math.max(0, servedW - dcLoad * config.inverter.efficiency);
      const totalDcUse = dcLoad + idleDc;
      if (totalDcUse > solarDc) {
        dischargeDc = Math.min(batteryLimit, totalDcUse - solarDc);
        stored -= dischargeDc * hours * ratePenalty(dischargeDc) / config.battery.dischargeEfficiency;
      } else {
        const surplus = solarDc - totalDcUse;
        chargeDc = Math.min(surplus, bank.volts * config.battery.chargeAmps, Math.max(0, bank.wh - stored) / (hours * config.battery.chargeEfficiency));
        stored += chargeDc * hours * config.battery.chargeEfficiency;
        curtailedDc = surplus - chargeDc;
      }
    } else if (!batteryEnabled && gridAvailable) {
      const solarAc = Math.min(solarDc * config.inverter.efficiency, rating, servedW);
      gridW = servedW - solarAc;
      curtailedDc = solarDc - solarAc / config.inverter.efficiency;
    } else {
      gridW = gridAvailable ? servedW : 0;
      curtailedDc = solarDc;
    }
    // Energy below reserve is retained, never invented by clamping to reserve.
    stored = Math.min(bank.wh, Math.max(0, stored));
    const shortfallW = demandW - servedW;
    const soc = stored / bank.wh * 100;
    result.minSoc = Math.min(result.minSoc, soc);
    result.finalSoc = soc;
    result.solarKwh += solarDc * hours / 1000;
    result.demandKwh += demandW * hours / 1000;
    result.servedKwh += servedW * hours / 1000;
    result.gridKwh += gridW * hours / 1000;
    result.unmetKwh += shortfallW * hours / 1000;
    result.curtailedKwh += curtailedDc * hours / 1000;
    result.batteryDischargeKwh += dischargeDc * hours * ratePenalty(dischargeDc) / config.battery.dischargeEfficiency / 1000;
    if (shortfallW > 0) result.outageMinutes += duration;
    if (statuses.some((s) => ["inverter-watts", "inverter-va", "startup-surge", "startup-source"].includes(s.reason))) result.overloadMinutes += duration;
    result.steps.push({ minute, duration, hour: minute / 60, solarW: solarDc, demandW, servedW, gridW, shortfallW, curtailedW: curtailedDc, batteryW: dischargeDc - chargeDc, soc, gridAvailable, loads: statuses });
    previouslyRunning = running;
  }
  return result;
}

/** Compare actual alternate runs; only report quantified improvements. */
export function scheduleAdvice(config: SimulationConfig, baseline: SimulationResult): { loadId: string; name: string; moved: SimulationConfig; unmetReduction: number; gridReduction: number; dischargeReduction: number }[] {
  return config.loads.filter((load) => load.enabled && load.windows.length === 1 && load.windows[0].duration <= 240 && load.windows[0].start !== 720).slice(0, 10).flatMap((load) => {
    const moved: SimulationConfig = { ...config, loads: config.loads.map((item) => item.id === load.id ? { ...item, windows: [{ ...item.windows[0], start: 720 }] } : item) };
    const alternative = simulate(moved);
    const unmetReduction = baseline.unmetKwh - alternative.unmetKwh;
    const gridReduction = baseline.gridKwh - alternative.gridKwh;
    const dischargeReduction = baseline.batteryDischargeKwh - alternative.batteryDischargeKwh;
    if (unmetReduction < -1e-6 || gridReduction < -1e-6 || dischargeReduction < -1e-6) return [];
    return Math.max(unmetReduction, gridReduction, dischargeReduction) > 0.02 ? [{ loadId: load.id, name: load.name, moved, unmetReduction, gridReduction, dischargeReduction }] : [];
  }).sort((a, b) => (b.unmetReduction - a.unmetReduction) || (b.gridReduction - a.gridReduction) || (b.dischargeReduction - a.dischargeReduction)).slice(0, 2);
}
