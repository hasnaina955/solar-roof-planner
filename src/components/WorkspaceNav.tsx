import { BatteryCharging, BoxSelect, Sun } from "lucide-react";
import { Link, NavLink } from "react-router";

export function WorkspaceNav({ compact = false }: { compact?: boolean }) {
  return <div className="flex flex-wrap items-center gap-3">
    {!compact && <Link to="/" className="flex items-center gap-2 text-base font-semibold tracking-tight"><span className="grid size-8 place-items-center rounded-xl bg-primary/15 text-primary"><Sun className="size-4" /></span>helio<span className="hidden text-[10px] font-medium tracking-widest text-muted-foreground sm:inline">/ ENERGY LAB</span></Link>}
    <nav aria-label="Workspace" className="flex rounded-xl border border-border bg-muted/60 p-1 text-xs font-medium">
      <NavLink to="/simulator" className={({ isActive }) => `flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><BatteryCharging className="size-3.5" />Usage simulator</NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => `flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors ${isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><BoxSelect className="size-3.5" />3D planner</NavLink>
    </nav>
  </div>;
}
