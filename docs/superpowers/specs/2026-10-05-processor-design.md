# Processor Design

Date: 2026-10-05
Status: Draft, pending review

## Context

`dpp-processor-backend` is being rewritten as a set of smaller services:

- **Processors** (this spec): each one calculates difficulty and performance with exactly one algorithm.
- **Broker** (`apps/broker`, designed separately): routes client requests to the right processor using its own registry of processor addresses.
- **Score service** (designed after the processor): replay listener, online-score lookup, score and total pp recalculation. It calls processors through the broker.

The old backend handled every mode and algorithm in one process, through four routes that each branched on game mode × calculation method. It stored difficulty attributes in one table per mode and algorithm, with one column per attribute. That required a hand-written migration after every algorithm change.

## Goals

- One processor process serves exactly one **variant**: a freely named build that pairs one game mode with one specific build of the calculator code.
- Any number of variants, including several for the same mode, can run side by side and stay available.
- Algorithm changes never require a database migration.
- The processor only calculates. It depends on its own Postgres database and the beatmap service (`~/Projects/osu-beatmap-processor`), nothing else.
- Every service and controller can be unit tested; repositories and controllers can be integration tested without a database server.
- Calculated values match what the calculator library produces for the same inputs.

## Non-goals

- The broker and its registry, which get their own spec. The processor never reads or writes the registry.
- Everything score-related: the official osu!droid database, replay files on disk, MongoDB, the replay listener, dan courses, Discord metadata, the pp multiplier, recalculation scripts. These belong to the score service.
- Compatibility with the old API. Clients will be updated.
- Running several instances of one variant. The design does not prevent it (writes are idempotent, in-memory caches are optional), but it is not a goal here.

## Terminology

- **Variant**: a deployable processor configuration with a free-form name chosen by the operator. Its game mode and calculator code are set when it is built and recorded in its manifest; the name does not need to mention either. Examples: `droid-live`, `osu-rebalance`, `flowaim-experiment`. The broker routes by variant name.
- **Snapshot**: an immutable build output for a variant, containing the processor code with its calculator code bundled in, plus migrations and a manifest.
- **Calculator version**: a hash of the calculator code inside a snapshot. Used as the difficulty attributes cache version.

## Repository layout

The repository is a pnpm workspace:

```
apps/processor/        @dpp/processor (this spec)
apps/broker/           @dpp/broker (separate spec)
apps/score-service/    @dpp/score-service (separate spec)
packages/shared/       @dpp/shared: API request/response schemas, types, error codes
tsconfig.base.json, .oxlintrc.json, .oxfmtrc.json at the root
```

`@dpp/shared` has no build step. Its `exports` point at TypeScript source, and apps bundle it with tsdown's `deps.alwaysBundle`.

## Variants and snapshots

### Calculator sources

The processor's code imports the calculator packages by their normal npm names (`@rian8337/osu-base`, `@rian8337/osu-difficulty-calculator`, `@rian8337/osu-droid-replay-analyzer`, `@rian8337/osu-strain-graph-generator`). Type checking and tests use the npm-installed packages; the live and rebalance packages expose the same API.

At build time, those names are redirected (tsdown `alias`) to the chosen source:

- **npm, live**: the installed `@rian8337/osu-difficulty-calculator`.
- **npm, rebalance**: the installed `@rian8337/osu-rebalance-difficulty-calculator`.
- **local**: a path to an `osu-droid-module` checkout (for example a worktree on an experiment branch), using its built `packages/*/dist`, live or rebalance.

`osu-base`, the calculator, and the replay analyzer must come from the same source, and are all bundled into the snapshot, so only one copy of `osu-base` exists at runtime. `canvas` (a native dependency of the strain graph generator) and `pg-native` stay external.

### Build command

```
pnpm build:variant <variant-name> --mode droid|osu --algorithm live|rebalance [--source <path-to-osu-droid-module>] [--activate]
```

`apps/processor/scripts/build-variant.ts`:

1. Resolves the calculator, `osu-base`, and replay analyzer entry files from npm or `--source`.
2. Computes the calculator version: SHA-256 over the resolved calculator and `osu-base` entry files.
3. Runs tsdown with the aliases into a new folder `apps/processor/releases/<variant>/<timestamp>/`. Bundles both the server entry and the worker entry.
4. Copies the Drizzle migrations folder into the snapshot.
5. Writes `manifest.json`: `{ id, mode, algorithm, calculatorVersion, source, builtAt }`.
6. With `--activate`, repoints `releases/<variant>/current` at the new snapshot.

