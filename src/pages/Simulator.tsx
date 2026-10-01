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
  if (!user) return <div className="grid h-screen place-items-center text-muted-foreground">Loading your energy lab…</div>;
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
  const [mobileTab, setMobileTab] = useState<"system" | "loads" | "results">("results");
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
    <div className="sun-grid pointer-events-none absolute inset-x-0 top-0 h-72" />
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-md"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"><WorkspaceNav /><div className="flex items-center gap-2"><span className="hidden max-w-32 truncate text-xs text-muted-foreground xl:block">{user?.name || user?.email}</span><Dialog open={savedOpen} onOpenChange={setSavedOpen}><DialogTrigger asChild><Button variant="outline" size="sm">Saved scenarios <span className="numeric text-muted-foreground">{saved?.length ?? "…"}</span></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Your saved systems</DialogTitle><DialogDescription>Every save is a new snapshot: equipment, schedules, cuts, solar assumptions and any linked roof. Baselines are local to this session.</DialogDescription></DialogHeader><div className="max-h-[60vh] space-y-2 overflow-auto">{saved === undefined ? <div className="space-y-2 p-1" aria-label="Loading saved scenarios"><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /></div> : saved.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No saved scenarios yet.</p> : saved.map((scenario) => <div key={scenario._id} className="flex items-center gap-2 rounded-xl border border-border p-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => loadScenario(scenario)}><span className="block truncate text-sm font-medium">{scenario.name}</span><span className="text-[10px] text-muted-foreground">{new Date(scenario.createdAt).toLocaleDateString("en-IN")} · {scenario.plannerProject ? "linked roof + usage" : "independent system"}</span></button><Button variant="ghost" size="icon" aria-label={`Delete ${scenario.name}`} onClick={async () => { try { await remove({ id: scenario._id }); } catch { toast.error("Could not delete scenario."); } }}><Trash2 className="size-4" /></Button></div>)}</div></DialogContent></Dialog><Button size="sm" disabled={saving} onClick={saveScenario}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}<span className="hidden sm:inline">Save scenario</span></Button><Button size="icon" variant="ghost" aria-label="Sign out" onClick={async () => { await signOut(); navigate("/"); }}><LogOut className="size-4" /></Button></div></div></header>
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-primary">India · 230 V · 50 Hz · IST</p><h1 className="display mt-2 text-3xl font-semibold sm:text-[2.6rem] sm:leading-[1.02]">What can your solar actually run?</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Your panels. Your battery. Your daily life. Test the overlap—not just the daily total.</p></div><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => { setProject({ config: defaultSimulation() }); setSelectedMinute(720); toast.success("Reset to the example system."); }}>Reset example</Button><Button variant="outline" onClick={() => { setBaseline(structuredClone(project)); setMobileTab("results"); toast.success("Baseline captured — compare below the results."); }}><GitCompareArrows className="size-4" />Keep as baseline</Button></div></div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"><label className="flex min-w-0 flex-1 items-center gap-3"><span className="hidden text-[10px] tracking-wider text-muted-foreground uppercase sm:inline">SCENARIO</span><input aria-label="Scenario name" maxLength={100} value={config.name} onChange={(e) => change({ ...config, name: e.target.value || "Untitled scenario" })} className="min-w-0 w-full max-w-md rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium outline-none focus-visible:border-primary" /></label><span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Check className={`size-3 ${recoveryUnavailable ? "text-destructive" : "text-emerald-600"}`} />{recoveryUnavailable ? "Local recovery unavailable" : "Local draft enabled"}</span>{project.plannerProject && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={restoreRoof}>Linked roof <ArrowRight className="size-3" /></Button>}</div>
      {project.plannerProject && <p className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">Linked roof snapshot retained. Array count, watts, orientation and location were transferred; roof/vent shading and planner climate presets are not applied to this independent simulation.</p>}
      <nav aria-label="Simulator sections" className="mb-5 flex gap-1 overflow-x-auto rounded-full border border-border/70 bg-card/70 p-1.5 backdrop-blur xl:hidden">{([["system", "01", "System"], ["loads", "02", "Daily life"], ["results", "03", "Results"]] as const).map(([id, number, label]) => <button key={id} type="button" aria-current={mobileTab === id ? "page" : undefined} onClick={() => setMobileTab(id)} className={`relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${mobileTab === id ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{mobileTab === id && <motion.span layoutId="simtab-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-full bg-secondary shadow-sm" />}<span className="numeric relative z-10 text-[10px] opacity-50">{number}</span><span className="relative z-10">{label}</span></button>)}</nav>
      <div className="grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className={`rise min-w-0 space-y-4 ${mobileTab === "results" ? "hidden xl:block" : ""}`}><div className={mobileTab === "system" ? "" : "hidden xl:block"}><p className="eyebrow mb-4 hidden text-muted-foreground xl:block">01 · Build the setup</p><Equipment config={config} onChange={change} /></div><div className={mobileTab === "loads" ? "" : "hidden xl:block"}><p className="eyebrow mb-4 hidden text-muted-foreground xl:block">02 · Describe daily life</p><Schedule loads={config.loads} onChange={(loads) => change({ ...config, loads })} /></div></div>
        <div className={`rise rise-1 min-w-0 space-y-5 ${mobileTab === "results" ? "" : "hidden xl:block"}`}><p className="eyebrow hidden text-muted-foreground xl:block">03 · Read the answer</p><Results config={config} result={result} selectedMinute={Math.min(selectedMinute, config.days * 1440 - 5)} onSelect={setSelectedMinute} advice={advice} onApply={(next) => { change(next); toast.success("Applied tested midday schedule."); }} />
          <section aria-label="Scenario comparison" className="panel-surface p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-primary">Scenario lab</p><h2 className="display mt-1 text-xl font-semibold">Change the system. Keep the reference.</h2></div><Button variant="outline" size="sm" onClick={() => { setBaseline(structuredClone(project)); toast.success("Baseline captured."); }}><GitCompareArrows className="size-4" />{baseline ? "Re-capture baseline" : "Keep as baseline"}</Button></div>{!baseline || !baselineResult ? <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs leading-relaxed text-muted-foreground">Keep your current setup as a baseline, then change equipment or schedules — the delta appears here without overwriting anything.</p> : <><div className="mt-5 grid gap-4 md:grid-cols-2">{[["BASELINE", baseline.config.name, baselineResult], ["CURRENT", config.name, result]].map(([label, name, r]) => { const data = r as typeof result; return <div key={label as string} className="rounded-xl border border-border p-4"><p className="eyebrow !text-[9px] text-primary">{label as string}</p><h3 className="mt-1 text-sm font-semibold">{name as string}</h3><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Unserved AC" value={data.unmetKwh.toFixed(2)} unit="kWh" hint="Lower is better" alert={data.unmetKwh > 0.01} /><Metric label="Grid imports" value={data.gridKwh.toFixed(2)} unit="kWh" hint="Variable energy only" /><Metric label="Battery end" value={(label === "BASELINE" ? baseline.config.grid.mode : config.grid.mode) === "grid-tied" ? "—" : data.finalSoc.toFixed(0)} unit="%" hint={(label === "BASELINE" ? baseline.config.grid.mode : config.grid.mode) === "grid-tied" ? "Not used in on-grid mode" : "For the configured bank"} /><Metric label="Solar DC" value={data.solarKwh.toFixed(2)} unit="kWh" hint="Captured after controller" /></div></div>; })}</div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Current minus baseline: {(result.unmetKwh - baselineResult.unmetKwh).toFixed(2)} kWh unserved · {(result.gridKwh - baselineResult.gridKwh).toFixed(2)} kWh imported. {!sameContext ? "Location, weather assumptions, mode, cuts or period differ: this is not a like-for-like equipment comparison." : "Same location, weather assumptions, mode, cuts and simulation period."}</p><Button variant="outline" className="mt-4" onClick={() => { setProject(structuredClone(baseline)); toast.success("Restored baseline without deleting it."); }}>Restore baseline</Button></>}</section>
        </div>
      </div>
      <button type="button" onClick={() => { setMobileTab("results"); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }} className={`fixed inset-x-4 z-40 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md xl:hidden ${result.unmetKwh > 0.01 ? "border-destructive/30 bg-card/95" : "border-emerald-600/30 bg-card/95"}`}><span className="text-xs font-semibold">{result.demandKwh <= 0 ? "Add appliances for a verdict" : result.unmetKwh > 0.01 ? `${result.unmetKwh.toFixed(2)} kWh unserved — see why` : `${(result.demandKwh > 0 ? result.servedKwh / result.demandKwh * 100 : 0).toFixed(0)}% served — all covered`}</span><span className="text-xs font-bold text-primary">Results ↑</span></button>
      <footer className="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-5 pb-20 text-[11px] leading-relaxed text-muted-foreground xl:pb-5"><p className="max-w-3xl">Planning simulation, not electrical sign-off. Solar is estimated from location/date and your constant clearness assumption. The model uses event-aligned steps up to 5 minutes, priority-based whole-load shedding and nominal battery energy. No measured weather, battery ageing, motor-start transients or export credit. Lead-acid rate penalty and timed duty cycles are simplified, editable assumptions.</p><Link to="/dashboard" className="flex items-center gap-1 text-foreground hover:text-primary">Explore the 3D planner <ArrowRight className="size-3" /></Link></footer>
    </div>
  </main>;
}
