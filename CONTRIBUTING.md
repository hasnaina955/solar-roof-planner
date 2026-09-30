# Contributing to Helio

## Setup

```bash
bun install
```

You need a Convex deployment. The one configured in `.env.local` belongs to the
platform service account, so **for your own account**:

```bash
bunx convex dev
```

That writes `CONVEX_DEPLOYMENT` to `.env.local` and prints the values to export
for the deployment:

| Variable | Purpose |
| --- | --- |
| `JWT_PRIVATE_KEY` | Signs auth tokens (Convex Auth) |
| `CONVEX_JWKS` | Public half of that key pair, for verifying them |
| `SITE_URL` | Your dev origin, used to build auth callbacks |

The client only needs `VITE_CONVEX_URL`. Never edit `.env` files by hand — use
the Keys panel if you are working in the hosted environment.

`.gitignore` deliberately excludes `.env.local`, `node_modules`, `dist` and
`src/convex/_generated`. The last of those is generated, and the first contains
secrets.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server (the platform normally runs this for you) |
| `bun tsc -b --noEmit` | Typecheck. Must pass before you call anything done. |
| `bun convex dev --once` | Push Convex functions and regenerate `_generated` |
| `bunx eslint .` | Lint |

**Never run `bun convex dev` without `--once`.** The terminal here is
non-interactive; the long-running form hangs and leaves codegen incomplete.

## Verification scripts

Two things in this project are easy to break silently — the annual energy
figure drifting, and the scene lighting drifting — so both have scripts that
assert an invariant and exit non-zero on failure.

```bash
bunx tsx scripts/verify-shading.ts
bunx tsx scripts/verify-lighting.ts
```

- **`verify-shading.ts`** guards the annual model. The invariant is that the
  annual figure depends on the design only: it must not move when the
  time-of-day slider moves. It also checks that shading actually removes energy
  and that winter row shading is captured. This catches the class of bug where
  an instantaneous derate gets extrapolated across the year.
- **`verify-lighting.ts`** guards the scene. The invariant is that at the tuned
  condition (55° altitude, clearness 0.62) the render is unchanged from the
  flat constant light it replaced, and that intensity varies monotonically with
  altitude and cloud cover everywhere, with no NaN and no black or blown-out
  frame across all twelve sites.

Run both before touching the physics or the scene.

## Conventions

- **Use `bun`, never `npm`/`yarn`/`pnl`.**
- **Edit files with the editor tools**, not `sed`, shell redirection or inline
  scripts. Shell-written files can fail to persist through the build state.
- Pages live in `src/pages`, planner components in `src/components/planner`,
  shadcn primitives in `src/components/ui`. Add to these rather than creating
  parallel structures.
- Express UI through the existing shadcn components.
- Put physics in `src/lib`, not in components. If a number is shown in the UI,
  it should be computed by something with a test.

## Things that will bite you

1. **The roof basis is left-handed.** `roofGroup` carries the roof-plane basis
   matrix, so children are in roof local coordinates (+X along the eaves, +Y up
   the slope, +Z along the roof normal). That basis has determinant −1. Never
   call `setFromRotationMatrix()` on it. See the header of
   `RoofScene.tsx`.

2. **A racked module pivots on its low edge.** Rotating about the module centre
   swings it down through the roof at high rack angles. The clearance is ~32 mm
   at 25°; keep it that way.

3. **three.js multiplies instanced colour by the material colour.** An
   `InstancedMesh` with a dark material colour *and* dark instance colours
   renders near-black, because the darkness is squared. The module material
   colour is `#ffffff` for this reason.

4. **Shared textures are flagged `userData.shared`.** `disposeObject()` skips
   anything so marked, because they are created once in the scene context and
   reused across rebuilds. Creating one per rebuild leaks it.

5. **The annual integration costs ~20 ms.** It is memoised against the design
   and deliberately kept off the animation path — do not reintroduce a
   dependency on the current minute of the day.