A build never modifies an existing snapshot. Changes to the `osu-droid-module` copy after a build do not affect the snapshot. `releases/` is gitignored.

### Running under PM2

One PM2 app per variant, fork mode, one instance, `script` pointing at `releases/<variant>/current/index.mjs`, with deployment settings in the app's `env`. Switching code means repointing `current` and running `pm2 restart <app>`; rolling back means repointing it at the previous snapshot. Recommended PM2 settings: `exp_backoff_restart_delay`, and `kill_timeout` slightly above the processor's shutdown timeout.

A performance-only algorithm change still changes the calculator version, so cached difficulty attributes are recalculated lazily on the next request. This is accepted; the alternative (a manual version) risks silently stale results.

## Architecture

```
Startup (index.ts)
  ├── Config            env settings, validated with zod
  └── VariantManifest   manifest.json: id, mode, algorithm, calculatorVersion, builtAt
        │ registered in the DI container
        ▼
HTTP (broker)
  │
  ▼
Controllers ── request schemas from @dpp/shared
  │
  ▼
Services
  ├── CalculationService
  ├── BeatmapService
  └── DifficultyCacheService
  │
  ├── Algorithm: DroidAlgorithm | OsuAlgorithm        (chosen from manifest mode)
  ├── CalculationRunner: PiscinaRunner | InlineRunner (thread count from Config)
  ├── Repositories: DifficultyAttributesRepository
  └── Clients: BeatmapServiceClient
```

It follows the structure of `PSB-SMAN2Tangsel/backend`: `@Injectable(token)` and `@Controller(path)` decorators, tsyringe tokens in `dependencies/tokens.ts`, `registerDependencies(container)`, a router built from controller metadata, `BaseController.handleError`, `APIError` subclasses, and `I*` interfaces for services, repositories and clients. PSB's i18n, sessions, and roles are not used.

### Units

**Config** (`IConfigService`). Reads and validates environment variables at startup; invalid or missing values stop the process with a clear message.

| Variable                                                                                | Purpose                                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `PORT`                                                                                  | HTTP port                                                 |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | the variant's own Postgres database                       |
| `BEATMAP_SERVICE_URL`, `BEATMAP_SERVICE_KEY`                                            | beatmap service                                           |
| `API_KEY`                                                                               | key the broker must send in `X-Api-Key`                   |
| `CALCULATION_THREADS`                                                                   | worker pool size; `0` runs calculations inline            |
| `CALCULATION_MAX_QUEUE`                                                                 | maximum queued worker tasks before returning `OVERLOADED` |

**VariantManifest**. Loaded once from the snapshot's `manifest.json` (located relative to `import.meta.url`). Provides the variant id, mode, and calculator version. When running from source (development, tests), there is no `manifest.json`; the manifest is constructed from the `DEV_MODE` (`droid`/`osu`) and `DEV_ALGORITHM` (`live`/`rebalance`) environment variables and the installed npm packages. These variables are ignored when a `manifest.json` exists.

**Algorithm** (`DroidAlgorithm`, `OsuAlgorithm`). The only code that calls the calculator packages. Used by both the main thread and workers. Methods:

- `decodeBeatmap(osuFile)`: decodes a `.osu` file for this mode.
- `retainDifficultyAdjustmentMods(mods)`: keeps only mods that affect difficulty.
- `calculateDifficulty(beatmap, mods)`: returns cacheable difficulty attributes.
- `calculatePerformance(attributes, score)`: returns the performance attributes from the library's `PerformanceCalculator.calculate()` (`IDroidPerformanceAttributes` / `IOsuPerformanceAttributes`, plain interfaces) and the resolved score parameters.
- `analyzeReplay(replay, beatmap)`: returns replay-derived score parameters (including tap and slider-cheese penalties) and replay information (hit error, slider tick and slider end information).
- `calculateStrainPeaks(beatmap, mods)`: returns strain peaks for chart rendering.

