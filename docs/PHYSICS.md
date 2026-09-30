# The physics model

Everything below is in `src/lib/solar.ts` and `src/lib/roof.ts`. It is a
deliberate *engineering* model, not a certified one: the aim is that a homeowner
comparing options gets honest relative answers, not an energy yield guarantee.
Where a simplification exists, it is stated.

## Solar position

NOAA Solar Calculator equations in the Michalsky fractional-year form:
fractional year → equation of time → declination → true solar time → hour angle
→ zenith. Azimuth is taken about the south meridian and flipped across the noon
line, which is the step that is usually got wrong.

The frame is right-handed, `+X` east, `+Y` zenith, `+Z` south, so north is
`−Z` and azimuth is measured clockwise from north.

## Clear-sky irradiance

ASHRAE-style, driven by solar altitude:

- **Air mass** — Kasten–Young relative form, `1 / (cos z + 0.50572 (α + 6.07995)^-1.6364)`.
- **Beam attenuation** — Hottel/Meinel, `DNI = 1361 · 0.7^(AM^0.678)`.
- **Cloud** — clearness index `k` ∈ [0,1] from the site preset scales the beam
  through a smoothstep `k²(3 − 2k)`, and a Perez-style broad-cloud term adds
  diffuse so an overcast sky is not simply a dark clear sky.
- **Diffuse** — a clear-sky component `0.13 · DNI_clear` plus a cloud component
  `0.09 · 1361 · sin(α) · (1 − k)`.

Monthly clearness and temperature are typical public climate normals, one per
city, not a live TMY feed.

## Transposition to the plane of array

Isotropic sky model, which splits the plane-of-array irradiance into the three
physical components:

```
cos θ = cos(β − α)                      incidence cosine
beam   = DNI · max(0, cos θ)
diffuse = DHI · (1 + cos β) / 2
ground  = GHI · albedo · (1 − cos β) / 2
```

Keeping these separate matters: **only the beam component is reduced by a
shadow.** Diffuse light still reaches a shaded module from the rest of the sky,
and ground-reflected light is unaffected. An earlier version scaled the whole
plane-of-array figure, which wrongly darkened a shaded module's diffuse share.

## Array power

Nameplate is measured at STC (1000 W/m²), so:

```
cell temp  = T_ambient + ((NOCT − 20) / 800) · POA
temp factor = 1 + (γ_p / 100) · (T_cell − 25)
DC = (POA / 1000) · W_nameplate · N · max(0.7, temp factor) · (1 − losses)
AC = min(DC, inverter rating)
```

`max(0.7, …)` is a floor on the temperature derate so a hot cell cannot drive
the model to zero or negative power. Note the ordering: the area does not appear
here because irradiance is already per-square-metre and watts are per module.
Getting that wrong was an early dimensional bug.

## Annual integration

365 days at 15-minute resolution — 35,040 steps, about 20 ms.

Clearness and ambient temperature are looked up per month, not interpolated;
that is the dominant simplification and is worth more than a finer timestep.

### Shading inside the loop

The array's shaded fraction is looked up at each timestep from a seasonal grid,
built by `buildShadingField()`:

- **12 representative days**, one per month (15th, 46th, 74th, …).
- **13 hourly samples** per day, 06:00 to 18:00 local clock.
- Bilinear interpolation on lookup, clamped at the edges of the hour window.

The clamping only matters at high latitudes in midsummer, when the sun is still
up outside 06:00–18:00.

This exists because the shadow geometry is not constant over a year. A vent
throws a long shadow at noon in December and a short one at noon in June, and
row-to-row shading on a racked array only bites when the sun is low. Measured on
the sample roof: a racked array casts **zero** shadow on a June morning and
**2.67%** on a December morning, and that December contribution was missing
entirely before this was fixed.

### Row pitch

Flush modules are coplanar with the roof and cannot shade one another, so rows
stack with a small access gap. Racked modules stand above the roof, so the pitch
comes from the classic winter-design-day result:

```
pitch = L · (1 + tan α / tan β)
```

where `L` is the module dimension along the slope, `β` the tilt of the module
surface, and `α` the **profile altitude** — solar altitude measured in the
vertical cross-section perpendicular to the rows, which is what actually governs
inter-row shading:

```
α = atan( tan(altitude) · cos(sunAzimuth − surfaceAzimuth) )
```

This is the single biggest driver of how many modules a roof holds.

## Module-level shading

Resolved geometrically, not by ray casting, because the geometry is convex:

- **Obstructions** — the 3D box corners are projected along the sun vector onto
  the roof plane and the convex hull is taken. Vent stacks are drawn as
  cylinders but shade with their full box footprint, which is slightly
  conservative and keeps the picture honest to the physics.
- **Racked rows** — projected as parallelograms, and only for rows a little way
  up-slope, bounded by the shadow reach.
- Behind the roof plane there is no beam at all, so shade is 1 outright.

Both are tested against a **5 × 5 sample grid** inside each module, which is
the same answer a ray tracer would give for this geometry.

## Scene lighting

The scene uses the *same* clear-sky model as the energy numbers, so the picture
and the physics cannot drift apart. See `scripts/verify-lighting.ts`.

Intensity is `3 · DNI / DNI_reference`, clamped to `[0, 4]`, where the reference
is 55° altitude at clearness 0.62. At that condition intensity is exactly 3.0,
ambient exactly 0.95 and the sun colour exactly the neutral it was tuned to, so
the render is unchanged at the tuned point and only moves as the real sky
degrades. Colour lerps from `#ff8a35` at the horizon to `#fff0d2` overhead. The
ambient floor is 0.42, deliberately equal to the night fill, so crossing the
horizon dims smoothly instead of stepping *up* into a brighter night.

## Calibration

Measured specific yield across the site presets at the default design
(25 modules, 11.00 kWp, 25° tilt, due south, flush). Reproduce with:

```bash
bunx tsx scripts/calibration.ts
```

| Site | kWh/kWp/yr | Capacity factor |
| --- | ---: | ---: |
| London | 1000 | 11.4% |
| Sydney | 1068 | 12.2% |
| Berlin | 1082 | 12.4% |
| Seattle | 1218 | 13.9% |
| Chicago | 1362 | 15.5% |
| San Francisco | 1412 | 16.1% |
| New York | 1447 | 16.5% |
| Austin | 1528 | 17.4% |
| Madrid | 1575 | 18.0% |
| Miami | 1603 | 18.3% |
| Denver | 1662 | 19.0% |
| Phoenix | 1807 | 20.6% |

A 1.81× spread from darkest to sunniest, and every value in the right band for
the city. That is the quickest sanity check that a change to the model has not
broken the physics — if this table moves unexpectedly, something is wrong.

## What this model does not do

- No soiling, snow, albedo-by-season, or partial-shading electrical mismatch
  beyond the geometric beam loss.
- No module-level temperature variation, so a partially shaded array is
  optimistic: real modules with mismatched irradiance suffer from a hot spot and
  produce less than the geometric beam loss alone implies.
- The roof is a single tilted plane. Hips, valleys and dormers are not modelled.
- Monthly normals, not TMY. Interannual variability is not represented.
- Cable, mismatch and soiling losses are lumped into a flat 14%.

A site survey still rules.
