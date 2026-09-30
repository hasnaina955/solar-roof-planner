import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { DEG, requiredRowPitch, profileAltitude, solarPosition, unitFromAltAz, winterSolsticeNoonAltitude, dayEvents, incidenceCosine, annualEnergy, type SystemSpec } from "../src/lib/solar";
import { designRowPitch, computeShading, roofFrame, layoutPanels, SITE_PRESETS, MODULE_PRESETS, type Panel } from "../src/lib/roof";
import { initialHistory, reduceHistory } from "../src/lib/design-history";
import { defaultProject, parseProject, readDraft, writeDraft, draftKey } from "../src/lib/project";

const close = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
const panel = (y: number, row: number): Panel => ({ id: `p${row}`, x: 0, y, w: 2, h: 2, row, column: 0, shade: 0 });
const rectangularRoof = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 12 }, { x: 0, y: 12 }];
const site = SITE_PRESETS[0];
const module = MODULE_PRESETS[1];
const system: SystemSpec = { module, inverterWatts: 4000, latitude: site.latitude, longitude: site.longitude, utcOffset: site.utcOffset, monthlyClearness: site.clearness, monthlyTemperature: site.temperature, losses: 0.14, noct: 45, albedo: 0.2 };

describe("independent physical reference cases", () => {
  it("flat-roof reference: 2 m module, 30° rack, 30° sun → 3.4641 m pitch", () => {
    close(requiredRowPitch(2, 30, 30), 2 * Math.sqrt(3));
    close(requiredRowPitch(2, 30, 60), 4 / Math.sqrt(3));
    assert.ok(requiredRowPitch(2, 30, 15) > requiredRowPitch(2, 30, 45));
    close(requiredRowPitch(2, 0, 30), 2);
  });
  it("sloped-roof pitch equals a world-space high-edge ray/roof intersection", () => {
    for (const roof of [0, 10, 25, 45]) for (const rack of [5, 15, 25]) for (const altitude of [10, 30, 60]) {
      const beta = roof * DEG;
      const moduleTilt = (roof + rack) * DEG;
      // Cross-section: horizontal +X uphill, vertical +Y up.
      const high = { x: 2 * Math.cos(moduleTilt), y: 2 * Math.sin(moduleTilt) };
      const d = { x: Math.cos(altitude * DEG), y: -Math.sin(altitude * DEG) };
      const t = (Math.tan(beta) * high.x - high.y) / (d.y - Math.tan(beta) * d.x);
      const shadowOnRoof = (high.x + t * d.x) / Math.cos(beta);
      const footprint = 2 * Math.cos(rack * DEG);
      close(requiredRowPitch(2, roof + rack, altitude, roof), Math.max(footprint, shadowOnRoof));
    }
  });
  it("off-axis profile uses projection, not multiplication by cos(azimuth)", () => {
    const sun = solarPosition(40, 0, 0, new Date("2023-06-21"), 720);
    const referenceSun = { ...sun, altitude: 30, azimuth: 240 };
    close(profileAltitude(referenceSun, { tilt: 0, azimuth: 180 }), Math.atan(2 / Math.sqrt(3)) / DEG);
    close(profileAltitude({ ...sun, altitude: 30, azimuth: 270 }, { tilt: 0, azimuth: 180 }), 90);
    close(profileAltitude({ ...sun, altitude: 30, azimuth: 0 }, { tilt: 0, azimuth: 180 }), 150);
  });
  it("uses June winter in Sydney and December winter in the north", () => {
    close(winterSolsticeNoonAltitude(-33.87, 0), 90 - 33.87 - 23.44, 0.2);
    close(winterSolsticeNoonAltitude(40, 180), 90 - 40 - 23.44, 0.2);
  });
  it("rack normal matches energy tilt, including the shared 70° cap", () => {
    for (const roof of [0, 25, 55]) for (const rack of [0, 10, 35]) {
      const layout = designRowPitch(2, roof, 180, 37.77, "racked", rack);
      const frame = roofFrame(roof, 180);
      const r = (layout.moduleTilt - roof) * DEG;
      const normal = { x: frame.normal.x * Math.cos(r) - frame.upSlope.x * Math.sin(r), y: frame.normal.y * Math.cos(r) - frame.upSlope.y * Math.sin(r), z: frame.normal.z * Math.cos(r) - frame.upSlope.z * Math.sin(r) };
      const sun = unitFromAltAz(40, 210);
      close(normal.x * sun.x + normal.y * sun.y + normal.z * sun.z, incidenceCosine(40, 210, { tilt: layout.moduleTilt, azimuth: 180 }));
      close(layout.moduleHeight, 2 * Math.sin(r));
    }
  });
  it("front row shades rear row at low sun; design pitch clears it", () => {
    const height = 1; // 2 m at 30°, projected footprint sqrt(3).
    const frame = roofFrame(0, 180);
    const sun = unitFromAltAz(15, 180);
    const tight = computeShading([panel(0, 0), panel(2, 1)], [], frame, height, true, sun);
    close(tight[0], 0);
    assert.ok(tight[1] > 0.5);
    const clear = computeShading([panel(0, 0), panel(requiredRowPitch(2, 30, 15) + 0.05, 1)], [], frame, height, true, sun);
    assert.deepEqual(clear, [0, 0]);
  });
  it("back-facing rack has no beam even when the roof itself is sunlit", () => {
    // Flat roof is sunlit, but a south-facing rack sees a low north sun behind it.
    const result = computeShading([panel(0, 0)], [], roofFrame(0, 180), 1, true, unitFromAltAz(10, 0));
    assert.deepEqual(result, [1]);
  });
  it("vent intersections respect the elevated module surface", () => {
    const vent = { id: "v", x: 0, y: 0, w: 2, h: 2, height: 0.02, label: "Low" };
    assert.deepEqual(computeShading([panel(0, 0)], [vent], roofFrame(0, 180), 0, false, unitFromAltAz(60, 180)), [0]);
    assert.deepEqual(computeShading([panel(0, 0)], [{ ...vent, height: 2 }], roofFrame(0, 180), 0, false, unitFromAltAz(60, 180)), [1]);
  });
  it("edge setbacks apply on all four sides to projected rack footprints", () => {
    const layout = layoutPanels({ polygon: rectangularRoof, tilt: 0, azimuth: 180, latitude: 37.77, moduleLength: 2, moduleWidth: 1, orientation: "portrait", mounting: "racked", rackTilt: 30, setback: 0.5, gap: 0.02, obstacles: [] });
    assert.ok(layout.panels.length > 0);
    for (const p of layout.panels) {
      assert.ok(p.x >= 0.5 && p.x + p.w <= 7.5 + 1e-9);
      assert.ok(p.y >= 0.5 && p.y + Math.sqrt(p.h ** 2 - layout.moduleHeight ** 2) <= 11.5);
    }
  });
  it("solar noon is near midday, not 28h, in San Francisco", () => {
    const date = new Date("2023-06-21");
    const events = dayEvents(system, date);
    assert.ok(events.noon > 700 && events.noon < 780);
    const before = solarPosition(site.latitude, site.longitude, site.utcOffset, date, events.noon - 15);
    const noon = solarPosition(site.latitude, site.longitude, site.utcOffset, date, events.noon);
    const after = solarPosition(site.latitude, site.longitude, site.utcOffset, date, events.noon + 15);
    assert.ok(noon.altitude > before.altitude && noon.altitude > after.altitude);
  });
});

