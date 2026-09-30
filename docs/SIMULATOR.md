# India usage simulator

The dedicated `/simulator` route is independent of roof drawing. It is protected
by the existing auth wrapper, and `/auth` now falls back to this workspace.
The existing `/dashboard` planner remains protected and accessible from shared nav.

## Inputs and context

- Custom panel count and STC watts, tilt, azimuth, DC losses, controller current.
- Indian city or custom coordinates; all schedules use IST (UTC+5:30).
- Constant editable clearness and ambient-temperature assumptions over 1–7 days.
  These are **not** historical weather or monsoon forecasts. No API is required.
- Battery chemistry, per-unit volts/Ah, series units, parallel strings, starting
  SOC, reserve, bank current limits, charge/discharge efficiencies, Ah rating
  period and optional high-current Peukert penalty.
- Inverter VA, rated W/VA factor, startup watt ceiling, required DC voltage,
  efficiency and idle DC consumption. 230 V / 50 Hz is the AC context, not a
  wiring/protection certification.
- Off-grid, hybrid with mains bypass, or grid-tied without backup; daily cuts,
  editable INR/kWh variable energy tariff.
- Appliance running watts, quantity, power factor, startup multiplier, priority,
  multiple daily schedule windows and optional deterministic duty cycles.

Start example: two 220 W panels, one 12 V 150 Ah tubular battery, 900 VA inverter
(rated factor 0.8 → 720 W), BLDC fan, four LEDs, TV and router. Add the fridge/pump
presets to inspect their startup demands. Preset values need manufacturer or
measurement confirmation. The fridge preset cycles 20 minutes per hour; each
cycle incurs a fresh startup check. This is not thermostatic behavior.

## Core equations

```
bank V  = per-unit V × units in series
bank Ah = per-unit Ah × parallel strings
bank Wh = bank V × bank Ah
reserve Wh = bank Wh × reserve SOC
continuous inverter W = rated VA × rated W/VA factor
appliance VA = running W / appliance power factor
```

Series changes voltage, not Ah. Changing to a 24 V bank without changing a 12 V
inverter causes a visible mismatch warning and disables backup generation.
Chemistry selects editable reserve/efficiency/rate defaults, not proprietary
battery performance curves. Lithium voltage must still be entered explicitly
(e.g. 12.8 V if appropriate) and must match the inverter configuration.

Solar DC uses shared NOAA/irradiance/NOCT functions and nameplate watts; dimensions
are not needed for this independent system. DC is capped by nominal bank voltage
× solar-controller amps in battery modes. This simplified cap does not validate
PV string Voc/Vmp, MPPT windows, PWM losses or charge-controller compatibility.

## Event-aligned dispatch

`src/lib/simulator.ts` owns all simulation logic. Boundaries include every five
minutes plus every schedule, cycle and mains-cut transition, including overnight
windows. Solar is sampled at interval midpoint. SOC carries across days; it is
never reset at midnight. Overlapping windows count the appliance once.

Hybrid policy is deliberately explicit: during mains availability, grid bypass
serves protected loads and solar offsets them before charging surplus into the
battery. The battery does not discharge to offset grid energy or charge from the
grid; inverter idle consumption remains on DC. During cuts it behaves as backup.
Bypass has no modeled service-current limit. Grid-tied PV disconnects during a
cut (anti-islanding) and the battery configuration is unused. No exports/credits.

For battery-only operation, prioritize whole loads by ascending priority number
(stable list order for ties). Admit each load only if combined running watts,
running VA, aggregate startup watts/VA and configured DC-source current allow it.
Accepted loads are not fractionally powered. Rejected loads show an explicit
reason: watts, VA, surge, startup source, energy shortage, cut or voltage mismatch.
Rejected scheduled loads retry at the next interval; this is modeled load shedding,
not a vendor's actual whole-inverter trip/restart policy.

Battery energy limit with timestep Δt and optional Peukert exponent k:

