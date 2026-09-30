# Contributing to Helio

## Setup

```bash
bun install
```

You need a Convex deployment. The hosted project currently uses the platform's
service-account deployment. For your own deployment, initialize it on your own
machine (interactive setup only):

```bash
bunx convex dev
```

That initializes your local deployment configuration. Configure Convex Auth
keys separately using the Convex Auth setup instructions; these are not all
created by the plain `convex dev` command:

| Variable | Purpose |
| --- | --- |
| `JWT_PRIVATE_KEY` | Signs auth tokens (Convex Auth) |
| `JWKS` | Public half of that key pair, for verifying them |
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

**In the hosted terminal, never run `bun convex dev` without `--once` or launch
`bun run dev`.** The platform manages both long-running services. The interactive
setup example above is for your own machine only.

## Verification

```bash
bun test scripts/trust.test.ts
bun scripts/verify-shading.ts
bun scripts/verify-lighting.ts
bun scripts/calibration.ts
```

- **`trust.test.ts`**: independent geometric references, module normals,
  hemisphere winter, ray intersections, action-based history, validated project
  serialization and source-AST guards on annual memo dependencies/save wiring.
- **`verify-shading.ts`**: seasonal samples compared with direct geometry;
  beam shadows remove energy. This is not a mounted clock-scrub test.
- **`verify-lighting.ts`**: numeric model calibration/monotonicity/clamps across
  twelve sites and representative days in every month. It mirrors lighting
  calculations, not rendered scene behavior or perceptual readability.
- **`calibration.ts`**: model yields for equator-facing arrays. No external
  measurements are used; this is a sanity report, not physical validation.

Browser interactions and visual quality require separate preview/E2E checks.
Do not claim engineering accuracy or rendered readability from these scripts.

## Conventions

- **Use `bun`, not another package manager.**
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