describe("action-based undo/redo", () => {
  const start = { tilt: 25, azimuth: 180, moduleId: "old", moduleWatts: 465 };
  const edit = (state: ReturnType<typeof initialHistory<typeof start>>, patch: Partial<typeof start>, at: number) => reduceHistory(state, { type: "edit", patch, at, continuousKeys: ["tilt", "azimuth", "moduleWatts"] });
  it("first edit is undoable; same slider merges; another slider does not", () => {
    let state = edit(initialHistory(start), { tilt: 26 }, 1);
    assert.equal(state.past.length, 1);
    state = edit(state, { tilt: 30 }, 2);
    assert.equal(state.past.length, 1);
    state = edit(state, { azimuth: 190 }, 3);
    assert.equal(state.past.length, 2);
    close(reduceHistory(state, { type: "undo" }).present.azimuth, 180);
  });
  it("divergent slider edits invalidate redo and get their own undo step", () => {
    let state = edit(initialHistory(start), { tilt: 30 }, 1);
    state = reduceHistory(state, { type: "undo" });
    state = edit(state, { tilt: 35 }, 2);
    assert.equal(state.future.length, 0);
    assert.deepEqual(reduceHistory(state, { type: "undo" }).present, start);
  });
  it("module selection and custom watts restore atomically", () => {
    const state = edit(initialHistory(start), { moduleId: "new", moduleWatts: 550 }, 1);
    const restored = reduceHistory(state, { type: "undo" });
    assert.deepEqual(restored.present, start);
    assert.equal(reduceHistory(restored, { type: "redo" }).present.moduleWatts, 550);
  });
  it("replace, including identical replace, never swallows the next edit", () => {
    const state = reduceHistory(initialHistory(start), { type: "replace", value: start });
    assert.equal(edit(state, { tilt: 30 }, 1).past.length, 1);
  });
  it("functional patches use the latest reducer state across batched edits", () => {
    let state = initialHistory(start);
    for (let i = 0; i < 3; i++) {
      state = reduceHistory(state, { type: "edit", patch: (current) => ({ tilt: current.tilt + 1 }), at: i, continuousKeys: ["tilt"] });
    }
    close(state.present.tilt, 28);
    assert.deepEqual(reduceHistory(state, { type: "undo" }).present, start);
  });
  it("no-op edits keep redo; history retains at most 100 steps", () => {
    let state = initialHistory(start);
    for (let i = 1; i <= 120; i++) state = edit(state, { tilt: i }, i * 1000);
    assert.equal(state.past.length, 100);
    state = reduceHistory(state, { type: "undo" });
    assert.equal(edit(state, { tilt: state.present.tilt }, 999999), state);
  });
});