**CalculationRunner** (`ICalculationRunner`). Runs heavy work off the main thread: difficulty calculation on cache miss, replay analysis, strain chart rendering. Task inputs and outputs are serializable (the `.osu` text, serialized mods, replay bytes). `PiscinaRunner` uses a piscina pool with `CALCULATION_THREADS` workers and `CALCULATION_MAX_QUEUE`; the worker file is resolved relative to the snapshot. Workers keep a small cache of decoded beatmaps keyed by beatmap hash. `InlineRunner` runs the same task functions in-process and is used in tests and when `CALCULATION_THREADS=0`.

**BeatmapServiceClient** (`IBeatmapServiceClient`). HTTP client for the beatmap service's `getbeatmap` and `getbeatmapfile` routes, with a timeout of about 10 seconds.

**BeatmapService** (`IBeatmapService`). Resolves a beatmap reference (`{ id }`, `{ hash }`, or `{ file }`) to metadata and `.osu` text. Caches metadata and files in memory for a few minutes; the beatmap service is the authority. An uploaded `{ file }` gets its hash computed locally and is never stored in the database.

**DifficultyCacheService** (`IDifficultyCacheService`). Read-through cache for difficulty attributes, keyed by beatmap hash, canonical mods key, and calculator version:

1. Bounded in-memory cache (least recently used, capped by entry count).
2. On miss, `DifficultyAttributesRepository`.
3. On miss, calculate through `CalculationRunner`, then insert with `ON CONFLICT DO NOTHING`.
4. Concurrent misses for the same key share one in-flight calculation.

Uploaded beatmaps (`{ file }`) bypass the cache entirely: they are always calculated and never stored.

**DifficultyAttributesRepository** (`IDifficultyAttributesRepository`). Drizzle queries on `difficulty_attributes`. Accepts the generic Drizzle Postgres database type so production (node-postgres) and tests (PGlite) share the code.

**CalculationService** (`ICalculationService`). Orchestrates each request: resolve beatmap, get difficulty attributes, apply replay analysis if any, calculate performance, render a strain chart if requested.

## Data layer

There is no beatmap table. Difficulty attributes depend only on the `.osu` file contents, the mods, and the calculator code, so the cache is keyed by beatmap hash. When a beatmap is updated, its hash changes and lookups miss. Rows for old hashes remain until pruned.

```sql
difficulty_attributes (
  beatmap_hash        char(32)    not null,
  mods                text        not null,
  calculator_version  text        not null,
  attributes          jsonb       not null,
  created_at          timestamptz not null default now(),
  primary key (beatmap_hash, mods, calculator_version)
)
```

- **Canonical mods key**: difficulty-adjusting mods only, sorted by acronym, each mod's settings with sorted keys, serialized as a JSON string. `[HD, DT]` and `[DT, HD]` produce the same key.
- **`attributes`**: the calculator's cacheable difficulty attributes, typed with `jsonb().$type<...>()`. Not validated on read, since a row only matches when its calculator version equals the running code's.
- **`calculator_version`** is part of the primary key, so rolling back to an earlier snapshot finds its rows again.
- **Migrations**: generated by drizzle-kit into `apps/processor/drizzle/`, copied into each snapshot, and applied at startup with Drizzle's migrator. A new variant needs only `CREATE DATABASE`.
- **Pruning**: a `prune` CLI command deletes rows whose `calculator_version` differs from the current snapshot's. It is only run manually.

## API

All bodies are JSON; binary data (replays, strain chart PNGs) is base64. The body size limit is 1 MB. Request and response schemas and types live in `@dpp/shared`. Every route except `GET /info` requires the `X-Api-Key` header.

Common shapes:

- `beatmap`: one of `{ id: number }`, `{ hash: string }`, `{ file: string }` (`.osu` text).
- `mods`: `SerializedMod[]`.
- `score` (all optional): `n300`, `n100`, `n50`, `nmiss`, `combo`, `sliderTicksMissed`, `sliderEndsDropped`, `totalScore`, `tapPenalty`, `sliderCheesePenalty`. Missing values default to a full combo at 100% accuracy; combo is clamped to the beatmap's maximum.

| Route                      | Body                                               | Response                                                   |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `GET /info`                | —                                                  | `{ id, mode, algorithm, calculatorVersion, builtAt }`      |
| `POST /difficulty`         | `{ beatmap, mods, strainChart?: boolean }`         | `{ difficulty, strainChart? }`                             |
| `POST /performance`        | `{ beatmap, mods, score?, strainChart?: boolean }` | `{ difficulty, performance, score, strainChart? }`         |
| `POST /performance/replay` | `{ replay, mods?, score?, strainChart?: boolean }` | `{ difficulty, performance, score, replay, strainChart? }` |

