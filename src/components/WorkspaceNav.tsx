import { motion } from "framer-motion";
import { BatteryCharging, BoxSelect, Sun } from "lucide-react";
import { Link, NavLink } from "react-router";

export function Brandmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl text-[#fff7e8] shadow-[0_8px_20px_-8px_oklch(0.585_0.16_44/0.7)]"
        style={{ background: "conic-gradient(from 210deg, #e07b2e, #c8501b 40%, #2b2118 78%, #e07b2e)" }}>
        <Sun className="size-5 transition-transform duration-500 group-hover:rotate-45" />
        <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/25" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="display block text-[1.35rem] font-semibold">helio</span>
          <span className="eyebrow mt-1 block text-[9px] text-muted-foreground">energy lab · india</span>
        </span>
      )}
    </Link>
  );
}

export function WorkspaceNav({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!compact && <Brandmark />}
      <nav aria-label="Workspace" className="flex items-center gap-1 rounded-full border border-border/80 bg-card/80 p-1 text-xs font-semibold shadow-[inset_0_1px_0_oklch(1_0_0/60%)]">
      {[{ to: "/simulator", label: "Usage simulator", Icon: BatteryCharging }, { to: "/dashboard", label: "3D planner", Icon: BoxSelect }].map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `relative flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-colors ${isActive ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {({ isActive }) => (<>
            {isActive && <motion.span layoutId="workspace-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-full bg-secondary shadow-[0_6px_16px_-8px_oklch(0.3_0.05_58/0.8)]" />}
            <span className="relative z-10 flex items-center gap-1.5"><Icon className="size-3.5" />{label}</span>
          </>)}
        </NavLink>
      ))}
    </nav>
    </div>
  );
}
