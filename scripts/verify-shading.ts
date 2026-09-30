/**
 * Regression test for the annual shading model.
 *
 * The invariant that matters: the annual figure depends on the design only.
 * If it ever starts depending on the time-of-day slider again, the headline
 * kWh, kWh/kWp and %-of-usage all move while the sun is being scrubbed.
 *
 *   bunx tsx scripts/verify-shading.ts
 */
import {
  SITE_PRESETS,
  MODULE_PRESETS,
  DEFAULT_OBSTACLES,
  starterRoof,
  layoutPanels,
  roofFrame,
  buildShadingField,
  type Mounting,
} from "../src/lib/roof";
import {
  annualEnergy,
  dayOfYear as doyOf,
  type SystemSpec,
} from "../src/lib/solar";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

const site = SITE_PRESETS.find((p) => p.id === "sf")!;
const mod = MODULE_PRESETS.find((p) => p.id === "modern-440")!;
const tilt = 25;
const azimuth = 180;
const frame = roofFrame(tilt, azimuth);

function systemFor(capacityW: number): SystemSpec {
  return {
    module: {
      length: mod.length,
      width: mod.width,
      wattage: mod.wattage,
      tempCoefficient: mod.tempCoefficient,
    },
    inverterWatts: Math.max(1, capacityW / 1.15),
    latitude: site.latitude,
    longitude: site.longitude,
    utcOffset: site.utcOffset,
    monthlyClearness: site.clearness,
    monthlyTemperature: site.temperature,
    losses: 0.14,
    noct: 45,
    albedo: 0.2,
  };
}

function setup(mounting: Mounting) {
  const layout = layoutPanels({
    polygon: starterRoof(),
    tilt,
    azimuth,
    latitude: site.latitude,
    moduleLength: mod.length,
    moduleWidth: mod.width,
    orientation: "portrait",
    mounting,
    rackTilt: 10,
    setback: 0.4,
    gap: 0.02,
    obstacles: DEFAULT_OBSTACLES,
  });
  const system = systemFor(layout.panels.length * mod.wattage);
  const field = buildShadingField({
    panels: layout.panels,
    obstacles: DEFAULT_OBSTACLES,
    frame,
    moduleHeight: layout.moduleHeight,
    rowsCanShade: layout.rowsCanShade,
    latitude: site.latitude,
    longitude: site.longitude,
    utcOffset: site.utcOffset,
  });
  return { layout, system, field };
}

const CLOCK = [300, 480, 660, 780, 960, 1140, 1260];

for (const mounting of ["flush", "racked"] as Mounting[]) {
  const { layout, system, field } = setup(mounting);
  const n = layout.panels.length;
  const lookup = (d: Date, m: number) => field.at(doyOf(d), m);

  console.log(
    `\n=== ${mounting} ===  ${n} panels, ${((n * mod.wattage) / 1000).toFixed(2)} kWp, rowsCanShade=${layout.rowsCanShade}`,
  );

  const byMinute = CLOCK.map((m) => Math.round(annualEnergy(system, n, tilt, azimuth, lookup).annualKwh));
  const spread = Math.max(...byMinute) - Math.min(...byMinute);
  check(
    "annual kWh independent of the clock",
    spread === 0,
    `spread ${spread} kWh across ${CLOCK.length} times of day (${byMinute[0]} kWh)`,
  );

  const unshaded = annualEnergy(system, n, tilt, azimuth).annualKwh;
  const shaded = annualEnergy(system, n, tilt, azimuth, lookup).annualKwh;
  const lossPct = 100 * (1 - shaded / unshaded);
  check("shading removes energy", lossPct > 0, `${lossPct.toFixed(2)}% annual loss`);

  // Winter mornings are the hard case: long shadows and low sun.
  console.log(
    `  field @ 12:00  Jun ${field.at(196, 720).toFixed(4)}  Dec ${field.at(15, 720).toFixed(4)}`,
  );
  console.log(
    `  field @ 08:00  Jun ${field.at(196, 480).toFixed(4)}  Dec ${field.at(15, 480).toFixed(4)}`,
  );
  if (mounting === "racked") {
    check(
      "winter row shading is captured",
      field.at(15, 480) > field.at(196, 480),
      `Dec ${field.at(15, 480).toFixed(4)} > Jun ${field.at(196, 480).toFixed(4)}`,
    );
  }
}

const flush = setup("flush");
const t0 = performance.now();
for (let i = 0; i < 10; i++) annualEnergy(flush.system, 25, tilt, azimuth, (d, m) => flush.field.at(doyOf(d), m));
const energyMs = (performance.now() - t0) / 10;
const t1 = performance.now();
for (let i = 0; i < 10; i++) setup("racked");
const fieldMs = (performance.now() - t1) / 10;

console.log(`\n=== cost (only recomputed on design changes) ===`);
console.log(`  buildShadingField: ${fieldMs.toFixed(1)} ms`);
console.log(`  annualEnergy:      ${energyMs.toFixed(1)} ms`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
