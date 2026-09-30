import { v } from "convex/values";

/** Optional on legacy designs; new saves always include a complete snapshot. */
export const projectValidator = v.object({
  version: v.literal(1),
  siteId: v.string(), moduleId: v.string(),
  tilt: v.number(), azimuth: v.number(),
  orientation: v.union(v.literal("portrait"), v.literal("landscape")),
  mounting: v.union(v.literal("flush"), v.literal("racked")),
  rackTilt: v.number(), setback: v.number(),
  polygon: v.array(v.object({ x: v.number(), y: v.number() })),
  obstacles: v.array(v.object({
    id: v.string(), x: v.number(), y: v.number(), w: v.number(), h: v.number(),
    height: v.number(), label: v.string(),
  })),
  appliances: v.array(v.object({
    id: v.string(), name: v.string(), watts: v.number(),
    quantity: v.number(), hours: v.number(),
  })),
  panelLimit: v.union(v.number(), v.null()),
  moduleWatts: v.number(), dayOfYear: v.number(), minutes: v.number(),
});