```
P_ref = bank Wh / Ah-rating hours
rate_penalty(P) = max(1, (P / P_ref)^(k − 1))
discharge DC × Δt × rate_penalty / discharge_efficiency ≤ stored Wh − reserve Wh
stored Wh -= discharge DC × Δt × rate_penalty / discharge_efficiency
stored Wh += charge DC × Δt × charge_efficiency
```

For high currents solve the nonlinear power limit before admitting loads. No
low-current capacity bonus is added. k=1 disables the penalty. Lead-acid defaults
are assumptions (tubular 1.15, AGM 1.1 at C20), not calibrated battery data; ageing,
temperature-dependent capacity and voltage sag remain unmodeled. Reported battery
discharge energy represents modeled reserve depletion, including this penalty.

Charge/discharge limits also respect nominal bank V × configured bank amps. Solar
and battery share one DC bus. Conversion efficiency and idle load are explicit;
charge and discharge do not occur simultaneously. Storage starting below reserve
is retained honestly; the model never raises it to reserve without charging.

Startup checks use requested multipliers and aggregate simultaneous starts,
including quantity. Their seconds of extra energy and transient voltage behavior
are **not** integrated. Configured battery discharge amps are also the startup
ceiling; no unspecified pulse-current bonus is assumed. Surge VA is estimated
from surge watts and inverter rated factor, not a separately supplied datasheet
surge-VA curve.

## Outputs and comparisons

Timeline: solar DC, scheduled demand AC, unmet AC and end-of-interval battery SOC.
A time scrubber lists the exact appliance states for that interval. DC and AC
lines have different conversion points; compare them with that distinction.
Energy served is actual modeled requested energy supplied, not annual generation
ratio. Grid costs are variable imports × user tariff, excluding fixed charges,
taxes, subsidy and net-metering.

Keep a baseline locally in memory and compare the current configuration without
overwriting it. A context warning appears if dates, duration, location, mode,
cuts or solar assumptions differ. Advice is generated by actually rerunning
short single-window loads at noon. Only improvements without worsening the
other tracked metrics are offered. At most ten candidates/two recommendations;
this is not a global optimization or a guarantee.

## Persistence and planner handoff

Complete validated configuration is stored as versioned JSON in Convex
`simulations`, with owner index and owner checks on save/list/delete. JSON is
parsed and validated against the same Zod domain schema server-side. Each save
creates a new immutable scenario snapshot. Optional complete planner snapshots
are stored alongside the simulator scenario.

Local draft key: `helio:simulation:v1:<owner-id>`. Account switches remount by
owner ID. Corrupt/unknown configurations fall back safely; storage failures show
a warning instead of crashing. Baseline comparisons are session-local, not part
of a saved configuration.

“Simulate this array” in the planner transfers Indian-site location, installed
count, custom watts, actual module tilt, facing and date, preserving the existing
simulator battery, inverter and load schedules. It attaches the full roof
snapshot and leaves the independently configurable solar assumptions intact.
**Geometric shading is not yet transferred**; that omission is announced during
handoff. Restoring a linked roof does not push simulator equipment edits back
onto the roof. Local storage is required for this route handoff; cloud snapshots
retain linked roofs across devices.

## Validation and next steps

`bun test scripts/simulator.test.ts` covers numeric bank references, constant-power
energy conservation, efficiency/reserve runtime, rate penalty, full-charge/current
caps, event schedules, cycling, overload/surge/current, anti-islanding, voltage
mismatch, multi-day SOC, scenario-derived advice, local persistence, handoff and
route wiring. `scripts/trust.test.ts` remains the planner reference suite.

These are domain/unit/source checks, not browser E2E, visual, real equipment or
historical-yield validation. Next: browser workflows, measured weather support,
PV electrical configuration, richer inverter protection behavior, shading transfer
and then deeper 3D plane/module editing. Preserve the renderer rather than migrate
frameworks without evidence.
