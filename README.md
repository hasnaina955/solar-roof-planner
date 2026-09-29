# Helio — 3D rooftop solar planner

Trace your roof on a tilted 3D plane, watch modules lay themselves out at a
spacing that survives the worst day of winter, then sweep the sun across the
year and see every panel's yield move with it.

Built for homeowners comparing options before they talk to an installer.

## What it does

- **Trace your roof** — click the outline on the roof plane. The layout solver
  reflows the array the moment you close the shape.
- **See the array** — modules are packed by a real layout algorithm with edge
  setbacks, vents and obstructions carved out, and inter-row spacing solved
  rather than guessed.
- **Watch a real day** — scrub the date and clock time, or play the day as an
  animation. Shadows sweep across the roof and each module recolours by how
  much sun it is catching.
- **Get numbers you can defend** — annual and monthly yield, roof coverage,
  bill offset, CO₂ avoided, and the shading loss that got you there.
- **Size it yourself** — set module output and install any number of modules up
  to what the roof holds.
- **Model your own usage** — build your household from 22 appliance presets to
  see what each one contributes and how much of it the array covers.
- **Compare options** — save layouts and rank them on capacity and specific
  yield.

## The model

The point of this app is that the geometry is honest. All of it lives in
`src/lib/solar.ts` and `src/lib/roof.ts` and is independent of React and three.js.

**Solar position** — NOAA Solar Calculator equations (fractional year,
equation of time, declination) giving altitude and azimuth for any minute of any
day at any site.

**Irradiance** — Kasten–Young relative air mass, Hottel/Meinel beam attenuation,
a diffuse component that survives cloud cover, and an isotropic-sky
transposition with ground reflection onto the tilted plane:

```
POA = DNI·cos(θ) + DHI·(1 + cos β)/2 + GHI·ρ·(1 − cos β)/2
```

**Power** — nameplate is defined at 1000 W/m², so plane-of-array irradiance
scaled to that reference times nameplate watts times module count gives DC
power, derated by cell temperature (NOCT model) and system losses, then clipped
at the inverter. A full year is integrated at 15-minute resolution.

**Row pitch** — flush modules are coplanar with the roof and cannot shade one
another, so rows stack with an access gap. Racked modules stand above the roof
and get real spacing from the winter-solstice profile angle:

```
pitch = L · (1 + tan α / tan β)
```

where β is the module surface tilt and α the profile altitude at the design
day. This is the single biggest driver of how many modules a roof holds.

**Shading** — resolved geometrically each instant: obstruction box corners are
projected along the sun vector onto the roof plane and hulled, racked rows
project as parallelograms, and both are tested against a 5×5 sample grid inside
every module. Only the beam component is removed by a shadow, so diffuse and
ground-reflected light survive.

## Architecture

```
src/lib/solar.ts          solar geometry, irradiance, PV energy model
src/lib/roof.ts           roof frames, layout solver, shading, site presets
src/lib/appliances.ts     appliance library and household load model
src/components/planner/
  RoofScene.tsx           three.js scene: roof, house, modules, sun, shadows
  ControlRail.tsx         design inputs
  InsightRail.tsx         KPIs and production charts
  TimeBar.tsx             date and time scrubber
  LoadCalculator.tsx      appliance usage builder
  SavedDesigns.tsx        save/load/compare layouts
src/pages/Landing.tsx     marketing page
src/pages/Dashboard.tsx   the planner
src/convex/               Convex backend (designs table, auth)
```

Stack: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, Framer Motion,
three.js, Convex + Convex Auth, Recharts.

## Running it

```bash
bun install
bun convex dev --once   # codegen the Convex client
bun run dev
```

Typecheck with `bun tsc -b --noEmit`.

## Accuracy and limitations

Monthly clearness and temperature figures are typical public climate normals for
each of the twelve sites, not a live satellite or TMY feed, so treat the output
as a very good guide rather than a guarantee. Shading is resolved instantaneously
and applied to the year as a derate rather than ray-traced for all 8,760 hours.
The roof is a single tilted plane — hips, valleys and dormers are not modelled.
A site survey still rules.

## Environment

The client needs `VITE_CONVEX_URL` and the Convex deployment needs
`CONVEX_DEPLOYMENT` plus the auth keys (`JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`).
Secrets are held outside the repository; `.gitignore` excludes `.env.local`,
`node_modules`, `dist` and `src/convex/_generated`.

## Project conventions

- Package manager is **bun**.
- Pages live in `src/pages`, components in `src/components`, shadcn primitives
  in `src/components/ui`. Import via the `@/` alias.
- Convex auth files (`src/convex/auth.ts`, `src/convex/auth.config.ts`,
  `src/convex/auth/emailOtp.ts`) are fixed — do not modify them. Use the
  `useAuth` hook on the frontend and protect routes with `RequireAuth`, which
  preserves the requested path through `/auth?returnTo=...`.
- Theme tokens live in `src/index.css`; prefer them over hardcoded colours.
- Express UI state through the existing shadcn components and keep pages
  responsive.
