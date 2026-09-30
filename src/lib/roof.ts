/**
 * Roof geometry, panel layout and module-level shading.
 *
 * The roof is represented as a tilted plane ("roof local frame"):
 *   +X = along the eaves, horizontal
 *   +Y = up the slope, in the plane of the roof
 *   +Z = along the roof normal (upwards)
 *
 * Roof outlines are drawn directly on that plane, so polygon areas in local
 * 2D coordinates are true roof surface areas (no cos(tilt) correction needed),
 * which keeps panel counts and coverage percentages honest.
 */

import { INDIA_SITES, IST_OFFSET } from "./india";
import {
  DEG,
  requiredRowPitch,
  solarPosition,
  winterSolsticeNoonAltitude,
  type Vec3,
} from "./solar";

export interface Point2 {
  x: number;
  y: number;
}

export interface Rect2 {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Obstacle {
  id: string;
  /** Footprint on the roof plane, local coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Height above the roof surface, metres. */
  height: number;
  label: string;
}

export interface Panel {
  id: string;
  /** Lower-left corner in roof local coordinates. */
  x: number;
  y: number;
  /** Along-eaves dimension. */
  w: number;
  /** Along-slope dimension. */
  h: number;
  row: number;
  column: number;
  /** 0 = fully lit, 1 = fully shaded. Filled in by the shading pass. */
  shade: number;
}

export interface RoofFrame {
  /** Unit vector along the eaves (horizontal). */
  eaves: Vec3;
  /** Unit vector up the slope, in the roof plane. */
  upSlope: Vec3;
  /** Unit roof normal. */
  normal: Vec3;
}

export function roofFrame(tiltDeg: number, azimuthDeg: number): RoofFrame {
  const tilt = tiltDeg * DEG;
  const az = azimuthDeg * DEG;
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  const sa = Math.sin(az);
  const ca = Math.cos(az);

  return {
    // Along the eaves, horizontal and orthogonal to the facing direction.
    eaves: { x: ca, y: 0, z: sa },
    // Up the slope: horizontal component back towards the ridge, vertical
    // component sin(tilt).
    upSlope: { x: -sa * ct, y: st, z: ca * ct },
    // u x e, i.e. vertical component cos(tilt) and a horizontal component of
    // sin(tilt) towards the eaves. This is the true surface normal, so the dot
    // product with a sun vector is the cosine of the angle of incidence.
    normal: { x: sa * st, y: ct, z: -ca * st },
  };
}

/** Express a world direction in roof local coordinates. */
export function toLocalDirection(dir: Vec3, frame: RoofFrame): Vec3 {
  return {
    x: dir.x * frame.eaves.x + dir.y * frame.eaves.y + dir.z * frame.eaves.z,
    y: dir.x * frame.upSlope.x + dir.y * frame.upSlope.y + dir.z * frame.upSlope.z,
    z: dir.x * frame.normal.x + dir.y * frame.normal.y + dir.z * frame.normal.z,
  };
}

/* ------------------------------------------------------------------ *
 * 2D polygon helpers
 * ------------------------------------------------------------------ */

export function polygonArea(points: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function polygonCentroid(points: Point2[]): Point2 {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-9) {
    const n = points.length || 1;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonBounds(points: Point2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Translate a polygon so its bounding box starts at the origin. */
export function normalisePolygon(points: Point2[]): Point2[] {
  const { minX, minY } = polygonBounds(points);
  return points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/** Drop points closer together than `tolerance`. */
export function dedupePolygon(points: Point2[], tolerance = 0.15): Point2[] {
  const out: Point2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= tolerance) {
      out.push(p);
    }
  }
  if (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < tolerance) out.pop();
  }
  return out;
}

/** Shortest horizontal span of the polygon at height y. */
export function sliceSpan(polygon: Point2[], y: number): [number, number] | null {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y > hi) continue;
    const t = (y - a.y) / (b.y - a.y);
    const x = a.x + t * (b.x - a.x);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, maxX];
}