- `difficulty`: cacheable difficulty attributes, with `mods` set to the requested mods.
- `performance`: the performance attributes returned by the calculator library.
- `score` in responses: the parameters actually used, after defaults, clamping, and replay analysis.
- `/performance/replay`: the beatmap is taken from the hash in the replay. `mods` and `score` default to the values derived from the replay; when given, they override them. The score service uses the overrides for old or mismatched replays, as the old online-score route did.

Data flow for `POST /performance`:

1. The controller validates the body.
2. `CalculationService` resolves the beatmap through `BeatmapService`.
3. `DifficultyCacheService` returns attributes, calculating through the runner only on a miss.
4. `Algorithm.calculatePerformance` runs inline. A requested strain chart is rendered through the runner.
5. The controller sends the response.

## Errors and runtime behavior

Error responses are `{ error: { code, message } }`. Codes are defined in `@dpp/shared`.

| Status | Code                          | Cause                                                 |
| ------ | ----------------------------- | ----------------------------------------------------- |
| 400    | `INVALID_REQUEST`             | body failed validation; `message` has the first issue |
| 401    | `UNAUTHORIZED`                | missing or wrong API key                              |
| 404    | `BEATMAP_NOT_FOUND`           | beatmap service returned 404                          |
| 422    | `INVALID_BEATMAP`             | `.osu` text could not be decoded                      |
| 422    | `INVALID_REPLAY`              | replay could not be decoded or analyzed               |
| 503    | `BEATMAP_SERVICE_UNAVAILABLE` | beatmap service timed out or failed                   |
| 503    | `OVERLOADED`                  | worker queue is full                                  |
| 500    | `CALCULATION_FAILED`          | calculator threw, or a worker crashed during the task |
| 500    | `INTERNAL_ERROR`              | anything else; logged, details not sent               |

- Database read failures in the cache are treated as misses; write failures are logged and the result is still returned.
- Piscina replaces crashed workers; only the affected task fails.
- **Startup order** (fail fast, exit non-zero on any failure): config, manifest, database connection, migrations, worker pool, HTTP listen.
- **Shutdown** on SIGINT/SIGTERM: stop accepting connections, let in-flight requests and worker tasks finish, close the pool, close the database. Force exit after about 10 seconds.
- **Logging**: `console`, prefixed with `[<variant-id>]`. API keys and request bodies are never logged.

## Testing

```
apps/processor/tests/
  unit/          services, controllers, algorithms, middleware, build script
  integration/   repositories and controllers against PGlite
  e2e/           a built snapshot started as a real process
  fixtures/      beatmaps/*.osu, replays/*.odr
  setup/ mocks/ utils/
```

- **Unit** (mocked dependencies, child DI container per test, following PSB):
    - Services: cache hit, miss, shared in-flight calculation, database error fallbacks, score parameter defaults and clamping, error mapping.
    - Controllers (supertest): validation, status codes, error codes, API key middleware.
    - Algorithms: results on fixture beatmaps equal calling the calculator directly.
    - Canonical mods key: order-independent, drops non-difficulty mods.
    - Build script: manifest contents, calculator version hashing, snapshot immutability.
- **Integration** (PGlite with real migrations, a fresh database per test file, stub beatmap service client serving fixtures): repository queries and conflict handling; controllers through the full stack using `InlineRunner`.
- **End-to-end** (`pnpm test:e2e`): build a variant from npm packages, start it, call every route, check SIGTERM shutdown. This is the only place `PiscinaRunner` is exercised.
- **`@dpp/shared`**: schema tests for valid and invalid request bodies.
- Fixtures: beatmaps copied from `osu-droid-module` test files. Replays to be provided: at least one v3+ replay; an older one if available.
- Commands: `pnpm test` (unit and integration), `pnpm test:e2e`, `pnpm test:coverage`.

## To verify during planning

- Whether performance calculation needs the decoded beatmap (the old code called `applyToOptions(beatmap, ...)`). If so, it moves into the runner.
- That TypeScript 7, tsdown, and vitest emit decorator metadata correctly for tsyringe parameter injection. Spike this first.
- That tsdown can alias the calculator packages to an `osu-droid-module` checkout while bundling a single copy of `osu-base`.
