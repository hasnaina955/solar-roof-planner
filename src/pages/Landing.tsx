import { motion } from "framer-motion";
import {
  ArrowRight,
  BoxSelect,
  Compass,
  LineChart,
  Pencil,
  Ruler,
  Sun,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { layoutPanels, starterRoof } from "@/lib/roof";

/**
 * Hero visual: a blueprint of the same roof the planner opens with, drawn from
 * the real layout solver so the marketing page and the product agree.
 */
function HeroBlueprint() {
  const roof = starterRoof();
  const layout = layoutPanels({
    polygon: roof,
    tilt: 25,
    azimuth: 180,
    latitude: 37.77,
    moduleLength: 1.762,
    moduleWidth: 1.134,
    orientation: "portrait",
    mounting: "flush",
    rackTilt: 0,
    setback: 0.4,
    gap: 0.02,
    obstacles: [],
  });

  const width = 10.2;
  const height = 7.4;
  const scale = 44;
  const ox = 44;
  const oy = 300;
  const toX = (x: number) => ox + x * scale;
  const toY = (y: number) => oy + (height - y) * scale;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-40px_oklch(0_0_0/0.5)]">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium">
          <BoxSelect className="size-3.5 text-primary" />
          Roof plan · south facing · 25°
        </div>
        <span className="numeric text-xs text-muted-foreground">
          {layout.panels.length} modules · {layout.rowPitch.toFixed(2)} m pitch
        </span>
      </div>

      <svg viewBox="0 0 590 330" className="w-full">
        <defs>
          <pattern id="grid" width="31" height="31" patternUnits="userSpaceOnUse">
            <path
              d="M31 0H0V31"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-border"
            />
          </pattern>
          <linearGradient id="panelFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7cd7a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#e0a53c" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        <rect width="590" height="330" fill="url(#grid)" className="text-muted-foreground/40" />

        {/* sun path */}
        <path
          d="M70 190 Q 300 8 540 176"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.5"
          strokeDasharray="5 5"
          opacity="0.6"
        />
        <circle cx="452" cy="56" r="12" fill="#f2b93f" />
        <circle cx="452" cy="56" r="21" fill="#f2b93f" opacity="0.18" />

        {/* roof outline */}
        <polygon
          points={roof
            .map((p) => `${toX(p.x)},${toY(p.y)}`)
            .join(" ")}
          fill="var(--color-muted)"
          fillOpacity="0.65"
          stroke="var(--color-foreground)"
          strokeWidth="1.6"
        />

        {/* modules */}
        {layout.panels.map((panel, index) => (
          <motion.rect
            key={panel.id}
            x={toX(panel.x)}
            y={toY(panel.y + panel.h)}
            width={panel.w * scale - 1.2}
            height={panel.h * scale - 1.2}
            rx="2"
            fill="url(#panelFill)"
            stroke="#b9812a"
            strokeWidth="0.8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.25 + index * 0.022,
              duration: 0.35,
              ease: "easeOut",
            }}
          />
        ))}

        {/* dimension lines */}
        <g className="fill-muted-foreground text-[10px]">
          <line
            x1={toX(0)}
            y1={toY(-0.6)}
            x2={toX(width)}
            y2={toY(-0.6)}
            stroke="currentColor"
            strokeWidth="0.8"
          />
          <line
            x1={toX(0)}
            y1={toY(-0.85)}
            x2={toX(0)}
            y2={toY(-0.35)}
            stroke="currentColor"
            strokeWidth="0.8"
          />
          <line
            x1={toX(width)}
            y1={toY(-0.85)}
            x2={toX(width)}
            y2={toY(-0.35)}
            stroke="currentColor"
            strokeWidth="0.8"
          />
          <text x={toX(width / 2)} y={toY(-0.95)} textAnchor="middle">
            10.20 m
          </text>
          <text x={toX(0) - 8} y={toY(height / 2)} textAnchor="end">
            7.40 m
          </text>
        </g>
      </svg>

      <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
        {[
          ["Modules", `${layout.panels.length}`],
          ["Design day", `${layout.designAltitude.toFixed(1)}°`],
          ["Roof used", `${Math.round(((layout.panels.length * layout.moduleAlongSlope * layout.moduleAlongEaves) / layout.usableArea) * 100)}%`],
        ].map(([label, value]) => (
          <div key={label} className="px-2 py-3">
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            <p className="numeric mt-0.5 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Pencil,
    title: "Trace your actual roof",
    body: "Click along the eave, ridge and valleys on a real 3D roof plane. Close the shape and the layout engine reflows instantly.",
  },
  {
    icon: Ruler,
    title: "It knows how the panels are mounted",
    body: "Flush modules lie in the roof plane and cast nothing, so rows pack tight. Racked modules stand above it, and row pitch comes from the winter-solstice result L · (1 + tan α / tan β).",
  },
  {
    icon: Sun,
    title: "Watch a real day happen",
    body: "Scrub the date and time. Shadows sweep across the array module by module and every panel lights up with its own yield.",
  },
  {
    icon: TrendingUp,
    title: "Numbers you can defend",
    body: "NOAA solar geometry, a Kasten–Young clear-sky model, isotropic transposition and cell-temperature derates — integrated over all 365 days.",
  },
  {
    icon: Compass,
    title: "Twelve cities, honest climate",
    body: "Monthly clearness and temperature normals for each site, so San Francisco does not quietly look like Phoenix.",
  },
  {
    icon: LineChart,
    title: "Compare before you commit",
    body: "Save a layout, tilt the roof, save another. The comparison table ranks them on capacity, yield and specific yield.",
  },
];

const STEPS = [
  {
    title: "Trace the outline",
    body: "Click each corner of the roof on the tilted plane. Press enter or close the shape to commit.",
  },
  {
    title: "Set the real conditions",
    body: "Pick your city, set pitch and compass facing, choose a module, mark any vents.",
  },
  {
    title: "Read the day and the year",
    body: "Sweep the sun through the day, then check annual output, bill offset and shading loss.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-primary">
              <BoxSelect className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Helio</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Rooftop solar planner
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="cursor-pointer">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button size="sm" asChild className="cursor-pointer">
              <Link to="/auth?returnTo=%2Fdashboard">
                Open planner
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-16 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <Sun className="size-3.5 text-primary" />
            Accurate enough to sign off on
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl"
          >
            Your roof, drawn in real sunlight.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground"
          >
            Trace your roof outline on a 3D plane, watch modules lay themselves
            out at a spacing that survives the worst day of winter, then sweep
            the sun across the year. Every number comes out of the same
            geometry a PV engineer would use.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button size="lg" asChild className="h-11 cursor-pointer px-5">
              <Link to="/auth?returnTo=%2Fdashboard">
                Design my roof
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-11 cursor-pointer px-5">
              <Link to="/auth">Sign in</Link>
            </Button>
          </motion.div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-border pt-6">
            {[
              ["365", "days integrated"],
              ["15 min", "time resolution"],
              ["12", "climate sites"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="numeric text-xl font-semibold tracking-tight">
                  {value}
                </dt>
                <dd className="mt-0.5 text-xs text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <HeroBlueprint />
        </motion.div>
      </section>

      {/* Features */}
      <section className="border-y border-border bg-card/40 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Most solar calculators draw a rectangle and hope for the best.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              This one solves the roof you actually have, then shows you why
              the layout is the layout.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: (index % 3) * 0.06 }}
                className="panel-surface p-5 transition-shadow hover:shadow-[0_18px_40px_-28px_oklch(0_0_0/0.35)]"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Three steps, about two minutes.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              No uploads, no satellite wait, no sales call. The planner opens
              on a sample roof so you can see it working before you draw your
              own.
            </p>
            <Button className="mt-8 cursor-pointer" asChild>
              <Link to="/auth?returnTo=%2Fdashboard">
                Start planning
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>

          <ol className="space-y-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-xl border border-border bg-card/60 p-5"
              >
                <span className="numeric grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Method */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What &ldquo;accurate&rdquo; means here
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Solar position",
                body: "NOAA fractional-year equations for declination and the equation of time, giving altitude and azimuth for any minute of any day.",
              },
              {
                title: "Irradiance",
                body: "Kasten–Young air mass with Hottel beam attenuation for direct normal, a diffuse component that survives cloud cover, and ground-reflected light on the tilt.",
              },
              {
                title: "Array behaviour",
                body: "Mounting-aware row spacing, module-level shadow polygons clipped against obstructions, cell-temperature derate and inverter clipping at a realistic DC/AC ratio.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Estimates are modelled from typical monthly climate normals, not a
            live satellite feed, so treat them as a very good guide rather than
            a guarantee. A site survey still rules.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="panel-surface flex flex-col items-start gap-6 p-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              See what your roof can actually do.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Open the planner on a sample roof, then trace your own. It takes
              about as long as making a coffee.
            </p>
          </div>
          <Button size="lg" asChild className="h-11 shrink-0 cursor-pointer px-5">
            <Link to="/auth?returnTo=%2Fdashboard">
              Open the planner
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>Helio · a rooftop solar planner for homeowners.</p>
          <p>Estimates are modelled, not surveyed.</p>
        </div>
      </footer>
    </div>
  );
}
