import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { projectValidator } from "./project";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    /** Complete standalone simulator scenarios; optional linked roof snapshot. */
    simulations: defineTable({
      owner: v.id("users"),
      name: v.string(),
      configuration: v.string(),
      plannerProject: v.optional(projectValidator),
      createdAt: v.number(),
    }).index("by_owner", ["owner"]),

    /** Saved roof designs, so homeowners can compare options side by side. */
    designs: defineTable({
      owner: v.id("users"),
      name: v.string(),
      siteId: v.string(),
      latitude: v.number(),
      longitude: v.number(),
      utcOffset: v.number(),
      tilt: v.number(),
      azimuth: v.number(),
      polygon: v.array(v.object({ x: v.number(), y: v.number() })),
      obstacles: v.array(
        v.object({
          id: v.string(),
          x: v.number(),
          y: v.number(),
          w: v.number(),
          h: v.number(),
          height: v.number(),
          label: v.string(),
        }),
      ),
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
      project: v.optional(projectValidator),
      createdAt: v.number(),
    }).index("by_owner", ["owner"]),

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;
