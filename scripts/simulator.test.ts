import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultProject } from "../src/lib/project";
import { plannerToSimulation, readSimulationDraft, writeSimulationDraft } from "../src/lib/simulation-project";
import { batteryBank, defaultSimulation, estimatedSolarDc, inWindow, makeLoad, scheduleAdvice, simulate, simulationSchema, type SimulationConfig } from "../src/lib/simulator";

function config(): SimulationConfig {
  const c = defaultSimulation();
  return { ...c, days: 1, loads: [], solar: { ...c.solar, count: 0, controllerAmps: 1000 }, battery: { ...c.battery, unitVolts: 12, unitAh: 100, initialSoc: 100, reserveSoc: 0, chargeAmps: 1000, dischargeAmps: 1000, chargeEfficiency: 1, dischargeEfficiency: 1, peukertExponent: 1 }, inverter: { ...c.inverter, va: 10000, ratedPowerFactor: 1, surgeWatts: 20000, efficiency: 1, idleWatts: 0 } };
}
const load = (watts: number, start = 0, duration = 1440) => ({ ...makeLoad(0, "load"), watts, quantity: 1, surgeMultiplier: 1, powerFactor: 1, windows: [{ start, duration }] });
const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

describe("India simulator reference cases", () => {
  it("12 V 150 Ah is 1.8 kWh; series doubles volts, not Ah", () => {
    const c = defaultSimulation();
    close(batteryBank(c).wh, 1800);
    close(batteryBank(c).usableWh, 900);
    c.battery.series = 2;
    close(batteryBank(c).volts, 24);
    close(batteryBank(c).ah, 150);
    c.battery.parallel = 2;
    close(batteryBank(c).ah, 300);
    close(batteryBank(c).wh, 7200);
  });
  it("100 W for 12 h consumes exactly 1.2 kWh", () => {
    const c = config(); c.loads = [load(100, 0, 720)];
    const r = simulate(c, () => 0);
    close(r.demandKwh, 1.2); close(r.servedKwh, 1.2); close(r.finalSoc, 0);
  });
  it("reserve, efficiency, idle power and Ah determine runtime", () => {
    const c = config(); c.battery.reserveSoc = 50; c.inverter.efficiency = 0.8;
    c.inverter.idleWatts = 5; c.loads = [load(76, 0, 360)];
    // 76/0.8 + 5 = 100 W DC; six hours exactly exhaust 600 Wh usable.
    const r = simulate(c, () => 0);
    close(r.perLoad.load.unmetKwh, 0); close(r.minSoc, 50);
    close(r.batteryDischargeKwh, 0.6);
  });
  it("lead-acid rate penalty reduces high-current runtime versus lossless nominal Ah", () => {
    const c = config(); c.loads = [load(240)];
    const ideal = simulate(c, () => 0);
    c.battery.peukertExponent = 1.2;
    const penalized = simulate(c, () => 0);
    assert.ok(penalized.servedKwh < ideal.servedKwh);
    // Whole-load shedding can leave < one timestep of usable energy.
    assert.ok(penalized.finalSoc < 3);
    close(penalized.batteryDischargeKwh, batteryBank(c).wh * (1 - penalized.finalSoc / 100) / 1000);
  });
  it("charge cannot exceed bank capacity, charger current or efficiency", () => {
    const c = config(); c.battery.initialSoc = 0; c.battery.chargeAmps = 10; c.battery.chargeEfficiency = 0.5;
    const r = simulate(c, () => 240);
    close(r.finalSoc, 100); close(r.solarKwh, 5.76); close(r.curtailedKwh, 3.36);
  });
  it("load + battery change + curtailed energy balances lossless PV", () => {
    const c = config(); c.battery.initialSoc = 50; c.loads = [load(100)];
    const r = simulate(c, (minute) => minute >= 360 && minute < 1080 ? 300 : 0);
    const batteryDelta = (r.finalSoc - 50) / 100 * batteryBank(c).wh / 1000;
    close(r.solarKwh, r.servedKwh + r.curtailedKwh + batteryDelta);
    close(r.demandKwh, r.servedKwh + r.unmetKwh);
  });
  it("zero initial charge below reserve is not magically raised", () => {
    const c = config(); c.battery.initialSoc = 0; c.battery.reserveSoc = 50; c.loads = [load(20)];
    const r = simulate(c, () => 0); close(r.finalSoc, 0); close(r.servedKwh, 0);
  });
  it("cross-midnight and non-5-minute schedules are event aligned", () => {
    assert.equal(inWindow(30, { start: 1380, duration: 120 }), true);
    assert.equal(inWindow(60, { start: 1380, duration: 120 }), false);
    const c = config(); c.grid.mode = "hybrid"; c.loads = [load(100, 1081, 7)];
    const r = simulate(c, () => 0); close(r.demandKwh, 100 * 7 / 60 / 1000);
  });
  it("priority sheds whole appliances when continuous watts exceed rating", () => {
    const c = config(); c.inverter.va = 150;
    c.loads = [{ ...load(100), id: "important", priority: 1 }, { ...load(100), id: "optional", priority: 9 }];
    const r = simulate(c, () => 1000);
    close(r.steps[0].servedW, 100);
    assert.equal(r.steps[0].loads.find((l) => l.id === "optional")?.reason, "inverter-watts");
  });
  it("VA and starting surges can fail even below continuous watts", () => {
    const c = config(); c.inverter.va = 1000; c.inverter.surgeWatts = 1200;
    c.loads = [{ ...load(600), powerFactor: 0.5 }];
    assert.equal(simulate(c, () => 2000).steps[0].loads[0].reason, "inverter-va");
    c.loads = [{ ...load(600), surgeMultiplier: 3 }];
    assert.equal(simulate(c, () => 2000).steps[0].loads[0].reason, "startup-surge");
  });
  it("fridge duty cycles integrate exact run minutes and repeat startup checks", () => {
    const c = config(); c.loads = [{ ...makeLoad(3, "fridge"), watts: 120, powerFactor: 1, surgeMultiplier: 1 }];
    const r = simulate(c, () => 1000);
    close(r.demandKwh, 0.96); // 120 W × 8 h, not 120 W × 24 h.
    c.inverter.surgeWatts = 300; c.loads[0].surgeMultiplier = 4;
    close(simulate(c, () => 1000).servedKwh, 0);
  });
  it("startup must fit battery current even when inverter surge rating is sufficient", () => {
    const c = config(); c.battery.dischargeAmps = 20; c.loads = [{ ...load(200), surgeMultiplier: 3 }];
    assert.equal(simulate(c, () => 0).steps[0].loads[0].reason, "startup-source");
    c.battery.dischargeAmps = 100;
    assert.equal(simulate(c, () => 0).steps[0].loads[0].reason, "running");
  });
  it("bank/inverter voltage mismatch disables backup rather than inventing power", () => {
    const c = config(); c.battery.series = 2; c.loads = [load(100)];
    const r = simulate(c, () => 2000); close(r.servedKwh, 0);
    assert.equal(r.steps[0].loads[0].reason, "voltage-mismatch");
  });
  it("battery state carries to the second day, not reset nightly", () => {
    const c = config(); c.days = 2; c.loads = [load(50)];
    const r = simulate(c, () => 0); close(r.servedKwh, 1.2); close(r.unmetKwh, 1.2);
  });
  it("hybrid mains bypass supplies loads, cuts use backup, grid-tied cuts disconnect PV", () => {
    const c = config(); c.grid.mode = "hybrid"; c.grid.outages = [{ start: 1080, duration: 60 }];
    c.battery.initialSoc = 0; c.loads = [load(100)];
    const hybrid = simulate(c, () => 0); close(hybrid.gridKwh, 2.3); close(hybrid.unmetKwh, 0.1);
    c.grid.mode = "grid-tied";
    const tied = simulate(c, () => 1000); close(tied.unmetKwh, 0.1);
    assert.equal(tied.steps.find((s) => s.minute === 1080)?.loads[0].reason, "grid-outage");
    close(tied.steps.find((s) => s.minute === 1080)!.solarW, 0);
  });
  it("PV charge controller clips DC input at nominal bank V × A", () => {
    const c = config(); c.solar.controllerAmps = 10;
    close(simulate(c, () => 1000).steps[0].solarW, 120);
  });
  it("weekly high-current runs respect SOC bounds and requested-energy accounting", () => {
    const c = defaultSimulation(); c.days = 7; c.grid.mode = "hybrid";
    c.grid.outages = [{ start: 1141, duration: 137 }];
    c.loads = [...c.loads, makeLoad(3, "fridge"), makeLoad(7, "pump")];
    const r = simulate(c);
    assert.ok(r.steps.every((s) => s.soc >= c.battery.reserveSoc - 1e-6 && s.soc <= 100 && s.shortfallW >= 0));
    close(r.demandKwh, r.servedKwh + r.unmetKwh);
    close(Object.values(r.perLoad).reduce((sum, l) => sum + l.unmetKwh, 0), r.unmetKwh);
  });
  it("India solar is zero at night and custom array wattage scales DC generation", () => {
    const c = defaultSimulation();
    close(estimatedSolarDc(c, 0), 0); close(estimatedSolarDc(c, 1380), 0);
    assert.ok(estimatedSolarDc(c, 720) > 0);
    close(estimatedSolarDc({ ...c, solar: { ...c.solar, count: 4 } }, 720), estimatedSolarDc(c, 720) * 2);
  });
  it("advice comes from another simulated schedule without overwriting baseline", () => {
    const c = defaultSimulation(); c.grid.mode = "hybrid"; c.loads = [load(150, 1140, 60)];
    const baseline = simulate(c); const advice = scheduleAdvice(c, baseline);
    assert.ok(advice.length > 0); assert.ok(advice[0].gridReduction > 0);
    assert.equal(c.loads[0].windows[0].start, 1140);
    assert.equal(advice[0].moved.loads[0].windows[0].start, 720);
  });
  it("two 220 W panels, 150 Ah battery and overlapping fan/lights/TV produce finite shortfalls", () => {
    const c = defaultSimulation(); const r = simulate(c);
    assert.ok(r.solarKwh > 0 && r.demandKwh > 0); assert.ok(r.unmetKwh > 0);
    assert.ok(r.steps.every((s) => s.soc >= 0 && s.soc <= 100 && Number.isFinite(s.servedW)));
    close(r.demandKwh, r.servedKwh + r.unmetKwh);
  });
  it("overlapping windows count each appliance once, simultaneous starts add surges", () => {
    const c = config(); c.loads = [{ ...load(100), windows: [{ start: 0, duration: 60 }, { start: 30, duration: 60 }] }];
    close(simulate(c, () => 1000).demandKwh, 0.15);
    c.inverter.surgeWatts = 1000;
    c.loads = [{ ...load(200), id: "a", surgeMultiplier: 3 }, { ...load(200), id: "b", surgeMultiplier: 3 }];
    assert.equal(simulate(c, () => 2000).steps[0].loads.find((s) => s.id === "b")?.reason, "startup-surge");
  });
  it("simulator drafts isolate users and retain all equipment/schedules and linked roof", () => {
    const project = { config: defaultSimulation(), plannerProject: { ...defaultProject(), siteId: "delhi" } };
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    assert.equal(writeSimulationDraft(storage, "alice", project), true);
    assert.deepEqual(readSimulationDraft(storage, "alice"), project);
    assert.equal(readSimulationDraft(storage, "bob"), null);
  });
  it("India planner handoff preserves battery/schedules and rejects a non-India site", () => {
    const existing = { config: defaultSimulation() };
    existing.config.battery.unitAh = 200;
    const roof = { ...defaultProject(), siteId: "delhi", moduleWatts: 550 };
    const transferred = plannerToSimulation(roof, 6, 35, existing);
    assert.equal(transferred.config.solar.count, 6);
    assert.equal(transferred.config.solar.watts, 550);
    assert.equal(transferred.config.solar.tilt, 35);
    assert.deepEqual(transferred.config.battery, existing.config.battery);
    assert.deepEqual(transferred.config.loads, existing.config.loads);
    assert.deepEqual(transferred.plannerProject, roof);
    assert.throws(() => plannerToSimulation(defaultProject(), 6, 35));
  });
  it("router protects the dedicated workspace and auth fallback opens simulator", () => {
    const router = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
    assert.match(router, /path="\/simulator" element=\{<RequireAuth redirectImmediately><Simulator/);
    assert.match(router, /redirectAfterAuth="\/simulator"/);
  });
  it("rejects invalid equipment, duplicate load IDs and invalid imported numbers", () => {
    const c = config();
    assert.equal(simulationSchema.safeParse({ ...c, battery: { ...c.battery, unitAh: -150 } }).success, false);
    assert.equal(simulationSchema.safeParse({ ...c, loads: [load(50), load(50)] }).success, false);
    assert.throws(() => simulate(c, () => NaN));
  });
});