export function convexHull(points: Point2[]): Point2[] {
  if (points.length < 4) return points;
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x,
  );
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Sutherland-Hodgman clip of a convex polygon against an axis-aligned rect. */
export function clipPolygonToRect(
  polygon: Point2[],
  rect: Rect2,
): Point2[] {
  const planes: ((p: Point2) => number)[] = [
    (p) => p.x - rect.x,
    (p) => rect.x + rect.w - p.x,
    (p) => p.y - rect.y,
    (p) => rect.y + rect.h - p.y,
  ];

  let output = polygon;
  for (const plane of planes) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const dc = plane(current);
      const dp = plane(previous);
      if (dc <= 0) {
        if (dp < 0) {
          const t = dp / (dp - dc);
          output.push({
            x: previous.x + t * (current.x - previous.x),
            y: previous.y + t * (current.y - previous.y),
          });
        }
        output.push(current);
      } else if (dp <= 0) {
        const t = dp / (dp - dc);
        output.push({
          x: previous.x + t * (current.x - previous.x),
          y: previous.y + t * (current.y - previous.y),
        });
      }
    }
  }
  return output;
}

export function polygonAreaAbs(polygon: Point2[]): number {
  return polygon.length < 3 ? 0 : Math.abs(polygonArea(polygon));
}

function rectsOverlap(a: Rect2, b: Rect2): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/* ------------------------------------------------------------------ *
 * Panel layout
 * ------------------------------------------------------------------ */

export interface LayoutParams {
  polygon: Point2[];
  /** Roof tilt, degrees. */
  tilt: number;
  /** Roof facing azimuth, degrees clockwise from north. */
  azimuth: number;
  /** Site latitude used for the winter design day. */
  latitude: number;
  /** Along-slope module dimension, metres. */
  moduleLength: number;
  /** Along-eaves module dimension, metres. */
  moduleWidth: number;
  /** Portrait puts the long edge up the slope. */
  orientation: "portrait" | "landscape";
  /**
   * `flush` lays modules directly on the roof surface, which is what a pitched
   * roof gets. `racked` stands them up on rails, which is what low-slope and
   * flat roofs get — and only then does row-to-row shading exist.
   */
  mounting: Mounting;
  /** Tilt of the rack above the roof plane, degrees. */
  rackTilt: number;
  /** Edge setback, metres. */
  setback: number;
  /** Gap between modules along the eaves, metres. */
  gap: number;
  obstacles: Obstacle[];
}

export type Mounting = "flush" | "racked";

export interface LayoutResult {
  panels: Panel[];
  /** Distance between the bottom of each row, along the slope. */
  rowPitch: number;
  /** Solar altitude that sets the row pitch, degrees. */
  designAltitude: number;
  /** Module dimensions actually used. */
  moduleAlongSlope: number;
  moduleAlongEaves: number;
  /** Surface tilt of the modules themselves, degrees. */
  moduleTilt: number;
  /** Height of a module's top edge above the roof plane, metres. */
  moduleHeight: number;
  /** Whether modules can shade the row in front of them. */
  rowsCanShade: boolean;
  /** Roof surface area, m2. */
  usableArea: number;
}

/** Gap left between the top of one flush row and the next, metres. */
const FLUSH_ROW_GAP = 0.04;

/**
 * Row pitch for the chosen mounting.
 *
 * Flush modules are coplanar with the roof, so they cannot shade one another
 * and rows are simply stacked with a small access gap. Racked modules stand
 * above the roof. Project the high edge's shadow onto the sloped roof,
 * using the hemisphere's winter-solstice noon as the design condition.
 */
