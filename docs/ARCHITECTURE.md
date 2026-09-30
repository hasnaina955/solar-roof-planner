# Architecture

Keep the existing React/Vite provider tree, Convex backend and imperative three.js
renderer. The domain calculations live outside rendering, so they can be tested
without a WebGL context. `RoofScene` also calls the shared irradiance model for
art-directed lighting; it does not own layout or production calculations.

## Dedicated simulator

`/simulator` uses `src/lib/simulator.ts` for validated equipment, event-aligned
multi-day dispatch and scenario advice. `Equipment`, `Schedule` and `Results`
components expose the complete inputs, schedules and outcomes. `simulations`
in Convex saves complete configuration with optional linked roof snapshots;
`simulation-project.ts` handles per-user local recovery and explicit handoff.
See [SIMULATOR.md](SIMULATOR.md) for the dispatch policy and physical limits.
The planner no longer treats a usage modal as the simulator; it links to the
dedicated workspace. Mobile planner inputs reuse the full rail in a bottom sheet.

## State and derivation

```
Dashboard (auth user gate, keyed by user id)
  └─ Planner
       ├─ useDesignHistory → reducer-owned design inputs
       ├─ date/time state → sun, not annual integration dependencies
       ├─ memoized geometry/shading/power
       ├─ Convex query/mutations for saved projects
       └─ RoofScene, control rail, insight rail, usage estimator
```

`src/lib/design-history.ts` is the pure action reducer; its hook is only a React
adapter. All design edits use patches. Module preset selection changes ID and
watts atomically, avoiding an effect that overwrites restored custom watts.
Only repeated changes to the **same scalar** within 600 ms coalesce. First edits
are always undoable, divergent edits clear redo, no-op edits preserve redo, and
loading a project replaces both state and history. Native text editing is not
intercepted by planner undo shortcuts. History retains 100 snapshots.

```
design → roofFrame(roof tilt, azimuth)
       → layoutPanels → moduleTilt, height, pitch, projected footprints
       → installedPanels → custom module watts → SystemSpec
       → module surface { tilt: layout.moduleTilt, azimuth }
       → seasonal shadow field → annualEnergy
clock/date → solarPosition → instantaneous shadows → live AC output
selected date + seasonal field → dailyProfile
```

Annual integration depends on the module surface and seasonal lookup, never on
live `derate`, date, minutes, or playback state. `trust.test.ts` contains source-AST
guards for this wiring; it does not simulate a mounted dashboard.

## Complete project persistence

`src/lib/project.ts` defines a Zod-validated `PlannerProject`, version 1. It contains
all editable model inputs: site/module IDs, roof geometry, obstacles, orientation,
mounting/rack angle, setbacks, maximum/null or explicit panel limit, custom watts,
appliances and selected date/time. Camera, heatmap visibility, draft tracing and
playback are ephemeral display state and are intentionally excluded.

`src/convex/project.ts` provides the shared Convex structural validator. New saves
require the complete snapshot and are also checked against the domain validator.
The `designs` table keeps the project optional to allow existing legacy documents;
owner checks remain enforced on list/save/delete. Existing top-level geometry and
summary fields remain for comparison and backward compatibility.

Loading a new project replaces its configuration exactly. Old saves restore the
information actually stored, use an explicit panel-count limit, and warn about
missing mounting/appliances. They cannot recover information never persisted.
Summary outputs reflect the model at save time; future model or preset changes
can change recomputed results. IDs reference current immutable-in-code presets,
not a separately versioned climate/equipment dataset.

Local recovery uses `helio:project:v1:<user-id>`. A keyed planner is initialized
from that user's validated local draft, preventing state crossover on account
switch. Changes are written after a 300 ms debounce, on pagehide, and on unmount;
playback is not resumed. Corrupt/unknown versions fall back safely, storage quota
errors do not crash the app, and unavailable storage prompts a cloud-save warning.
Local storage is readable by this origin, not a secret store or cross-device backup.

## Coordinate conventions

World (right-handed): +X east, +Y up, +Z south. North is −Z; azimuth clockwise
from north.

Roof basis (left-handed): +X eaves, +Y upslope, +Z roof normal. Use this basis for
point transforms, never `setFromRotationMatrix()` to extract a quaternion.
Polygon dimensions/areas are roof-surface coordinates. Racked panel `h` remains
physical length while packing uses `h cos(effective rack angle)`.

Panels pivot on the low edge, 0.05 m above the roof. Effective rack tilt is capped
so module surface tilt is at most 70°. Renderer, row pitch, sampled ray shadows
and energy use the same effective tilt. Row pitch comes from a roof-coordinate
shadow projection; see [PHYSICS.md](PHYSICS.md).

The renderer uses an additional house/scene centering offset. Dividing the
upslope horizontal direction by `cos(tilt)` gives a unit horizontal direction;
it is **not** the horizontal projection of a roof-plane distance. That offset
and framing still warrant visual review.

## Scene lifecycle

`RoofScene` owns the WebGL renderer, controls and requestAnimationFrame loop.
Geometry is rebuilt/disposed on design changes; instance colors update separately.
Shared procedural textures are created at bootstrap and flagged
`userData.shared`, so geometry rebuilds skip their disposal. A sky/ground PMREM
probe supplies a static environment map.

Outstanding lifecycle audit: explicit shared texture disposal, retained PMREM
render-target disposal and teardown ordering. Numeric checks do not verify GPU
resource usage or rendered appearance. Do not claim those gaps are closed.

## Routes

`/` is public and demonstrates both tools. CTAs use `/auth?returnTo=/simulator`
or the protected planner. `/simulator` and `/dashboard` use `RequireAuth` with
immediate signed-out redirect, preserving the intended destination. `/auth`
falls back to `/simulator`. Providers and auth configuration are preserved.
Simulator comparisons are a dedicated workspace view, not a separate route.
