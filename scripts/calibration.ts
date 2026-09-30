/**
 * Model-yield sanity report, NOT calibration against measured systems.
 * Uses equator-facing arrays in both hemispheres and illustrative site presets.
 *
 *   bun scripts/calibration.ts
 */
import {
  SITE_PRESETS,
  MODULE_PRESETS,
  DEFAULT_OBSTACLES,
  starterRoof,
  layoutPanels,
  roofFrame,
  buildShadingField,
} from "../src/lib/roof";
import { annualEnergy, dayOfYear as doyOf, type SystemSpec } from "../src/lib/solar";

const mod = MODULE_PRESETS.find((p) => p.id === "modern-440")!;
const tilt = 25;
const rows: [string, number, number, number][] = [];
for (const site of SITE_PRESETS) {
  const azimuth = site.latitude < 0 ? 0 : 180;
  const frame = roofFrame(tilt, azimuth);
  const layout = layoutPanels({
    polygon: starterRoof(), tilt, azimuth, latitude: site.latitude,
    moduleLength: mod.length, moduleWidth: mod.width, orientation: "portrait",
    mounting: "flush", rackTilt: 10, setback: 0.4, gap: 0.02,
    obstacles: DEFAULT_OBSTACLES,
  });
  const count = layout.panels.length;
  const capacityW = count * mod.wattage;
  const system: SystemSpec = {
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
  const result = annualEnergy(system, count, tilt, azimuth, (d, m) =>
    field.at(doyOf(d), m),
  );
  rows.push([site.name, result.specificYield, result.capacityFactor, count]);
}

rows.sort((a, b) => a[1] - b[1]);
console.log(
  `Model estimates only: ${tilt}deg, equator-facing, flush, sample roof/vents. Not measured climate validation.\n`,
);
console.log("Site              kWh/kWp/yr   capacity factor   modules");
for (const [name, yieldKwh, cf, count] of rows) {
  console.log(
    `${name.padEnd(16)}  ${Math.round(yieldKwh).toString().padStart(7)}   ${(cf * 100).toFixed(1)}%   ${count}`,
  );
}
const spread = rows[rows.length - 1][1] / rows[0][1];
console.log(`\nspread, darkest to sunniest: ${spread.toFixed(2)}x`);
