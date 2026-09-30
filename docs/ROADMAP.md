# Roadmap

Honest status. "Shipped" means built and numerically verified. Nothing here
has been visually confirmed in a rendered preview — see the caveat at the bottom.

## Shipped

### Energy engine — `src/lib/solar.ts`
NOAA solar position, Kasten–Young air mass, Hottel beam attenuation, isotropic
sky transposition, cell-temperature derates, inverter clipping, and a 365-day
integration at 15-minute resolution. Verified against a calibration table of
specific yields for all twelve site presets.

### Geometry and layout — `src/lib/roof.ts`
Roof-plane basis, 2D polygon maths, a greedy row-by-row layout solver that keeps
parallelogram and L-shaped roofs dense, the winter-design-day row pitch, and
geometric module-level shading from convex projections sampled on a 5×5 grid.

Five real bugs were found and fixed here during development:

1. Azimuth conversion inverted.
2. Roof normal not perpendicular to the roof plane.
3. Power model multiplied module watts by area — dimensionally wrong.
4. The annual loop used 1/15-hour steps instead of 0.25 h, and double-divided
   the kWh result.
5. Flush modules were modelled as if they were racked.

### Seasonal shading — fixed this cycle
The annual figure was reading an *instantaneous* derate and extrapolating it
across the year. Two consequences: the headline kWh moved while you dragged the
time-of-day slider, and a 35,040-step integration ran on every animation frame.

Both are fixed. The annual model now resolves shading on a 12 × 13 grid of
representative days and hours. Winter row shading, which was missing entirely,
now appears in the year. Guarded by `scripts/verify-shading.ts`.

A second bug surfaced in the same function: the derate was scaling diffuse and
ground-reflected light as well as beam. Corrected.

### Scene — `src/components/planner/RoofScene.tsx`
Roof slab with a real fascia board, walls that follow the roof plane, windows and
a door for scale, instanced modules with a rise-in animation, vent stacks, two
tree species, planting, compass readout, sun arc with hour labels, and three
camera framings that tween between presets.

The "panels render black" bug had a single root cause: `InstancedMesh` multiplies
instance colour by material colour, so a dark blue material carrying dark blue
instance colours squares the darkness to near-black.

### Physical lighting
Scene lighting now runs the same clear-sky model as the energy numbers, so the
picture and the physics cannot drift. Calibrated so the previously-tuned condition
renders identically, with smooth variation across altitude and cloud cover.
Guarded by `scripts/verify-lighting.ts`.

### Product surface
Landing page, Convex Auth, protected planner route, saved designs in Convex,
control and insight rails, a 22-appliance load calculator, a date/time scrubber,
and keyboard shortcuts for transport and view presets.

### Undo/redo — shipped this cycle
`src/hooks/use-design-history.ts`. Snapshots the serialised design state rather
than rewriting thirteen `useState` values into a reducer, so the existing
component structure is untouched. Rapid edits that share a shape coalesce into
one step, so dragging the tilt slider is a single undo rather than two hundred.
Changing the roof, the vents, the appliances or the module always starts a new
step. Bound to Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, plus header buttons. Loading a
saved design resets the history so undo cannot reach across into it.

Known interaction: selecting a module preset resets the nameplate watts through
an effect, so undoing across a module change restores the preset's watts rather
than a custom value.

## Known gaps

In rough priority order.

1. **No manual module editing.** You can change global setback but cannot remove
   a single panel that sits awkwardly, or drag one to a better spot.
2. **Appliances are not persisted.** The `designs` table stores the roof, the
   array and the yield, but not the household usage profile, so a saved design
   loses the load calculation it was made with.
3. **No state persistence across a refresh.** Fifteen pieces of design state in
   `useState` with no localStorage. A reload loses the session.
4. **No cost or payback framing.** The audience is homeowners deciding between
   options, and they care about money, not kWh/kWp.
5. **Module-level temperature mismatch is not modelled.** A partially shaded
   array is optimistic; see `docs/PHYSICS.md`.
6. **Single tilted plane only.** Hips, valleys and dormers are not modelled.

## Next

Persisting the appliance list with saved designs, then session persistence via
localStorage, then cost and payback framing.

## Unreleased since the last push

This is the changelog for the next commit. Everything below is new work, not yet
committed.

### Fixed
- The annual energy figure no longer depends on the time-of-day slider. It was
  reading an instantaneous shading derate and extrapolating it across the year.
- The same fix removed a 35,040-step integration from the animation path. It was
  running on every frame of the day sweep.
- Shading derates now scale the beam component only. Diffuse and
  ground-reflected light were being darkened along with the direct beam.
- Fog colour now matches the horizon band of the sky gradient, so the far edge
  of the plot dissolves into the sky.
- Crossing the horizon no longer steps brightness *up* into a brighter night.

### Added
- Seasonal shading: the year now resolves shading on a 12 × 13 grid of
  representative days and hours instead of one instant.
- Physical scene lighting driven by the same clear-sky model as the energy
  numbers, calibrated so the previously-tuned condition renders identically.
- Soft ground contact shadow under the house footprint.
- Undo/redo across the whole design state, with keyboard shortcuts.
- `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/PHYSICS.md`,
  `docs/ROADMAP.md`.
- Three verification scripts: `verify-shading`, `verify-lighting`, `calibration`.

## The caveat

None of this has been visually confirmed. Every check in `scripts/` is numeric:
specific yields, geometric clearance, monotone response curves, invariant
checksums on the annual figure. That is enough to be confident the maths is
right and nothing is silently broken, but it is not enough to say the scene
*looks* good. The rendering claims in this file describe what the code does, not
what anyone has seen.
