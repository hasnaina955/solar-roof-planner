/**
 * Solar geometry + photovoltaic energy model.
 *
 * All positions use a right-handed world frame:
 *   +X = East, +Y = Up (zenith), +Z = South
 * so North is -Z. Azimuths are measured clockwise from North, the
 * convention used by PVsyst / PVGIS / NREL.
 *
 * Solar position follows the NOAA Solar Calculator equations
 * (Michalsky-style fractional year form). Irradiance uses an
 * ASHRAE-style clear-sky model with a Kasten-Young air mass, and
 * plane-of-array transposition uses the isotropic sky model.
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SunPosition {
  /** Degrees above the horizon. Negative = night. */
  altitude: number;
  /** Degrees clockwise from North. */
  azimuth: number;
  /** Unit vector pointing from the scene toward the sun. */
  direction: Vec3;
  /** Solar declination in degrees. */
  declination: number;
  /** Equation of time in minutes. */
  eqTime: number;
}

/** Day-of-year (1..365) for a JS date. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return Math.floor((current - start) / 86400000);
}

export function monthOfDay(doy: number): number {
  const d = new Date(Date.UTC(2001, 0, doy));
  return d.getUTCMonth();
}

/**
 * NOAA solar position.
 * @param minutesOfDay local clock time, minutes past midnight
 */
export function solarPosition(
  latitude: number,
  longitude: number,
  utcOffsetHours: number,
  date: Date,
  minutesOfDay: number,
): SunPosition {
  const doy = dayOfYear(date);
  const hour = minutesOfDay / 60;

  // Fractional year (radians)
  const gamma = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);

  // Equation of time (minutes)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // True solar time (minutes)
  const timeOffset = eqTime + 4 * longitude - 60 * utcOffsetHours;
  const tst = (((minutesOfDay + timeOffset) % 1440) + 1440) % 1440;

  // Hour angle (degrees, negative before solar noon)
  const ha = tst / 4 - 180;

  const latRad = latitude * DEG;
  const haRad = ha * DEG;

  const cosZenith =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const altitude = 90 - zenith * RAD;

  // Azimuth, clockwise from north. The acos term is measured from due south,
  // so it flips across the solar noon line.
  const sinZenith = Math.sin(zenith);
  let azimuth = 180;
  if (Math.abs(sinZenith) > 1e-6 && Math.abs(Math.cos(latRad)) > 1e-6) {
    const fromSouth =
      (Math.sin(latRad) * Math.cos(zenith) - Math.sin(decl)) /
      (Math.cos(latRad) * sinZenith);
    const angle = Math.acos(Math.max(-1, Math.min(1, fromSouth))) * RAD;
    azimuth = ha > 0 ? (angle + 180) % 360 : (180 - angle + 360) % 360;
  }

  return {
    altitude,
    azimuth,
    declination: decl * RAD,
    eqTime,
    direction: unitFromAltAz(altitude, azimuth),
  };
}

/** Unit vector toward the sun for an altitude/azimuth pair. */
export function unitFromAltAz(altitude: number, azimuth: number): Vec3 {
  const alt = altitude * DEG;
  const az = azimuth * DEG;
  const c = Math.cos(alt);
  return {
    x: c * Math.sin(az),
    y: Math.sin(alt),
    z: -c * Math.cos(az),
  };
}

export interface Irradiance {
  /** Direct normal irradiance, W/m2 */
  dni: number;
  /** Diffuse horizontal irradiance, W/m2 */
  dhi: number;
  /** Global horizontal irradiance, W/m2 */
  ghi: number;
}

/**
 * Clear-sky irradiance from solar altitude. `clearness` (0..1) scales the
 * direct beam to represent cloud cover; a simple Perez-style reduction keeps
 * diffuse from vanishing entirely under overcast skies.
 */
export function clearSkyIrradiance(altitude: number, clearness: number): Irradiance {
  if (altitude <= 0) return { dni: 0, dhi: 0, ghi: 0 };

  const altRad = altitude * DEG;
  const cosZenith = Math.sin(altRad);

  // Kasten-Young relative air mass
  const airMass = 1 / (cosZenith + 0.50572 * Math.pow(altitude + 6.07995, -1.6364));

  // Meinel / Hottel beam attenuation
  const dniClear = 1361 * Math.pow(0.7, Math.pow(airMass, 0.678));

  const cloud = clamp(clearness, 0, 1);
  const dni = dniClear * (cloud * cloud * (3 - 2 * cloud));

  // Diffuse: clear-sky component + broad-cloud component
  const dhiClear = 0.13 * dniClear;
  const cloudDiffuse = 0.09 * 1361 * Math.sin(altRad) * (1 - cloud);
  const dhi = dhiClear * (0.25 + 0.75 * cloud) + cloudDiffuse;

  return { dni, dhi, ghi: dni * cosZenith + dhi };
}

