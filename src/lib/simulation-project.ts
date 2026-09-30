import { defaultSimulation, simulationSchema, type SimulationConfig } from "./simulator";
import { parseProject, type PlannerProject } from "./project";
import { SITE_PRESETS } from "./roof";

export interface SimulationProject { config: SimulationConfig; plannerProject?: PlannerProject }
export function parseSimulationProject(value: unknown): SimulationProject | null {
  if (!value || typeof value !== "object" || !("config" in value)) return null;
  const parsed = simulationSchema.safeParse(value.config);
  if (!parsed.success) return null;
  const planner = "plannerProject" in value && value.plannerProject ? parseProject(value.plannerProject) : undefined;
  if (planner === null) return null;
  return { config: parsed.data, ...(planner ? { plannerProject: planner } : {}) };
}
export function simulationDraftKey(owner: string) { return `helio:simulation:v1:${owner}`; }
export function readSimulationDraft(storage: Pick<Storage, "getItem">, owner: string): SimulationProject | null {
  try { const json = storage.getItem(simulationDraftKey(owner)); return json ? parseSimulationProject(JSON.parse(json)) : null; }
  catch { return null; }
}
export function writeSimulationDraft(storage: Pick<Storage, "setItem">, owner: string, project: SimulationProject): boolean {
  try { storage.setItem(simulationDraftKey(owner), JSON.stringify(project)); return true; } catch { return false; }
}
export function plannerToSimulation(project: PlannerProject, count: number, moduleTilt: number, existing?: SimulationProject | null): SimulationProject {
  const site = SITE_PRESETS.find((s) => s.id === project.siteId);
  if (!site || site.utcOffset !== 5.5) throw new Error("Select an Indian location in the planner before sending the array to the India simulator.");
  const config = existing?.config ?? defaultSimulation();
  const next = {
    ...config, location: { name: site.name, latitude: site.latitude, longitude: site.longitude },
    solar: { ...config.solar, count, watts: project.moduleWatts, tilt: moduleTilt, azimuth: project.azimuth },
    startDay: project.dayOfYear,
  };
  return { config: simulationSchema.parse(next), plannerProject: project };
}
