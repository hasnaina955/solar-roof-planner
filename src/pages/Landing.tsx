import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, BatteryCharging, BoxSelect, Check, Clock3, Fan, Lightbulb, PanelTop, PlugZap, Sun, Tv, Zap } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Brandmark } from "@/components/WorkspaceNav";
import { defaultSimulation, simulate } from "@/lib/simulator";

const example = defaultSimulation();
const run = simulate({ ...example, days: 1 });
const heroPoints = run.steps.filter((_, index) => index % 12 === 0);
const powerPath = heroPoints.map((s, index) => `${index === 0 ? "M" : "L"}${24 + s.minute / 1440 * 480},${170 - s.solarW / 440 * 140}`).join(" ");
const demandPath = heroPoints.map((s, index) => `${index === 0 ? "M" : "L"}${24 + s.minute / 1440 * 480},${170 - s.demandW / 440 * 140}`).join(" ");

function EnergyPreview() {
  return (
    <div className="ink-panel relative overflow-hidden rounded-[1.75rem] p-5 sm:p-7">
      <div className="sun-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-medium text-[#ffe9c4]">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-300" />
          </span>
          A small system. A real question.
        </span>
        <span className="numeric rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] tracking-[0.14em] text-[#ffe9c4]">NEW DELHI · IST</span>
      </div>
      <div className="relative mt-6 grid grid-cols-3 divide-x divide-white/10">
        {[[PanelTop, "2 × 220 W", "Solar panels"], [BatteryCharging, "12 V · 150 Ah", "Tubular battery"], [PlugZap, "900 VA", "Solar inverter"]].map(([Icon, value, label]) => {
          const Component = Icon as typeof Sun;
          return (
            <div key={label as string} className="px-2 text-center">
              <span className="mx-auto grid size-9 place-items-center rounded-xl border border-white/10 bg-white/10 text-amber-200"><Component className="size-4" /></span>
              <p className="numeric mt-3 text-sm font-semibold text-white">{value as string}</p>
              <p className="mt-1 text-[10px] text-white/60">{label as string}</p>
            </div>
          );
        })}
      </div>
      <div className="relative mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="flex justify-between text-[10px] text-white/55"><span>Solar vs household demand</span><span>One modeled day</span></div>
        <svg viewBox="0 0 530 205" className="mt-3 w-full" role="img" aria-label="Example solar rises during daylight while household demand peaks in the evening">
          <defs>
            <linearGradient id="landing-solar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[50, 110, 170].map((y) => <line key={y} x1="24" y1={y} x2="504" y2={y} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 5" />)}
          <path d={`${powerPath} L504,170 L24,170 Z`} fill="url(#landing-solar)" />
          <path d={powerPath} fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
          <path d={demandPath} fill="none" stroke="#9db4c8" strokeWidth="2" strokeDasharray="5 3" />
          {[0, 6, 12, 18, 24].map((h) => <text key={h} x={24 + h / 24 * 480} y="198" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)">{String(h).padStart(2, "0")}:00</text>)}
        </svg>
        <div className="flex gap-4 text-[10px] text-white/60">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-300" />Estimated solar DC</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-slate-400" />Scheduled demand AC</span>
        </div>
      </div>
      <div className="relative mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
        <div className="flex -space-x-1.5">{[Fan, Lightbulb, Tv, Zap].map((Icon, index) => <span key={index} className="grid size-8 place-items-center rounded-full border-2 border-[#241b12] bg-[#3a2d1e] text-amber-100/80"><Icon className="size-3.5" /></span>)}</div>
        <div className="text-right"><p className="text-xs font-medium text-white">Fans, lights, TV & Wi-Fi</p><p className="mt-1 text-[10px] text-white/55">Not all energy is available when you need it.</p></div>
      </div>
      <p className="relative mt-4 text-[10px] leading-relaxed text-white/50">Actual engine output for the example setup, not a weather forecast. Edit every rating, schedule and solar assumption in the simulator.</p>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
          <Brandmark />
          <div className="flex items-center gap-2">
            <Link to="/auth" className="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Sign in</Link>
            <Button asChild size="sm" className="rounded-full"><Link to="/auth?returnTo=%2Fsimulator">Open simulator <ArrowRight className="size-3.5" /></Link></Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="sun-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[110px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card/80 py-1.5 pl-2 pr-3 shadow-sm">
              <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold tracking-[0.1em] text-primary-foreground">INDIA</span>
              <span className="eyebrow !text-[10px] text-foreground/80">230 V · 50 Hz · IST schedules</span>
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="display mt-6 text-[2.9rem] font-semibold leading-[0.98] sm:text-6xl lg:text-[4.6rem]">
              Less guesswork.
              <br />
              More <span className="relative inline-block text-primary">sun-powered<svg viewBox="0 0 220 12" className="absolute -bottom-1 left-0 w-full" preserveAspectRatio="none"><path d="M3 9 C 60 3, 160 3, 217 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.35" /></svg></span>
              <br />
              everyday life.
            </motion.h1>
            <p className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-muted-foreground">Two panels or a whole rooftop. Find out what your solar, battery and inverter can power — together, through the day, and through a power cut.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-[0.95rem]"><Link to="/auth?returnTo=%2Fsimulator">Test my solar system <ArrowRight className="size-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-[0.95rem]"><Link to="/auth?returnTo=%2Fdashboard"><BoxSelect className="size-4" />Plan my roof</Link></Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {["Custom panels & Ah batteries", "IST appliance schedules", "No roof drawing required"].map((text) => (
                <span key={text} className="flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full bg-emerald-600/15 text-emerald-700"><Check className="size-2.5" /></span>{text}</span>
              ))}
            </div>
          </div>
          <motion.div initial={{ opacity: 0, y: 24, rotate: 0.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.12, duration: 0.6 }}>
            <EnergyPreview />
          </motion.div>
        </div>
      </section>

      <div className="border-y border-[#2b2118] bg-[#1d1610] text-[#f5ead6]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-5 py-7 sm:grid-cols-4 sm:px-8">
          {[["V × Ah", "Know your battery's actual energy"], ["W ≠ VA", "Respect your inverter's limits"], ["1–7 days", "Carry charge beyond one sunset"], ["230 V / 50 Hz", "Indian household context"]].map(([value, label]) => (
            <div key={value} className="border-l-2 border-amber-400/40 pl-4">
              <p className="numeric text-lg font-semibold tracking-tight text-amber-200">{value}</p>
              <p className="mt-1 text-[11px] text-white/60">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">Two tools · one better decision</p>
            <h2 className="display mt-3 text-3xl font-semibold sm:text-[2.6rem] sm:leading-[1.05]">Start with the system. Or the roof.</h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">Explore your equipment independently, then connect a spatial plan when you're ready.</p>
        </div>
        <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, ease: "easeOut" }} className="mt-10 grid gap-5 md:grid-cols-2">
          <Link to="/auth?returnTo=%2Fsimulator" className="group panel-surface relative overflow-hidden p-7 transition-all hover:-translate-y-0.5 sm:p-9">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-primary to-primary/20" />
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_22px_-10px_oklch(0.585_0.16_44/0.8)]"><BatteryCharging className="size-6" /></span>
              <span className="eyebrow text-muted-foreground">01 / Usage simulator</span>
            </div>
            <h3 className="display mt-7 text-[1.7rem] font-semibold">Can it run your everyday?</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Enter panel count and watts, battery chemistry and Ah, series/parallel connections, and inverter VA. Schedule appliances and inspect charge, grid dependence and unmet loads.</p>
            <span className="mt-6 inline-flex items-center gap-2 text-xs font-bold tracking-wide">SIMULATE YOUR SYSTEM <span className="grid size-7 place-items-center rounded-full bg-foreground text-background transition-transform group-hover:translate-x-1"><ArrowRight className="size-3.5" /></span></span>
          </Link>
          <Link to="/auth?returnTo=%2Fdashboard" className="group panel-surface relative overflow-hidden p-7 transition-all hover:-translate-y-0.5 sm:p-9">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-500 via-slate-700 to-transparent" />
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><BoxSelect className="size-6" /></span>
              <span className="eyebrow text-muted-foreground">02 / 3D roof planner</span>
            </div>
            <h3 className="display mt-7 text-[1.7rem] font-semibold">Where will your panels fit?</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Trace a roof, explore mounting and orientation, and inspect sampled shadows. Send an Indian-site array into the usage simulator while keeping its roof snapshot.</p>
            <span className="mt-6 inline-flex items-center gap-2 text-xs font-bold tracking-wide">EXPLORE THE PLANNER <span className="grid size-7 place-items-center rounded-full border border-border transition-transform group-hover:translate-x-1"><ArrowUpRight className="size-3.5" /></span></span>
          </Link>
        </motion.div>
      </section>

      <section className="border-y border-border/70 bg-card/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="eyebrow text-primary">Not just a daily total</p>
            <h2 className="display mt-3 text-3xl font-semibold leading-[1.05] sm:text-4xl">Enough energy is not the same as enough power.</h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">A pump starting at dinner can change everything. A 150 Ah battery means something different at 12 V and 24 V. Helio makes those assumptions visible.</p>
            <Button asChild variant="outline" className="mt-6 rounded-full"><Link to="/auth?returnTo=%2Fsimulator">Try the example system <ArrowRight className="size-4" /></Link></Button>
          </div>
          <div className="space-y-4">
            {[[PanelTop, "Configure the equipment you actually own", "Use custom nameplate ratings. See nominal bank energy, usable reserve and the separate limits of solar input, battery current and inverter output."], [Clock3, "Put appliances on the same clock", "Fans, lights, a TV, fridge or pump share a daily schedule. Power cuts, overlaps and midnight-crossing runs are modeled in IST."], [Zap, "Compare a change — not a sales promise", "Keep a baseline. Test another battery or inverter, or apply a schedule move backed by an alternate simulated run."]].map(([Icon, title, body], index) => {
              const Component = Icon as typeof Sun;
              return (
                <motion.div key={title as string} initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: index * 0.08 }} className="panel-surface flex gap-4 p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><Component className="size-4" /></span>
                  <div><p className="numeric text-[10px] text-muted-foreground">0{index + 1}</p><h3 className="mt-1 text-[0.95rem] font-semibold">{title as string}</h3><p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">{body as string}</p></div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55 }} className="ink-panel relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
          <div className="sun-grid pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative max-w-2xl">
            <p className="eyebrow text-amber-300">A small system is a good place to start</p>
            <h2 className="display mt-3 text-3xl font-semibold text-white sm:text-[2.75rem] sm:leading-[1.02]">Try two 220 W panels and a 150 Ah battery.</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">The simulator opens with a 12 V tubular battery, a 900 VA inverter, BLDC fan, LED lights, TV and router. Change every detail to match your home.</p>
            <Button asChild size="lg" className="mt-7 rounded-full"><Link to="/auth?returnTo=%2Fsimulator">Open the example <ArrowRight className="size-4" /></Link></Button>
          </div>
        </motion.div>
        <p className="mt-6 max-w-4xl text-xs leading-relaxed text-muted-foreground">Transparent planning estimates, not certified electrical engineering. Solar curves use editable illustrative assumptions — not measured local weather or a forecast. Lead-acid rate effects and appliance duty cycles use simplified assumptions; battery ageing and real motor-start transients are not modeled. Always confirm equipment, wiring, protection and installation with a qualified professional.</p>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-muted-foreground sm:px-8">
          <span className="flex items-center gap-2 font-semibold text-foreground"><span className="grid size-6 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Sun className="size-3.5" /></span>helio <span className="font-normal text-muted-foreground">/ energy lab</span></span>
          <span>Plan with the sun. Verify on site.</span>
          <Link to="/auth?returnTo=%2Fsimulator" className="font-semibold text-foreground hover:text-primary">Open your workspace →</Link>
        </div>
      </footer>
    </div>
  );
}
