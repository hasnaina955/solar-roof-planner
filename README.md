# Helio — India solar usage simulator & 3D planner

Two dedicated tools for homeowners: an India-focused custom-system usage
simulator at `/simulator`, and the existing roof planner at `/dashboard`.
Start with equipment without drawing a roof, or send an Indian-site planned
array into the simulator. Neither tool is certified electrical design.

## Usage simulator

- Custom panels, battery volts/Ah/series/parallel, chemistry/reserve/current limits,
  optional lead-acid rate penalty, inverter VA/watts/surge/DC voltage/efficiency.
- Indian city/custom coordinates, IST schedules, 230 V / 50 Hz context.
- Multiple overlapping appliance schedules and editable timed duty cycles.
- Off-grid, hybrid mains bypass with daily cuts, grid-tied anti-islanding.
- Event-aligned 1–7-day dispatch, battery SOC, unmet-load reasons, grid imports
  and user-entered INR tariff estimates (variable energy charge only).
- Saved complete scenarios, local recovery, baseline comparison and advice
  derived from alternate simulated schedules.

See [docs/SIMULATOR.md](docs/SIMULATOR.md) for equations and operating policy.

## 3D planner capabilities

- Trace a single roof plane; choose location, pitch, facing, modules and mounting.
- Automatically place modules around vents with edge setbacks and winter-noon
  rack spacing. Scrub the sun and inspect sampled module shadows.
- Estimate instantaneous AC power and monthly/annual energy using solar geometry,
  illustrative climate presets, temperature derating and inverter clipping.
- Estimate household consumption from 22 appliance presets.
- Save complete versioned projects in Convex: geometry, racks, equipment, custom
  wattage, maximum/limited array mode, appliances, date and time.
- Recover a local draft after refresh, scoped to the signed-in user.
- Undo/redo design edits, with repeated edits to the same slider coalesced.

“Generation / use” is an annual energy ratio, **not** load served or bill savings.
The inverter limit is an equipment assumption, **not** the power available at any
particular time. The separate simulator supplies scheduled dispatch with explicit assumptions;
planner annual ratios still do not establish load timing or bill savings.

## Stack and architecture

Bun, Vite, React 19, TypeScript, Tailwind 4, shadcn/ui, Framer Motion, Recharts,
imperative three.js, Convex and Convex Auth. Existing providers and protected
routes/providers are retained; `/auth` now falls back to `/simulator` and preserves
explicit planner return paths.

| Module | Responsibility |
| --- | --- |
| `src/lib/solar.ts` | Solar position, irradiance, PV power, annual integration |
| `src/lib/roof.ts` | Roof geometry, layout, sampled ray shadows, presets |
| `src/lib/appliances.ts` | Average daily household energy estimates |
| `src/lib/project.ts` | Validated versioned project and local draft serialization |
| `src/lib/design-history.ts` | Pure action-based undo/redo reducer |
| `src/hooks/use-design-history.ts` | React state adapter |
| `src/pages/Dashboard.tsx` | Planner and memoized derivation chain |
| `src/components/planner/RoofScene.tsx` | Existing three.js renderer |
| `src/convex/designs.ts` | Owner-protected project save/list/delete |

## Development and checks

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup. The hosted platform manages
servers; do not launch another dev server there.

```bash
bun convex dev --once && bun tsc -b --noEmit
bun test scripts/trust.test.ts scripts/simulator.test.ts
bun scripts/verify-shading.ts
bun scripts/verify-lighting.ts
bun scripts/calibration.ts
```

Tests include independent flat/sloped row-spacing references, module normal
consistency, hemisphere season, sampled ray intersections, history transitions,
project serialization and source-AST dependency guards. **They are not browser
interaction, visual, deployment ownership, or measured-yield validation tests.**

## Documentation

- [Simulator](docs/SIMULATOR.md): India equipment inputs, energy dispatch and limits.
- [Architecture](docs/ARCHITECTURE.md): state, persistence, coordinates, rendering.
- [Physics and limits](docs/PHYSICS.md): equations, assumptions, reference tests.
- [Roadmap](docs/ROADMAP.md): trust/recovery work and the two-tool product plan.

## Accuracy and persistence limits

Outputs are planning estimates, not certified engineering or installation
sign-off. Climate values are illustrative monthly presets, not a sourced TMY
dataset or live forecast. Shadows use 5×5 samples and a 12-day × 25-hour annual
field; no error bound has been established. One roof plane only; string mismatch,
weather variability and equipment-specific electrical behavior are not modeled.

Older saved options lack mounting and appliances. Loading one uses explicit
fallbacks and shows a warning; missing historical information cannot be recovered.
Local drafts require browser storage and are not a cross-device backup. New
saved snapshots preserve inputs, but future model/preset changes can change
recomputed estimates; historical summary values are not recalculated on save-list
read.

The client needs `VITE_CONVEX_URL`. Convex Auth uses `JWKS`, `JWT_PRIVATE_KEY`
and `SITE_URL` on the deployment. Manage hosted secrets in the Keys UI; never
commit environment files or hand-edit generated Convex files. Keep existing auth
providers and `RequireAuth` return-path behavior intact.