export interface PlaneOrientation {
  /** Surface tilt from horizontal, degrees. */
  tilt: number;
  /** Surface azimuth (facing direction), degrees clockwise from North. */
  azimuth: number;
}

/**
 * Plane-of-array irradiance split into its three physical components.
 * Beam is the only part a shadow can remove, so the module-level shading pass
 * multiplies just this term.
 */
export function planeOfArrayComponents(
  poa: Irradiance,
  sun: SunPosition,
  surface: PlaneOrientation,
  groundAlbedo = 0.2,
): { beam: number; diffuse: number; ground: number; total: number } {
  if (sun.altitude <= 0) return { beam: 0, diffuse: 0, ground: 0, total: 0 };
  const tilt = surface.tilt * DEG;
  const dAzimuth = (sun.azimuth - surface.azimuth) * DEG;
  const altRad = sun.altitude * DEG;
  const cosIncidence =
    Math.cos(tilt) * Math.cos(Math.PI / 2 - altRad) +
    Math.sin(tilt) * Math.sin(Math.PI / 2 - altRad) * Math.cos(dAzimuth);
  const beam = poa.dni * Math.max(0, cosIncidence);
  const diffuse = poa.dhi * ((1 + Math.cos(tilt)) / 2);
  const ground = poa.ghi * groundAlbedo * ((1 - Math.cos(tilt)) / 2);
  return {
    beam,
    diffuse,
    ground,
    total: Math.max(0, beam + diffuse + ground),
  };
}

/**
 * Plane-of-array irradiance, isotropic sky model.
 */
export function planeOfArray(
  poa: Irradiance,
  sun: SunPosition,
  surface: PlaneOrientation,
  groundAlbedo = 0.2,
): number {
  return planeOfArrayComponents(poa, sun, surface, groundAlbedo).total;
}

/** Incidence cosine on the tilted surface (1 = facing the sun head-on). */
export function incidenceCosine(
  sunAltitude: number,
  sunAzimuth: number,
  surface: PlaneOrientation,
): number {
  if (sunAltitude <= 0) return 0;
  const tilt = surface.tilt * DEG;
  const dAz = (sunAzimuth - surface.azimuth) * DEG;
  const zenith = (90 - sunAltitude) * DEG;
  return (
    Math.cos(zenith) * Math.cos(tilt) +
    Math.sin(zenith) * Math.sin(tilt) * Math.cos(dAz)
  );
}

/**
 * Sun altitude inside the vertical cross-section perpendicular to the rows,
 * which is what governs inter-row shading.
 */
export function profileAltitude(
  sun: SunPosition,
  surface: PlaneOrientation,
): number {
  if (sun.altitude <= 0) return 0;
  const dAz = (sun.azimuth - surface.azimuth) * DEG;
  return Math.atan(Math.tan(sun.altitude * DEG) * Math.cos(dAz)) * RAD;
}

/**
 * Minimum row pitch for zero winter-solstice inter-row shading.
 *
 *   pitch = L * (1 + tan(alpha) / tan(beta))
 *
 * where L is the module dimension along the slope, beta the roof tilt and
 * alpha the profile altitude. This is the classic PV row-spacing result and
 * it is the single biggest driver of how many panels a roof can hold.
 */
export function requiredRowPitch(
  moduleAlongSlope: number,
  tilt: number,
  profileAlt: number,
): number {
  const beta = Math.max(tilt, 1) * DEG;
  const alpha = Math.max(profileAlt, 0.5) * DEG;
  return moduleAlongSlope * (1 + Math.tan(alpha) / Math.tan(beta));
}

/** Solar altitude at local solar noon on the winter solstice (21 Dec). */
export function winterSolsticeNoonAltitude(
  latitude: number,
  surfaceAzimuth: number,
): number {
  const winterSolstice = new Date(Date.UTC(2023, 11, 21));
  const position = solarPosition(latitude, 0, 0, winterSolstice, 720);
  return profileAltitude(position, { tilt: 0, azimuth: surfaceAzimuth });
}

