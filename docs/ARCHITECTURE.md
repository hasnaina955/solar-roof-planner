# Architecture

## The shape of the app

```
React page (Dashboard)
  ├── useMemo chain: design → geometry → shading → energy
  ├── Convex queries/mutations for saved designs
  └── <RoofScene> — imperative three.js, driven by props
```

The split that matters: **every number the UI shows is computed in `src/lib`**
(`solar.ts`, `roof.ts`, `appliances.ts`) and handed to the scene as plain data.
`RoofScene.tsx` never computes physics. It only draws what it is given. That is
what makes the engine testable in Node — see `scripts/`.

## Module map

| File | Responsibility |
| --- | --- |
| `src/lib/solar.ts` | NOAA solar position, clear-sky irradiance, transposition, PV power, annual integration |
| `src/lib/roof.ts` | Roof frames, 2D polygon maths, the layout solver, module-level shading, site and module presets |
| `src/lib/appliances.ts` | 22 appliance presets in 6 categories, household load summary |
| `src/convex/schema.ts` | Auth tables plus the `designs` table |
| `src/convex/designs.ts` | Save / list / load / delete saved designs |
| `src/pages/Dashboard.tsx` | Planner shell. Owns all design state and the derivation chain |
| `src/components/planner/RoofScene.tsx` | The three.js scene: roof, house, modules, sun, scenery, camera |
| `src/components/planner/materials.ts` | Procedural canvas textures (panel, shingle, wall, contact shadow) |

## The derivation chain

`Dashboard.tsx` builds this with `useMemo`, in order. Each stage depends only on
the ones above it:

```
design state          siteId, moduleId, tilt, azimuth, orientation, mounting,
                      rackTilt, setback, polygon, obstacles, appliances,
                      panelLimit, moduleWatts
  │
  ├─ frame            roofFrame(tilt, azimuth) → the roof-plane basis
  ├─ layout           layoutPanels(...) → panels, row pitch, module height
  ├─ installedPanels  the first `panelCount` of layout.panels
  ├─ system           SystemSpec for the energy model
  ├─ date / sun       solarPosition(...) at the scrubbed minute
  ├─ shades           computeShading(...) — instantaneous, for the live view
  ├─ derate           1 − mean(shades) — live beam transmission only
  ├─ annualShading    buildShadingField(...) — the seasonal grid
  ├─ shadeAt          (date, minutes) → annualShading.at(...)
  └─ energy           annualEnergy(system, count, tilt, az, shadeAt)
```

### The distinction that matters

`derate` and `annualShading` answer different questions and must not be mixed.

- **`derate`** is instantaneous. It drives the live watt readout and the
  heat-map colours, and it *should* change as you scrub the sun.
- **`annualShading`** is a seasonal grid — one representative day per month,
  sampled hourly — built once per design change. The annual integration looks
  it up per timestep.

When the annual figure was wired to `derate`, the headline kWh moved while you
dragged the clock, and a 35,040-step integration ran on every animation frame.
Both are fixed; `scripts/verify-shading.ts` exists to stop them coming back.

## Coordinate conventions

This is the part that generates bugs, so it is stated in the header of
`RoofScene.tsx` as well.

**World frame** (right-handed, used by the physics):

```
+X = East,  +Y = up (zenith),  +Z = South
```

So North is −Z. Azimuths are degrees clockwise from North, matching
PVsyst / PVGIS / NREL.

**Roof local frame** (left-handed, used by everything drawn on the roof):

```
+X = along the eaves, horizontal
+Y = up the slope, in the plane of the roof
+Z = along the roof normal, upwards
```

`roofGroup` carries the roof-plane basis matrix, so its children are in roof
local coordinates. Because the basis is left-handed (det = −1) it is valid for
*transforms* and invalid for extracting a rotation — nothing calls
`setFromRotationMatrix()` on it.

Polygons are drawn in roof local 2D, which means **polygon areas are true roof
surface areas**. No `cos(tilt)` correction is needed anywhere in the layout
solver, and panel counts and coverage percentages are honest.

Two conversions matter and are easy to get wrong:

- **Plan offset.** `planX = eaves.x * p.x + (upSlope.x / cos(tilt)) * p.y` — the
  up-slope distance is converted to its horizontal projection before being used
  as a plan offset.
- **Module placement.** A flush module sits 0.05 m proud of the roof. A racked
  one pivots on its **low edge** about the eaves axis, so it can never swing
  down through the roof surface.

## Scene lifecycle

`RoofScene` has one mount-once effect and several rebuild effects. It is
imperative, so this matters:

- **Textures** (panel, shingle, wall, contact shadow) are created once in the
  bootstrap effect, stored on `SceneContext`, and flagged
  `userData.shared = true` so `disposeObject()` does not free them on rebuild.
- **Geometry** (roof slab, house, modules, obstructions) is rebuilt whenever the
  design changes, and disposed on cleanup.
- **Instance colours** (heat map) are updated without a geometry rebuild —
  that effect writes `setColorAt` and sets `needsUpdate` only.
- **The sun marker** moves every sweep frame via props; the sun *arc* is
  rebuilt only when the day or site changes.

The render loop is started once and never torn down. It eases the camera toward
`ctx.cameraGoal` when a view preset changes, runs the module rise-in animation
against `ctx.build`, then calls `controls.update()` and renders.

## Environment map

A throwaway sky-and-ground scene is baked through `PMREMGenerator` into
`scene.environment`. This is not decoration: without it every metallic
material — module frames, vent stacks, window glass — renders as flat black.
The probe's geometry and materials are traversed and freed manually, because
the sky texture it shares is still in use by the main sky dome.
