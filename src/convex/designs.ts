import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Saved roof designs, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("designs")
      .withIndex("by_owner", (q) => q.eq("owner", userId))
      .order("desc")
      .take(24);
  },
});

const pointValidator = v.object({ x: v.number(), y: v.number() });

const obstacleValidator = v.object({
  id: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  height: v.number(),
  label: v.string(),
});

export const save = mutation({
  args: {
    name: v.string(),
    siteId: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    utcOffset: v.number(),
    tilt: v.number(),
    azimuth: v.number(),
    polygon: v.array(pointValidator),
    obstacles: v.array(obstacleValidator),
    moduleId: v.string(),
    orientation: v.union(v.literal("portrait"), v.literal("landscape")),
    setback: v.number(),
    moduleLength: v.number(),
    moduleWidth: v.number(),
    wattage: v.number(),
    panelCount: v.number(),
    capacityKw: v.number(),
    annualKwh: v.number(),
    specificYield: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in to save designs.");
    return await ctx.db.insert("designs", {
      ...args,
      owner: userId,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("designs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You must be signed in.");
    const design = await ctx.db.get(args.id);
    if (!design || design.owner !== userId) {
      throw new Error("Design not found.");
    }
    await ctx.db.delete(args.id);
  },
});