describe("complete project and local draft recovery", () => {
  it("round trips racks, custom watts, limited count, appliances, geometry and clock", () => {
    const project = { ...defaultProject(), mounting: "racked" as const, rackTilt: 23, panelLimit: 2, moduleWatts: 220, dayOfYear: 300, minutes: 1234, appliances: [{ id: "fan", name: "Fan", watts: 45, quantity: 2, hours: 7 }] };
    assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    assert.equal(writeDraft(storage, "alice", project), true);
    assert.deepEqual(readDraft(storage, "alice"), project);
    assert.equal(readDraft(storage, "bob"), null);
    const maximumMode = { ...project, panelLimit: null };
    assert.equal(writeDraft(storage, "bob", maximumMode), true);
    assert.deepEqual(readDraft(storage, "bob"), maximumMode);
    assert.deepEqual(readDraft(storage, "alice"), project);
    data.set(draftKey("alice"), "broken JSON");
    assert.equal(readDraft(storage, "alice"), null);
  });
  it("rejects unknown versions, invalid ranges and unknown equipment without crashing", () => {
    for (const patch of [{ version: 2 }, { moduleId: "missing" }, { minutes: NaN }, { tilt: 99 }, { panelLimit: -1 }, { appliances: [{}] }]) {
      assert.equal(parseProject({ ...defaultProject(), ...patch }), null);
    }
    const storage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    assert.equal(readDraft(storage, "alice"), null);
    assert.equal(writeDraft(storage, "alice", defaultProject()), false);
  });
  it("restored layout and energy match the saved configuration", () => {
    const original = { ...defaultProject(), mounting: "racked" as const, rackTilt: 15, panelLimit: 2, moduleWatts: 220 };
    const restored = parseProject(JSON.parse(JSON.stringify(original)))!;
    const calculate = (project: typeof original) => {
      const layout = layoutPanels({ ...project, latitude: site.latitude, moduleLength: module.length, moduleWidth: module.width, gap: 0.02 });
      const count = Math.min(project.panelLimit, layout.panels.length);
      const energy = annualEnergy({ ...system, module: { ...module, wattage: project.moduleWatts } }, count, layout.moduleTilt, project.azimuth);
      return { layout, count, energy };
    };
    assert.deepEqual(calculate(restored as typeof original), calculate(original));
  });
});

describe("dashboard source-wiring guards (not browser interaction tests)", () => {
  const text = readFileSync(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("Dashboard.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function memo(name: string): ts.CallExpression {
    let found: ts.CallExpression | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && ts.isCallExpression(node.initializer)) found = node.initializer;
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.ok(found, `missing memo ${name}`);
    return found;
  }
  it("annual memo uses module surface and cannot read selected clock or live derate", () => {
    const energy = memo("energy").getText(source);
    assert.match(energy, /annualEnergy\(system, panelCount, surface\.tilt, surface\.azimuth, shadeAt\)/);
    assert.doesNotMatch(energy, /\b(minutes|date|dayOfYear|live|derate|sun)\b/);
    assert.doesNotMatch(memo("annualShading").getText(source), /\b(minutes|date|dayOfYear|live|derate|sun)\b/);
    assert.match(memo("surface").getText(source), /tilt: layout\.moduleTilt/);
    assert.match(text, /rackTilt=\{layout\.moduleTilt - tilt\}/);
  });
  it("save sends complete snapshot and custom watts; load replaces history", () => {
    assert.match(text, /wattage: moduleWatts/);
    assert.match(text, /specificYield: energy\.specificYield,\s*project,/);
    assert.match(text, /history\.replace\(designFromProject\(restored\)\)/);
    assert.doesNotMatch(text, /setModuleWatts\(modulePreset\.wattage\)/);
    const backend = readFileSync(new URL("../src/convex/designs.ts", import.meta.url), "utf8");
    assert.match(backend, /project: projectValidator/);
    assert.match(backend, /parseProject\(args\.project\)/);
  });
});