export interface ModuleSpec {
  /** Dimension along the slope, metres. */
  length: number;
  /** Dimension along the eaves, metres. */
  width: number;
  /** Nameplate DC power, watts. */
  wattage: number;
  /** Module temperature coefficient of power, %/°C. */
  tempCoefficient: number;
}

export interface SystemSpec {
  module: ModuleSpec;
  /** Inverter AC rating, watts. */
  inverterWatts: number;
  /** Site latitude / longitude / UTC offset. */
  latitude: number;
  longitude: number;
  utcOffset: number;
  /** 0..1 cloud transmission, per month. */
  monthlyClearness: number[];
  /** Mean ambient temperature per month, °C. */
  monthlyTemperature: number[];
  /** Combined system losses, fraction. */
  losses: number;
  /** Module nominal operating cell temperature, °C. */
  noct: number;
  /** Ground albedo for the diffuse transposition. */
  albedo: number;
}

export function moduleArea(module: ModuleSpec): number {
  return module.length * module.width;
}

/**
 * DC power of the whole array for a given plane-of-array irradiance.
 *
 * Module nameplate is measured at 1000 W/m², so the plane-of-array irradiance
 * scaled to that reference, times the nameplate watts and the module count,
 * gives the DC power before derates. The cell-temperature coefficient and the
 * system losses are applied next, and the result is clipped at the inverter.
 */
export function acPowerWatts(
  system: SystemSpec,
  poaWm2: number,
  ambientC: number,
  panelCount: number,
): { dc: number; ac: number } {
  if (poaWm2 <= 0 || panelCount <= 0) return { dc: 0, ac: 0 };
  const cellTemp = ambientC + ((system.noct - 20) / 800) * poaWm2;
  const tempFactor =
    1 + (system.module.tempCoefficient / 100) * (cellTemp - 25);
  const dc =
    (poaWm2 / 1000) *
    system.module.wattage *
    panelCount *
    Math.max(0.7, tempFactor) *
    (1 - system.losses);
  const ac = Math.min(dc, system.inverterWatts);
  return { dc, ac };
}

export interface EnergyResult {
  /** kWh per year, AC. */
  annualKwh: number;
  /** 12 monthly production values, kWh. */
  monthlyKwh: number[];
  /** kWh per installed kWp for the year. */
  specificYield: number;
  /** Share of the year the array delivers its rating, as a fraction. */
  capacityFactor: number;
}

const YEAR_STEPS_PER_DAY = 96; // 15-minute resolution
const STEP_HOURS = 24 / YEAR_STEPS_PER_DAY;

/**
 * Fraction of the array in shadow at a given instant: 0 is fully lit, 1 is
 * fully shaded.
 *
 * This is looked up per timestep rather than collapsed to a single derate,
 * because the shadow geometry changes all year — a vent throws a long shadow
 * at noon in December and a short one at noon in June, and row-to-row shading
 * only bites when the sun is low. `buildShadingField` in `roof.ts` supplies a
 * cheap interpolating implementation.
 */
export type ShadingLookup = (date: Date, minutesOfDay: number) => number;

const NO_SHADING: ShadingLookup = () => 0;

/**
 * Plane-of-array irradiance with the beam component reduced by shadow.
 *
 * Only the beam term is scaled: diffuse light still reaches a shaded module
 * from the rest of the sky, and the ground-reflected component is unaffected.
 */
function shadedPlaneOfArray(
  parts: { beam: number; diffuse: number; ground: number },
  shade: number,
): number {
  return parts.beam * (1 - shade) + parts.diffuse + parts.ground;
}

/**
 * Integrate a full year of production at 15-minute resolution, resolving the
 * shading geometry at every timestep through `shading`.
 *
 * The annual figure therefore depends only on the design — roof, modules,
 * obstructions, tilt and azimuth — and never on which instant of the day the
 * UI happens to be parked at.
 */
