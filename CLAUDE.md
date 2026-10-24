# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pnpm monorepo of services that calculate droid performance points (dpp) for osu!droid scores. Clients reach
everything through the **broker**, which routes by variant name or alias to **processor** instances; the **score
service** gets every pp value through the broker too.

- `apps/processor` (`@dpp/processor`): pure difficulty/performance calculation for one _variant_ (game mode plus one
  build of the calculator: npm live, npm rebalance, or a local `osu-droid-module` checkout). Has its own Postgres
  database (difficulty attribute cache) and fetches beatmaps from the external beatmap service.
- `apps/broker` (`@dpp/broker`): the single client entry point. Holds a registry (variants, aliases, instances,
  users, API keys, rate limits) in Postgres, managed by its CLI (`apps/broker/src/cli`) and admin routes. The
  registry is loaded into an in-memory snapshot and reloaded on a timer or `SIGHUP`.
- `apps/score-service` (`@dpp/score-service`): replay listener (chokidar), online-score lookup, game routes, and
  resumable score/total-pp recalculation jobs. Uses Postgres (own state), MariaDB (official osu!droid database,
  `src/official`), and MongoDB (`src/mongo`).
- `packages/shared` (`@dpp/shared`): API contract types, routes, and zod validators shared by all apps. Change the
  contract here, not in an app.
- `packages/server` (`@dpp/server`): shared HTTP/runtime plumbing (decorators, DI container, `BaseController`,
  `GracefulServer`, shutdown, logging, `DatabaseConnection`) and test helpers under `src/testing`.

Packages are consumed as TypeScript source (`exports` points at `src/index.ts`); only the apps are built (tsdown,
output `dist/*.mjs`).

The root `src/` and `dist/` directories are ignored leftovers from the old single-app codebase; ignore them.

## Commands

Node.js 24, pnpm (version pinned in `packageManager`).

```bash
pnpm install
pnpm build              # build every app
pnpm typecheck
pnpm lint               # oxlint --fix (type-aware; import/no-cycle is an error)
pnpm format             # oxfmt (4-space indent, 80 cols)
pnpm test               # unit + integration, one package at a time
pnpm test:e2e           # builds each app (and a processor snapshot), then tests it as a real process
```

CI runs `pnpm typecheck`, `pnpm exec oxlint --deny-warnings`, `pnpm exec oxfmt --check`, `pnpm test`, and
`pnpm test:e2e`. Warnings fail CI.

Per package (run from the repo root):

```bash
pnpm --filter @dpp/broker test                                   # one package
pnpm --filter @dpp/broker exec vitest run tests/unit/services/RegistryService.test.ts
pnpm --filter @dpp/broker exec vitest run -t "name of test"
pnpm --filter @dpp/processor test:e2e
pnpm --filter @dpp/broker db:generate                            # drizzle-kit migration after editing src/database/schema.ts
pnpm --filter @dpp/broker cli <args>                             # broker registry CLI (needs a build)
pnpm build:variant <name> --mode droid --algorithm live --activate   # see apps/processor/README.md
```

Tests need no running services: Postgres is PGlite (in-memory), MongoDB is `mongodb-memory-server`, and MariaDB
tests start a throwaway `mariadbd` (skipped if MariaDB is not installed, unless `REQUIRE_MARIADB=1`).

## Architecture conventions

Every app has the same layered layout and wiring:

- **DI with tsyringe.** Classes are marked `@Injectable(dependencyTokens.x)` (from `@dpp/server`) and constructor
  params use `@inject(dependencyTokens.x)`. Tokens live in each app's `src/dependencies/tokens.ts`;
  `src/dependencies/register.ts` registers runtime instances (config, db, ...) and imports the
  `clients`/`repositories`/`services` barrels so their decorators run. A new injectable must be exported from its
  folder's `index.ts` or it won't be registered.
- **Interfaces per class.** Each service/repository/client has an `I*.ts` interface; dependents type against the
  interface (often narrowed with `Pick<>`), which is what unit tests stub.
- **Controllers** extend `BaseController` and use `@Controller`/`@Get`/`@Post` decorators from `@dpp/server`; errors
  go through `this.handleError(res, e)`, with domain errors in `src/types/errors.ts`.
- **Entry points.** `src/index.ts` loads env and config (`src/config/config.ts`, zod-validated), opens the database,
  runs Drizzle migrations from `drizzle/`, registers dependencies, and starts a `GracefulServer`; resources are
  released through an `AsyncDisposableStack`. `src/app.ts` builds the Express app (used directly by integration
  tests). `polyfills.ts` must be imported first (`reflect-metadata`).
- **Imports:** `@/` maps to an app's `src/`, `@test/` to its `tests/`.
- **Tests:** `tests/unit`, `tests/integration` (`*.int.test.ts`), `tests/e2e` (`*.e2e.test.ts`, separate
  `vitest.e2e.config.mts`), helpers in `tests/utils`. Mocks are restored after each test.

Processor specifics: calculations run through an `ICalculationRunner`, either `PiscinaRunner` (worker threads,
`src/calculation/worker.ts`) or `InlineRunner` (`CALCULATION_THREADS=0`, used in tests). Variant snapshots are built
into `apps/processor/releases/<variant>/<timestamp>/` with a `current` symlink and resolve `canvas`, `piscina`, and
`pg-native` from `apps/processor/node_modules`.

Each app's README covers its configuration, CLI, and PM2 deployment.

## Design docs

Designs live in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/` (dated filenames).
Read the relevant spec before changing behavior, and keep it and the app README in sync with contract changes.
