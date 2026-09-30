import { z } from "zod";
import { defaultAppliances } from "./appliances";
import { DEFAULT_OBSTACLES, MODULE_PRESETS, SITE_PRESETS, starterRoof } from "./roof";

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
export const projectSchema = z.object({
  version: z.literal(1),
  siteId: z.string().refine((id) => SITE_PRESETS.some((site) => site.id === id)),
  moduleId: z.string().refine((id) => MODULE_PRESETS.some((module) => module.id === id)),
  tilt: z.number().min(0).max(55),
  azimuth: z.number().min(0).max(360),
  orientation: z.enum(["portrait", "landscape"]),
  mounting: z.enum(["flush", "racked"]),
  rackTilt: z.number().min(0).max(35),
  setback: z.number().min(0).max(1.5),
  polygon: z.array(point).min(3).max(500),
  obstacles: z.array(z.object({
    id: z.string(), x: z.number().finite(), y: z.number().finite(),
    w: z.number().positive(), h: z.number().positive(),
    height: z.number().min(0), label: z.string(),
  })).max(500),
  appliances: z.array(z.object({
    id: z.string(), name: z.string(), watts: z.number().min(1).max(20000),
    quantity: z.number().int().min(1).max(99), hours: z.number().min(0).max(24),
  })).max(500),
  panelLimit: z.number().int().min(0).nullable(),
  moduleWatts: z.number().positive().max(2000),
  dayOfYear: z.number().int().min(1).max(365),
  minutes: z.number().min(0).max(1440),
});
export type PlannerProject = z.infer<typeof projectSchema>;
export type PlannerDesign = Omit<PlannerProject, "version" | "dayOfYear" | "minutes">;

export function defaultProject(): PlannerProject {
  return {
    version: 1, siteId: "sf", moduleId: "modern-440", tilt: 25, azimuth: 180,
    orientation: "portrait", mounting: "flush", rackTilt: 10, setback: 0.4,
    polygon: starterRoof(), obstacles: DEFAULT_OBSTACLES.map((o) => ({ ...o })),
    appliances: defaultAppliances(), panelLimit: null, moduleWatts: 440,
    dayOfYear: 172, minutes: 780,
  };
}

export function parseProject(value: unknown): PlannerProject | null {
  const result = projectSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function designFromProject(project: PlannerProject): PlannerDesign {
  return {
    siteId: project.siteId, moduleId: project.moduleId, tilt: project.tilt,
    azimuth: project.azimuth, orientation: project.orientation, mounting: project.mounting,
    rackTilt: project.rackTilt, setback: project.setback, polygon: project.polygon,
    obstacles: project.obstacles, appliances: project.appliances,
    panelLimit: project.panelLimit, moduleWatts: project.moduleWatts,
  };
}

export function draftKey(ownerId: string): string {
  return `helio:project:v1:${ownerId}`;
}

export function readDraft(storage: Pick<Storage, "getItem">, ownerId: string): PlannerProject | null {
  try {
    const json = storage.getItem(draftKey(ownerId));
    return json ? parseProject(JSON.parse(json)) : null;
  } catch {
    return null; // Corrupt, obsolete, or unavailable browser storage.
  }
}

export function writeDraft(storage: Pick<Storage, "setItem">, ownerId: string, project: PlannerProject): boolean {
  try {
    storage.setItem(draftKey(ownerId), JSON.stringify(project));
    return true;
  } catch {
    return false; // Private mode / quota errors must not crash the planner.
  }
}
