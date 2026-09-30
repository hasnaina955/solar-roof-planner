/**
 * Checks the scene lighting model in RoofScene.
 *
 * The contract: at the tuned condition (REFERENCE_ALTITUDE / REFERENCE_CLEARNESS)
 * the render must be identical to the old flat constant light — intensity 3,
 * ambient 0.95, colour #fff0d2 — and everything else must follow the real
 * clear-sky model monotonically.
 *
 *   bunx tsx scripts/verify-lighting.ts
 */
import { clearSkyIrradiance, solarPosition } from "../src/lib/solar";
import { SITE_PRESETS } from "../src/lib/roof";

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

// Mirrors sunLightFor() in RoofScene.tsx. three.js is not importable outside a
// browser here, so the clamp/lerp maths is reproduced exactly.
const REFERENCE_ALTITUDE = 55;
const REFERENCE_CLEARNESS = 0.62;
const ref = clearSkyIrradiance(REFERENCE_ALTITUDE, REFERENCE_CLEARNESS);

function sunLightFor(altitudeDeg: number, clearness: number) {
  const sky = clearSkyIrradiance(Math.max(altitudeDeg, 0), clearness);
  const intensity = clamp((3 * sky.dni) / ref.dni, 0, 4);
  const t = smoothstep(clamp(altitudeDeg / REFERENCE_ALTITUDE, 0, 1));
  const ambient = clamp(0.95 * (sky.ghi / ref.ghi), 0.42, 1.25);
  return { intensity, ambient, warmth: t };
}

console.log("=== calibration ===");
console.log(
  `  reference DNI ${ref.dni.toFixed(1)} W/m2, GHI ${ref.ghi.toFixed(1)} W/m2 ` +
    `at ${REFERENCE_ALTITUDE}deg / clearness ${REFERENCE_CLEARNESS}`,
);
const atRef = sunLightFor(REFERENCE_ALTITUDE, REFERENCE_CLEARNESS);
check(
  "tuned condition reproduces the old constant light",
  Math.abs(atRef.intensity - 3) < 1e-9 &&
    Math.abs(atRef.ambient - 0.95) < 1e-9 &&
    atRef.warmth === 1,
  `intensity ${atRef.intensity.toFixed(4)}, ambient ${atRef.ambient.toFixed(4)}, neutral colour`,
);

console.log("\n=== response to sun altitude (clearness 0.62) ===");
let prev = -1;
let monotone = true;
for (const alt of [0, 5, 10, 20, 30, 40, 55, 70, 90]) {
  const r = sunLightFor(alt, 0.62);
  if (r.intensity < prev - 1e-9) monotone = false;
  prev = r.intensity;
  console.log(
    `  ${String(alt).padStart(2)}deg  intensity ${r.intensity.toFixed(3)}  ` +
      `ambient ${r.ambient.toFixed(3)}  warmth ${r.warmth.toFixed(3)}`,
  );
}
check("intensity rises with altitude", monotone, "monotone across 0-90deg");

console.log("\n=== response to cloud cover (sun at 40deg) ===");
prev = -1;
monotone = true;
for (const c of [0.3, 0.4, 0.5, 0.62, 0.7, 0.8]) {
  const r = sunLightFor(40, c);
  if (r.intensity < prev - 1e-9) monotone = false;
  prev = r.intensity;
  console.log(
    `  clearness ${c.toFixed(2)}  intensity ${r.intensity.toFixed(3)}  ambient ${r.ambient.toFixed(3)}`,
  );
}
check("intensity rises as cloud clears", monotone, "monotone across 0.30-0.80");

console.log("\n=== every site, every month, every 15 min of an extreme day ===");
let minI = Infinity;
let maxI = -Infinity;
let minA = Infinity;
let maxA = -Infinity;
let worst = "";
let bad = 0;
for (const site of SITE_PRESETS) {
  for (const month of [0, 5, 11]) {
    const date = new Date(Date.UTC(2023, month, 15));
    for (let m = 0; m <= 1440; m += 15) {
      const sun = solarPosition(site.latitude, site.longitude, site.utcOffset, date, m);
      const alt = sun.altitude;
      const r = sunLightFor(alt, site.clearness[month]);
      if (!Number.isFinite(r.intensity) || !Number.isFinite(r.ambient)) bad++;
      if (alt < 5) continue; // twilight is meant to be nearly dark
      if (r.intensity < minI) {
        minI = r.intensity;
        worst = `${site.name}, month ${month + 1}, ${String(m).padStart(4, "0")} min, sun ${alt.toFixed(1)}deg, clearness ${site.clearness[month]}`;
      }
      maxI = Math.max(maxI, r.intensity);
      minA = Math.min(minA, r.ambient);
      maxA = Math.max(maxA, r.ambient);
    }
  }
}
check("no NaN or Infinity anywhere", bad === 0, `${bad} bad samples`);
check(
  "dimmest usable daylight still reads",
  minI > 0.25,
  `min intensity ${minI.toFixed(3)} at ${worst}`,
);
check(
  "usable daylight never blows out",
  maxI <= 4,
  `max intensity ${maxI.toFixed(3)} (clamped ceiling 4)`,
);
console.log(`  ambient range ${minA.toFixed(3)} .. ${maxA.toFixed(3)}`);

// The horizon crossing must not step brightness up.
const horizonIn = sunLightFor(0.4, 0.62).ambient;
check(
  "twilight meets night without a step",
  Math.abs(horizonIn - 0.42) < 1e-9,
  `ambient at the horizon ${horizonIn.toFixed(3)} vs night fill 0.420`,
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