export function annualEnergy(
  system: SystemSpec,
  panelCount: number,
  tilt: number,
  azimuth: number,
  shading: ShadingLookup = NO_SHADING,
): EnergyResult {
  const surface = { tilt, azimuth };
  const monthlyKwh = new Array(12).fill(0);
  let totalKwh = 0;

  for (let doy = 1; doy <= 365; doy++) {
    const date = new Date(Date.UTC(2023, 0, doy));
    const month = date.getUTCMonth();
    const clearness = system.monthlyClearness[month];
    const ambient = system.monthlyTemperature[month];

    for (let step = 0; step < YEAR_STEPS_PER_DAY; step++) {
      const minutes = (step * 1440) / YEAR_STEPS_PER_DAY;
      const sun = solarPosition(
        system.latitude,
        system.longitude,
        system.utcOffset,
        date,
        minutes,
      );
      if (sun.altitude <= 0) continue;
      const sky = clearSkyIrradiance(sun.altitude, clearness);
      const parts = planeOfArrayComponents(sky, sun, surface, system.albedo);
      const poa = shadedPlaneOfArray(parts, shading(date, minutes));
      if (poa <= 0) continue;
      const { ac } = acPowerWatts(system, poa, ambient, panelCount);
      const kwh = (ac * STEP_HOURS) / 1000;
      monthlyKwh[month] += kwh;
      totalKwh += kwh;
    }
  }

  const kwdc = (panelCount * system.module.wattage) / 1000;
  const annualKwh = totalKwh;
  return {
    annualKwh,
    monthlyKwh,
    specificYield: kwdc > 0 ? annualKwh / kwdc : 0,
    capacityFactor: kwdc > 0 ? annualKwh / (kwdc * 8760) : 0,
  };
}

export interface InstantResult {
  date: Date;
  minutesOfDay: number;
  sun: SunPosition;
  poa: number;
  /** AC watts for the full unshaded array. */
  acWatts: number;
  /** Sky cover 0..1. */
  clearness: number;
}

export function instantaneous(
  system: SystemSpec,
  panelCount: number,
  surface: PlaneOrientation,
  date: Date,
  minutesOfDay: number,
): InstantResult {
  const month = monthOfDay(dayOfYear(date));
  const clearness = system.monthlyClearness[month];
  const sun = solarPosition(
    system.latitude,
    system.longitude,
    system.utcOffset,
    date,
    minutesOfDay,
  );
  const sky = clearSkyIrradiance(sun.altitude, clearness);
  const poa = planeOfArray(sky, sun, surface, system.albedo);
  const { ac } = acPowerWatts(
    system,
    poa,
    system.monthlyTemperature[month],
    panelCount,
  );
  return { date, minutesOfDay, sun, poa, acWatts: ac, clearness };
}

/** Half-hourly AC production curve for one day, kWh. */
export function dailyProfile(
  system: SystemSpec,
  panelCount: number,
  surface: PlaneOrientation,
  date: Date,
  shading: ShadingLookup = NO_SHADING,
): { hour: number; kwh: number; altitude: number }[] {
  const out: { hour: number; kwh: number; altitude: number }[] = [];
  const month = monthOfDay(dayOfYear(date));
  const clearness = system.monthlyClearness[month];
  const ambient = system.monthlyTemperature[month];
  for (let hour = 0; hour <= 24; hour += 0.5) {
    const sun = solarPosition(
      system.latitude,
      system.longitude,
      system.utcOffset,
      date,
      hour * 60,
    );
    if (sun.altitude <= 0) {
      out.push({ hour, kwh: 0, altitude: Math.max(0, sun.altitude) });
      continue;
    }
    const sky = clearSkyIrradiance(sun.altitude, clearness);
    const parts = planeOfArrayComponents(sky, sun, surface, system.albedo);
    const poa = shadedPlaneOfArray(parts, shading(date, hour * 60));
    const { ac } = acPowerWatts(system, poa, ambient, panelCount);
    out.push({ hour, kwh: (ac * 0.5) / 1000, altitude: sun.altitude });
  }
  return out;
}

/** Sunrise / solar noon / sunset in local clock minutes. */
export function dayEvents(
  system: SystemSpec,
  date: Date,
): { sunrise: number; noon: number; sunset: number } {
  const noon = 720 - system.utcOffset * 60 - system.longitude * 4;
  let sunrise = 0;
  let sunset = 1440;
  for (let m = 0; m <= 1440; m += 2) {
    const sun = solarPosition(
      system.latitude,
      system.longitude,
      system.utcOffset,
      date,
      m,
    );
    if (sun.altitude > -0.833) {
      sunrise = m;
      break;
    }
  }
  for (let m = 1440; m >= 0; m -= 2) {
    const sun = solarPosition(
      system.latitude,
      system.longitude,
      system.utcOffset,
      date,
      m,
    );
    if (sun.altitude > -0.833) {
      sunset = m;
      break;
    }
  }
  return { sunrise, noon, sunset };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