export function designRowPitch(
  moduleAlongSlope: number,
  tilt: number,
  azimuth: number,
  latitude: number,
  mounting: Mounting = "flush",
  rackTilt = 0,
): {
  pitch: number;
  designAltitude: number;
  moduleTilt: number;
  moduleHeight: number;
  rowsCanShade: boolean;
} {
  if (mounting === "flush") {
    return {
      pitch: moduleAlongSlope + FLUSH_ROW_GAP,
      designAltitude: winterSolsticeNoonAltitude(latitude, azimuth),
      moduleTilt: tilt,
      moduleHeight: 0,
      rowsCanShade: false,
    };
  }
  const effectiveRack = Math.max(0, Math.min(rackTilt, 70 - tilt));
  const moduleTilt = tilt + effectiveRack;
  const designAltitude = winterSolsticeNoonAltitude(latitude, azimuth);
  const footprint = moduleAlongSlope * Math.cos(effectiveRack * DEG);
  const pitch = requiredRowPitch(moduleAlongSlope, moduleTilt, designAltitude, tilt);
  return {
    pitch: Math.max(pitch, footprint + 0.05),
    designAltitude,
    moduleTilt,
    moduleHeight: moduleAlongSlope * Math.sin(effectiveRack * DEG),
    rowsCanShade: effectiveRack > 0,
  };
}

