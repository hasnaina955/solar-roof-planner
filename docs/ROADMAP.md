# Roadmap and current status

Helio now has a dedicated India-focused operational usage simulator and the
existing 3D planner. The stack and renderer are preserved. Domain reference
checks pass; browser, device and physical validation remain outstanding.

## Latest implementation

- Custom panels, bank topology/Ah/chemistry/current/reserve/rate penalty and
  inverter VA/watts/surge/DC-voltage inputs.
- Multi-window/duty-cycle loads, explicit startup/continuous/source limits,
  priority whole-load shedding, multi-day SOC and IST power cuts.
- Off-grid, hybrid mains-bypass and grid-tied anti-islanding policies.
- Responsive standalone equipment/schedule/results/compare workspace and
  a redesigned simulator-first landing page with two product entry points.
- Owner-protected full Convex scenario saves, local drafts and baseline compare.
- Indian-location planner handoff preserves battery/schedules and linked roof;
  mobile planner exposes all inputs via the same full control rail.
- New simulator tests alongside existing planner tests. See SIMULATOR.md.

Geometric shading is not yet sent into simulator output. Keep deep 3D editing
work after simulator/UI workflow verification, as requested.

## Phase 1 — trust and recovery implementation

Implemented:

- Honest annual generation/use ratios instead of “Solar covers” and “Bill offset”.
  Removed unsupported whole-house operation and CO₂/savings promises.
- Usage shows the inverter AC ceiling, not current sun output mislabeled as peak.
- Rack surface tilt drives live/day/annual energy and rendered orientation, with
  consistent 70° cap.
- Corrected off-axis profile angle and roof-coordinate row pitch; June winter
  in the southern hemisphere, December in the north.
- Sample rays intersect actual module surfaces and vent boxes; front/rear row
  direction and module-normal illumination are handled explicitly.
- Full-day seasonal shadow sampling instead of 06:00–18:00 clamping.
- Fixed the inverted displayed instantaneous shading-loss percentage and incorrect
  UTC sign in solar noon.
- Packing uses projected rack footprints and top/bottom edge setbacks.
- Complete versioned saved configuration, including appliances, racks, custom
  watts, panel limit, geometry, date/time. Legacy saves show missing-field warning.
- Validated per-user local drafts restored after refresh.
- Action-based undo/redo, same-control coalescing, redo invalidation, atomic module
  selection/custom-watts restoration and native text-field shortcut handling.
- Independent geometry/history/serialization tests and dashboard source-wiring
  guards, replacing the repeated-identical-call “clock invariance” test.

Checked: Convex codegen/deployment command, TypeScript and numerical tests.
**Not complete sign-off:** browser save/load, refresh, clock scrub, text editing,
auth switching and rendered layouts remain unverified. Full physics requires
external data/convergence validation. No claim of engineering certification.

Layout corrections change the default module count and outputs relative to old
saved summaries. Old summaries are retained, not silently rewritten.

## Phase 2 — simulator validation and refinement

Completion example: two 220 W panels plus a 150 Ah battery and multiple loads.
Ask for battery voltage, chemistry, usable capacity, starting charge, charge and
discharge limits, inverter continuous/surge ratings, location and grid mode.

Add start/stop schedules and overlapping appliances, solar/grid/battery dispatch,
startup/continuous overload handling and explicit unmet loads. Show solar versus
demand, battery SOC, running appliances, shortfalls and grid dependence over time.
Recommendations must come from comparing simulated alternatives, not generic
advice. A single representative day is not sufficient for seasonal autonomy.

## Phase 3 — two equal tools and mobile parity

Navigation: Planner · Usage Simulator · Compare. Usage gets a full workspace,
not only a modal. Allow existing-system setup without tracing a roof, transfer a
planned array into simulation, and save both parts together. Preserve baseline
scenarios when comparing alternatives.

On mobile, expose every essential input through accessible sheets/results views.
The compact city/totals replacement now opens the full input rail in a bottom
sheet; dedicated mobile planner results still need work and device verification. Landing should demonstrate both tools only once both actually exist.

## Phase 4 — planning realism

Individual panel placement/removal, dimension/snapping tools, editable obstacles,
multiple roof faces and traceable layout-to-simulation effects. Investigate PVGIS
historical irradiance/TMY via Convex actions and server-side cache. Historical
records are not live weather forecasts. Validate provider coverage/terms and data
provenance before making accuracy claims.

## Phase 5 — production hardening

Browser/a11y tests, mobile device rendering and adaptive quality, GPU lifecycle
audit, worker-based calculation if measured costs justify it, exportable project
reports and scenario comparisons. Reference tests do not replace field validation.

## Version control and preview limits

The hosted platform manages Git/export; terminal Git/GitHub synchronization is
blocked. No commit/push or remote synchronization claim is made by these edits.
There is no browser inspection tool in this session, so rendered appearance and
end-to-end interactions are not verified.
