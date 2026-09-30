# Helio — rooftop solar planning estimates

A 3D planner for homeowners exploring panel layouts before speaking to an
installer. The next product milestone is a first-class multi-appliance Usage
Simulator; the current usage tool is an **energy estimator**, not that simulator.

## Current capabilities

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
particular time. There is no battery dispatch, scheduling, surge, tariff or
self-consumption model yet.

## Stack and architecture

Bun, Vite, React 19, TypeScript, Tailwind 4, shadcn/ui, Framer Motion, Recharts,
imperative three.js, Convex and Convex Auth. Existing providers and protected
routes are retained: `/` → `/auth` → `/dashboard`.

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
bun test scripts/trust.test.ts
bun scripts/verify-shading.ts
bun scripts/verify-lighting.ts
bun scripts/calibration.ts
```

Tests include independent flat/sloped row-spacing references, module normal
consistency, hemisphere season, sampled ray intersections, history transitions,
project serialization and source-AST dependency guards. **They are not browser
interaction, visual, deployment ownership, or measured-yield validation tests.**

## Documentation

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