function rectFitsPolygon(polygon: Point2[], rect: Rect2, inset: number): boolean {
  const corners: Point2[] = [
    { x: rect.x + inset, y: rect.y + inset },
    { x: rect.x + rect.w - inset, y: rect.y + inset },
    { x: rect.x + rect.w - inset, y: rect.y + rect.h - inset },
    { x: rect.x + inset, y: rect.y + rect.h - inset },
  ];
  if (!pointInPolygon({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, polygon)) {
    return false;
  }
  return corners.every((c) => pointInPolygon(c, polygon));
}

/**
 * Greedy row-by-row packing. Rows are laid out from the eave upward using the
 * shading-derived pitch, and each row is packed along the eaves starting from
 * the polygon edge, so parallelogram and L-shaped roofs stay dense.
 */
export function layoutPanels(params: LayoutParams): LayoutResult {
  const {
    polygon,
    tilt,
    azimuth,
    latitude,
    moduleLength,
    moduleWidth,
    orientation,
    mounting,
    rackTilt,
    setback,
    gap,
    obstacles,
  } = params;

  const moduleAlongSlope =
    orientation === "portrait" ? moduleLength : moduleWidth;
  const moduleAlongEaves =
    orientation === "portrait" ? moduleWidth : moduleLength;

  const { pitch, designAltitude, moduleTilt, moduleHeight, rowsCanShade } =
    designRowPitch(
      moduleAlongSlope,
      tilt,
      azimuth,
      latitude,
      mounting,
      rackTilt,
    );

  const panels: Panel[] = [];
  const bounds = polygonBounds(polygon);
  const step = moduleAlongEaves + gap;
  let rowIndex = 0;

  const footprint = Math.sqrt(Math.max(0, moduleAlongSlope ** 2 - moduleHeight ** 2));
  for (let y = bounds.minY + setback; y + footprint <= bounds.maxY - setback; y += pitch, rowIndex++) {
    const centreY = y + footprint / 2;
    const span = sliceSpan(polygon, centreY);
    if (!span) continue;
    const [spanMin, spanMax] = span;
    const start = spanMin + setback;
    const end = spanMax - setback;

    let columnIndex = 0;
    for (let x = start; x + moduleAlongEaves <= end + 1e-9; x += step, columnIndex++) {
      const rect: Rect2 = {
        x,
        y,
        w: moduleAlongEaves,
        h: footprint,
      };
      if (!rectFitsPolygon(polygon, rect, 0.04)) continue;
      const clashes = obstacles.some(
        (o) =>
          o.height > 0.12 &&
          rectsOverlap(rect, { x: o.x, y: o.y, w: o.w, h: o.h }),
      );
      if (clashes) continue;
      panels.push({
        id: `p${rowIndex}-${columnIndex}`,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        // h is the physical module dimension, not its roof projection.
        h: moduleAlongSlope,
        row: rowIndex,
        column: columnIndex,
        shade: 0,
      });
    }
  }

  return {
    panels,
    rowPitch: pitch,
    designAltitude,
    moduleAlongSlope,
    moduleAlongEaves,
    moduleTilt,
    moduleHeight,
    rowsCanShade,
    usableArea: Math.abs(polygonArea(polygon)),
  };
}

/* ------------------------------------------------------------------ *
 * Instantaneous module-level shading
 * ------------------------------------------------------------------ */

const SAMPLE_COLS = 5;
const SAMPLE_ROWS = 5;

/** Ray/box intersection in roof coordinates; vents use conservative boxes. */
function rayHitsObstacle(p: Vec3, d: Vec3, obstacle: Obstacle): boolean {
  let near = 0;
  let far = Infinity;
  const bounds = [
    [p.x, d.x, obstacle.x, obstacle.x + obstacle.w],
    [p.y, d.y, obstacle.y, obstacle.y + obstacle.h],
    [p.z, d.z, 0, obstacle.height],
  ];
  for (const [origin, direction, min, max] of bounds) {
    if (Math.abs(direction) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const a = (min - origin) / direction;
    const b = (max - origin) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return far > 1e-6;
}

/**
 * Beam shadow fraction sampled at 5×5 points on each actual module surface.
 * Rays toward the sun intersect vent boxes and other tilted module planes.
 * Area sampling is approximate; thin shadows may fall between sample points.
 */
export function computeShading(
  panels: Panel[],
  obstacles: Obstacle[],
  frame: RoofFrame,
  moduleHeight: number,
  rowsCanShade: boolean,
  sunWorld: Vec3,
): number[] {
  const local = toLocalDirection(sunWorld, frame);
  const height = rowsCanShade ? moduleHeight : 0;
  const standoff = 0.05; // Same low-edge height as RoofScene.
  return panels.map((panel, index) => {
    const footprint = Math.sqrt(Math.max(1e-9, panel.h ** 2 - height ** 2));
    const slope = height / footprint;
    // Dot with the MODULE normal, not the roof normal.
    if (local.z - slope * local.y <= 0) return 1;
    let shaded = 0;
    for (let r = 0; r < SAMPLE_ROWS; r++) {
      for (let c = 0; c < SAMPLE_COLS; c++) {
        const v = (r + 0.5) / SAMPLE_ROWS;
        const p = {
          x: panel.x + ((c + 0.5) / SAMPLE_COLS) * panel.w,
          y: panel.y + v * footprint,
          z: standoff + v * height,
        };
        let blocked = obstacles.some((o) => rayHitsObstacle(p, local, o));
        if (!blocked && rowsCanShade) {
          blocked = panels.some((other, otherIndex) => {
            if (index === otherIndex) return false;
            const otherFootprint = Math.sqrt(Math.max(1e-9, other.h ** 2 - height ** 2));
            const otherSlope = height / otherFootprint;
            const denominator = local.z - otherSlope * local.y;
            if (Math.abs(denominator) < 1e-9) return false;
            const t = (standoff + (p.y - other.y) * otherSlope - p.z) / denominator;
            if (t <= 1e-6) return false;
            const x = p.x + t * local.x;
            const y = p.y + t * local.y;
            return x >= other.x && x <= other.x + other.w &&
              y >= other.y && y <= other.y + otherFootprint;
          });
        }
        if (blocked) shaded++;
      }
    }
    return shaded / (SAMPLE_COLS * SAMPLE_ROWS);
  });
}

/* ------------------------------------------------------------------ *
 * Annual shading field
 * ------------------------------------------------------------------ */

/**
 * One representative day per month. Interpolation is an approximation, not
 * an established error bound; annual accuracy needs external reference data.
 */
const MONTH_SAMPLE_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 257, 288, 318, 349];

/** Hourly samples covering the full local day, including early/late sun. */
const HOUR_SAMPLE_FIRST = 0;
const HOUR_SAMPLE_COUNT = 25;
const HOUR_SAMPLE_STEP = 60;

export interface ShadingField {
  /**
   * Fraction of the array in shadow at a day-of-year and local clock time,
   * linearly interpolated between representative months and full-day hours.
   * Rapidly moving or narrow shadows need finer sampling for accuracy.
   */
  at(doy: number, minutes: number): number;
}

export interface ShadingFieldParams {
  panels: Panel[];
  obstacles: Obstacle[];
  frame: RoofFrame;
  /** Height of a module's top edge above the roof plane, metres. */
  moduleHeight: number;
  /** Whether modules can shade the row in front of them. */
  rowsCanShade: boolean;
  /** Site coordinates, needed to place the sun at each sample. */
  latitude: number;
  longitude: number;
  utcOffset: number;
}

const NO_SHADING_FIELD: ShadingField = { at: () => 0 };

/**
 * Pre-compute the shaded fraction of the array across the whole year.
 *
 * The result depends only on the design, so it can be memoised against the
 * geometry and reused for every timestep of the annual integration.
 */
export function buildShadingField(params: ShadingFieldParams): ShadingField {
  const { panels, obstacles, frame, moduleHeight, rowsCanShade } = params;
  if (panels.length === 0) return NO_SHADING_FIELD;

  const grid = new Float32Array(12 * HOUR_SAMPLE_COUNT);

  for (let month = 0; month < 12; month++) {
    const date = new Date(Date.UTC(2023, 0, MONTH_SAMPLE_DOY[month]));
    for (let hour = 0; hour < HOUR_SAMPLE_COUNT; hour++) {
      const minutes = HOUR_SAMPLE_FIRST + hour * HOUR_SAMPLE_STEP;
      const sun = solarPosition(
        params.latitude,
        params.longitude,
        params.utcOffset,
        date,
        minutes,
      );
      if (sun.altitude <= 0) continue;
      const shades = computeShading(
        panels,
        obstacles,
        frame,
        moduleHeight,
        rowsCanShade,
        sun.direction,
      );
      let total = 0;
      for (const value of shades) total += value;
      grid[month * HOUR_SAMPLE_COUNT + hour] = total / shades.length;
    }
  }

  return {
    at(doy: number, minutes: number): number {
      // Which pair of sampled months brackets this day, wrapping the year.
      const day = ((doy % 365) + 365) % 365;
      let lo = 0;
      let hi = 1;
      let monthT = 0;
      for (let i = 0; i < 12; i++) {
        const a = MONTH_SAMPLE_DOY[i];
        const b =
          i === 11 ? MONTH_SAMPLE_DOY[0] + 365 : MONTH_SAMPLE_DOY[i + 1];
        const d = i === 11 && day < a ? day + 365 : day;
        if (d >= a && d < b) {
          lo = i;
          hi = i === 11 ? 0 : i + 1;
          monthT = (d - a) / (b - a);
          break;
        }
      }

      // Hour index, clamped to the sampled window.
      const hourPos = (minutes - HOUR_SAMPLE_FIRST) / HOUR_SAMPLE_STEP;
      const clamped = Math.min(Math.max(hourPos, 0), HOUR_SAMPLE_COUNT - 1);
      const hourLo = Math.floor(clamped);
      const hourHi = Math.min(hourLo + 1, HOUR_SAMPLE_COUNT - 1);
      const hourT = clamped - hourLo;

      const a =
        grid[lo * HOUR_SAMPLE_COUNT + hourLo] * (1 - hourT) +
        grid[lo * HOUR_SAMPLE_COUNT + hourHi] * hourT;
      const b =
        grid[hi * HOUR_SAMPLE_COUNT + hourLo] * (1 - hourT) +
        grid[hi * HOUR_SAMPLE_COUNT + hourHi] * hourT;
      return a * (1 - monthT) + b * monthT;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

export interface SitePreset {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  utcOffset: number;
  /** Monthly clearness index 0..1, Jan → Dec. */
  clearness: number[];
  /** Mean monthly temperature °C, Jan → Dec. */
  temperature: number[];
}

/**
 * Illustrative monthly clearness and temperature presets. These are not a
 * sourced TMY dataset and must not be presented as measured historical climate.
 */
export const SITE_PRESETS: SitePreset[] = [
  {
    id: "sf",
    name: "San Francisco",
    region: "California, USA",
    latitude: 37.77,
    longitude: -122.42,
    utcOffset: -8,
    clearness: [0.52, 0.55, 0.59, 0.62, 0.6, 0.62, 0.64, 0.63, 0.6, 0.56, 0.5, 0.49],
    temperature: [11, 12.5, 13.5, 14.5, 16, 18, 19, 19.5, 18.5, 16, 13, 11],
  },
  {
    id: "denver",
    name: "Denver",
    region: "Colorado, USA",
    latitude: 39.74,
    longitude: -104.99,
    utcOffset: -7,
    clearness: [0.72, 0.7, 0.7, 0.69, 0.66, 0.73, 0.73, 0.7, 0.7, 0.72, 0.66, 0.68],
    temperature: [0.5, 2, 6, 10, 15, 21, 24, 23, 18, 12, 5, -0.5],
  },
  {
    id: "austin",
    name: "Austin",
    region: "Texas, USA",
    latitude: 30.27,
    longitude: -97.74,
    utcOffset: -6,
    clearness: [0.56, 0.6, 0.63, 0.65, 0.63, 0.65, 0.63, 0.63, 0.62, 0.63, 0.58, 0.56],
    temperature: [11, 13, 17, 21, 25, 29, 31, 31, 27, 22, 16, 12],
  },
  {
    id: "phoenix",
    name: "Phoenix",
    region: "Arizona, USA",
    latitude: 33.45,
    longitude: -112.07,
    utcOffset: -7,
    clearness: [0.72, 0.74, 0.78, 0.82, 0.82, 0.83, 0.75, 0.74, 0.76, 0.78, 0.74, 0.71],
    temperature: [12, 14.5, 18, 22.5, 28, 33.5, 35.5, 34.5, 30, 23, 16, 11.5],
  },
  {
    id: "chicago",
    name: "Chicago",
    region: "Illinois, USA",
    latitude: 41.88,
    longitude: -87.63,
    utcOffset: -6,
    clearness: [0.5, 0.55, 0.58, 0.6, 0.61, 0.63, 0.64, 0.63, 0.61, 0.56, 0.47, 0.46],
    temperature: [-2, 0.5, 6.5, 12, 17.5, 23, 25.5, 24.5, 20, 13.5, 6.5, 0.5],
  },
  {
    id: "nyc",
    name: "New York",
    region: "New York, USA",
    latitude: 40.71,
    longitude: -74.01,
    utcOffset: -5,
    clearness: [0.55, 0.59, 0.62, 0.63, 0.63, 0.65, 0.66, 0.65, 0.63, 0.6, 0.54, 0.52],
    temperature: [0.5, 2, 7, 13, 18.5, 24, 26.5, 26, 22, 15.5, 9, 3.5],
  },
  {
    id: "miami",
    name: "Miami",
    region: "Florida, USA",
    latitude: 25.76,
    longitude: -80.19,
    utcOffset: -5,
    clearness: [0.65, 0.67, 0.7, 0.71, 0.66, 0.61, 0.62, 0.62, 0.6, 0.63, 0.64, 0.64],
    temperature: [21, 22, 23.5, 25.5, 27.5, 29, 29.5, 29.5, 28.5, 26.5, 24, 21.5],
  },
  {
    id: "seattle",
    name: "Seattle",
    region: "Washington, USA",
    latitude: 47.61,
    longitude: -122.33,
    utcOffset: -8,
    clearness: [0.4, 0.46, 0.53, 0.58, 0.6, 0.6, 0.66, 0.64, 0.59, 0.48, 0.4, 0.37],
    temperature: [6, 7, 9, 11.5, 15, 18, 20.5, 20.5, 17.5, 13, 8.5, 5.5],
  },
  {
    id: "london",
    name: "London",
    region: "England, UK",
    latitude: 51.51,
    longitude: -0.13,
    utcOffset: 0,
    clearness: [0.36, 0.4, 0.46, 0.5, 0.52, 0.53, 0.54, 0.53, 0.5, 0.42, 0.36, 0.33],
    temperature: [5, 5.5, 8, 10.5, 14, 17, 19, 19, 16, 12.5, 8, 5.5],
  },
  {
    id: "berlin",
    name: "Berlin",
    region: "Germany",
    latitude: 52.52,
    longitude: 13.4,
    utcOffset: 1,
    clearness: [0.35, 0.42, 0.5, 0.55, 0.58, 0.59, 0.6, 0.59, 0.55, 0.45, 0.35, 0.32],
    temperature: [1, 2, 6, 10.5, 15.5, 18.5, 20.5, 20, 16, 11, 5.5, 2],
  },
  {
    id: "madrid",
    name: "Madrid",
    region: "Spain",
    latitude: 40.42,
    longitude: -3.7,
    utcOffset: 1,
    clearness: [0.55, 0.6, 0.66, 0.66, 0.7, 0.76, 0.8, 0.79, 0.72, 0.63, 0.54, 0.52],
    temperature: [6, 8, 11.5, 13.5, 18, 23, 27, 26, 21.5, 16, 10, 7],
  },
  {
    id: "sydney",
    name: "Sydney",
    region: "NSW, Australia",
    latitude: -33.87,
    longitude: 151.21,
    utcOffset: 10,
    clearness: [0.68, 0.63, 0.62, 0.63, 0.6, 0.57, 0.62, 0.64, 0.66, 0.68, 0.67, 0.68],
    temperature: [23, 23, 21.5, 19.5, 17, 15, 13.5, 15, 17, 19.5, 21, 22.5],
  },
  ...INDIA_SITES.map((site) => ({
    ...site, region: "India · IST", utcOffset: IST_OFFSET,
    // Shared illustrative curve, NOT city-specific measured weather.
    clearness: [0.62, 0.68, 0.72, 0.74, 0.72, 0.55, 0.4, 0.42, 0.55, 0.68, 0.65, 0.6],
    temperature: [18, 21, 26, 30, 33, 32, 29, 28, 28, 26, 22, 19],
  })),
];

export interface ModulePreset {
  id: string;
  name: string;
  length: number;
  width: number;
  wattage: number;
  tempCoefficient: number;
}

export const MODULE_PRESETS: ModulePreset[] = [
  {
    id: "standard-400",
    name: "Standard 400 W",
    length: 1.722,
    width: 1.134,
    wattage: 400,
    tempCoefficient: -0.35,
  },
  {
    id: "modern-440",
    name: "Modern 440 W",
    length: 1.762,
    width: 1.134,
    wattage: 440,
    tempCoefficient: -0.29,
  },
  {
    id: "large-500",
    name: "Large 500 W",
    length: 2.278,
    width: 1.134,
    wattage: 500,
    tempCoefficient: -0.3,
  },
  {
    id: "compact-410",
    name: "Compact 410 W",
    length: 1.762,
    width: 1.04,
    wattage: 410,
    tempCoefficient: -0.34,
  },
];

/** A realistic starting roof so the planner is never empty on first load. */
export function starterRoof(): Point2[] {
  return normalisePolygon([
    { x: 0, y: 0 },
    { x: 10.2, y: 0 },
    { x: 10.2, y: 7.4 },
    { x: 6.2, y: 7.4 },
    { x: 6.2, y: 5.2 },
    { x: 3.0, y: 5.2 },
    { x: 3.0, y: 7.4 },
    { x: 0, y: 7.4 },
  ]);
}

export const DEFAULT_OBSTACLES: Obstacle[] = [
  {
    id: "vent",
    x: 7.8,
    y: 2.6,
    w: 0.55,
    h: 0.55,
    height: 0.85,
    label: "Bathroom vent",
  },
];

export function formatDegrees(value: number): string {
  const compass = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round((((value % 360) + 360) % 360) / 22.5) % 16;
  return `${Math.round(value)}° ${compass[index]}`;
}
