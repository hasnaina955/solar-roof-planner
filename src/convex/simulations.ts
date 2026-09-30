import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { simulationSchema } from "../lib/simulator";
import { parseProject } from "../lib/project";
import { projectValidator } from "./project";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) return [];
    return ctx.db.query("simulations").withIndex("by_owner", (q) => q.eq("owner", owner)).order("desc").take(30);
  },
});
export const save = mutation({
  args: { configuration: v.string(), plannerProject: v.optional(projectValidator) },
  handler: async (ctx, args) => {
    const owner = await getAuthUserId(ctx);
    if (owner === null) throw new Error("Sign in to save a scenario.");
    if (args.configuration.length > 100000) throw new Error("Scenario is too large.");
    const configuration = simulationSchema.parse(JSON.parse(args.configuration));
    if (args.plannerProject && !parseProject(args.plannerProject)) throw new Error("Invalid linked roof configuration.");
    return ctx.db.insert("simulations", { owner, name: configuration.name, configuration: JSON.stringify(configuration), plannerProject: args.plannerProject, createdAt: Date.now() });
  },
});
export const remove = mutation({
  args: { id: v.id("simulations") },
  handler: async (ctx, { id }) => {
    const owner = await getAuthUserId(ctx);
    const scenario = await ctx.db.get(id);
    if (owner === null || !scenario || scenario.owner !== owner) throw new Error("Scenario not found.");
    await ctx.db.delete(id);
  },
});
