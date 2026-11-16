# ADR 0047: The Web App Stays at the Root, and the Companion App and One Shared Package Are Workspaces Beside It

## Status

Accepted. Resolves LAY-204, on the map *iOS companion app* (LAY-196).

Settles where ADR 0046's contract schemas go. They leave `types/contract/` for
`packages/domain/contract/`, moving as a unit. Every other ruling of 0046 stands.

## Context

The map settled on Expo for the **Companion App**, kept in the same repo (LAY-196 decisions 3 and
4). It sketched an eventual `apps/web` + `apps/mobile` + `packages/domain`, and left the shape and
the timing to this ticket.

What the repo looks like today:

- **The Next.js app is the repo root.** About 450 files import with `@/`, and `tsconfig.json`
  and `jest.config.mjs` both map that alias to the root. Every ADR, `AGENTS.md` and the testing
  docs cite paths like `services/analysis/…`.
- **CI is one Ubuntu job** on Node 20 (lint, tsc, jest, build). Vercel deploys the root, and
  there is no `vercel.json`.
- **Worktrees get `node_modules` by symlinking a sibling's install.** Nobody runs `npm ci` in a
  fresh one.
- **The pure layer is pure.** `types/index.ts` imports nothing. `services/analysis/` is
  isomorphic (ADR 0029), except four readers that take a Supabase client.

What the Companion App needs from shared code is less than it first looks:

- **Current Conditions arrives over the App API**, already decided (ADR 0046).
- **The recorder splits lines and stores them**, and only a live display would decode them
  (LAY-199).
- **The analysis screens stay on the web** (LAY-196 decision 2).

So the app's first real dependency is ADR 0046's zod contract, and little else.

Facts about the tools (checked 2026-11-16):

- **Expo SDK 58** bundles React Native 0.88 and pins **React 19.3.0** exactly. The web is on
  19.2.4.
- **Expo's monorepo guide** says duplicate React versions in one app "will cause runtime errors".
  Its fix is npm `overrides` at the root.
- **Metro auto-configures for workspaces** since SDK 52.
- **SDK 57 and 58 need Node 22.13 or newer.**
- **Next 16 compiles workspace packages** without `transpilePackages`.
- **EAS builds iOS on its own Macs.** A Vercel Ignored Build Step skips the deploy when its
  command exits 0.

## Decision

### The web app stays where it is

The Next.js app stays at the root. The root `package.json` is both the web app and the npm
workspace root, and lists `apps/*` and `packages/*` as workspaces. Nothing in this map needs
`apps/web`. That move would rewrite every config, Vercel's root directory, CI, worktree setup and
every cited path, all for symmetry. If a real need appears, it gets its own ticket.

**npm workspaces only.** No pnpm (its symlinked layout has a history of friction with Metro), no
Yarn, no Turborepo (one app and one small package have nothing to cache).

### One shared package, and code moves into it on demand

- **There is one package,** `packages/domain`, published in the workspace as `@layline/domain`.
  The workspace names are `layline` (the root), `@layline/mobile` and `@layline/domain`.
- **Its first contents are ADR 0046's contract schemas,** moved with `git mv` to
  `packages/domain/contract/`, along with whatever pure types and helpers they pull in.
- **Nothing else moves until a Companion App screen needs it.** That includes
  `services/analysis/`, wind classification and decoding. Each one moves when the app gets a
  second consumer for it, not before.
- **The move happens with the `apps/mobile` scaffold.** That is the moment a second consumer
  exists. LAY-213 creates `types/contract/` at the root as written, and the scaffold ticket moves
  it.
- **It ships raw TypeScript.** `exports` points at the `.ts` sources, with no build step and no
  `dist/`. Next compiles the package itself, and Metro compiles it with Babel.

### The package imports nothing it doesn't own

Code inside `packages/domain` uses **relative imports only**. It may import its own files and pure
third-party libraries such as zod. It never imports `next`, `react-dom`, `@supabase/*`, or
anything at the root, `@/` included.

