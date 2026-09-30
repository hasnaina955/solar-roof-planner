/**
 * Specific yield across the site presets at the default design. This is the
 * quickest sanity check that a change to the physics has not broken the model,
 * and the source of the calibration table in docs/PHYSICS.md.
 *
 *   bunx tsx scripts/calibration.ts
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
const azimuth = 180;
const frame = roofFrame(tilt, azimuth);
const layout = layoutPanels({
  polygon: starterRoof(),
  tilt,
  azimuth,
  latitude: 37.77,
  moduleLength: mod.length,
  moduleWidth: mod.width,
  orientation: "portrait",
  mounting: "flush",
  rackTilt: 10,
  setback: 0.4,
  gap: 0.02,
  obstacles: DEFAULT_OBSTACLES,
});
const count = layout.panels.length;
const capacityW = count * mod.wattage;

const rows: [string, number, number][] = [];
for (const site of SITE_PRESETS) {
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
  rows.push([site.name, result.specificYield, result.capacityFactor]);
}

rows.sort((a, b) => a[1] - b[1]);
console.log(
  `default design: ${count} modules, ${(capacityW / 1000).toFixed(2)} kWp, ` +
    `tilt ${tilt}deg, azimuth S, flush, San Francisco obstruction set\n`,
);
console.log("Site              kWh/kWp/yr   capacity factor");
for (const [name, yieldKwh, cf] of rows) {
  console.log(
    `${name.padEnd(16)}  ${Math.round(yieldKwh).toString().padStart(7)}   ${(cf * 100).toFixed(1)}%`,
  );
}
const spread = rows[rows.length - 1][1] / rows[0][1];
console.log(`\nspread, darkest to sunniest: ${spread.toFixed(2)}x`);
