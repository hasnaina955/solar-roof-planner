# Physics model and its limits

Helio produces preliminary planning estimates, not certified design, guaranteed
yield, appliance-operability proof or installation approval. Passing geometric
reference tests does not validate the complete energy model against real systems.

## Coordinates and solar position

World coordinates: +X east, +Y up, +Z south. Azimuth is clockwise from north.
NOAA fractional-year equations provide declination, equation of time, altitude
and azimuth. Local solar noon is approximately:

```
noon = 720 + 60 × UTC_offset − 4 × longitude − equation_of_time
```

Winter design day is December 21 in the north, June 21 in the south. Use solar
noon, not an arbitrary clock-noon sample, for the spacing reference.

## Irradiance and plane of array

The model uses Kasten–Young relative air mass, a Meinel-style attenuation
`DNI_clear = 1361 × 0.7^(AM^0.678)`, and an illustrative cloud reduction:

```
DNI = DNI_clear × k²(3 − 2k)
DHI = 0.13 × DNI_clear × (0.25 + 0.75k)
    + 0.09 × 1361 × sin(altitude) × (1 − k)
GHI = DNI × sin(altitude) + DHI
```

The cloud calculation is a heuristic, not a full Perez model. Monthly clearness
and temperature presets are illustrative and have no documented historical-data
provenance. Do not call them measured climate normals or TMY.

For module tilt β, sun altitude α, and azimuth difference ΔA:

```
cos(incidence) = sin(α) cos(β) + cos(α) sin(β) cos(ΔA)
beam    = DNI × max(0, cos(incidence))
diffuse = DHI × (1 + cos(β)) / 2
ground  = GHI × albedo × (1 − cos(β)) / 2
POA     = beam × (1 − sampled_shadow_fraction) + diffuse + ground
```

Racked arrays use the actual module tilt, not the roof tilt, for live, daily
and annual power. Layout and scene share a 70° maximum module surface tilt.
Only direct beam is reduced by the current shadow model; diffuse sky obstruction
and changes to reflected light are not modeled.

## Row pitch in roof coordinates

Let L be the physical module dimension along the slope, t the roof tilt,
r the rack angle above the roof, and α the sun's profile altitude:

```
α = atan2(sin(sun_altitude), cos(sun_altitude) cos(ΔA))
roof footprint = L cos(r)
height above roof = L sin(r)
pitch = L cos(r) + max(0, L sin(r) cot(α + t))
```

Derivation: the high edge is `(y,z) = (L cos(r), L sin(r))` in roof local
coordinates. Project its ray away from the sun onto `z=0`; the local sun
components satisfy `sy/sz = −cot(α+t)`. The projected high edge is the minimum
bottom-to-bottom pitch for this design condition. A 0.05 m minimum gap is used.
For flat roofs this reduces to:

```
pitch = L cos(module_tilt) + L sin(module_tilt) / tan(α)
```

Thus lower sun requires **more**, not less, spacing. For a 2 m module at 30°
with a 30° profile, pitch is `2√3 = 3.4641 m`.

This is a **winter-noon reference**, not an all-day guarantee. Back-facing roof
sun provides no useful no-shading design reference; footprint clearance is used
in that case. Flush modules have a 0.04 m row gap. The solver uses projected rack
footprints but retains physical module dimensions for rendering. Complex concave
polygon/access-path validity still needs stronger layout tests.

## Sampled beam shadows

At 25 points on each actual tilted module surface, cast rays toward the sun.
Check intersections with conservative vent boxes and other module planes. Module
low edges share the scene's 0.05 m standoff. Check the module normal for back-face
illumination, not the roof normal. Coplanar flush modules do not shade each other.

This is **sampled area**, not exact shaded-area integration. Narrow shadows can
fall between sample points. Vents are drawn as cylinders but treated as boxes.
Frames, trees, string topology, bypass diodes and partial-shading electrical
mismatch are not represented in the output calculation.

Annual shadow lookup uses 12 representative days and 25 hourly samples spanning
00:00–24:00. It interpolates seasons cyclically and hours linearly. This fixes the
former 06:00–18:00 boundary limitation, but no accuracy bound has been established;
rapid shadow changes and sunrise transitions can need finer sampling.

## Power and integration

```
cell temperature = ambient + ((NOCT − 20) / 800) × POA
temperature factor = 1 + (temperature_coefficient / 100) × (cell_temperature − 25)
DC = (POA / 1000) × module_nameplate_watts × count
   × max(0.7, temperature_factor) × (1 − losses)
AC = min(DC, inverter_rating)
```

Nameplate watts already incorporate module area. Multiplying by area again is
incorrect. Default assumptions: 14% combined losses, NOCT 45°C, albedo 0.2,
DC/AC ratio 1.15. Inverter conversion efficiency is folded into broad assumptions,
not equipment-specific curves. Annual integration uses 365 days × 96 steps,
`energy_kWh = AC_watts × 0.25 / 1000`. Daily chart points represent half-hour
energy estimates, not instantaneous kW.

## Evidence and outstanding validation

`bun test scripts/trust.test.ts` checks flat reference values, independent
world-space ray/roof intersections, off-axis profiles, both hemispheres, rack
normals, sampled vent/row rays, edge bounds and solar noon. It also checks history,
project recovery and the dashboard's annual dependency wiring by source AST.
Those wiring guards can detect known source regressions; they are **not** mounted
React or browser clock-scrub tests.

`bun scripts/calibration.ts` prints model yields with equator-facing arrays
(north in Sydney, south in northern sites). This is a sanity comparison, **not
calibration against measurements**. No externally validated yield table or error
margin is claimed.

The scene uses irradiance to drive art-directed lighting, with readability floors,
intensity clamps and a static environment map. Numeric lighting checks are not
visual exposure or readability verification.

Remaining validation: historical irradiance/TMY comparisons, electrical mismatch,
sub-hour shadow convergence, all-day design constraints, browser workflows, and
rendered visual review. PVGIS is a candidate for later historical-data support
through cached Convex actions; it must never be labeled a live forecast.