A `@/` import inside the package would resolve against whichever app is bundling it, which differs
between Next and Metro, and it would let the package reach back into the web. A test enforces the
rule, in the same spirit as ADR 0046's "adapters hold no rules" test.

Both apps import the package as `@layline/domain/...`.

### One React for the whole repo

A single React version runs everywhere. Expo's SDK chooses it, and a root `overrides` entry pins
it.

- **The web moves to React 19.3** and Node 22 before `apps/mobile` exists. `engines.node`
  becomes `>=22.13`, so Vercel follows.
- **Every Expo SDK upgrade bumps the web's React in the same PR.**

Keeping `apps/mobile` outside the workspace, with its own lockfile, would avoid the coupling. But
`@layline/domain` would then have to be consumed by path, which is the case Expo's monorepo
support doesn't cover. That option was rejected.

### The root's tools stay out of `apps/mobile`

- **Excluded:** the root `tsconfig.json`, jest's `testPathIgnorePatterns` and the eslint config
  all exclude `apps/mobile`.
- **Mobile's own tools:** the app has its own `tsconfig.json`, jest config (`jest-expo`) and
  eslint config, run with `npm test -w @layline/mobile`.
- **The package's tests:** `packages/domain` is tested by the root jest, so `npm test` at the root
  still covers everything the web depends on.

### The web resolves the package by path, not through `node_modules`

npm links a workspace package into `node_modules` with a relative symlink
(`node_modules/@layline/domain → ../../packages/domain`).

A worktree whose `node_modules` is a symlink to a sibling's install would follow that link into
the **sibling's** `packages/domain`. It would edit one copy and test another, with no error
telling it so.

So the root `tsconfig.json` paths and jest's `moduleNameMapper` both map `@layline/domain/*` to
`./packages/domain/*`. Next, tsc and jest then resolve the package inside their own worktree,
whatever `node_modules` is.

**Mobile work needs a real `npm ci` in its worktree.** Metro and Expo autolinking follow
`node_modules`, and no alias changes that.

### Deploys and CI

- **Vercel:** a new `vercel.json` sets
  `ignoreCommand: "git diff HEAD^ HEAD --quiet -- . ':(exclude)apps/mobile'"`. A commit that only
  touches `apps/mobile` doesn't deploy. A change to `packages/domain` does, because the web
  consumes it.

  This has one known gap, which is accepted. A PR preview compares only the branch's last commit,
  so it skips when that commit touched only mobile. Production on `main` is correct, because each
  merge commit is compared with the previous `main`.
- **Web CI:** `ci.yml` stays as it is, on Node 22.
- **Mobile CI:** `mobile.yml` runs on Ubuntu when `apps/mobile/**`, `packages/**` or
  `package-lock.json` change. It runs tsc, the mobile jest suite and
  `npx expo export --platform ios`. That last step is a bundling smoke test, and it proves Metro
  resolves the workspace package without a Mac.
- **EAS builds are never triggered from CI** in this map. The owner runs `eas build` by hand for a
  TestFlight build, because EAS's free tier caps monthly builds. `eas.json` lives in
  `apps/mobile`. No macOS runner is needed.

## Consequences

- **Two build tickets, in this order:**
  1. Move the web to React 19.3 and Node 22. Nothing blocks it.
  2. Scaffold `apps/mobile` and move the contract into `@layline/domain`. It is blocked by the
     first ticket and LAY-213.
- **`AGENTS.md`'s directory map and the worktree setup notes change** in the scaffold ticket. The
  setup notes must say that mobile work needs `npm ci`.
- **`CONTEXT.md` gains no terms.** None of this is domain language.
- **Expo's SDK cadence sets the web's React.** An SDK upgrade is a two-app PR.
- **Moving the web to `apps/web` stays possible** and stays unplanned. None of the above
  forecloses it.
- **Android stays cheap** (LAY-196 decision 5). Nothing here is iOS-specific except the `--platform`
  of one smoke test.
