import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, GitCompareArrows, Loader2, LogOut, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WorkspaceNav } from "@/components/WorkspaceNav";
import { Equipment } from "@/components/simulator/Equipment";
import { Schedule } from "@/components/simulator/Schedule";
import { Metric, Results } from "@/components/simulator/Results";
import { useAuth } from "@/hooks/use-auth";
import { defaultSimulation, scheduleAdvice, simulate, simulationSchema, type SimulationConfig } from "@/lib/simulator";
import { readSimulationDraft, writeSimulationDraft, type SimulationProject } from "@/lib/simulation-project";
import { writeDraft } from "@/lib/project";

export default function Simulator() {
  const { user } = useAuth();
  if (!user) return <div className="grid h-screen place-items-center text-muted-foreground">Loading… please wait.</div>;
  return <SimulatorWorkspace key={user._id} ownerId={user._id} />;
}
function SimulatorWorkspace({ ownerId }: { ownerId: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<SimulationProject>(() => {
    try { return readSimulationDraft(window.localStorage, ownerId) ?? { config: defaultSimulation() }; }
    catch { return { config: defaultSimulation() }; }
  });
  const config = project.config;
  const change = (next: SimulationConfig) => setProject((previous) => ({ ...previous, config: next }));
  const [mobileTab, setMobileTab] = useState<"system" | "loads" | "results">("system");
  const [selectedMinute, setSelectedMinute] = useState(1140);
  const [baseline, setBaseline] = useState<SimulationProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const latest = useRef(project);
  const warned = useRef(false);
  useEffect(() => {
    latest.current = project;
    const persist = () => {
      let ok = false;
      try { ok = writeSimulationDraft(window.localStorage, ownerId, project); } catch { /* storage unavailable */ }
      if (!ok && !warned.current) { warned.current = true; setRecoveryUnavailable(true); toast.warning("Local recovery is unavailable. Save a cloud scenario to keep your work."); }
    };
    const timer = window.setTimeout(persist, 250);
    window.addEventListener("pagehide", persist);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", persist); };
  }, [project, ownerId]);
  useEffect(() => () => { try { writeSimulationDraft(window.localStorage, ownerId, latest.current); } catch { /* no local storage */ } }, [ownerId]);
  const result = useMemo(() => simulate(config), [config]);
  const advice = useMemo(() => scheduleAdvice(config, result), [config, result]);
  const baselineResult = useMemo(() => baseline ? simulate(baseline.config) : null, [baseline]);
  const saved = useQuery(api.simulations.list, {});
  const sameContext = baseline && JSON.stringify({ location: baseline.config.location, solar: { clearness: baseline.config.solar.clearness, temperature: baseline.config.solar.temperature }, days: baseline.config.days, startDay: baseline.config.startDay, grid: baseline.config.grid }) === JSON.stringify({ location: config.location, solar: { clearness: config.solar.clearness, temperature: config.solar.temperature }, days: config.days, startDay: config.startDay, grid: config.grid });
  const save = useMutation(api.simulations.save);
  const remove = useMutation(api.simulations.remove);
  const saveScenario = async () => {
    try { setSaving(true); await save({ configuration: JSON.stringify(config), ...(project.plannerProject ? { plannerProject: project.plannerProject } : {}) }); toast.success("Complete scenario saved. Your baseline is unchanged."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save scenario."); }
    finally { setSaving(false); }
  };
  const loadScenario = (scenario: Doc<"simulations">) => {
    try {
      const loaded = simulationSchema.parse(JSON.parse(scenario.configuration));
      setProject({ config: loaded, ...(scenario.plannerProject ? { plannerProject: scenario.plannerProject } : {}) });
      setSelectedMinute(1140); setSavedOpen(false); toast.success(`Loaded ${loaded.name}.`);
    } catch { toast.error("This scenario is invalid or uses an unsupported version."); }
  };
  const restoreRoof = () => {
    if (!project.plannerProject) { navigate("/dashboard"); return; }
    try {
      if (!writeDraft(window.localStorage, ownerId, project.plannerProject)) throw new Error("Browser storage unavailable.");
      navigate("/dashboard");
    } catch { toast.error("Could not restore the linked roof. Browser storage is required for this handoff."); }
  };
  return <main className="relative min-h-screen bg-background text-foreground">
    <div className="sun-grid pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70" />
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-md"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6"><WorkspaceNav /><div className="flex items-center gap-2"><span className="hidden max-w-32 truncate text-xs text-muted-foreground xl:block">{user?.name || user?.email}</span><Dialog open={savedOpen} onOpenChange={setSavedOpen}><DialogTrigger asChild><Button variant="outline" size="sm" className="h-9 rounded-xl px-3.5">Saved scenarios <span className="numeric text-muted-foreground">{saved?.length ?? "…"}</span></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Saved scenarios</DialogTitle><DialogDescription>Each save keeps panels, battery, inverter, appliance schedules and outage settings. Reopen any scenario to continue.</DialogDescription></DialogHeader><div className="max-h-[60vh] space-y-2 overflow-auto">{saved === undefined ? <div className="space-y-2 p-1" aria-label="Loading saved scenarios"><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /></div> : saved.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No saved scenarios yet. Configure the system, then save it here.</p> : saved.map((scenario) => <div key={scenario._id} className="flex items-center gap-2 rounded-xl border border-border p-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadScenario(scenario)}><span className="block truncate text-sm font-medium">{scenario.name}</span><span className="text-[10px] text-muted-foreground">{new Date(scenario.createdAt).toLocaleDateString("en-IN")} · {scenario.plannerProject ? "with roof plan" : "system only"}</span></button><Button variant="ghost" size="icon" aria-label={`Delete ${scenario.name}`} onClick={async () => { try { await remove({ id: scenario._id }); } catch { toast.error("Could not delete scenario."); } }}><Trash2 className="size-4" /></Button></div>)}</div></DialogContent></Dialog><Button size="sm" className="h-9 rounded-xl px-3.5" disabled={saving} onClick={saveScenario}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}<span className="hidden sm:inline">Save scenario</span></Button><Button size="icon" variant="ghost" aria-label="Sign out" onClick={async () => { await signOut(); navigate("/"); }}><LogOut className="size-4" /></Button></div></div></header>
    <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="max-w-2xl"><p className="eyebrow text-primary">India · IST · 230 V / 50 Hz</p><h1 className="display mt-1.5 text-[1.45rem] font-semibold tracking-tight sm:text-[1.7rem]">Will your system carry your home?</h1></div><div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={() => { setProject({ config: defaultSimulation() }); setSelectedMinute(720); toast.success("Example system restored."); }}>Reset to example</Button><Button variant="outline" className="h-9 rounded-xl" onClick={() => { setBaseline(structuredClone(project)); setMobileTab("results"); toast.success("Baseline captured. Change the system to compare."); }}><GitCompareArrows className="size-4" />Compare a change</Button></div></div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card px-4 py-2.5 shadow-sm"><label className="flex min-w-0 flex-1 items-center gap-4"><span className="hidden shrink-0 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase sm:inline">Scenario</span><input aria-label="Scenario name" maxLength={100} value={config.name} onChange={(e) => change({ ...config, name: e.target.value || "Untitled scenario" })} className="min-w-0 w-full max-w-md rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-semibold tracking-tight outline-none transition-colors focus-visible:border-primary focus-visible:bg-background" /></label><span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Check className={`size-3 ${recoveryUnavailable ? "text-destructive" : "text-emerald-600"}`} />{recoveryUnavailable ? "Local recovery unavailable" : "Local draft enabled"}</span>{project.plannerProject && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={restoreRoof}>Linked roof <ArrowRight className="size-3" /></Button>}</div>
      {project.plannerProject && <p className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">Linked roof snapshot retained. Array count, watts, orientation and location were transferred; roof/vent shading and planner climate presets are not applied to this independent simulation.</p>}
      <nav aria-label="Simulator sections" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/70 p-1.5 backdrop-blur xl:hidden">{([["system", "01", "System"], ["loads", "02", "Appliances"], ["results", "03", "Results"]] as const).map(([id, number, label]) => <button key={id} type="button" aria-current={mobileTab === id ? "page" : undefined} onClick={() => setMobileTab(id)} className={`relative flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-all duration-200 ${mobileTab === id ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{mobileTab === id && <motion.span layoutId="simtab-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-xl bg-secondary shadow-sm" />}<span className="numeric relative z-10 text-[10px] opacity-50">{number}</span><span className="relative z-10">{label}</span></button>)}</nav>
      <div className="grid items-start gap-5 xl:grid-cols-[560px_minmax(0,1fr)] 2xl:grid-cols-[600px_minmax(0,1fr)]">
        <div className={`rise min-w-0 ${mobileTab === "results" ? "hidden xl:block" : ""}`}>
          <div className="xl:sticky xl:top-[4.5rem] xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:pb-4 simulator-side-scroll">
            <div aria-label="Setup sections" className="mb-4 hidden gap-1 rounded-2xl border border-border/70 bg-card/80 p-1 xl:flex">
              {([["system", "System"], ["loads", "Appliances"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={(mobileTab === id) || (mobileTab === "results" && id === "system")} onClick={() => setMobileTab(id)} className={`relative flex-1 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all duration-200 ${((mobileTab === id) || (mobileTab === "results" && id === "system")) ? "bg-secondary text-secondary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
            </div>
            <div className={mobileTab === "loads" ? "hidden" : ""}><p className="eyebrow mb-4 hidden text-muted-foreground xl:block">01 · System configuration</p><Equipment config={config} onChange={change} /></div>
            <div className={mobileTab === "loads" ? "" : "hidden"}><p className="eyebrow mb-4 hidden text-muted-foreground xl:block">02 · Appliances & schedule</p><Schedule loads={config.loads} onChange={(loads) => change({ ...config, loads })} /></div>
          </div>
        </div>
        <div className={`rise rise-1 min-w-0 space-y-4 ${mobileTab === "results" ? "" : "hidden xl:block"}`}><p className="eyebrow hidden text-muted-foreground xl:block">03 · Results & analysis</p><Results config={config} result={result} selectedMinute={Math.min(selectedMinute, config.days * 1440 - 5)} onSelect={setSelectedMinute} advice={advice} onApply={(next) => { change(next); toast.success("Applied tested midday schedule."); }} />
          <details className="panel-surface group p-5"><summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden"><div><p className="eyebrow text-muted-foreground">Detail · scenario comparison</p><h2 className="mt-1 text-[15px] font-semibold tracking-tight">Compare against a baseline <span className="ml-1 text-xs font-normal text-muted-foreground">(expand)</span></h2></div><Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={() => { setBaseline(structuredClone(project)); toast.success("Baseline captured."); }}><GitCompareArrows className="size-3.5" />{baseline ? "Update baseline" : "Capture baseline"}</Button></summary>{!baseline || !baselineResult ? <p className="mt-5 rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-[13px] leading-relaxed text-muted-foreground">Capture a baseline first. The difference between baseline and current appears here, without overwriting either.</p> : <><div className="mt-6 grid gap-4 md:grid-cols-2">{[["BASELINE", baseline.config.name, baselineResult], ["CURRENT", config.name, result]].map(([label, name, r]) => { const data = r as typeof result; return <div key={label as string} className="rounded-2xl border border-border/80 bg-background/50 p-5"><p className="eyebrow !text-[9px] text-primary">{label as string}</p><h3 className="mt-1.5 text-sm font-semibold tracking-tight">{name as string}</h3><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Unserved energy" value={data.unmetKwh.toFixed(2)} unit="kWh" hint="Lower is better" alert={data.unmetKwh > 0.01} /><Metric label="Grid import" value={data.gridKwh.toFixed(2)} unit="kWh" hint="Energy charge only" /><Metric label="Battery remaining" value={(label === "BASELINE" ? baseline.config.grid.mode : config.grid.mode) === "grid-tied" ? "—" : data.finalSoc.toFixed(0)} unit="%" hint={(label === "BASELINE" ? baseline.config.grid.mode : config.grid.mode) === "grid-tied" ? "No storage in grid-tied" : "End of study period"} /><Metric label="Solar generation" value={data.solarKwh.toFixed(2)} unit="kWh" hint="After controller & losses" /></div></div>; })}</div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Current minus baseline: {(result.unmetKwh - baselineResult.unmetKwh).toFixed(2)} kWh unserved · {(result.gridKwh - baselineResult.gridKwh).toFixed(2)} kWh imported. {!sameContext ? "Location, weather assumptions, mode, cuts or period differ: this is not a like-for-like equipment comparison." : "Same location, weather assumptions, mode, cuts and simulation period."}</p><Button variant="outline" className="mt-4" onClick={() => { setProject(structuredClone(baseline)); toast.success("Restored baseline without deleting it."); }}>Restore baseline</Button></>}</details>
        </div>
      </div>
      <button type="button" onClick={() => { setMobileTab("results"); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }} className={`fixed inset-x-4 z-40 flex items-center justify-between gap-3 rounded-2xl border px-5 py-3.5 shadow-lg backdrop-blur-md transition-all duration-200 xl:hidden ${result.unmetKwh > 0.01 ? "border-destructive/30 bg-card/95" : "border-emerald-600/30 bg-card/95"}`}><span className="text-[13px] font-semibold">{result.demandKwh <= 0 ? "Add appliances to see results" : result.unmetKwh > 0.01 ? `${result.unmetKwh.toFixed(2)} kWh unserved — see breakdown` : `${(result.demandKwh > 0 ? result.servedKwh / result.demandKwh * 100 : 0).toFixed(0)}% of demand covered`}</span><span className="text-[13px] font-bold text-primary">Results ↑</span></button>
      <footer className="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-5 pb-20 text-[11px] leading-relaxed text-muted-foreground xl:pb-5"><p className="max-w-3xl">Planning simulation, not electrical sign-off. Solar is estimated from location/date and your constant clearness assumption. The model uses event-aligned steps up to 5 minutes, priority-based whole-load shedding and nominal battery energy. No measured weather, battery ageing, motor-start transients or export credit. Lead-acid rate penalty and timed duty cycles are simplified, editable assumptions.</p><Link to="/dashboard" className="flex items-center gap-1 text-foreground hover:text-primary">Explore the 3D planner <ArrowRight className="size-3" /></Link></footer>
    </div>
  </main>;
}
