# Processor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/processor`, a service that calculates osu!droid / osu!standard difficulty and performance for exactly one variant (one game mode plus one specific build of the calculator code), with a Postgres-backed difficulty attributes cache, a worker pool, and a build command that produces immutable per-variant snapshots.

**Architecture:** Express 5 controllers → services → (algorithm adapter, worker-pool runner, Drizzle repository, beatmap service HTTP client), wired with tsyringe like `~/Projects/PSB-SMAN2Tangsel/backend`. The calculator packages are imported by their npm names and redirected at build time (tsdown `alias`) to npm or a local `osu-droid-module` checkout; each build is written to `releases/<variant>/<timestamp>/` with a `manifest.json` whose calculator hash versions the cache. Types come from the osu packages wherever they exist (`Modes`, `SerializedMod`, `IDifficultyAttributes`, `CacheableDifficultyAttributes`, the performance attribute interfaces, `HitErrorInformation`, `SliderNestedHitObjectInformation`).

**Tech Stack:** Node.js 24, pnpm 12.9.1 workspace, TypeScript 7.0.2, tsdown 0.23, vitest 5, Express 5, zod 4, tsyringe 4, Drizzle ORM 0.45 + drizzle-kit 0.31, node-postgres, PGlite (tests), piscina 5, `@rian8337/osu-*` (the beta release in which `PerformanceCalculator.calculate` returns performance attributes).

**Spec:** `docs/superpowers/specs/2026-10-05-processor-design.md`

## Prerequisite

An `osu-droid-module` beta in which:

- `@rian8337/osu-difficulty-calculator` exports the interfaces `IPerformanceAttributes` (`total`, `effectiveMissCount`), `IDroidPerformanceAttributes` (adds `aim`, `tap`, `accuracy`, `flashlight`, `reading`, `tapPenalty`, `deviation`, `tapDeviation`, `sliderCheesePenalty`), and `IOsuPerformanceAttributes` (adds `aim`, `speed`, `accuracy`, `flashlight`, `reading`). They are plain interfaces, so they survive structured cloning.
- `PerformanceCalculator<TDifficultyAttributes, TPerformanceAttributes>.calculate(options)` returns the performance attributes. `DroidPerformanceCalculator` returns `IDroidPerformanceAttributes`; `OsuPerformanceCalculator` returns `IOsuPerformanceAttributes`.
- The rebalance package does the same.

The change was made in `osu-droid-module` and verified on 2026-10-06 (typecheck, lint, the packages' tests, and value-for-value parity with the previous calculators across live/rebalance, both modes, 9 beatmaps, 3 mod sets, and 3 scores). It must be published before Task 1; Task 1 installs it and stops if it is missing.

## Global Constraints

- All `@rian8337/osu-*` packages use one exact version (the prerequisite beta) across the workspace, saved with `--save-exact`.
- Use the osu packages' own types instead of re-declaring them: `Modes` (members are `Modes.Droid` and `Modes.Osu`), `SerializedMod`, `ModMap`, `IDifficultyAttributes`, `CacheableDifficultyAttributes`, `IPerformanceAttributes` (and its droid/osu interfaces), `HitErrorInformation`, `SliderNestedHitObjectInformation`. No string literals `"droid"`/`"osu"` in TypeScript source outside schemas parsing external input.
- The processor depends only on its own Postgres database and the beatmap service. No MongoDB, MySQL, official database, or replay files on disk.
- JSON request body limit: 1 MB.
- Auth: `X-Api-Key` header on every route except `GET /info`.
- Error responses: `{ "error": { "code": <ErrorCode>, "message": <string> } }`, codes from `@dpp/shared`.
- Beatmap service calls time out after 10 000 ms.
- Shutdown force-exits after 10 000 ms.
- Logs are prefixed `[<variant-id>]`. Never log API keys or request bodies.
- Calculator version = first 16 hex characters of SHA-256 over the calculator entry file followed by the `osu-base` entry file.
- Snapshots live in `apps/processor/releases/<variant>/<YYYYMMDD-HHMMSS>/`; `current` is a relative symlink to one snapshot. Variant names match `^[a-z0-9][a-z0-9-]*$`.
- Only Node built-ins, `canvas`, `piscina`, and `pg-native` stay external in builds; everything else is bundled.
- Every file that uses decorators must be inside `apps/processor/tsconfig.json`'s `include` (otherwise vitest/tsdown won't apply `experimentalDecorators`/`emitDecoratorMetadata`). This was verified in a spike.
- Path alias `@/` = `apps/processor/src/`, `@test/` = `apps/processor/tests/`. Files under `scripts/` and `src/manifest/calculatorVersion.ts` must not use the alias (they run under Node's type stripping).
- Tests build `ModMap`s from mod instances (`modMap(new ModNoFail(), new ModDoubleTime())`) wherever the code under test takes mods as a `ModMap` or produces serialized mods from one. Request bodies in tests stay JSON (`{ acronym }` objects), since that is the wire format under test.
- A function whose only meaningful input is an instance of one of our own classes is a method on that class (`APIError.toResponse()`, `AlgorithmInputError.toApiError()`, `DatabaseConnection.migrate()`). A function that only configures behavior around one instance is a class instead (`CalculationTaskHandler`). Functions over plain data (interfaces, strings, enums) or third-party objects stay functions.
- Anything that holds a resource (connection pools, worker pools, HTTP servers, PGlite databases, temporary directories, child processes) is released through `Disposable`/`AsyncDisposable`: `using`/`await using`, or an `AsyncDisposableStack` when resources are created in steps. Node 24, `pg` pools wrapped by `DatabaseConnection`, piscina, `http.Server`, PGlite, and `fs.promises.mkdtempDisposable` all support this (verified); `PGLiteSocketServer` does not, so it is registered with `stack.defer(() => server.stop())`.
- No type assertions (`as`) in source or tests unless a comment explains why the types cannot express the case.
- Commit messages: a short imperative sentence (the repository's existing style), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use `git reset HEAD~n`; the user may run git commands concurrently.

## Review Focus

1. **Mods that change pp but not difficulty.** Attributes are cached under difficulty-affecting mods only, but NoFail lowers pp (verified: droid 56.8 → 51.1, osu 93.0 → 83.7 on identical attributes). Requested mods must be put back before performance is calculated. Test in Task 11.
2. **Unknown or duplicate mod acronyms.** `ModUtil.deserializeMods` silently drops unknown acronyms and merges duplicates (verified). A request with `[{ "acronym": "ZZ" }]` must get 400 `INVALID_REQUEST`, not a NoMod result. Test in Task 11.
3. **Beatmap updated between the metadata and file fetches, and UTF-8 BOMs.** If the downloaded file's MD5 differs from the metadata hash, nothing may be cached under the wrong hash; respond 503 `BEATMAP_SERVICE_UNAVAILABLE` and drop the cached metadata. A file with a BOM must not trigger a false mismatch, so the hash is computed over bytes, not decoded text. Test in Task 9.
4. **Malformed JSON, oversized bodies, unknown routes.** These must return the JSON error shape, not Express's HTML pages. Test in Task 12.
5. **Hit counts that don't add up.** Counts summing above the object count → 400 `INVALID_REQUEST`; below → the remainder counts as misses; combo above the maximum is clamped. Test in Task 4.

## Spec clarifications made while planning

- **Performance values are the attributes returned by the library's `PerformanceCalculator.calculate()`** (the prerequisite release), instead of being read off the calculator. Task 4 updates the spec.
- **Running from source uses the live npm calculator only.** Redirecting packages needs the bundler, so `DEV_ALGORITHM` is dropped; `DEV_MODE` remains. Task 7 updates the spec.
- **`pg-native` is removed.** The old backend imported `Pool` from `pg` and never used the native binding.
- **Rebalance-only response extras** (`estimatedUnstableRate`, `estimatedSpeedUnstableRate`, `calculatedUnstableRate`) are not produced. They were derived values (`deviation * 10`, `tapDeviation * 10`, replay unstable rate / clock rate) that callers can compute from `performance.deviation`, `performance.tapDeviation`, and `replay.hitError`.
- **The two-hand check is dropped.** The old code ran it for droid rebalance, but its result never reached the performance calculation.
- **The difficulty attributes primary key starts with `calculator_version`.** Lookups match all three columns, so the order costs nothing, and pruning by version can use the index's prefix.
- **The replay `mods` field overrides the replay's mods for every replay version** and is required when the replay does not record its mods (v1/v2). Old replays may be outdated relative to their score; the override corrects them at least partially.

## File Structure

```
apps/processor/
  package.json, tsconfig*.json, tsdown.config.ts, vitest.config.mts, vitest.e2e.config.mts, drizzle.config.ts
  drizzle/                         generated SQL migrations
  scripts/
    build-variant.ts               CLI: build a variant snapshot
    lib/buildOptions.ts            tsdown options shared by `pnpm build` and build-variant
    lib/variant.ts                 argument parsing, source resolution, manifest writing, activation
  src/
    index.ts                       startup and shutdown
    app.ts                         Express app
    router.ts                      routes from controller metadata
    env.ts                         (exists) .env loading
    algorithms/
      types.ts                     Algorithm interface and result types
      errors.ts                    AlgorithmInputError
      score.ts                     resolveScore, toCalculationOptions
      BaseAlgorithm.ts             shared calculator logic
      DroidAlgorithm.ts, OsuAlgorithm.ts, createAlgorithm.ts
    calculation/
      tasks.ts                     worker task types + CalculationTaskHandler
      outcome.ts                   unwrapOutcome
      ICalculationRunner.ts, BaseRunner.ts, InlineRunner.ts, PiscinaRunner.ts
      worker.ts                    piscina worker entry
      strainChartColor.ts
    cli/prune.ts                   delete attributes from other calculator versions
    clients/                       IBeatmapServiceClient.ts, BeatmapServiceClient.ts, index.ts
    config/config.ts               Config + loadConfig
    controllers/                   BaseController.ts, InfoController.ts, DifficultyController.ts, PerformanceController.ts, index.ts
    database/                      schema.ts, types.ts, DatabaseConnection.ts
    decorators/                    injectable.ts, controller.ts, routes.ts
    dependencies/                  container.ts, tokens.ts, register.ts
    manifest/                      manifest.ts, calculatorVersion.ts
    middleware/                    apiKey.ts, errorHandlers.ts
    repositories/                  IDifficultyAttributesRepository.ts, DifficultyAttributesRepository.ts, index.ts
    runtime/                       logging.ts, shutdown.ts
    services/                      IBeatmapService.ts, BeatmapService.ts, IDifficultyCacheService.ts, DifficultyCacheService.ts, ICalculationService.ts, CalculationService.ts, index.ts
    types/                         env.ts (exists), errors.ts
    utils/                         LruCache.ts, md5.ts, modsKey.ts
    validators/parseBody.ts
  tests/
    setup.ts
    fixtures/beatmaps/*.osu, fixtures/replays/ (v3.odr + v3.osu, provided by the user), fixtures/workers/fake-worker.mjs
    utils/                         fixtures.ts, mods.ts, attributes.ts, database.ts, beatmaps.ts, container.ts
    unit/, integration/, e2e/
packages/shared/
  src/errors.ts, src/schemas.ts, src/types.ts, src/index.ts
  tests/schemas.test.ts, vitest.config.mts
```

---

### Task 1: Dependencies, configuration, and test harness

**Files:**

- Modify: `apps/processor/package.json` (via pnpm commands and scripts), `apps/processor/tsconfig.json`, `apps/processor/tsconfig.typecheck.json`, `apps/processor/vitest.config.mts`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `.gitignore`, `package.json`
- Create: `apps/processor/tests/setup.ts`, `apps/processor/tests/utils/fixtures.ts`, `apps/processor/tests/utils/mods.ts`, `apps/processor/tests/fixtures/beatmaps/*.osu`, `apps/processor/tests/fixtures/replays/.gitkeep`
- Test: `apps/processor/tests/unit/harness.test.ts`

**Interfaces:**

- Produces:
    - `readBeatmapFixture(name: BeatmapFixtureName): string`, `beatmapFixtures` (`loveLetter` id 1, `highPowered` id 2, `discoprince` id 3), `beatmapFixtureNames`, `md5Of(content: string | Buffer): string`, `replayFixture` (`{ replay: string; beatmap: string }` paths), `hasReplayFixture: boolean`
    - `modMap(...mods: Mod[]): ModMap`

- [ ] **Step 1: Install the osu packages and check the prerequisite**

Run from the repository root:

```bash
pnpm --filter @dpp/processor add --save-exact @rian8337/osu-base@beta @rian8337/osu-difficulty-calculator@beta @rian8337/osu-rebalance-difficulty-calculator@beta @rian8337/osu-droid-replay-analyzer@beta @rian8337/osu-strain-graph-generator@beta
grep -n '"@rian8337/' apps/processor/package.json
grep -nE "^interface I(Droid|Osu)?PerformanceAttributes|calculate\(options\?: PerformanceCalculationOptions\): T" apps/processor/node_modules/@rian8337/osu-difficulty-calculator/typings/index.d.ts
```

Expected: all five packages pinned to the same exact version; the typings declare the three performance attribute interfaces, and `calculate` on the performance calculators returns them. **If the interfaces are missing, stop and report that the prerequisite release is not available.** If the five versions differ, rerun the first command with that exact version instead of `@beta`. If pnpm refuses a package because of its minimum release age, add that exact `name@version` under a `minimumReleaseAgeExclude:` list in `pnpm-workspace.yaml` and rerun.

- [ ] **Step 2: Adjust the remaining dependencies**

```bash
pnpm --filter @dpp/processor remove cors @types/cors @types/express-form-data pg-native
pnpm --filter @dpp/processor add canvas@^3.1.0 piscina@^5.3.2
pnpm --filter @dpp/processor add -D drizzle-kit@^0.31.11 @electric-sql/pglite@^0.5.8 @electric-sql/pglite-socket@^0.2.11 @types/pg@^8.23.1 @vitest/coverage-v8@^5.0.3
```

Replace `pnpm-workspace.yaml` with:

```yaml
packages:
    - apps/*
    - packages/*

allowBuilds:
    canvas: true
```

Run: `pnpm install`
Expected: completes; `apps/processor/node_modules/canvas` exists.

- [ ] **Step 3: Scripts**

In `apps/processor/package.json`, set `"scripts"` to:

```json
{
    "build": "tsdown",
    "dev": "tsdown --watch --on-success \"node dist/index.mjs\"",
    "typecheck": "tsc -p tsconfig.typecheck.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "vitest run -c vitest.e2e.config.mts",
    "db:generate": "drizzle-kit generate",
    "build:variant": "node scripts/build-variant.ts",
    "prune": "node dist/prune.mjs"
}
```

In the root `package.json`, add to `"scripts"`:

```json
"build:variant": "pnpm --filter @dpp/processor run build:variant",
"test:e2e": "pnpm --filter @dpp/processor run test:e2e"
```

- [ ] **Step 4: TypeScript configuration**

In `tsconfig.base.json`, replace the commented `// "lib": [],` line with (keeping the trailing comment):

```json
    "lib": ["es2022", "esnext.disposable"],              /* Specify a set of bundled library declaration files that describe the target runtime environment. */
```

Replace `apps/processor/tsconfig.json` with:

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "rootDir": "./",
        "outDir": "./dist",
        "noEmit": true,
        "allowImportingTsExtensions": true,
        "paths": {
            "@/*": ["./src/*"],
            "@test/*": ["./tests/*"]
        }
    },
    "include": [
        "src",
        "tests",
        "scripts",
        "drizzle.config.ts",
        "tsdown.config.ts",
        "vitest.config.mts",
        "vitest.e2e.config.mts"
    ]
}
```

Replace `apps/processor/tsconfig.typecheck.json` with:

```json
{
    "extends": "./tsconfig.json"
}
```

- [ ] **Step 5: Vitest configuration**

Replace `apps/processor/vitest.config.mts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@": "/src", "@test": "/tests" } },
    test: {
        include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        setupFiles: ["./tests/setup.ts"],
        maxWorkers: process.env.CI ? 1 : undefined,
        silent: "passed-only",
        passWithNoTests: true,
        // Undo vi.spyOn spies (e.g. on console or a shared algorithm) after each test.
        restoreMocks: true,
        coverage: {
            provider: "v8",
            include: ["src/**"],
            reportsDirectory: "./coverage",
        },
    },
});
```

Create `apps/processor/tests/setup.ts`:

```ts
// tsyringe needs the Reflect metadata polyfill before any decorated class is loaded.
import "reflect-metadata";
```

- [ ] **Step 6: Fixtures and test utilities**

```bash
SRC=/root/Projects/osu-droid-module/packages/osu-rebalance-difficulty-calculator/tests/files/beatmaps
DST=apps/processor/tests/fixtures/beatmaps
mkdir -p "$DST" apps/processor/tests/fixtures/replays
cp "$SRC/YOASOBI - Love Letter (ohm002) [Please accept my overflowing emotions.].osu" "$DST/love-letter.osu"
cp "$SRC/sphere - HIGH POWERED (TV Size) (Azunyan-) [POWER OVERLOAD EXPERT].osu" "$DST/high-powered.osu"
cp "$SRC/Kenji Ninuma - DISCOPRINCE (peppy) [Normal].osu" "$DST/discoprince.osu"
touch apps/processor/tests/fixtures/replays/.gitkeep
```

Create `apps/processor/tests/utils/fixtures.ts`:

```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixturesDirectory = fileURLToPath(
    new URL("../fixtures/", import.meta.url),
);

/**
 * Beatmap fixtures, with the fake beatmap IDs the stub beatmap service uses for them.
 */
export const beatmapFixtures = {
    loveLetter: { id: 1, file: "beatmaps/love-letter.osu" },
    highPowered: { id: 2, file: "beatmaps/high-powered.osu" },
    discoprince: { id: 3, file: "beatmaps/discoprince.osu" },
} as const;

export type BeatmapFixtureName = keyof typeof beatmapFixtures;

// Object.keys returns string[]; the keys of a literal `as const` object are exactly BeatmapFixtureName.
export const beatmapFixtureNames = Object.keys(
    beatmapFixtures,
) as BeatmapFixtureName[];

/**
 * Reads a beatmap fixture as text.
 */
export function readBeatmapFixture(name: BeatmapFixtureName): string {
    return readFileSync(fixturesDirectory + beatmapFixtures[name].file, "utf8");
}

/**
 * Computes the MD5 hash of a string (as UTF-8) or buffer.
 */
export function md5Of(content: string | Buffer): string {
    return createHash("md5").update(content).digest("hex");
}

/**
 * A v3+ replay and the beatmap it was played on. Provided by the user; tests that need it are skipped until both
 * files exist.
 */
export const replayFixture = {
    replay: fixturesDirectory + "replays/v3.odr",
    beatmap: fixturesDirectory + "replays/v3.osu",
};

export const hasReplayFixture =
    existsSync(replayFixture.replay) && existsSync(replayFixture.beatmap);
```

Create `apps/processor/tests/utils/mods.ts`:

```ts
import { ModMap, type Mod } from "@rian8337/osu-base";

/**
 * Builds a `ModMap` from mod instances, e.g. `modMap(new ModHidden(), new ModDoubleTime())`.
 */
export function modMap(...mods: Mod[]): ModMap {
    const map = new ModMap();

    for (const mod of mods) {
        map.set(mod);
    }

    return map;
}
```

- [ ] **Step 7: Ignore build outputs**

Append to the root `.gitignore`:

```
# Processor snapshots and coverage
releases
coverage
```

- [ ] **Step 8: Write the harness test**

Create `apps/processor/tests/unit/harness.test.ts`:

```ts
import { ModDoubleTime, ModHidden } from "@rian8337/osu-base";
import {
    beatmapFixtureNames,
    md5Of,
    readBeatmapFixture,
} from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
    it("loads reflect-metadata", () => {
        expect(typeof Reflect.getMetadata).toBe("function");
    });

    it.each(beatmapFixtureNames)("reads the %s fixture", (name) => {
        const content = readBeatmapFixture(name);

        expect(content.startsWith("osu file format")).toBe(true);
        expect(md5Of(content)).toMatch(/^[0-9a-f]{32}$/);
    });

    it("builds mod maps", () => {
        expect(
            modMap(new ModHidden(), new ModDoubleTime()).serializeMods(),
        ).toEqual([{ acronym: "HD" }, { acronym: "DT" }]);
    });
});
```

- [ ] **Step 9: Run tests, typecheck, lint**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck && pnpm lint`
Expected: 5 tests pass; typecheck and lint exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A apps/processor pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json .gitignore
git commit -m "Set up processor dependencies and test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared API contract (`@dpp/shared`)

**Files:**

- Modify: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/errors.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/types.ts`, `packages/shared/vitest.config.mts`
- Test: `packages/shared/tests/schemas.test.ts`

**Interfaces:**

- Produces (all exported from `@dpp/shared`):
    - `errorCodes`, `type ErrorCode`, `interface ErrorResponse`
    - Schemas: `serializedModSchema` (satisfies `z.ZodType<SerializedMod>`), `modsSchema`, `beatmapReferenceSchema`, `scoreParametersSchema`, `difficultyRequestSchema`, `performanceRequestSchema`, `replayPerformanceRequestSchema`
    - Types: `BeatmapReference`, `ScoreParameters`, `DifficultyRequest`, `PerformanceRequest`, `ReplayPerformanceRequest`, `CalculatorAlgorithm` (`"live" | "rebalance"`), `ResolvedScore`, `ReplayAttributes`, `InfoResponse`, `DifficultyResponse<TAttributes>`, `PerformanceResponse<TAttributes, TPerformance>`, `ReplayPerformanceResponse<TAttributes, TPerformance>`
- The shared package imports osu package **types only** (`import type`), so it has no runtime osu dependency.

- [ ] **Step 1: Package setup**

The osu packages must be the exact version pinned in `apps/processor/package.json`:

```bash
V=$(node -p "require('./apps/processor/package.json').dependencies['@rian8337/osu-base']")
pnpm --filter @dpp/shared add zod@^4.6.5
pnpm --filter @dpp/shared add --save-exact "@rian8337/osu-base@$V" "@rian8337/osu-difficulty-calculator@$V" "@rian8337/osu-droid-replay-analyzer@$V"
pnpm --filter @dpp/shared add -D vitest@^5.0.3
```

In `packages/shared/package.json`, set `"scripts"` to:

```json
{
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
}
```

Replace `packages/shared/tsconfig.json` with:

```json
{
    "extends": "../../tsconfig.base.json",
    "include": ["src", "tests", "vitest.config.mts"]
}
```

Create `packages/shared/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        silent: "passed-only",
    },
});
```

- [ ] **Step 2: Write the failing tests**

Create `packages/shared/tests/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    difficultyRequestSchema,
    errorCodes,
    performanceRequestSchema,
    replayPerformanceRequestSchema,
} from "../src";

describe("difficultyRequestSchema", () => {
    it("accepts each beatmap reference form and defaults optional fields", () => {
        for (const beatmap of [
            { id: 1 },
            { hash: "0123456789abcdef0123456789abcdef" },
            { file: "osu file format v14" },
        ]) {
            expect(difficultyRequestSchema.parse({ beatmap })).toEqual({
                beatmap,
                mods: [],
                strainChart: false,
            });
        }
    });

    it("rejects a reference with more than one form", () => {
        expect(
            difficultyRequestSchema.safeParse({
                beatmap: { id: 1, hash: "0123456789abcdef0123456789abcdef" },
            }).success,
        ).toBe(false);
    });

    it("rejects malformed hashes, non-positive IDs, empty acronyms, and unknown fields", () => {
        expect(
            difficultyRequestSchema.safeParse({ beatmap: { hash: "abc" } })
                .success,
        ).toBe(false);
        expect(
            difficultyRequestSchema.safeParse({ beatmap: { id: 0 } }).success,
        ).toBe(false);
        expect(
            difficultyRequestSchema.safeParse({
                beatmap: { id: 1 },
                mods: [{ acronym: "" }],
            }).success,
        ).toBe(false);
        expect(
            difficultyRequestSchema.safeParse({
                beatmap: { id: 1 },
                gamemode: "droid",
            }).success,
        ).toBe(false);
    });

    it("accepts long acronyms and mods with settings", () => {
        const request = difficultyRequestSchema.parse({
            beatmap: { id: 1 },
            mods: [
                { acronym: "REPLAYV6" },
                { acronym: "DT", settings: { rateMultiplier: 1.3 } },
            ],
        });

        expect(request.mods).toEqual([
            { acronym: "REPLAYV6" },
            { acronym: "DT", settings: { rateMultiplier: 1.3 } },
        ]);
    });
});

describe("performanceRequestSchema", () => {
    it("defaults score to an empty object", () => {
        expect(
            performanceRequestSchema.parse({ beatmap: { id: 1 } }).score,
        ).toEqual({});
    });

    it("rejects negative or fractional hit counts and non-positive penalties", () => {
        for (const score of [{ n300: -1 }, { n100: 1.5 }, { tapPenalty: 0 }]) {
            expect(
                performanceRequestSchema.safeParse({
                    beatmap: { id: 1 },
                    score,
                }).success,
            ).toBe(false);
        }
    });
});

describe("replayPerformanceRequestSchema", () => {
    it("requires base64 replay data", () => {
        expect(
            replayPerformanceRequestSchema.safeParse({ replay: "not base64!" })
                .success,
        ).toBe(false);
        expect(
            replayPerformanceRequestSchema.parse({ replay: "AAEC" }),
        ).toEqual({
            replay: "AAEC",
            strainChart: false,
        });
    });

    it("keeps the mods and score overrides optional, without defaults", () => {
        const request = replayPerformanceRequestSchema.parse({
            replay: "AAEC",
        });

        expect(request.mods).toBeUndefined();
        expect(request.score).toBeUndefined();
    });
});

describe("errorCodes", () => {
    it("lists every code the processor can return", () => {
        expect(errorCodes).toEqual([
            "INVALID_REQUEST",
            "UNAUTHORIZED",
            "BEATMAP_NOT_FOUND",
            "INVALID_BEATMAP",
            "INVALID_REPLAY",
            "BEATMAP_SERVICE_UNAVAILABLE",
            "OVERLOADED",
            "CALCULATION_FAILED",
            "INTERNAL_ERROR",
        ]);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/shared test`
Expected: FAIL; `difficultyRequestSchema` and the others are not exported.

- [ ] **Step 4: Implement**

Create `packages/shared/src/errors.ts`:

```ts
/**
 * Machine-readable error codes returned by the processor.
 */
export const errorCodes = [
    "INVALID_REQUEST",
    "UNAUTHORIZED",
    "BEATMAP_NOT_FOUND",
    "INVALID_BEATMAP",
    "INVALID_REPLAY",
    "BEATMAP_SERVICE_UNAVAILABLE",
    "OVERLOADED",
    "CALCULATION_FAILED",
    "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/**
 * The body of every error response.
 */
export interface ErrorResponse {
    readonly error: {
        readonly code: ErrorCode;
        readonly message: string;
    };
}
```

Create `packages/shared/src/schemas.ts`:

```ts
import type { SerializedMod } from "@rian8337/osu-base";
import { z } from "zod";

/**
 * A mod in osu-base's serialized form. Whether the acronym is a known mod is checked by the processor.
 */
export const serializedModSchema = z.strictObject({
    acronym: z.string().min(1),
    settings: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<SerializedMod>;

/**
 * A list of mods, shared by every request that takes mods.
 */
export const modsSchema = z.array(serializedModSchema);

/**
 * Identifies a beatmap by ID, MD5 hash, or `.osu` file contents.
 */
export const beatmapReferenceSchema = z.union([
    z.strictObject({ id: z.number().int().positive() }),
    z.strictObject({ hash: z.string().regex(/^[0-9a-f]{32}$/) }),
    z.strictObject({ file: z.string().min(1) }),
]);

const hitCount = z.number().int().nonnegative();

/**
 * Score values that alter a performance calculation. Every field is optional.
 */
export const scoreParametersSchema = z.strictObject({
    n300: hitCount.optional(),
    n100: hitCount.optional(),
    n50: hitCount.optional(),
    nmiss: hitCount.optional(),
    combo: hitCount.optional(),
    sliderTicksMissed: hitCount.optional(),
    sliderEndsDropped: hitCount.optional(),
    totalScore: hitCount.optional(),
    tapPenalty: z.number().positive().optional(),
    sliderCheesePenalty: z.number().positive().optional(),
});

export const difficultyRequestSchema = z.strictObject({
    beatmap: beatmapReferenceSchema,
    mods: modsSchema.default([]),
    strainChart: z.boolean().default(false),
});

export const performanceRequestSchema = z.strictObject({
    beatmap: beatmapReferenceSchema,
    mods: modsSchema.default([]),
    score: scoreParametersSchema.default({}),
    strainChart: z.boolean().default(false),
});

/**
 * `mods` and `score` override what the replay records. `mods` is required for replays that do not record their
 * mods (versions 1 and 2).
 */
export const replayPerformanceRequestSchema = z.strictObject({
    replay: z.base64().min(1),
    mods: modsSchema.optional(),
    score: scoreParametersSchema.optional(),
    strainChart: z.boolean().default(false),
});
```

Create `packages/shared/src/types.ts`:

```ts
import type { Modes } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
    IPerformanceAttributes,
} from "@rian8337/osu-difficulty-calculator";
import type {
    HitErrorInformation,
    SliderNestedHitObjectInformation,
} from "@rian8337/osu-droid-replay-analyzer";
import type { z } from "zod";
import type {
    beatmapReferenceSchema,
    difficultyRequestSchema,
    performanceRequestSchema,
    replayPerformanceRequestSchema,
    scoreParametersSchema,
} from "./schemas";

export type BeatmapReference = z.infer<typeof beatmapReferenceSchema>;
export type ScoreParameters = z.infer<typeof scoreParametersSchema>;
export type DifficultyRequest = z.infer<typeof difficultyRequestSchema>;
export type PerformanceRequest = z.infer<typeof performanceRequestSchema>;
export type ReplayPerformanceRequest = z.infer<
    typeof replayPerformanceRequestSchema
>;

/**
 * Which calculator package a variant was built from. The osu packages have no equivalent type.
 */
export type CalculatorAlgorithm = "live" | "rebalance";

/**
 * The score values actually used in a calculation, after defaults, clamping, and replay analysis.
 */
export interface ResolvedScore {
    readonly n300: number;
    readonly n100: number;
    readonly n50: number;
    readonly nmiss: number;
    readonly combo: number;
    readonly sliderTicksMissed?: number;
    readonly sliderEndsDropped?: number;
    readonly totalScore?: number;
    readonly tapPenalty: number;
    readonly sliderCheesePenalty: number;
}

/**
 * Information derived from a replay. Not the replay analyzer's `ReplayInformation`, which is the raw replay record.
 */
export interface ReplayAttributes {
    readonly hitError: HitErrorInformation | null;
    readonly sliderTickInformation: SliderNestedHitObjectInformation | null;
    readonly sliderEndInformation: SliderNestedHitObjectInformation | null;
}

export interface InfoResponse {
    readonly id: string;
    readonly mode: Modes;
    readonly algorithm: CalculatorAlgorithm;
    readonly calculatorVersion: string;
    readonly builtAt: string;
}

export interface DifficultyResponse<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
> {
    readonly difficulty: CacheableDifficultyAttributes<TAttributes>;

    /**
     * PNG image, base64-encoded.
     */
    readonly strainChart?: string;
}

export interface PerformanceResponse<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> extends DifficultyResponse<TAttributes> {
    readonly performance: TPerformance;
    readonly score: ResolvedScore;
}

export interface ReplayPerformanceResponse<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> extends PerformanceResponse<TAttributes, TPerformance> {
    readonly replay: ReplayAttributes;
}
```

Replace `packages/shared/src/index.ts` with:

```ts
export * from "./errors";
export * from "./schemas";
export * from "./types";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/shared test && pnpm --filter @dpp/shared typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A packages/shared pnpm-lock.yaml
git commit -m "Add shared request and response contract" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Core utilities, API errors, and DI decorators

**Files:**

- Create: `apps/processor/src/types/errors.ts`, `apps/processor/src/utils/LruCache.ts`, `apps/processor/src/utils/md5.ts`, `apps/processor/src/utils/modsKey.ts`, `apps/processor/src/decorators/injectable.ts`, `apps/processor/src/dependencies/container.ts`, `apps/processor/src/dependencies/tokens.ts`
- Test: `apps/processor/tests/unit/utils/LruCache.test.ts`, `apps/processor/tests/unit/utils/modsKey.test.ts`, `apps/processor/tests/unit/types/errors.test.ts`, `apps/processor/tests/unit/decorators/injectable.test.ts`

**Interfaces:**

- Produces:
    - `class APIError extends Error { readonly statusCode: number; readonly code: ErrorCode; toResponse(): ErrorResponse }`; subclasses `BadRequestError(message)`, `UnauthorizedError()`, `NotFoundError(code: "BEATMAP_NOT_FOUND", message)`, `UnprocessableEntityError(code: "INVALID_BEATMAP" | "INVALID_REPLAY", message)`, `ServiceUnavailableError(code: "BEATMAP_SERVICE_UNAVAILABLE" | "OVERLOADED", message)`, `CalculationFailedError(message)`
    - `class LruCache<K, V>`: `constructor(maxEntries: number, ttlMs?: number, now?: () => number)`, `get(key): V | undefined`, `set(key, value): void`, `delete(key): void`, `get size(): number`
    - `md5(content: string | Buffer): string`
    - `createModsKey(mods: Iterable<SerializedMod>): string`
    - `Injectable(token: InjectionToken): ClassDecorator`
    - `getContainer(): DependencyContainer`, `useContainer(container): void`
    - `dependencyTokens` (an initially empty object; later tasks add entries)

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/utils/LruCache.test.ts`:

```ts
import { LruCache } from "@/utils/LruCache";
import { describe, expect, it } from "vitest";

describe("LruCache", () => {
    it("evicts the least recently used entry when full", () => {
        const cache = new LruCache<string, number>(2);

        cache.set("a", 1);
        cache.set("b", 2);
        // Touch "a" so "b" becomes least recently used.
        expect(cache.get("a")).toBe(1);
        cache.set("c", 3);

        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("a")).toBe(1);
        expect(cache.get("c")).toBe(3);
        expect(cache.size).toBe(2);
    });

    it("expires entries after the TTL", () => {
        let time = 0;
        const cache = new LruCache<string, number>(10, 100, () => time);

        cache.set("a", 1);
        time = 99;
        expect(cache.get("a")).toBe(1);
        time = 100;
        expect(cache.get("a")).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it("deletes entries", () => {
        const cache = new LruCache<string, number>(10);

        cache.set("a", 1);
        cache.delete("a");

        expect(cache.get("a")).toBeUndefined();
    });
});
```

Create `apps/processor/tests/unit/utils/modsKey.test.ts`:

```ts
import { createModsKey } from "@/utils/modsKey";
import { ModDoubleTime, ModHardRock, ModHidden } from "@rian8337/osu-base";
import { modMap } from "@test/utils/mods";
import { describe, expect, it } from "vitest";

describe("createModsKey", () => {
    it("is independent of mod order", () => {
        expect(
            createModsKey(
                modMap(new ModHidden(), new ModDoubleTime()).serializeMods(),
            ),
        ).toBe(
            createModsKey(
                modMap(new ModDoubleTime(), new ModHidden()).serializeMods(),
            ),
        );
    });

    it("produces a stable JSON string sorted by acronym", () => {
        expect(
            createModsKey(
                modMap(new ModHardRock(), new ModDoubleTime()).serializeMods(),
            ),
        ).toBe('[{"acronym":"DT"},{"acronym":"HR"}]');
        expect(createModsKey([])).toBe("[]");
    });

    // The cases below are about the shape of serialized settings, so they use serialized mods directly.

    it("is independent of settings key order, including nested objects", () => {
        expect(
            createModsKey([
                {
                    acronym: "DA",
                    settings: { cs: 4, ar: 9, extra: { b: 1, a: 2 } },
                },
            ]),
        ).toBe(
            createModsKey([
                {
                    acronym: "DA",
                    settings: { extra: { a: 2, b: 1 }, ar: 9, cs: 4 },
                },
            ]),
        );
    });

    it("treats empty settings like no settings", () => {
        expect(createModsKey([{ acronym: "HD", settings: {} }])).toBe(
            createModsKey([{ acronym: "HD" }]),
        );
    });

    it("distinguishes different settings", () => {
        expect(
            createModsKey([{ acronym: "DA", settings: { ar: 8 } }]),
        ).not.toBe(createModsKey([{ acronym: "DA", settings: { ar: 9 } }]));
    });
});
```

Create `apps/processor/tests/unit/types/errors.test.ts`:

```ts
import {
    BadRequestError,
    CalculationFailedError,
    NotFoundError,
    ServiceUnavailableError,
    UnauthorizedError,
    UnprocessableEntityError,
} from "@/types/errors";
import { describe, expect, it } from "vitest";

describe("API errors", () => {
    it.each([
        [new BadRequestError("bad"), 400, "INVALID_REQUEST"],
        [new UnauthorizedError(), 401, "UNAUTHORIZED"],
        [
            new NotFoundError("BEATMAP_NOT_FOUND", "missing"),
            404,
            "BEATMAP_NOT_FOUND",
        ],
        [
            new UnprocessableEntityError("INVALID_REPLAY", "broken"),
            422,
            "INVALID_REPLAY",
        ],
        [new ServiceUnavailableError("OVERLOADED", "busy"), 503, "OVERLOADED"],
        [new CalculationFailedError("boom"), 500, "CALCULATION_FAILED"],
    ])("%s has status %i and code %s", (error, status, code) => {
        expect(error.statusCode).toBe(status);
        expect(error.code).toBe(code);
        expect(error.toResponse()).toEqual({
            error: { code, message: error.message },
        });
    });
});
```

Create `apps/processor/tests/unit/decorators/injectable.test.ts`:

```ts
import { Injectable } from "@/decorators/injectable";
import { container, type InjectionToken } from "tsyringe";
import { describe, expect, it } from "vitest";

describe("Injectable", () => {
    it("records the registration token and the class without registering it", () => {
        const token: InjectionToken<unknown> = Symbol("test");

        @Injectable(token)
        class Example {}

        const classes: unknown = Reflect.getMetadata("classes", globalThis);

        expect(Reflect.getMetadata("registrationToken", Example)).toBe(token);
        expect(classes).toContain(Example);
        expect(container.isRegistered(token)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test`
Expected: FAIL; modules `@/utils/LruCache`, `@/utils/modsKey`, `@/types/errors`, `@/decorators/injectable` not found.

- [ ] **Step 3: Implement**

Create `apps/processor/src/types/errors.ts`:

```ts
import type { ErrorCode, ErrorResponse } from "@dpp/shared";

/**
 * An error that maps to an HTTP response.
 */
export class APIError extends Error {
    constructor(
        readonly statusCode: number,
        readonly code: ErrorCode,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }

    /**
     * Builds the response body for this error.
     */
    toResponse(): ErrorResponse {
        return { error: { code: this.code, message: this.message } };
    }
}

export class BadRequestError extends APIError {
    constructor(message: string) {
        super(400, "INVALID_REQUEST", message);
    }
}

export class UnauthorizedError extends APIError {
    constructor() {
        super(401, "UNAUTHORIZED", "Missing or invalid API key");
    }
}

export class NotFoundError extends APIError {
    constructor(code: "BEATMAP_NOT_FOUND", message: string) {
        super(404, code, message);
    }
}

export class UnprocessableEntityError extends APIError {
    constructor(code: "INVALID_BEATMAP" | "INVALID_REPLAY", message: string) {
        super(422, code, message);
    }
}

export class ServiceUnavailableError extends APIError {
    constructor(
        code: "BEATMAP_SERVICE_UNAVAILABLE" | "OVERLOADED",
        message: string,
    ) {
        super(503, code, message);
    }
}

export class CalculationFailedError extends APIError {
    constructor(message: string) {
        super(500, "CALCULATION_FAILED", message);
    }
}
```

Create `apps/processor/src/utils/LruCache.ts`:

```ts
interface Entry<V> {
    readonly value: V;
    readonly expiresAt: number;
}

/**
 * A bounded cache that evicts the least recently used entry, with optional expiry.
 */
export class LruCache<K, V> {
    private readonly entries = new Map<K, Entry<V>>();

    /**
     * @param maxEntries The maximum number of entries.
     * @param ttlMs How long an entry lives, in milliseconds. Defaults to forever.
     * @param now The clock to use. Defaults to `Date.now`.
     */
    constructor(
        private readonly maxEntries: number,
        private readonly ttlMs = Number.POSITIVE_INFINITY,
        private readonly now: () => number = Date.now,
    ) {}

    get size(): number {
        return this.entries.size;
    }

    get(key: K): V | undefined {
        const entry = this.entries.get(key);

        if (!entry) {
            return undefined;
        }

        this.entries.delete(key);

        if (entry.expiresAt <= this.now()) {
            return undefined;
        }

        // Re-insert to mark as most recently used.
        this.entries.set(key, entry);

        return entry.value;
    }

    set(key: K, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });

        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();

            if (oldest.done) {
                break;
            }

            this.entries.delete(oldest.value);
        }
    }

    delete(key: K): void {
        this.entries.delete(key);
    }
}
```

Create `apps/processor/src/utils/md5.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Computes the MD5 hash of a string (encoded as UTF-8) or buffer, as lowercase hex.
 */
export function md5(content: string | Buffer): string {
    return createHash("md5").update(content).digest("hex");
}
```

Create `apps/processor/src/utils/modsKey.ts`:

```ts
import type { SerializedMod } from "@rian8337/osu-base";

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, nested]) => [key, sortKeys(nested)]),
        );
    }

    return value;
}

/**
 * Builds the canonical cache key for a set of mods: sorted by acronym, settings with sorted keys, empty settings
 * omitted, serialized as JSON.
 *
 * Callers should pass only difficulty-adjusting mods.
 */
export function createModsKey(mods: Iterable<SerializedMod>): string {
    const canonical = [...mods]
        .map((mod) =>
            mod.settings && Object.keys(mod.settings).length > 0
                ? { acronym: mod.acronym, settings: sortKeys(mod.settings) }
                : { acronym: mod.acronym },
        )
        .sort((a, b) =>
            a.acronym < b.acronym ? -1 : a.acronym > b.acronym ? 1 : 0,
        );

    return JSON.stringify(canonical);
}
```

Create `apps/processor/src/decorators/injectable.ts`:

```ts
import { injectable, type InjectionToken } from "tsyringe";
import type { constructor } from "tsyringe/dist/typings/types";

/**
 * Marks a class to be injectable with the given token.
 *
 * Unlike tsyringe's {@link injectable}, providing a token does not register the class. The token is stored as
 * metadata so that `registerDependencies` can register the class to a specific container.
 *
 * @param token The injection token representing the class.
 */
export function Injectable(token: InjectionToken): ClassDecorator {
    return (target) => {
        // ClassDecorator types its target as Function; tsyringe needs a constructor type.
        const targetConstructor = target as unknown as constructor<unknown>;

        Reflect.defineMetadata("registrationToken", token, target);

        // Reflect metadata is untyped; this decorator is the only writer of "classes".
        const classes =
            (Reflect.getMetadata("classes", globalThis) as
                constructor<unknown>[] | undefined) ?? [];

        Reflect.defineMetadata(
            "classes",
            classes.concat(targetConstructor),
            globalThis,
        );

        injectable()(targetConstructor);
    };
}
```

Create `apps/processor/src/dependencies/container.ts`:

```ts
import { container, type DependencyContainer } from "tsyringe";

let currentContainer = container;

/**
 * Gets the current dependency injection container.
 */
export function getContainer(): DependencyContainer {
    return currentContainer;
}

/**
 * Sets the current dependency injection container.
 */
export function useContainer(newContainer: DependencyContainer): void {
    currentContainer = newContainer;
}
```

Create `apps/processor/src/dependencies/tokens.ts`:

```ts
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 */
export const dependencyTokens = {} satisfies Record<
    string,
    InjectionToken<unknown>
>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add core utilities, API errors, and injection decorators" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Algorithms: difficulty, performance, strain peaks

**Files:**

- Create: `apps/processor/src/algorithms/types.ts`, `apps/processor/src/algorithms/errors.ts`, `apps/processor/src/algorithms/score.ts`, `apps/processor/src/algorithms/BaseAlgorithm.ts`, `apps/processor/src/algorithms/DroidAlgorithm.ts`, `apps/processor/src/algorithms/OsuAlgorithm.ts`, `apps/processor/src/algorithms/createAlgorithm.ts`
- Modify: `apps/processor/src/dependencies/tokens.ts`, `docs/superpowers/specs/2026-10-05-processor-design.md`
- Test: `apps/processor/tests/unit/algorithms/errors.test.ts`, `apps/processor/tests/unit/algorithms/score.test.ts`, `apps/processor/tests/unit/algorithms/algorithms.test.ts`

**Interfaces:**

- Consumes: `ScoreParameters`, `ResolvedScore` from `@dpp/shared`; `modMap` (Task 1); API errors (Task 3).
- Produces:
    - `interface Algorithm<TAttributes extends IDifficultyAttributes = IDifficultyAttributes, TPerformance extends IPerformanceAttributes = IPerformanceAttributes>` (in `types.ts`):
        - `readonly mode: Modes`
        - `decodeBeatmap(osuFile: string): Beatmap`
        - `retainDifficultyAdjustmentMods(mods: ModMap): SerializedMod[]`
        - `calculateDifficulty(beatmap: Beatmap, mods: ModMap): CacheableDifficultyAttributes<TAttributes>`
        - `calculatePerformance(difficulty: CacheableDifficultyAttributes<TAttributes>, score: ScoreParameters): PerformanceResult<TPerformance>`
        - `calculateStrainPeaks(beatmap: Beatmap, mods: ModMap): StrainPeaks`
        - Task 5 adds `readReplay` and `analyzeReplay`.
    - `interface PerformanceResult<TPerformance extends IPerformanceAttributes = IPerformanceAttributes> { performance: TPerformance; score: ResolvedScore }`
    - `class AlgorithmInputError extends Error { readonly code: "INVALID_BEATMAP" | "INVALID_REPLAY" | "INVALID_REQUEST"; toApiError(): APIError }`
    - `type ScoreLimits`, `resolveScore(limits: ScoreLimits, score: ScoreParameters): ResolvedScore`, `toCalculationOptions(score: ResolvedScore): PerformanceCalculationOptions`
    - `class DroidAlgorithm` (`Algorithm<IExtendedDroidDifficultyAttributes, IDroidPerformanceAttributes>`), `class OsuAlgorithm` (`Algorithm<IOsuDifficultyAttributes, IOsuPerformanceAttributes>`), `createAlgorithm(mode: Modes): Algorithm`
    - `dependencyTokens.algorithm: InjectionToken<Algorithm>`

**Design notes:**

- `BaseAlgorithm` holds a `DifficultyCalculator<PlayableBeatmap, DifficultyHitObject, DifficultyAttributes & TAttributes>` from the library; this was verified to accept `DroidDifficultyCalculator` and `OsuDifficultyCalculator` without casts.
- Performance goes through an abstract `calculatePerformanceAttributes(difficulty, options): TPerformance` that each mode implements as `new XPerformanceCalculator(difficulty).calculate(options)`. The processor only uses what `calculate` returns, so it never needs the `PerformanceCalculator` class type.
- `DroidAlgorithm`/`OsuAlgorithm` are assignable to the default `Algorithm` (verified), so services use the default.

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/algorithms/errors.test.ts`:

```ts
import { AlgorithmInputError } from "@/algorithms/errors";
import { BadRequestError, UnprocessableEntityError } from "@/types/errors";
import { describe, expect, it } from "vitest";

describe("AlgorithmInputError.toApiError", () => {
    it.each([
        ["INVALID_BEATMAP", UnprocessableEntityError, 422],
        ["INVALID_REPLAY", UnprocessableEntityError, 422],
        ["INVALID_REQUEST", BadRequestError, 400],
    ] as const)("maps %s to the matching API error", (code, type, status) => {
        const apiError = new AlgorithmInputError(code, "message").toApiError();

        expect(apiError).toBeInstanceOf(type);
        expect(apiError.statusCode).toBe(status);
        expect(apiError.toResponse()).toEqual({
            error: { code, message: "message" },
        });
    });
});
```

Create `apps/processor/tests/unit/algorithms/score.test.ts`:

```ts
import { AlgorithmInputError } from "@/algorithms/errors";
import {
    resolveScore,
    toCalculationOptions,
    type ScoreLimits,
} from "@/algorithms/score";
import { describe, expect, it } from "vitest";

const limits: ScoreLimits = {
    maxCombo: 800,
    hitCircleCount: 300,
    sliderCount: 190,
    spinnerCount: 10,
    maximumScore: 1_000_000,
};

describe("resolveScore", () => {
    it("defaults to a full combo with every object a 300", () => {
        expect(resolveScore(limits, {})).toEqual({
            n300: 500,
            n100: 0,
            n50: 0,
            nmiss: 0,
            combo: 800,
            tapPenalty: 1,
            sliderCheesePenalty: 1,
        });
    });

    it("fills n300 with the objects not otherwise accounted for", () => {
        expect(
            resolveScore(limits, { n100: 10, n50: 5, nmiss: 2 }),
        ).toMatchObject({
            n300: 483,
            n100: 10,
            n50: 5,
            nmiss: 2,
        });
    });

    it("counts objects missing from explicit hit counts as misses", () => {
        expect(resolveScore(limits, { n300: 400, n100: 20 })).toMatchObject({
            n300: 400,
            n100: 20,
            n50: 0,
            nmiss: 80,
        });
    });

    it("rejects hit counts above the object count", () => {
        expect(() => resolveScore(limits, { n300: 500, n100: 1 })).toThrow(
            AlgorithmInputError,
        );
        expect(() => resolveScore(limits, { n300: 501 })).toThrow(
            expect.objectContaining({ code: "INVALID_REQUEST" }),
        );
    });

    it("clamps combo to the maximum and total score to the maximum score", () => {
        const score = resolveScore(limits, {
            combo: 5000,
            totalScore: 2_000_000,
        });

        expect(score.combo).toBe(800);
        expect(score.totalScore).toBe(1_000_000);
    });

    it("keeps total score unclamped when there is no maximum score", () => {
        const { maximumScore: _, ...osuLimits } = limits;

        expect(
            resolveScore(osuLimits, { totalScore: 2_000_000 }).totalScore,
        ).toBe(2_000_000);
    });

    it("passes through slider values and penalties", () => {
        expect(
            resolveScore(limits, {
                sliderTicksMissed: 3,
                sliderEndsDropped: 4,
                tapPenalty: 0.9,
                sliderCheesePenalty: 0.8,
            }),
        ).toMatchObject({
            sliderTicksMissed: 3,
            sliderEndsDropped: 4,
            tapPenalty: 0.9,
            sliderCheesePenalty: 0.8,
        });
    });
});

describe("toCalculationOptions", () => {
    it("maps a resolved score to calculator options", () => {
        const options = toCalculationOptions(
            resolveScore(limits, { n100: 10, sliderTicksMissed: 2 }),
        );

        expect(options.combo).toBe(800);
        expect(options.sliderTicksMissed).toBe(2);
        expect(options.accPercent).toMatchObject({
            n300: 490,
            n100: 10,
            n50: 0,
            nmiss: 0,
        });
    });
});
```

Create `apps/processor/tests/unit/algorithms/algorithms.test.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { DroidAlgorithm } from "@/algorithms/DroidAlgorithm";
import { AlgorithmInputError } from "@/algorithms/errors";
import { OsuAlgorithm } from "@/algorithms/OsuAlgorithm";
import type { Algorithm } from "@/algorithms/types";
import {
    Accuracy,
    BeatmapDecoder,
    ModDoubleTime,
    ModHidden,
    ModNoFail,
    Modes,
    type Beatmap,
    type ModMap,
} from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IDifficultyAttributes,
    type IPerformanceAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { readBeatmapFixture } from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it } from "vitest";

interface AlgorithmCase<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
> {
    readonly algorithm: Algorithm<TAttributes, TPerformance>;
    readonly expectedDifficulty: (
        beatmap: Beatmap,
        mods: ModMap,
    ) => CacheableDifficultyAttributes<TAttributes>;
    readonly expectedPerformance: (
        attributes: CacheableDifficultyAttributes<TAttributes>,
        options: PerformanceCalculationOptions,
    ) => TPerformance;
}

/**
 * Checks that an algorithm produces exactly what calling the calculator directly produces.
 */
function describeAlgorithm<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
>(testCase: AlgorithmCase<TAttributes, TPerformance>) {
    const { algorithm, expectedDifficulty, expectedPerformance } = testCase;
    const osuFile = readBeatmapFixture("loveLetter");
    const mods = modMap(new ModHidden(), new ModDoubleTime());

    describe(`${algorithm.mode} algorithm`, () => {
        it("decodes beatmaps for its mode", () => {
            expect(
                algorithm.decodeBeatmap(osuFile).hitObjects.objects.length,
            ).toBe(
                new BeatmapDecoder().decode(osuFile, algorithm.mode).result
                    .hitObjects.objects.length,
            );
        });

        it("calculates the same difficulty attributes as the calculator", () => {
            const expected = expectedDifficulty(
                new BeatmapDecoder().decode(osuFile, algorithm.mode).result,
                mods,
            );

            expect(
                algorithm.calculateDifficulty(
                    algorithm.decodeBeatmap(osuFile),
                    mods,
                ),
            ).toEqual(expected);
        });

        it("calculates the same performance attributes as the calculator", () => {
            const attributes = algorithm.calculateDifficulty(
                algorithm.decodeBeatmap(osuFile),
                mods,
            );
            const objectCount =
                attributes.hitCircleCount +
                attributes.sliderCount +
                attributes.spinnerCount;

            const expected = expectedPerformance(attributes, {
                combo: attributes.maxCombo - 10,
                accPercent: new Accuracy({
                    n300: objectCount - 3,
                    n100: 2,
                    n50: 0,
                    nmiss: 1,
                }),
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            });

            const result = algorithm.calculatePerformance(attributes, {
                combo: attributes.maxCombo - 10,
                n100: 2,
                nmiss: 1,
            });

            expect(result.performance).toEqual(expected);
            expect(result.score).toMatchObject({
                n300: objectCount - 3,
                n100: 2,
                nmiss: 1,
            });
        });

        it("keeps only difficulty-adjusting mods", () => {
            const retained = algorithm.retainDifficultyAdjustmentMods(
                modMap(new ModNoFail(), new ModHidden(), new ModDoubleTime()),
            );

            expect(retained).toEqual(
                modMap(new ModHidden(), new ModDoubleTime()).serializeMods(),
            );
        });

        it("calculates strain peaks", () => {
            const peaks = algorithm.calculateStrainPeaks(
                algorithm.decodeBeatmap(osuFile),
                mods,
            );

            expect(peaks.aimWithSliders.length).toBeGreaterThan(0);
        });

        it("rejects a beatmap without hit objects", () => {
            expect(() => algorithm.decodeBeatmap("not a beatmap")).toThrow(
                AlgorithmInputError,
            );
        });
    });
}

describeAlgorithm({
    algorithm: new DroidAlgorithm(),
    expectedDifficulty: (beatmap, mods) =>
        new DroidDifficultyCalculator()
            .calculate(beatmap, mods)
            .toCacheableAttributes(),
    expectedPerformance: (attributes, options) =>
        new DroidPerformanceCalculator(attributes).calculate(options),
});

describeAlgorithm({
    algorithm: new OsuAlgorithm(),
    expectedDifficulty: (beatmap, mods) =>
        new OsuDifficultyCalculator()
            .calculate(beatmap, mods)
            .toCacheableAttributes(),
    expectedPerformance: (attributes, options) =>
        new OsuPerformanceCalculator(attributes).calculate(options),
});

describe("createAlgorithm", () => {
    it.each([
        [Modes.Droid, DroidAlgorithm],
        [Modes.Osu, OsuAlgorithm],
    ])("creates the %s algorithm", (mode, type) => {
        const algorithm = createAlgorithm(mode);

        expect(algorithm).toBeInstanceOf(type);
        expect(algorithm.mode).toBe(mode);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test`
Expected: FAIL; modules under `@/algorithms/` not found.

- [ ] **Step 3: Implement**

Create `apps/processor/src/algorithms/errors.ts`:

```ts
import {
    BadRequestError,
    UnprocessableEntityError,
    type APIError,
} from "@/types/errors";

/**
 * Codes for invalid input detected by an algorithm.
 */
export type AlgorithmErrorCode =
    "INVALID_BEATMAP" | "INVALID_REPLAY" | "INVALID_REQUEST";

/**
 * An error caused by invalid input rather than a calculator failure.
 *
 * Algorithms also run inside worker threads, where error classes do not survive the trip back to the main thread.
 * There the error travels as a task outcome, and the main thread rebuilds it to call {@link toApiError}.
 */
export class AlgorithmInputError extends Error {
    constructor(
        readonly code: AlgorithmErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "AlgorithmInputError";
    }

    /**
     * Converts this error to the API error returned to the client.
     */
    toApiError(): APIError {
        return this.code === "INVALID_REQUEST"
            ? new BadRequestError(this.message)
            : new UnprocessableEntityError(this.code, this.message);
    }
}
```

Create `apps/processor/src/algorithms/types.ts`:

```ts
import type { ResolvedScore, ScoreParameters } from "@dpp/shared";
import type { Beatmap, ModMap, Modes, SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
    IPerformanceAttributes,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";

/**
 * The result of a performance calculation.
 */
export interface PerformanceResult<
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> {
    readonly performance: TPerformance;
    readonly score: ResolvedScore;
}

/**
 * The only code that calls the calculator packages. One implementation exists per game mode; which calculator
 * code runs is decided when the variant is built.
 */
export interface Algorithm<
    TAttributes extends IDifficultyAttributes = IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes = IPerformanceAttributes,
> {
    /**
     * The game mode this algorithm calculates for.
     */
    readonly mode: Modes;

    /**
     * Decodes a `.osu` file for this mode.
     *
     * @throws {AlgorithmInputError} With code `INVALID_BEATMAP` if the file cannot be decoded or has no hit objects.
     */
    decodeBeatmap(osuFile: string): Beatmap;

    /**
     * Keeps only the mods that affect difficulty, in serialized form.
     */
    retainDifficultyAdjustmentMods(mods: ModMap): SerializedMod[];

    /**
     * Calculates cacheable difficulty attributes.
     */
    calculateDifficulty(
        beatmap: Beatmap,
        mods: ModMap,
    ): CacheableDifficultyAttributes<TAttributes>;

    /**
     * Calculates performance from difficulty attributes. `difficulty.mods` must be the mods the score was played
     * with, since some mods (such as NoFail) change performance without changing difficulty.
     *
     * @throws {AlgorithmInputError} With code `INVALID_REQUEST` if the hit counts exceed the object count.
     */
    calculatePerformance(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        score: ScoreParameters,
    ): PerformanceResult<TPerformance>;

    /**
     * Calculates strain peaks for strain chart rendering.
     */
    calculateStrainPeaks(beatmap: Beatmap, mods: ModMap): StrainPeaks;
}
```

Create `apps/processor/src/algorithms/score.ts`:

```ts
import type { ResolvedScore, ScoreParameters } from "@dpp/shared";
import { Accuracy, MathUtils } from "@rian8337/osu-base";
import type {
    IDifficultyAttributes,
    PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { AlgorithmInputError } from "./errors";

/**
 * The difficulty attributes that limit a score. `maximumScore` exists only for osu!droid.
 */
export type ScoreLimits = Pick<
    IDifficultyAttributes,
    "maxCombo" | "hitCircleCount" | "sliderCount" | "spinnerCount"
> & {
    readonly maximumScore?: number;
};

/**
 * Applies defaults and limits to score parameters.
 *
 * - Missing hit counts default to a perfect play; `n300` defaults to the objects not otherwise accounted for.
 * - Objects not accounted for by explicit hit counts count as misses.
 * - Combo defaults to, and is clamped to, the maximum combo.
 * - Total score is clamped to the maximum score when there is one (osu!droid).
 * - Penalties default to 1 (no penalty).
 */
export function resolveScore(
    limits: ScoreLimits,
    score: ScoreParameters,
): ResolvedScore {
    const objectCount =
        limits.hitCircleCount + limits.sliderCount + limits.spinnerCount;

    const n100 = score.n100 ?? 0;
    const n50 = score.n50 ?? 0;
    const explicitMisses = score.nmiss ?? 0;
    const n300 =
        score.n300 ?? Math.max(0, objectCount - n100 - n50 - explicitMisses);
    const counted = n300 + n100 + n50 + explicitMisses;

    if (counted > objectCount) {
        throw new AlgorithmInputError(
            "INVALID_REQUEST",
            `Hit counts add up to ${counted.toString()}, but the beatmap has ${objectCount.toString()} objects`,
        );
    }

    const totalScore =
        score.totalScore !== undefined && limits.maximumScore !== undefined
            ? Math.min(score.totalScore, limits.maximumScore)
            : score.totalScore;

    return {
        n300,
        n100,
        n50,
        nmiss: explicitMisses + (objectCount - counted),
        combo: MathUtils.clamp(
            score.combo ?? limits.maxCombo,
            0,
            limits.maxCombo,
        ),
        ...(score.sliderTicksMissed !== undefined && {
            sliderTicksMissed: score.sliderTicksMissed,
        }),
        ...(score.sliderEndsDropped !== undefined && {
            sliderEndsDropped: score.sliderEndsDropped,
        }),
        ...(totalScore !== undefined && { totalScore }),
        tapPenalty: score.tapPenalty ?? 1,
        sliderCheesePenalty: score.sliderCheesePenalty ?? 1,
    };
}

/**
 * Converts a resolved score to performance calculator options.
 */
export function toCalculationOptions(
    score: ResolvedScore,
): PerformanceCalculationOptions {
    return {
        combo: score.combo,
        accPercent: new Accuracy({
            n300: score.n300,
            n100: score.n100,
            n50: score.n50,
            nmiss: score.nmiss,
        }),
        sliderTicksMissed: score.sliderTicksMissed,
        sliderEndsDropped: score.sliderEndsDropped,
        totalScore: score.totalScore,
        tapPenalty: score.tapPenalty,
        sliderCheesePenalty: score.sliderCheesePenalty,
    };
}
```

Create `apps/processor/src/algorithms/BaseAlgorithm.ts`:

```ts
import type { ScoreParameters } from "@dpp/shared";
import {
    BeatmapDecoder,
    ModUtil,
    type Beatmap,
    type ModMap,
    type Modes,
    type PlayableBeatmap,
    type SerializedMod,
} from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    DifficultyAttributes,
    DifficultyCalculator,
    DifficultyHitObject,
    IDifficultyAttributes,
    IPerformanceAttributes,
    PerformanceCalculationOptions,
    StrainPeaks,
} from "@rian8337/osu-difficulty-calculator";
import { AlgorithmInputError } from "./errors";
import { resolveScore, toCalculationOptions } from "./score";
import type { Algorithm, PerformanceResult } from "./types";

/**
 * Calculator logic shared by all modes.
 *
 * @template TAttributes The difficulty attributes the mode's difficulty calculator produces.
 * @template TPerformance The performance attributes the mode's performance calculator produces.
 */
export abstract class BaseAlgorithm<
    TAttributes extends IDifficultyAttributes,
    TPerformance extends IPerformanceAttributes,
> implements Algorithm<TAttributes, TPerformance> {
    abstract readonly mode: Modes;

    protected abstract readonly difficultyCalculator: DifficultyCalculator<
        PlayableBeatmap,
        DifficultyHitObject,
        DifficultyAttributes & TAttributes
    >;

    /**
     * Runs the mode's performance calculator.
     */
    protected abstract calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        options: PerformanceCalculationOptions,
    ): TPerformance;

    decodeBeatmap(osuFile: string): Beatmap {
        let beatmap: Beatmap;

        try {
            beatmap = new BeatmapDecoder().decode(osuFile, this.mode).result;
        } catch (e) {
            throw new AlgorithmInputError(
                "INVALID_BEATMAP",
                e instanceof Error ? e.message : "Beatmap could not be decoded",
            );
        }

        if (beatmap.hitObjects.objects.length === 0) {
            throw new AlgorithmInputError(
                "INVALID_BEATMAP",
                "Beatmap has no hit objects",
            );
        }

        return beatmap;
    }

    retainDifficultyAdjustmentMods(mods: ModMap): SerializedMod[] {
        return ModUtil.serializeMods(
            this.difficultyCalculator.retainDifficultyAdjustmentMods([
                ...mods.values(),
            ]),
        );
    }

    calculateDifficulty(
        beatmap: Beatmap,
        mods: ModMap,
    ): CacheableDifficultyAttributes<TAttributes> {
        return this.difficultyCalculator
            .calculate(beatmap, mods)
            .toCacheableAttributes();
    }

    calculatePerformance(
        difficulty: CacheableDifficultyAttributes<TAttributes>,
        score: ScoreParameters,
    ): PerformanceResult<TPerformance> {
        // The attributes carry maxCombo and the object counts; droid attributes also carry maximumScore.
        const resolved = resolveScore(difficulty, score);

        return {
            performance: this.calculatePerformanceAttributes(
                difficulty,
                toCalculationOptions(resolved),
            ),
            score: resolved,
        };
    }

    calculateStrainPeaks(beatmap: Beatmap, mods: ModMap): StrainPeaks {
        return this.difficultyCalculator.calculateStrainPeaks(beatmap, mods);
    }
}
```

Create `apps/processor/src/algorithms/DroidAlgorithm.ts`:

```ts
import { Modes } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IDroidPerformanceAttributes,
    type IExtendedDroidDifficultyAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { BaseAlgorithm } from "./BaseAlgorithm";

/**
 * The osu!droid algorithm.
 */
export class DroidAlgorithm extends BaseAlgorithm<
    IExtendedDroidDifficultyAttributes,
    IDroidPerformanceAttributes
> {
    readonly mode = Modes.Droid;
    protected readonly difficultyCalculator = new DroidDifficultyCalculator();

    protected calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): IDroidPerformanceAttributes {
        return new DroidPerformanceCalculator(difficulty).calculate(options);
    }
}
```

Create `apps/processor/src/algorithms/OsuAlgorithm.ts`:

```ts
import { Modes } from "@rian8337/osu-base";
import {
    OsuDifficultyCalculator,
    OsuPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IOsuDifficultyAttributes,
    type IOsuPerformanceAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import { BaseAlgorithm } from "./BaseAlgorithm";

/**
 * The osu!standard algorithm.
 */
export class OsuAlgorithm extends BaseAlgorithm<
    IOsuDifficultyAttributes,
    IOsuPerformanceAttributes
> {
    readonly mode = Modes.Osu;
    protected readonly difficultyCalculator = new OsuDifficultyCalculator();

    protected calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<IOsuDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): IOsuPerformanceAttributes {
        return new OsuPerformanceCalculator(difficulty).calculate(options);
    }
}
```

Create `apps/processor/src/algorithms/createAlgorithm.ts`:

```ts
import { Modes } from "@rian8337/osu-base";
import { DroidAlgorithm } from "./DroidAlgorithm";
import { OsuAlgorithm } from "./OsuAlgorithm";
import type { Algorithm } from "./types";

/**
 * Creates the algorithm for a game mode.
 */
export function createAlgorithm(mode: Modes): Algorithm {
    switch (mode) {
        case Modes.Droid:
            return new DroidAlgorithm();

        case Modes.Osu:
            return new OsuAlgorithm();
    }
}
```

Replace `apps/processor/src/dependencies/tokens.ts` with:

```ts
import type { Algorithm } from "@/algorithms/types";
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 *
 * `Symbol.for(...) as InjectionToken<T>` is how tsyringe gives a symbol token its type.
 */
export const dependencyTokens = {
    algorithm: Symbol.for("algorithm") as InjectionToken<Algorithm>,
} satisfies Record<string, InjectionToken<unknown>>;
```

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-10-05-processor-design.md`, replace the `calculatePerformance` bullet under **Algorithm** with:

```
- `calculatePerformance(attributes, score)`: returns the performance attributes from the library's `PerformanceCalculator.calculate()` (`IDroidPerformanceAttributes` / `IOsuPerformanceAttributes`, plain interfaces) and the resolved score parameters.
```

and in the API section replace the line describing `performance` with:

```
- `performance`: the performance attributes returned by the calculator library.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0. If the library's `retainDifficultyAdjustmentMods` returns the mods in a different order than `[HD, DT]`, compare with `expect.arrayContaining` plus `toHaveLength(2)`; the cache key sorts them anyway.

- [ ] **Step 6: Commit**

```bash
git add -A apps/processor docs/superpowers/specs/2026-10-05-processor-design.md
git commit -m "Add droid and osu algorithm adapters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Algorithms: replays

**Files:**

- Modify: `apps/processor/src/algorithms/types.ts`, `apps/processor/src/algorithms/BaseAlgorithm.ts`, `apps/processor/src/algorithms/DroidAlgorithm.ts`
- Test: `apps/processor/tests/unit/algorithms/replays.test.ts`

**Interfaces:**

- Consumes: `Algorithm`, `BaseAlgorithm`, `AlgorithmInputError` (Task 4); `ScoreParameters`, `ReplayAttributes` from `@dpp/shared`.
- Produces:
    - `interface ReplayHeader { beatmapHash: string; mods: SerializedMod[] | null }` (`mods` is `null` for replays older than v3)
    - `interface ReplayAnalysis { score: ScoreParameters; replay: ReplayAttributes }`
    - `Algorithm.readReplay(replay: Buffer): Promise<ReplayHeader>`
    - `Algorithm.analyzeReplay(replay: Buffer, beatmap: Beatmap, difficulty: CacheableDifficultyAttributes<TAttributes>): Promise<ReplayAnalysis>` (`difficulty.mods` must be the mods the score is calculated with)

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/algorithms/replays.test.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { AlgorithmInputError } from "@/algorithms/errors";
import { Modes, ModUtil } from "@rian8337/osu-base";
import { hasReplayFixture, md5Of, replayFixture } from "@test/utils/fixtures";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe.each([Modes.Droid, Modes.Osu])("%s replay handling", (mode) => {
    const algorithm = createAlgorithm(mode);

    it("rejects bytes that are not a replay", async () => {
        const result = algorithm.readReplay(Buffer.from("not a replay"));

        await expect(result).rejects.toBeInstanceOf(AlgorithmInputError);
        await expect(result).rejects.toMatchObject({ code: "INVALID_REPLAY" });
    });

    describe.skipIf(!hasReplayFixture)("with the v3 replay fixture", () => {
        const replay = hasReplayFixture
            ? readFileSync(replayFixture.replay)
            : Buffer.alloc(0);
        const osuFile = hasReplayFixture
            ? readFileSync(replayFixture.beatmap, "utf8")
            : "";

        it("reads the beatmap hash and mods", async () => {
            const header = await algorithm.readReplay(replay);

            expect(header.beatmapHash).toBe(
                md5Of(readFileSync(replayFixture.beatmap)),
            );
            expect(header.mods).not.toBeNull();
        });

        it("derives score values that cover every object", async () => {
            const header = await algorithm.readReplay(replay);
            const replayMods = header.mods ?? [];
            const beatmap = algorithm.decodeBeatmap(osuFile);
            // readReplay returns serialized mods, the format a replay records them in.
            const difficulty = algorithm.calculateDifficulty(
                beatmap,
                ModUtil.deserializeMods(replayMods),
            );
            const played = { ...difficulty, mods: replayMods };

            const { score, replay: attributes } = await algorithm.analyzeReplay(
                replay,
                beatmap,
                played,
            );
            const objectCount =
                played.hitCircleCount +
                played.sliderCount +
                played.spinnerCount;

            expect(
                (score.n300 ?? 0) +
                    (score.n100 ?? 0) +
                    (score.n50 ?? 0) +
                    (score.nmiss ?? 0),
            ).toBe(objectCount);
            expect(score.combo).toBeGreaterThan(0);
            expect(attributes.sliderTickInformation).not.toBeNull();
            expect(attributes.hitError?.unstableRate).toBeGreaterThanOrEqual(0);

            // The result must be usable for a performance calculation.
            expect(
                algorithm.calculatePerformance(played, score).performance.total,
            ).toBeGreaterThan(0);
        });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test tests/unit/algorithms/replays.test.ts`
Expected: FAIL; `algorithm.readReplay is not a function`. Tests needing the fixture are reported as skipped until the user provides `tests/fixtures/replays/v3.odr` and `v3.osu`.

- [ ] **Step 3: Implement**

In `apps/processor/src/algorithms/types.ts`, change the shared import to:

```ts
import type {
    ReplayAttributes,
    ResolvedScore,
    ScoreParameters,
} from "@dpp/shared";
```

add these interfaces after `PerformanceResult`:

```ts
/**
 * What can be read from a replay without its beatmap.
 */
export interface ReplayHeader {
    readonly beatmapHash: string;

    /**
     * The mods the replay was played with, or `null` for replays older than v3, which don't record them.
     */
    readonly mods: SerializedMod[] | null;
}

/**
 * Score values and attributes derived from a replay.
 */
export interface ReplayAnalysis {
    readonly score: ScoreParameters;
    readonly replay: ReplayAttributes;
}
```

and add these members to the `Algorithm` interface:

```ts
    /**
     * Reads a replay's beatmap hash and mods.
     *
     * @throws {AlgorithmInputError} With code `INVALID_REPLAY` if the replay cannot be decoded.
     */
    readReplay(replay: Buffer): Promise<ReplayHeader>;

    /**
     * Derives score values (hit counts, combo, total score, slider values, penalties) and replay attributes.
     * `difficulty.mods` must be the mods the score is calculated with.
     *
     * @throws {AlgorithmInputError} With code `INVALID_REPLAY` if the replay cannot be decoded.
     */
    analyzeReplay(
        replay: Buffer,
        beatmap: Beatmap,
        difficulty: CacheableDifficultyAttributes<TAttributes>,
    ): Promise<ReplayAnalysis>;
```

In `apps/processor/src/algorithms/BaseAlgorithm.ts`, add the import:

```ts
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
```

change `import type { Algorithm, PerformanceResult } from "./types";` to:

```ts
import type {
    Algorithm,
    PerformanceResult,
    ReplayAnalysis,
    ReplayHeader,
} from "./types";
```

and add these methods to the class:

```ts
    async readReplay(replay: Buffer): Promise<ReplayHeader> {
        const data = await this.decodeReplay(new ReplayAnalyzer(), replay);

        return {
            beatmapHash: data.hash,
            mods: data.isReplayV3() ? data.convertedMods.serializeMods() : null,
        };
    }

    async analyzeReplay(
        replay: Buffer,
        beatmap: Beatmap,
        difficulty: CacheableDifficultyAttributes<TAttributes>,
    ): Promise<ReplayAnalysis> {
        const analyzer = new ReplayAnalyzer({ map: beatmap });
        const data = await this.decodeReplay(analyzer, replay);

        const score: ScoreParameters = {
            n300: data.accuracy.n300,
            n100: data.accuracy.n100,
            n50: data.accuracy.n50,
            nmiss: data.accuracy.nmiss,
        };

        if (data.isReplayV3()) {
            score.combo = data.maxCombo;
            score.totalScore = data.score;
        }

        const sliders = analyzer.obtainSliderHitInformation();

        if (sliders) {
            score.sliderTicksMissed =
                sliders.head.total -
                sliders.head.obtained +
                (sliders.tick.total - sliders.tick.obtained) +
                (sliders.repeat.total - sliders.repeat.obtained);

            score.sliderEndsDropped = sliders.end.total - sliders.end.obtained;
        }

        this.applyReplayPenalties(analyzer, difficulty, score);

        return {
            score,
            replay: {
                hitError: analyzer.calculateHitError(),
                sliderTickInformation: sliders?.tick ?? null,
                sliderEndInformation: sliders?.end ?? null,
            },
        };
    }

    /**
     * Applies mode-specific replay penalties to `score`. The default applies none.
     */
    protected applyReplayPenalties(
        _analyzer: ReplayAnalyzer,
        _difficulty: CacheableDifficultyAttributes<TAttributes>,
        _score: ScoreParameters,
    ): void {
        // No penalties by default.
    }

    private async decodeReplay(analyzer: ReplayAnalyzer, replay: Buffer) {
        analyzer.originalODR = replay;

        await analyzer.analyze().catch(() => undefined);

        if (!analyzer.data) {
            throw new AlgorithmInputError("INVALID_REPLAY", "Replay could not be decoded");
        }

        return analyzer.data;
    }
```

Replace `apps/processor/src/algorithms/DroidAlgorithm.ts` with:

```ts
import type { ScoreParameters } from "@dpp/shared";
import { Modes, ModUtil } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    type CacheableDifficultyAttributes,
    type IDroidPerformanceAttributes,
    type IExtendedDroidDifficultyAttributes,
    type PerformanceCalculationOptions,
} from "@rian8337/osu-difficulty-calculator";
import {
    RebalanceThreeFingerChecker,
    ThreeFingerChecker,
    type ReplayAnalyzer,
} from "@rian8337/osu-droid-replay-analyzer";
import { BaseAlgorithm } from "./BaseAlgorithm";

/**
 * The osu!droid algorithm.
 */
export class DroidAlgorithm extends BaseAlgorithm<
    IExtendedDroidDifficultyAttributes,
    IDroidPerformanceAttributes
> {
    readonly mode = Modes.Droid;
    protected readonly difficultyCalculator = new DroidDifficultyCalculator();

    protected calculatePerformanceAttributes(
        difficulty: CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
        options: PerformanceCalculationOptions,
    ): IDroidPerformanceAttributes {
        return new DroidPerformanceCalculator(difficulty).calculate(options);
    }

    /**
     * Applies the three-finger (tap) and slider cheese penalties. The replay analyzer picks the live or rebalance
     * checks from the attributes' `mode` tag, which the calculator that produced them sets.
     */
    protected override applyReplayPenalties(
        analyzer: ReplayAnalyzer,
        difficulty: CacheableDifficultyAttributes<IExtendedDroidDifficultyAttributes>,
        score: ScoreParameters,
    ): void {
        const attributes: IExtendedDroidDifficultyAttributes = {
            ...difficulty,
            mods: ModUtil.deserializeMods(difficulty.mods),
        };

        analyzer.difficultyAttributes = attributes;

        // Type-checking uses the live package, whose `mode` is always "live"; a rebalance build bundles the
        // rebalance calculator instead, so the runtime value can differ.
        const threeFingerChecker =
            attributes.mode === "live"
                ? ThreeFingerChecker
                : RebalanceThreeFingerChecker;

        if (threeFingerChecker.isEligibleToDetect(attributes)) {
            analyzer.checkFor3Finger();
            score.tapPenalty = analyzer.tapPenalty;
        }

        if (attributes.difficultSliders.length > 0) {
            analyzer.checkForSliderCheesing();
            score.sliderCheesePenalty = analyzer.sliderCheesePenalty;
        }
    }
}
```

If lint flags `attributes.mode === "live"` as an always-true condition, disable that rule for this one line with an inline comment pointing at the explanation above; do not change the comparison.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck && pnpm lint`
Expected: all tests pass (fixture-dependent tests skipped if the fixture is absent); typecheck and lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add replay reading and analysis to algorithms" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Calculation runners and worker

**Files:**

- Create: `apps/processor/src/calculation/tasks.ts`, `apps/processor/src/calculation/outcome.ts`, `apps/processor/src/calculation/ICalculationRunner.ts`, `apps/processor/src/calculation/BaseRunner.ts`, `apps/processor/src/calculation/InlineRunner.ts`, `apps/processor/src/calculation/PiscinaRunner.ts`, `apps/processor/src/calculation/worker.ts`, `apps/processor/src/calculation/strainChartColor.ts`, `apps/processor/tests/fixtures/workers/fake-worker.mjs`, `apps/processor/tests/utils/attributes.ts`
- Modify: `apps/processor/src/dependencies/tokens.ts`
- Test: `apps/processor/tests/unit/calculation/tasks.test.ts`, `apps/processor/tests/unit/calculation/InlineRunner.test.ts`, `apps/processor/tests/unit/calculation/PiscinaRunner.test.ts`

**Interfaces:**

- Consumes: `Algorithm`, `ReplayHeader`, `ReplayAnalysis`, `AlgorithmInputError` (with `toApiError()`), `createAlgorithm` (Tasks 4–5); `LruCache` and API errors (Task 3).
- Produces:
    - `type CalculationTask` (`kind`: `"difficulty" | "readReplay" | "analyzeReplay" | "strainChart"`; mods travel as `SerializedMod[]` because tasks must survive structured cloning), `type TaskOutcome`
    - `class CalculationTaskHandler`: `constructor(algorithm: Algorithm, beatmapCacheSize?: number)`, `handle(task: CalculationTask): Promise<TaskOutcome>`
    - `unwrapOutcome<T>(outcome: TaskOutcome): T`
    - `interface ICalculationRunner extends AsyncDisposable`:
        - `calculateDifficulty(input: { beatmapHash: string; osuFile: string; mods: SerializedMod[] }): Promise<CacheableDifficultyAttributes<IDifficultyAttributes>>`
        - `readReplay(replay: Buffer): Promise<ReplayHeader>`
        - `analyzeReplay(input: { beatmapHash: string; osuFile: string; replay: Buffer; difficulty: CacheableDifficultyAttributes<IDifficultyAttributes> }): Promise<ReplayAnalysis>`
        - `renderStrainChart(input: { beatmapHash: string; osuFile: string; mods: SerializedMod[]; clockRate: number; color: string }): Promise<Buffer>`
        - `[Symbol.asyncDispose](): Promise<void>` (waits for running tasks, then releases resources)
    - `class InlineRunner(algorithm: Algorithm)`, `class PiscinaRunner(options: { mode: Modes; threads: number; maxQueue: number; workerFile?: URL })`
    - `strainChartColor(mode: Modes, algorithm: CalculatorAlgorithm): string`
    - `calculateFixtureDifficulty(name: BeatmapFixtureName, mode: Modes, mods?: ModMap): CacheableDifficultyAttributes<IDifficultyAttributes>` (test util)
    - `dependencyTokens.calculationRunner: InjectionToken<ICalculationRunner>`

- [ ] **Step 1: Test utility**

Create `apps/processor/tests/utils/attributes.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { ModMap, type Modes } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { readBeatmapFixture, type BeatmapFixtureName } from "./fixtures";

/**
 * Calculates real difficulty attributes for a fixture, for tests that need attributes but not a specific value.
 */
export function calculateFixtureDifficulty(
    name: BeatmapFixtureName,
    mode: Modes,
    mods = new ModMap(),
): CacheableDifficultyAttributes<IDifficultyAttributes> {
    const algorithm = createAlgorithm(mode);

    return algorithm.calculateDifficulty(
        algorithm.decodeBeatmap(readBeatmapFixture(name)),
        mods,
    );
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/processor/tests/unit/calculation/tasks.test.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { CalculationTaskHandler } from "@/calculation/tasks";
import { ModDoubleTime, ModHardRock, Modes } from "@rian8337/osu-base";
import { md5Of, readBeatmapFixture } from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it, vi } from "vitest";

describe("CalculationTaskHandler", () => {
    const algorithm = createAlgorithm(Modes.Droid);
    const osuFile = readBeatmapFixture("discoprince");
    const beatmapHash = md5Of(osuFile);

    it("calculates difficulty", async () => {
        const handler = new CalculationTaskHandler(algorithm);
        const outcome = await handler.handle({
            kind: "difficulty",
            beatmapHash,
            osuFile,
            mods: modMap(new ModHardRock()).serializeMods(),
        });

        expect(outcome).toEqual({
            ok: true,
            value: algorithm.calculateDifficulty(
                algorithm.decodeBeatmap(osuFile),
                modMap(new ModHardRock()),
            ),
        });
    });

    it("decodes each beatmap once while it stays cached", async () => {
        const decode = vi.spyOn(algorithm, "decodeBeatmap");
        const handler = new CalculationTaskHandler(algorithm);

        await handler.handle({
            kind: "difficulty",
            beatmapHash,
            osuFile,
            mods: [],
        });
        await handler.handle({
            kind: "difficulty",
            beatmapHash,
            osuFile,
            mods: modMap(new ModDoubleTime()).serializeMods(),
        });

        expect(decode).toHaveBeenCalledTimes(1);
    });

    it("renders a strain chart as PNG bytes", async () => {
        const handler = new CalculationTaskHandler(algorithm);
        const outcome = await handler.handle({
            kind: "strainChart",
            beatmapHash,
            osuFile,
            mods: [],
            clockRate: 1,
            color: "#3168e8",
        });

        if (!outcome.ok || !(outcome.value instanceof Uint8Array)) {
            expect.fail("expected PNG bytes");
        }

        expect(Buffer.from(outcome.value).subarray(1, 4).toString()).toBe(
            "PNG",
        );
    });

    it("reports invalid input with its code", async () => {
        const handler = new CalculationTaskHandler(algorithm);

        expect(
            await handler.handle({
                kind: "difficulty",
                beatmapHash: "x",
                osuFile: "garbage",
                mods: [],
            }),
        ).toEqual({
            ok: false,
            code: "INVALID_BEATMAP",
            message: "Beatmap has no hit objects",
        });

        expect(
            await handler.handle({
                kind: "readReplay",
                replay: new Uint8Array([1, 2, 3]),
            }),
        ).toMatchObject({
            ok: false,
            code: "INVALID_REPLAY",
        });
    });

    it("reports unexpected errors as calculation failures", async () => {
        const handler = new CalculationTaskHandler(algorithm);

        vi.spyOn(algorithm, "calculateDifficulty").mockImplementationOnce(
            () => {
                throw new Error("calculator exploded");
            },
        );

        expect(
            await handler.handle({
                kind: "difficulty",
                beatmapHash,
                osuFile,
                mods: [],
            }),
        ).toEqual({
            ok: false,
            code: "CALCULATION_FAILED",
            message: "calculator exploded",
        });
    });
});
```

Create `apps/processor/tests/unit/calculation/InlineRunner.test.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { InlineRunner } from "@/calculation/InlineRunner";
import {
    CalculationFailedError,
    UnprocessableEntityError,
} from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
import { md5Of, readBeatmapFixture } from "@test/utils/fixtures";
import { describe, expect, it, vi } from "vitest";

describe("InlineRunner", () => {
    const algorithm = createAlgorithm(Modes.Osu);
    const osuFile = readBeatmapFixture("loveLetter");

    it("returns task values", async () => {
        await using runner = new InlineRunner(algorithm);
        const attributes = await runner.calculateDifficulty({
            beatmapHash: md5Of(osuFile),
            osuFile,
            mods: [],
        });

        expect(attributes.starRating).toBeGreaterThan(0);
    });

    it("returns strain charts as buffers", async () => {
        await using runner = new InlineRunner(algorithm);
        const chart = await runner.renderStrainChart({
            beatmapHash: md5Of(osuFile),
            osuFile,
            mods: [],
            clockRate: 1,
            color: "#169c18",
        });

        expect(Buffer.isBuffer(chart)).toBe(true);
    });

    it("throws invalid input as 422 errors", async () => {
        await using runner = new InlineRunner(algorithm);

        await expect(
            runner.readReplay(Buffer.from([0])),
        ).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it("throws calculator failures as 500 errors", async () => {
        await using runner = new InlineRunner(algorithm);

        vi.spyOn(algorithm, "calculateDifficulty").mockImplementationOnce(
            () => {
                throw new Error("boom");
            },
        );

        await expect(
            runner.calculateDifficulty({
                beatmapHash: "other",
                osuFile,
                mods: [],
            }),
        ).rejects.toBeInstanceOf(CalculationFailedError);
    });
});
```

Create `apps/processor/tests/fixtures/workers/fake-worker.mjs`:

```js
// A stand-in for the real worker, used to test PiscinaRunner without bundling TypeScript.
export default async function handle(task) {
    if (task.kind === "readReplay" && task.replay.length === 0) {
        throw new Error("worker crashed");
    }

    if (task.kind === "strainChart") {
        await new Promise((resolve) => setTimeout(resolve, 300));

        return { ok: true, value: new Uint8Array([1, 2, 3]) };
    }

    if (task.kind === "analyzeReplay") {
        return { ok: false, code: "INVALID_REPLAY", message: "bad replay" };
    }

    return { ok: true, value: { kind: task.kind } };
}
```

Create `apps/processor/tests/unit/calculation/PiscinaRunner.test.ts`:

```ts
import { PiscinaRunner } from "@/calculation/PiscinaRunner";
import {
    CalculationFailedError,
    ServiceUnavailableError,
    UnprocessableEntityError,
} from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import { describe, expect, it } from "vitest";

const workerFile = new URL(
    "../../fixtures/workers/fake-worker.mjs",
    import.meta.url,
);
const chartInput = {
    beatmapHash: "h",
    osuFile: "f",
    mods: [],
    clockRate: 1,
    color: "#000000",
};

function createRunner(maxQueue = 10): PiscinaRunner {
    return new PiscinaRunner({
        mode: Modes.Droid,
        threads: 1,
        maxQueue,
        workerFile,
    });
}

describe("PiscinaRunner", () => {
    it("returns values from the worker, converting bytes to buffers", async () => {
        await using runner = createRunner();

        expect(await runner.renderStrainChart(chartInput)).toEqual(
            Buffer.from([1, 2, 3]),
        );
    });

    it("maps worker-reported invalid input to 422 errors", async () => {
        await using runner = createRunner();

        await expect(
            runner.analyzeReplay({
                beatmapHash: "h",
                osuFile: "f",
                replay: Buffer.from([1]),
                difficulty: calculateFixtureDifficulty(
                    "discoprince",
                    Modes.Droid,
                ),
            }),
        ).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it("maps worker crashes to calculation failures", async () => {
        await using runner = createRunner();

        await expect(runner.readReplay(Buffer.alloc(0))).rejects.toBeInstanceOf(
            CalculationFailedError,
        );
    });

    it("rejects with OVERLOADED when the queue is full", async () => {
        await using runner = createRunner(1);

        const results = await Promise.allSettled([
            runner.renderStrainChart(chartInput),
            runner.renderStrainChart(chartInput),
            runner.renderStrainChart(chartInput),
        ]);

        const reasons = results.flatMap((result) =>
            result.status === "rejected" ? [result.reason] : [],
        );

        expect(reasons).toHaveLength(1);
        expect(reasons[0]).toBeInstanceOf(ServiceUnavailableError);
        expect(reasons[0]).toMatchObject({ code: "OVERLOADED" });
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test tests/unit/calculation`
Expected: FAIL; modules under `@/calculation/` not found.

- [ ] **Step 4: Implement**

Create `apps/processor/src/calculation/tasks.ts`:

```ts
import {
    AlgorithmInputError,
    type AlgorithmErrorCode,
} from "@/algorithms/errors";
import type { Algorithm } from "@/algorithms/types";
import { LruCache } from "@/utils/LruCache";
import { ModUtil, type Beatmap, type SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import generateStrainChart from "@rian8337/osu-strain-graph-generator";

/**
 * Work that may run in a worker thread. Every field must survive structured cloning, so mods are serialized.
 */
export type CalculationTask =
    | {
          kind: "difficulty";
          beatmapHash: string;
          osuFile: string;
          mods: SerializedMod[];
      }
    | { kind: "readReplay"; replay: Uint8Array }
    | {
          kind: "analyzeReplay";
          beatmapHash: string;
          osuFile: string;
          replay: Uint8Array;
          difficulty: CacheableDifficultyAttributes<IDifficultyAttributes>;
      }
    | {
          kind: "strainChart";
          beatmapHash: string;
          osuFile: string;
          mods: SerializedMod[];
          clockRate: number;
          color: string;
      };

/**
 * The result of a task. Errors are returned as data because error classes do not survive the worker boundary.
 */
export type TaskOutcome =
    | { ok: true; value: unknown }
    | {
          ok: false;
          code: AlgorithmErrorCode | "CALCULATION_FAILED";
          message: string;
      };

/**
 * Runs calculation tasks with an algorithm. Decoded beatmaps are cached by hash.
 */
export class CalculationTaskHandler {
    private readonly beatmaps: LruCache<string, Beatmap>;

    /**
     * @param algorithm The algorithm to calculate with.
     * @param beatmapCacheSize How many decoded beatmaps to keep.
     */
    constructor(
        private readonly algorithm: Algorithm,
        beatmapCacheSize = 32,
    ) {
        this.beatmaps = new LruCache(beatmapCacheSize);
    }

    /**
     * Runs a task. Never throws: failures are returned as outcomes.
     */
    async handle(task: CalculationTask): Promise<TaskOutcome> {
        try {
            return { ok: true, value: await this.execute(task) };
        } catch (e) {
            if (e instanceof AlgorithmInputError) {
                return { ok: false, code: e.code, message: e.message };
            }

            return {
                ok: false,
                code: "CALCULATION_FAILED",
                message: e instanceof Error ? e.message : "Calculation failed",
            };
        }
    }

    private async execute(task: CalculationTask): Promise<unknown> {
        switch (task.kind) {
            case "difficulty":
                return this.algorithm.calculateDifficulty(
                    this.decode(task.beatmapHash, task.osuFile),
                    ModUtil.deserializeMods(task.mods),
                );

            case "readReplay":
                return this.algorithm.readReplay(Buffer.from(task.replay));

            case "analyzeReplay":
                return this.algorithm.analyzeReplay(
                    Buffer.from(task.replay),
                    this.decode(task.beatmapHash, task.osuFile),
                    task.difficulty,
                );

            case "strainChart": {
                const beatmap = this.decode(task.beatmapHash, task.osuFile);
                const peaks = this.algorithm.calculateStrainPeaks(
                    beatmap,
                    ModUtil.deserializeMods(task.mods),
                );

                return generateStrainChart(beatmap, peaks, task.clockRate, {
                    color: task.color,
                });
            }
        }
    }

    private decode(beatmapHash: string, osuFile: string): Beatmap {
        let beatmap = this.beatmaps.get(beatmapHash);

        if (!beatmap) {
            beatmap = this.algorithm.decodeBeatmap(osuFile);
            this.beatmaps.set(beatmapHash, beatmap);
        }

        return beatmap;
    }
}
```

Create `apps/processor/src/calculation/outcome.ts`:

```ts
import { AlgorithmInputError } from "@/algorithms/errors";
import { CalculationFailedError } from "@/types/errors";
import type { TaskOutcome } from "./tasks";

/**
 * Returns a task's value, or throws the API error matching its failure.
 *
 * @template T The value type the task produces. Workers return untyped data, so the caller states it.
 */
export function unwrapOutcome<T>(outcome: TaskOutcome): T {
    if (!outcome.ok) {
        throw outcome.code === "CALCULATION_FAILED"
            ? new CalculationFailedError(outcome.message)
            : new AlgorithmInputError(
                  outcome.code,
                  outcome.message,
              ).toApiError();
    }

    // The task kind determines the value type; BaseRunner pairs each kind with its type.
    return outcome.value as T;
}
```

Create `apps/processor/src/calculation/ICalculationRunner.ts`:

```ts
import type { ReplayAnalysis, ReplayHeader } from "@/algorithms/types";
import type { SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";

/**
 * Runs heavy calculations without blocking request handling. Disposing waits for running tasks to finish, then
 * releases resources.
 *
 * Methods throw API errors: `UnprocessableEntityError` for invalid input, `CalculationFailedError` for calculator
 * failures, and `ServiceUnavailableError` (`OVERLOADED`) when the queue is full.
 */
export interface ICalculationRunner extends AsyncDisposable {
    calculateDifficulty(input: {
        beatmapHash: string;
        osuFile: string;
        mods: SerializedMod[];
    }): Promise<CacheableDifficultyAttributes<IDifficultyAttributes>>;

    readReplay(replay: Buffer): Promise<ReplayHeader>;

    analyzeReplay(input: {
        beatmapHash: string;
        osuFile: string;
        replay: Buffer;
        difficulty: CacheableDifficultyAttributes<IDifficultyAttributes>;
    }): Promise<ReplayAnalysis>;

    renderStrainChart(input: {
        beatmapHash: string;
        osuFile: string;
        mods: SerializedMod[];
        clockRate: number;
        color: string;
    }): Promise<Buffer>;
}
```

Create `apps/processor/src/calculation/BaseRunner.ts`:

```ts
import type { ReplayAnalysis, ReplayHeader } from "@/algorithms/types";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import type { ICalculationRunner } from "./ICalculationRunner";
import { unwrapOutcome } from "./outcome";
import type { CalculationTask, TaskOutcome } from "./tasks";

/**
 * Implements the runner methods on top of a task dispatcher.
 */
export abstract class BaseRunner implements ICalculationRunner {
    protected abstract dispatch(task: CalculationTask): Promise<TaskOutcome>;

    abstract [Symbol.asyncDispose](): Promise<void>;

    async calculateDifficulty(
        input: Parameters<ICalculationRunner["calculateDifficulty"]>[0],
    ) {
        return unwrapOutcome<
            CacheableDifficultyAttributes<IDifficultyAttributes>
        >(await this.dispatch({ kind: "difficulty", ...input }));
    }

    async readReplay(replay: Buffer) {
        return unwrapOutcome<ReplayHeader>(
            await this.dispatch({ kind: "readReplay", replay }),
        );
    }

    async analyzeReplay(
        input: Parameters<ICalculationRunner["analyzeReplay"]>[0],
    ) {
        return unwrapOutcome<ReplayAnalysis>(
            await this.dispatch({ kind: "analyzeReplay", ...input }),
        );
    }

    async renderStrainChart(
        input: Parameters<ICalculationRunner["renderStrainChart"]>[0],
    ) {
        // Buffers arrive from workers as plain Uint8Arrays.
        return Buffer.from(
            unwrapOutcome<Uint8Array>(
                await this.dispatch({ kind: "strainChart", ...input }),
            ),
        );
    }
}
```

Create `apps/processor/src/calculation/InlineRunner.ts`:

```ts
import type { Algorithm } from "@/algorithms/types";
import { BaseRunner } from "./BaseRunner";
import {
    CalculationTaskHandler,
    type CalculationTask,
    type TaskOutcome,
} from "./tasks";

/**
 * Runs calculations on the calling thread. Used in tests and when `CALCULATION_THREADS` is 0.
 */
export class InlineRunner extends BaseRunner {
    private readonly handler: CalculationTaskHandler;

    constructor(algorithm: Algorithm) {
        super();
        this.handler = new CalculationTaskHandler(algorithm);
    }

    protected dispatch(task: CalculationTask): Promise<TaskOutcome> {
        return this.handler.handle(task);
    }

    [Symbol.asyncDispose](): Promise<void> {
        // Nothing to release: tasks run on the calling thread.
        return Promise.resolve();
    }
}
```

Create `apps/processor/src/calculation/PiscinaRunner.ts`:

```ts
import {
    CalculationFailedError,
    ServiceUnavailableError,
} from "@/types/errors";
import type { Modes } from "@rian8337/osu-base";
import { Piscina } from "piscina";
import { BaseRunner } from "./BaseRunner";
import type { CalculationTask, TaskOutcome } from "./tasks";

export interface PiscinaRunnerOptions {
    readonly mode: Modes;
    readonly threads: number;
    readonly maxQueue: number;

    /**
     * The worker module. Defaults to `worker.mjs` next to the bundled entry, so workers run the snapshot's code.
     */
    readonly workerFile?: URL;
}

/**
 * Runs calculations in a pool of worker threads.
 */
export class PiscinaRunner extends BaseRunner {
    private readonly pool: Piscina<CalculationTask, TaskOutcome>;

    constructor(options: PiscinaRunnerOptions) {
        super();

        this.pool = new Piscina({
            filename: (
                options.workerFile ?? new URL("./worker.mjs", import.meta.url)
            ).href,
            workerData: { mode: options.mode },
            minThreads: options.threads,
            maxThreads: options.threads,
            maxQueue: options.maxQueue,
        });
    }

    protected async dispatch(task: CalculationTask): Promise<TaskOutcome> {
        try {
            return await this.pool.run(task);
        } catch (e) {
            if (e instanceof Error && /queue is at limit/i.test(e.message)) {
                throw new ServiceUnavailableError(
                    "OVERLOADED",
                    "Calculation queue is full; retry later",
                );
            }

            throw new CalculationFailedError(
                e instanceof Error ? e.message : "Calculation worker failed",
            );
        }
    }

    /**
     * Waits for queued and running tasks to finish, then stops the workers.
     */
    [Symbol.asyncDispose](): Promise<void> {
        return this.pool.close();
    }
}
```

Create `apps/processor/src/calculation/worker.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { Modes } from "@rian8337/osu-base";
import { workerData } from "node:worker_threads";
import { z } from "zod";
import { CalculationTaskHandler, type CalculationTask } from "./tasks";

const { mode } = z.object({ mode: z.enum(Modes) }).parse(workerData);
const handler = new CalculationTaskHandler(createAlgorithm(mode));

/**
 * The piscina worker entry: runs one calculation task.
 */
export default function runTask(task: CalculationTask) {
    return handler.handle(task);
}
```

Create `apps/processor/src/calculation/strainChartColor.ts`:

```ts
import type { CalculatorAlgorithm } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";

const colors: Record<Modes, Record<CalculatorAlgorithm, string>> = {
    [Modes.Droid]: { live: "#3168e8", rebalance: "#9e1fc4" },
    [Modes.Osu]: { live: "#169c18", rebalance: "#de8723" },
};

/**
 * The strain chart color for a mode and algorithm, matching the old backend.
 */
export function strainChartColor(
    mode: Modes,
    algorithm: CalculatorAlgorithm,
): string {
    return colors[mode][algorithm];
}
```

In `apps/processor/src/dependencies/tokens.ts`, add `import type { ICalculationRunner } from "@/calculation/ICalculationRunner";` and the entry:

```ts
    calculationRunner: Symbol.for("calculationRunner") as InjectionToken<ICalculationRunner>,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A apps/processor
git commit -m "Add inline and worker pool calculation runners" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Configuration and variant manifest

**Files:**

- Modify: `apps/processor/src/types/env.ts`, `apps/processor/src/dependencies/tokens.ts`, `docs/superpowers/specs/2026-10-05-processor-design.md`
- Create: `apps/processor/src/config/config.ts`, `apps/processor/src/manifest/manifest.ts`, `apps/processor/src/manifest/calculatorVersion.ts`
- Test: `apps/processor/tests/unit/config/config.test.ts`, `apps/processor/tests/unit/manifest/manifest.test.ts`

**Interfaces:**

- Produces:
    - `interface Config { port; database: { host; port; name; user; password }; beatmapService: { url; key }; apiKey; calculation: { threads; maxQueue } }`, `loadConfig(env: NodeJS.ProcessEnv): Config`, `class ConfigError extends Error`
    - `interface VariantManifest { id; mode: Modes; algorithm: CalculatorAlgorithm; calculatorVersion; source; builtAt }`, `loadManifest(manifestFile: URL, env: NodeJS.ProcessEnv): Promise<VariantManifest>`
    - `computeCalculatorVersion(files: readonly string[]): Promise<string>` (16 hex characters)
    - `dependencyTokens.config: InjectionToken<Config>`, `dependencyTokens.manifest: InjectionToken<VariantManifest>`

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/config/config.test.ts`:

```ts
import { ConfigError, loadConfig } from "@/config/config";
import { describe, expect, it } from "vitest";

const validEnv = {
    PORT: "3006",
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "dpp_droid_live",
    DATABASE_USER: "dpp",
    DATABASE_PASSWORD: "secret",
    BEATMAP_SERVICE_URL: "http://localhost:3017/api/beatmap/",
    BEATMAP_SERVICE_KEY: "beatmap-key",
    API_KEY: "0123456789abcdef",
    CALCULATION_THREADS: "2",
};

describe("loadConfig", () => {
    it("parses and normalizes valid settings", () => {
        expect(loadConfig(validEnv)).toEqual({
            port: 3006,
            database: {
                host: "localhost",
                port: 5432,
                name: "dpp_droid_live",
                user: "dpp",
                password: "secret",
            },
            beatmapService: {
                url: "http://localhost:3017/api/beatmap",
                key: "beatmap-key",
            },
            apiKey: "0123456789abcdef",
            calculation: { threads: 2, maxQueue: 100 },
        });
    });

    it("allows zero threads", () => {
        expect(
            loadConfig({ ...validEnv, CALCULATION_THREADS: "0" }).calculation
                .threads,
        ).toBe(0);
    });

    it("reports every invalid setting at once, by name, without values", () => {
        const { PORT: _, ...missingPort } = validEnv;
        const load = () =>
            loadConfig({
                ...missingPort,
                API_KEY: "short",
                BEATMAP_SERVICE_URL: "nope",
            });

        expect(load).toThrow(ConfigError);
        expect(load).toThrow(/PORT/);
        expect(load).toThrow(/API_KEY/);
        expect(load).toThrow(/BEATMAP_SERVICE_URL/);
        expect(load).not.toThrow(/short/);
    });
});
```

Create `apps/processor/tests/unit/manifest/manifest.test.ts`:

```ts
import { computeCalculatorVersion } from "@/manifest/calculatorVersion";
import { loadManifest } from "@/manifest/manifest";
import { Modes } from "@rian8337/osu-base";
import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function createTemporaryDirectory() {
    return mkdtempDisposable(join(tmpdir(), "manifest-"));
}

describe("computeCalculatorVersion", () => {
    it("is 16 hex characters and changes when any file changes", async () => {
        await using directory = await createTemporaryDirectory();
        const a = join(directory.path, "a.js");
        const b = join(directory.path, "b.js");

        await writeFile(a, "calculator");
        await writeFile(b, "base");
        const first = await computeCalculatorVersion([a, b]);

        expect(first).toMatch(/^[0-9a-f]{16}$/);
        expect(await computeCalculatorVersion([a, b])).toBe(first);

        await writeFile(b, "base changed");
        expect(await computeCalculatorVersion([a, b])).not.toBe(first);
    });
});

describe("loadManifest", () => {
    it("reads manifest.json when it exists", async () => {
        await using directory = await createTemporaryDirectory();
        const manifest = {
            id: "flowaim-experiment",
            mode: Modes.Droid,
            algorithm: "rebalance",
            calculatorVersion: "0123456789abcdef",
            source: "/home/rian/osu-droid-module-flowaim",
            builtAt: "2026-10-05T14:30:00.000Z",
        };

        await writeFile(
            join(directory.path, "manifest.json"),
            JSON.stringify(manifest),
        );

        expect(
            await loadManifest(
                pathToFileURL(join(directory.path, "manifest.json")),
                {},
            ),
        ).toEqual(manifest);
    });

    it("rejects an invalid manifest.json", async () => {
        await using directory = await createTemporaryDirectory();

        await writeFile(
            join(directory.path, "manifest.json"),
            JSON.stringify({ id: "x" }),
        );

        await expect(
            loadManifest(
                pathToFileURL(join(directory.path, "manifest.json")),
                {},
            ),
        ).rejects.toThrow(/manifest/i);
    });

    it("builds a development manifest from DEV_MODE when there is no manifest.json", async () => {
        await using directory = await createTemporaryDirectory();
        const manifest = await loadManifest(
            pathToFileURL(join(directory.path, "manifest.json")),
            {
                DEV_MODE: Modes.Osu,
            },
        );

        expect(manifest).toMatchObject({
            id: `dev-${Modes.Osu}`,
            mode: Modes.Osu,
            algorithm: "live",
            source: "npm",
        });
        expect(manifest.calculatorVersion).toMatch(/^[0-9a-f]{16}$/);
    });

    it("requires DEV_MODE when there is no manifest.json", async () => {
        await using directory = await createTemporaryDirectory();

        await expect(
            loadManifest(
                pathToFileURL(join(directory.path, "manifest.json")),
                {},
            ),
        ).rejects.toThrow(/DEV_MODE/);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test tests/unit/config tests/unit/manifest`
Expected: FAIL; modules not found.

- [ ] **Step 3: Implement**

Replace `apps/processor/src/types/env.ts` with:

```ts
/**
 * Environment variable keys used in the application.
 */
export enum EnvironmentVariableKey {
    Port = "PORT",
    DatabaseHost = "DATABASE_HOST",
    DatabasePort = "DATABASE_PORT",
    DatabaseName = "DATABASE_NAME",
    DatabaseUser = "DATABASE_USER",
    DatabasePassword = "DATABASE_PASSWORD",
    BeatmapServiceUrl = "BEATMAP_SERVICE_URL",
    BeatmapServiceKey = "BEATMAP_SERVICE_KEY",
    ApiKey = "API_KEY",
    CalculationThreads = "CALCULATION_THREADS",
    CalculationMaxQueue = "CALCULATION_MAX_QUEUE",
    DevMode = "DEV_MODE",
}
```

Create `apps/processor/src/config/config.ts`:

```ts
import { EnvironmentVariableKey as Key } from "@/types/env";
import { availableParallelism } from "node:os";
import { z } from "zod";

/**
 * Deployment settings, read from environment variables.
 */
export interface Config {
    readonly port: number;
    readonly database: {
        readonly host: string;
        readonly port: number;
        readonly name: string;
        readonly user: string;
        readonly password: string;
    };
    readonly beatmapService: {
        /**
         * Base URL without a trailing slash, e.g. `http://localhost:3017/api/beatmap`.
         */
        readonly url: string;
        readonly key: string;
    };
    readonly apiKey: string;
    readonly calculation: {
        /**
         * Worker threads. 0 runs calculations on the main thread.
         */
        readonly threads: number;
        readonly maxQueue: number;
    };
}

/**
 * Thrown when environment variables are missing or invalid. The message names every invalid variable but never
 * includes values.
 */
export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConfigError";
    }
}

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
    [Key.Port]: port,
    [Key.DatabaseHost]: z.string().min(1),
    [Key.DatabasePort]: port.default(5432),
    [Key.DatabaseName]: z.string().min(1),
    [Key.DatabaseUser]: z.string().min(1),
    [Key.DatabasePassword]: z.string().default(""),
    [Key.BeatmapServiceUrl]: z.url(),
    [Key.BeatmapServiceKey]: z.string().default(""),
    [Key.ApiKey]: z.string().min(16, "must be at least 16 characters"),
    [Key.CalculationThreads]: z.coerce
        .number()
        .int()
        .min(0)
        .default(availableParallelism()),
    [Key.CalculationMaxQueue]: z.coerce.number().int().min(1).default(100),
});

/**
 * Reads and validates the configuration.
 *
 * @throws {ConfigError} If any variable is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const result = schema.safeParse(env);

    if (!result.success) {
        const problems = result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );

        throw new ConfigError(
            `Invalid configuration:\n  ${problems.join("\n  ")}`,
        );
    }

    const values = result.data;

    return {
        port: values[Key.Port],
        database: {
            host: values[Key.DatabaseHost],
            port: values[Key.DatabasePort],
            name: values[Key.DatabaseName],
            user: values[Key.DatabaseUser],
            password: values[Key.DatabasePassword],
        },
        beatmapService: {
            url: values[Key.BeatmapServiceUrl].replace(/\/+$/, ""),
            key: values[Key.BeatmapServiceKey],
        },
        apiKey: values[Key.ApiKey],
        calculation: {
            threads: values[Key.CalculationThreads],
            maxQueue: values[Key.CalculationMaxQueue],
        },
    };
}
```

Create `apps/processor/src/manifest/calculatorVersion.ts` (no path aliases: `scripts/` imports this file under Node's type stripping):

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Computes the calculator version: the first 16 hex characters of SHA-256 over the given files, in order.
 *
 * Pass the calculator entry file followed by the osu-base entry file.
 */
export async function computeCalculatorVersion(
    files: readonly string[],
): Promise<string> {
    const hash = createHash("sha256");

    for (const file of files) {
        hash.update(await readFile(file));
    }

    return hash.digest("hex").slice(0, 16);
}
```

Create `apps/processor/src/manifest/manifest.ts`:

```ts
import { EnvironmentVariableKey } from "@/types/env";
import type { CalculatorAlgorithm } from "@dpp/shared";
import { Modes } from "@rian8337/osu-base";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { z } from "zod";
import { computeCalculatorVersion } from "./calculatorVersion";

/**
 * Identifies the variant a process is running. Written by the build into each snapshot.
 */
export interface VariantManifest {
    readonly id: string;
    readonly mode: Modes;
    readonly algorithm: CalculatorAlgorithm;
    readonly calculatorVersion: string;

    /**
     * `"npm"`, or the path of the osu-droid-module checkout the snapshot was built from.
     */
    readonly source: string;
    readonly builtAt: string;
}

const manifestSchema = z.strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    mode: z.enum(Modes),
    algorithm: z.enum(["live", "rebalance"]),
    calculatorVersion: z.string().regex(/^[0-9a-f]{16}$/),
    source: z.string().min(1),
    builtAt: z.iso.datetime(),
}) satisfies z.ZodType<VariantManifest>;

/**
 * Loads the variant manifest.
 *
 * When `manifestFile` does not exist (running from source), a development manifest is built from the `DEV_MODE`
 * environment variable and the installed live calculator.
 */
export async function loadManifest(
    manifestFile: URL,
    env: NodeJS.ProcessEnv,
): Promise<VariantManifest> {
    let content: string | null;

    try {
        content = await readFile(manifestFile, "utf8");
    } catch {
        content = null;
    }

    if (content !== null) {
        const result = manifestSchema.safeParse(JSON.parse(content));

        if (!result.success) {
            throw new Error(
                `Invalid manifest.json: ${result.error.issues[0]?.message ?? "unknown error"}`,
            );
        }

        return result.data;
    }

    const mode = z.enum(Modes).safeParse(env[EnvironmentVariableKey.DevMode]);

    if (!mode.success) {
        throw new Error(
            `No manifest.json found; set DEV_MODE to one of ${Object.values(Modes).join(", ")} to run from source`,
        );
    }

    const require = createRequire(import.meta.url);

    return {
        id: `dev-${mode.data}`,
        mode: mode.data,
        algorithm: "live",
        calculatorVersion: await computeCalculatorVersion([
            require.resolve("@rian8337/osu-difficulty-calculator"),
            require.resolve("@rian8337/osu-base"),
        ]),
        source: "npm",
        builtAt: new Date().toISOString(),
    };
}
```

In `apps/processor/src/dependencies/tokens.ts`, add the imports `import type { Config } from "@/config/config";` and `import type { VariantManifest } from "@/manifest/manifest";` and the entries:

```ts
    config: Symbol.for("config") as InjectionToken<Config>,
    manifest: Symbol.for("manifest") as InjectionToken<VariantManifest>,
```

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-10-05-processor-design.md`, replace the sentence that begins "When running from source (development, tests), there is no `manifest.json`;" with:

```
When running from source (development, tests), there is no `manifest.json`; the manifest is built from the `DEV_MODE` (`droid`/`osu`) environment variable and the installed npm live calculator. Running rebalance or local calculator code requires a variant build, since redirecting packages needs the bundler. `DEV_MODE` is ignored when a `manifest.json` exists.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A apps/processor docs/superpowers/specs/2026-10-05-processor-design.md
git commit -m "Add configuration loading and variant manifests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Database schema, migrations, and repository

**Files:**

- Create: `apps/processor/drizzle.config.ts`, `apps/processor/src/database/schema.ts`, `apps/processor/src/database/types.ts`, `apps/processor/src/database/DatabaseConnection.ts`, `apps/processor/src/repositories/IDifficultyAttributesRepository.ts`, `apps/processor/src/repositories/DifficultyAttributesRepository.ts`, `apps/processor/src/repositories/index.ts`, `apps/processor/tests/utils/database.ts`, `apps/processor/drizzle/` (generated)
- Modify: `apps/processor/src/dependencies/tokens.ts`
- Test: `apps/processor/tests/integration/repositories/DifficultyAttributesRepository.int.test.ts`

**Interfaces:**

- Consumes: `Config` (Task 7), `Injectable` (Task 3), `calculateFixtureDifficulty` (Task 6).
- Produces:
    - `difficultyAttributesTable`, `schema`, `type Database = PgDatabase<PgQueryResultHKT, typeof schema>`
    - `class DatabaseConnection implements AsyncDisposable`: `constructor(settings: Config["database"])`, `readonly db: Database`, `migrate(migrationsFolder: string): Promise<void>`, `[Symbol.asyncDispose]()` (closes the pool)
    - `interface DifficultyAttributesKey { calculatorVersion: string; beatmapHash: string; mods: string }`
    - `interface IDifficultyAttributesRepository`: `find(key): Promise<CacheableDifficultyAttributes<IDifficultyAttributes> | null>`, `insert(key, attributes): Promise<void>`, `deleteOtherVersions(calculatorVersion: string): Promise<number>`
    - `interface TestDatabase extends AsyncDisposable { readonly db: Database }`, `createTestDatabase(): Promise<TestDatabase>` (test util; PGlite with migrations applied, closed on dispose)
    - Tokens `db`, `difficultyAttributesRepository`

- [ ] **Step 1: Schema and Drizzle configuration**

Create `apps/processor/src/database/schema.ts`:

```ts
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import {
    char,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

/**
 * Cached difficulty attributes, keyed by calculator version, beatmap file hash, and canonical difficulty-adjusting
 * mods.
 *
 * `calculator_version` leads the primary key: lookups match all three columns, so the order does not affect them,
 * and pruning by version can use the index prefix.
 */
export const difficultyAttributesTable = pgTable(
    "difficulty_attributes",
    {
        calculatorVersion: text().notNull(),
        beatmapHash: char({ length: 32 }).notNull(),
        mods: text().notNull(),
        attributes: jsonb()
            .$type<CacheableDifficultyAttributes<IDifficultyAttributes>>()
            .notNull(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.calculatorVersion, table.beatmapHash, table.mods],
        }),
    ],
);

export const schema = { difficultyAttributesTable };
```

Create `apps/processor/src/database/types.ts`:

```ts
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { schema } from "./schema";

/**
 * A Drizzle database with the processor schema. Both node-postgres (production) and PGlite (tests) databases are
 * assignable to it (verified).
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
```

Create `apps/processor/src/database/DatabaseConnection.ts`:

```ts
import type { Config } from "@/config/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { schema } from "./schema";
import type { Database } from "./types";

/**
 * A connection pool to the variant's Postgres database. Disposing closes the pool.
 */
export class DatabaseConnection implements AsyncDisposable {
    private readonly pool: Pool;
    private readonly nodePgDb: NodePgDatabase<typeof schema>;

    constructor(settings: Config["database"]) {
        this.pool = new Pool({
            host: settings.host,
            port: settings.port,
            database: settings.name,
            user: settings.user,
            password: settings.password,
        });

        this.nodePgDb = drizzle(this.pool, { schema, casing: "snake_case" });
    }

    /**
     * The database, for repositories.
     */
    get db(): Database {
        return this.nodePgDb;
    }

    /**
     * Applies pending migrations from `migrationsFolder`.
     */
    async migrate(migrationsFolder: string): Promise<void> {
        await migrate(this.nodePgDb, { migrationsFolder });
    }

    [Symbol.asyncDispose](): Promise<void> {
        return this.pool.end();
    }
}
```

Create `apps/processor/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/database/schema.ts",
    out: "./drizzle",
    casing: "snake_case",
    strict: true,
});
```

- [ ] **Step 2: Generate the initial migration**

Run: `pnpm --filter @dpp/processor db:generate`
Expected: creates `apps/processor/drizzle/0000_<name>.sql` containing `CREATE TABLE "difficulty_attributes"` with columns `calculator_version`, `beatmap_hash`, `mods`, `attributes`, `created_at` and a primary key on `("calculator_version","beatmap_hash","mods")`, plus `drizzle/meta/`.

- [ ] **Step 3: Test database utility**

Create `apps/processor/tests/utils/database.ts`:

```ts
import { schema } from "@/database/schema";
import type { Database } from "@/database/types";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";

export const migrationsFolder = fileURLToPath(
    new URL("../../drizzle", import.meta.url),
);

/**
 * An in-memory Postgres database for a test. Disposing closes it.
 */
export interface TestDatabase extends AsyncDisposable {
    readonly db: Database;
}

/**
 * Creates an in-memory Postgres (PGlite) database with all migrations applied.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
    const client = new PGlite();
    const db = drizzle(client, { schema, casing: "snake_case" });

    await migrate(db, { migrationsFolder });

    return { db, [Symbol.asyncDispose]: () => client[Symbol.asyncDispose]() };
}
```

- [ ] **Step 4: Write the failing test**

Create `apps/processor/tests/integration/repositories/DifficultyAttributesRepository.int.test.ts`:

```ts
import { DifficultyAttributesRepository } from "@/repositories/DifficultyAttributesRepository";
import { ModDoubleTime, Modes } from "@rian8337/osu-base";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { modMap } from "@test/utils/mods";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const key = {
    calculatorVersion: "aaaaaaaaaaaaaaaa",
    beatmapHash: "0123456789abcdef0123456789abcdef",
    mods: '[{"acronym":"DT"}]',
};

// Real droid attributes include nested JSON (difficult sliders, three-finger sections).
const attributes = calculateFixtureDifficulty(
    "loveLetter",
    Modes.Droid,
    modMap(new ModDoubleTime()),
);

describe("DifficultyAttributesRepository (integration)", () => {
    let testDatabase: TestDatabase;
    let repository: DifficultyAttributesRepository;

    beforeEach(async () => {
        testDatabase = await createTestDatabase();
        repository = new DifficultyAttributesRepository(testDatabase.db);
    });

    afterEach(() => testDatabase[Symbol.asyncDispose]());

    it("returns null when nothing is stored", async () => {
        expect(await repository.find(key)).toBeNull();
    });

    it("round-trips attributes, including nested JSON", async () => {
        await repository.insert(key, attributes);

        expect(await repository.find(key)).toEqual(attributes);
    });

    it("matches on every key column", async () => {
        await repository.insert(key, attributes);

        expect(await repository.find({ ...key, mods: "[]" })).toBeNull();
        expect(
            await repository.find({
                ...key,
                calculatorVersion: "bbbbbbbbbbbbbbbb",
            }),
        ).toBeNull();
        expect(
            await repository.find({ ...key, beatmapHash: "f".repeat(32) }),
        ).toBeNull();
    });

    it("ignores a duplicate insert", async () => {
        await repository.insert(key, attributes);
        await repository.insert(key, { ...attributes, starRating: 1 });

        expect((await repository.find(key))?.starRating).toBe(
            attributes.starRating,
        );
    });

    it("deletes rows of other calculator versions only", async () => {
        await repository.insert(key, attributes);
        await repository.insert(
            { ...key, calculatorVersion: "bbbbbbbbbbbbbbbb" },
            attributes,
        );
        await repository.insert(
            { ...key, calculatorVersion: "cccccccccccccccc" },
            attributes,
        );

        expect(
            await repository.deleteOtherVersions(key.calculatorVersion),
        ).toBe(2);
        expect(await repository.find(key)).toEqual(attributes);
    });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @dpp/processor test tests/integration/repositories`
Expected: FAIL; `@/repositories/DifficultyAttributesRepository` not found.

- [ ] **Step 6: Implement**

Create `apps/processor/src/repositories/IDifficultyAttributesRepository.ts`:

```ts
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";

/**
 * Identifies a stored set of difficulty attributes.
 */
export interface DifficultyAttributesKey {
    readonly calculatorVersion: string;
    readonly beatmapHash: string;

    /**
     * The canonical mods key from `createModsKey`.
     */
    readonly mods: string;
}

/**
 * Stores difficulty attributes in the variant's database.
 */
export interface IDifficultyAttributesRepository {
    /**
     * Finds stored attributes, or `null` if there are none.
     */
    find(
        key: DifficultyAttributesKey,
    ): Promise<CacheableDifficultyAttributes<IDifficultyAttributes> | null>;

    /**
     * Stores attributes. Does nothing if attributes with the same key already exist.
     */
    insert(
        key: DifficultyAttributesKey,
        attributes: CacheableDifficultyAttributes<IDifficultyAttributes>,
    ): Promise<void>;

    /**
     * Deletes attributes of every calculator version except the given one.
     *
     * @returns The number of deleted rows.
     */
    deleteOtherVersions(calculatorVersion: string): Promise<number>;
}
```

Create `apps/processor/src/repositories/DifficultyAttributesRepository.ts`:

```ts
import { difficultyAttributesTable as table } from "@/database/schema";
import type { Database } from "@/database/types";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { and, eq, ne } from "drizzle-orm";
import { inject } from "tsyringe";
import type {
    DifficultyAttributesKey,
    IDifficultyAttributesRepository,
} from "./IDifficultyAttributesRepository";

@Injectable(dependencyTokens.difficultyAttributesRepository)
export class DifficultyAttributesRepository implements IDifficultyAttributesRepository {
    constructor(@inject(dependencyTokens.db) private readonly db: Database) {}

    async find(
        key: DifficultyAttributesKey,
    ): Promise<CacheableDifficultyAttributes<IDifficultyAttributes> | null> {
        const rows = await this.db
            .select({ attributes: table.attributes })
            .from(table)
            .where(
                and(
                    eq(table.calculatorVersion, key.calculatorVersion),
                    eq(table.beatmapHash, key.beatmapHash),
                    eq(table.mods, key.mods),
                ),
            )
            .limit(1);

        return rows[0]?.attributes ?? null;
    }

    async insert(
        key: DifficultyAttributesKey,
        attributes: CacheableDifficultyAttributes<IDifficultyAttributes>,
    ): Promise<void> {
        await this.db
            .insert(table)
            .values({ ...key, attributes })
            .onConflictDoNothing();
    }

    async deleteOtherVersions(calculatorVersion: string): Promise<number> {
        // Usually deletes most of the table, where a sequential scan is the efficient plan anyway.
        const deleted = await this.db
            .delete(table)
            .where(ne(table.calculatorVersion, calculatorVersion))
            .returning({ beatmapHash: table.beatmapHash });

        return deleted.length;
    }
}
```

Create `apps/processor/src/repositories/index.ts`:

```ts
export * from "./DifficultyAttributesRepository";
export * from "./IDifficultyAttributesRepository";
```

In `apps/processor/src/dependencies/tokens.ts`, add the imports `import type { Database } from "@/database/types";` and `import type { IDifficultyAttributesRepository } from "@/repositories/IDifficultyAttributesRepository";` and the entries:

```ts
    db: Symbol.for("db") as InjectionToken<Database>,
    difficultyAttributesRepository: Symbol.for(
        "difficultyAttributesRepository",
    ) as InjectionToken<IDifficultyAttributesRepository>,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A apps/processor
git commit -m "Add difficulty attributes schema and repository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Beatmap service client and beatmap service

**Files:**

- Create: `apps/processor/src/clients/IBeatmapServiceClient.ts`, `apps/processor/src/clients/BeatmapServiceClient.ts`, `apps/processor/src/clients/index.ts`, `apps/processor/src/services/IBeatmapService.ts`, `apps/processor/src/services/BeatmapService.ts`, `apps/processor/src/services/index.ts`, `apps/processor/tests/utils/beatmaps.ts`
- Modify: `apps/processor/src/dependencies/tokens.ts`
- Test: `apps/processor/tests/unit/clients/BeatmapServiceClient.test.ts`, `apps/processor/tests/unit/services/BeatmapService.test.ts`

**Interfaces:**

- Consumes: `Config` (Task 7), `LruCache`, `md5`, API errors, `Injectable` (Task 3), `BeatmapReference` from `@dpp/shared`.
- Produces:
    - `interface BeatmapMetadata { id: number; hash: string }`
    - `interface IBeatmapServiceClient`: `getBeatmap(reference: { id: number } | { hash: string }): Promise<BeatmapMetadata | null>`, `getBeatmapFile(id: number): Promise<Buffer | null>`
    - `interface ResolvedBeatmap { hash: string; cacheable: boolean; getFile(): Promise<string> }`
    - `interface IBeatmapService { resolve(reference: BeatmapReference): Promise<ResolvedBeatmap> }`
    - `class FixtureBeatmapServiceClient implements IBeatmapServiceClient` (test util serving the beatmap fixtures by `beatmapFixtures[...].id` and hash)
    - Tokens `beatmapServiceClient`, `beatmapService`

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/clients/BeatmapServiceClient.test.ts`:

```ts
import { BeatmapServiceClient } from "@/clients/BeatmapServiceClient";
import type { Config } from "@/config/config";
import { ServiceUnavailableError } from "@/types/errors";
import { afterEach, describe, expect, it, vi } from "vitest";

const config: Config = {
    port: 3006,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    beatmapService: {
        url: "http://beatmaps.local/api/beatmap",
        key: "beatmap-key",
    },
    apiKey: "0123456789abcdef",
    calculation: { threads: 0, maxQueue: 100 },
};

function stubFetch(response: Response | Error) {
    const fetchMock = vi.fn<typeof fetch>(() =>
        response instanceof Error
            ? Promise.reject(response)
            : Promise.resolve(response),
    );

    vi.stubGlobal("fetch", fetchMock);

    return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
    const input = fetchMock.mock.calls[0]?.[0];

    return new URL(input instanceof Request ? input.url : String(input));
}

describe("BeatmapServiceClient", () => {
    const client = new BeatmapServiceClient(config);

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("requests metadata by ID with the key and maps the response", async () => {
        const fetchMock = stubFetch(
            Response.json({
                beatmap_id: "75",
                file_md5: "0123456789abcdef0123456789abcdef",
                title: "x",
            }),
        );

        expect(await client.getBeatmap({ id: 75 })).toEqual({
            id: 75,
            hash: "0123456789abcdef0123456789abcdef",
        });

        const url = requestedUrl(fetchMock);
        expect(url.pathname).toBe("/api/beatmap/getbeatmap");
        expect(url.searchParams.get("id")).toBe("75");
        expect(url.searchParams.get("key")).toBe("beatmap-key");
    });

    it("requests metadata by hash", async () => {
        const fetchMock = stubFetch(
            Response.json({ beatmap_id: "1", file_md5: "a".repeat(32) }),
        );

        await client.getBeatmap({ hash: "a".repeat(32) });

        expect(requestedUrl(fetchMock).searchParams.get("hash")).toBe(
            "a".repeat(32),
        );
    });

    it("returns null on 404", async () => {
        stubFetch(new Response("missing", { status: 404 }));
        expect(await client.getBeatmap({ id: 1 })).toBeNull();

        stubFetch(new Response("missing", { status: 404 }));
        expect(await client.getBeatmapFile(1)).toBeNull();
    });

    it("returns file bytes unchanged", async () => {
        const bytes = Buffer.from("﻿osu file format v14");
        stubFetch(new Response(bytes));

        expect(await client.getBeatmapFile(1)).toEqual(bytes);
    });

    it.each([
        ["a server error", new Response("oops", { status: 500 })],
        ["a network error", new TypeError("fetch failed")],
        [
            "a timeout",
            new DOMException("The operation timed out", "TimeoutError"),
        ],
    ])("throws BEATMAP_SERVICE_UNAVAILABLE on %s", async (_, response) => {
        stubFetch(response);

        await expect(client.getBeatmap({ id: 1 })).rejects.toBeInstanceOf(
            ServiceUnavailableError,
        );
    });
});
```

Create `apps/processor/tests/unit/services/BeatmapService.test.ts`:

```ts
import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import { BeatmapService } from "@/services/BeatmapService";
import { NotFoundError, ServiceUnavailableError } from "@/types/errors";
import { md5Of, readBeatmapFixture } from "@test/utils/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";

const osuFile = readBeatmapFixture("discoprince");
const fileBytes = Buffer.from(osuFile);
const metadata: BeatmapMetadata = { id: 3, hash: md5Of(fileBytes) };

describe("BeatmapService", () => {
    let getBeatmap: ReturnType<
        typeof vi.fn<IBeatmapServiceClient["getBeatmap"]>
    >;
    let getBeatmapFile: ReturnType<
        typeof vi.fn<IBeatmapServiceClient["getBeatmapFile"]>
    >;
    let service: BeatmapService;

    beforeEach(() => {
        getBeatmap = vi.fn<IBeatmapServiceClient["getBeatmap"]>(() =>
            Promise.resolve(metadata),
        );
        getBeatmapFile = vi.fn<IBeatmapServiceClient["getBeatmapFile"]>(() =>
            Promise.resolve(fileBytes),
        );
        service = new BeatmapService({ getBeatmap, getBeatmapFile });
    });

    it("resolves uploaded files locally without caching them", async () => {
        const beatmap = await service.resolve({ file: osuFile });

        expect(beatmap.hash).toBe(md5Of(osuFile));
        expect(beatmap.cacheable).toBe(false);
        expect(await beatmap.getFile()).toBe(osuFile);
        expect(getBeatmap).not.toHaveBeenCalled();
    });

    it("resolves by ID and fetches the file lazily", async () => {
        const beatmap = await service.resolve({ id: 3 });

        expect(beatmap).toMatchObject({ hash: metadata.hash, cacheable: true });
        expect(getBeatmapFile).not.toHaveBeenCalled();
        expect(await beatmap.getFile()).toBe(osuFile);
    });

    it("caches metadata under both ID and hash, and caches files", async () => {
        await (await service.resolve({ id: 3 })).getFile();
        await (await service.resolve({ hash: metadata.hash })).getFile();

        expect(getBeatmap).toHaveBeenCalledTimes(1);
        expect(getBeatmapFile).toHaveBeenCalledTimes(1);
    });

    it("throws BEATMAP_NOT_FOUND when the beatmap or its file is missing", async () => {
        getBeatmap.mockResolvedValueOnce(null);
        await expect(service.resolve({ id: 9 })).rejects.toBeInstanceOf(
            NotFoundError,
        );

        getBeatmapFile.mockResolvedValueOnce(null);
        await expect(
            (await service.resolve({ id: 3 })).getFile(),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("refuses a file whose hash differs from the metadata, and forgets the stale metadata", async () => {
        getBeatmapFile.mockResolvedValueOnce(
            Buffer.from(readBeatmapFixture("loveLetter")),
        );

        const beatmap = await service.resolve({ id: 3 });

        await expect(beatmap.getFile()).rejects.toBeInstanceOf(
            ServiceUnavailableError,
        );

        await service.resolve({ id: 3 });
        expect(getBeatmap).toHaveBeenCalledTimes(2);
    });

    it("hashes file bytes, so a byte order mark does not cause a false mismatch", async () => {
        const withBom = Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            fileBytes,
        ]);

        getBeatmap.mockResolvedValueOnce({ id: 3, hash: md5Of(withBom) });
        getBeatmapFile.mockResolvedValueOnce(withBom);

        const file = await (await service.resolve({ id: 3 })).getFile();

        expect(file.endsWith(osuFile)).toBe(true);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test tests/unit/clients tests/unit/services`
Expected: FAIL; modules not found.

- [ ] **Step 3: Implement**

Create `apps/processor/src/clients/IBeatmapServiceClient.ts`:

```ts
/**
 * The beatmap fields the processor uses.
 */
export interface BeatmapMetadata {
    readonly id: number;

    /**
     * MD5 hash of the `.osu` file.
     */
    readonly hash: string;
}

/**
 * HTTP client for the beatmap service (`~/Projects/osu-beatmap-processor`).
 *
 * Methods throw `ServiceUnavailableError` (`BEATMAP_SERVICE_UNAVAILABLE`) when the service fails or times out.
 */
export interface IBeatmapServiceClient {
    /**
     * @returns The beatmap's metadata, or `null` if the beatmap does not exist.
     */
    getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null>;

    /**
     * @returns The `.osu` file's bytes, or `null` if it does not exist.
     */
    getBeatmapFile(id: number): Promise<Buffer | null>;
}
```

Create `apps/processor/src/clients/BeatmapServiceClient.ts`:

```ts
import type { Config } from "@/config/config";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import { ServiceUnavailableError } from "@/types/errors";
import type { OsuAPIResponse } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "./IBeatmapServiceClient";

const timeoutMs = 10_000;

@Injectable(dependencyTokens.beatmapServiceClient)
export class BeatmapServiceClient implements IBeatmapServiceClient {
    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null> {
        const response = await this.request(
            "getbeatmap",
            "id" in reference
                ? { id: reference.id.toString() }
                : { hash: reference.hash },
        );

        if (!response) {
            return null;
        }

        // response.json() is untyped; the beatmap service returns the osu! API v1 format.
        const body = (await response.json()) as Pick<
            OsuAPIResponse,
            "beatmap_id" | "file_md5"
        >;

        return { id: Number.parseInt(body.beatmap_id), hash: body.file_md5 };
    }

    async getBeatmapFile(id: number): Promise<Buffer | null> {
        const response = await this.request("getbeatmapfile", {
            id: id.toString(),
        });

        return response ? Buffer.from(await response.arrayBuffer()) : null;
    }

    /**
     * @returns The response, or `null` on 404.
     */
    private async request(
        route: string,
        params: Record<string, string>,
    ): Promise<Response | null> {
        const { url, key } = this.config.beatmapService;
        const requestUrl = new URL(`${url}/${route}`);

        if (key) {
            requestUrl.searchParams.set("key", key);
        }

        for (const [name, value] of Object.entries(params)) {
            requestUrl.searchParams.set(name, value);
        }

        let response: Response;

        try {
            response = await fetch(requestUrl, {
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch {
            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                "Beatmap service is unreachable",
            );
        }

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                `Beatmap service responded with status ${response.status.toString()}`,
            );
        }

        return response;
    }
}
```

Create `apps/processor/src/clients/index.ts`:

```ts
export * from "./BeatmapServiceClient";
export * from "./IBeatmapServiceClient";
```

Create `apps/processor/src/services/IBeatmapService.ts`:

```ts
import type { BeatmapReference } from "@dpp/shared";

/**
 * A beatmap ready for calculation.
 */
export interface ResolvedBeatmap {
    /**
     * MD5 hash of the `.osu` file.
     */
    readonly hash: string;

    /**
     * Whether attributes for this beatmap may be stored. False for uploaded files.
     */
    readonly cacheable: boolean;

    /**
     * Gets the `.osu` file, downloading it on first use.
     */
    getFile(): Promise<string>;
}

/**
 * Resolves beatmap references through the beatmap service.
 */
export interface IBeatmapService {
    /**
     * @throws {NotFoundError} `BEATMAP_NOT_FOUND` if the beatmap does not exist.
     * @throws {ServiceUnavailableError} `BEATMAP_SERVICE_UNAVAILABLE` if the beatmap service fails, or the file
     * changed while it was being fetched.
     */
    resolve(reference: BeatmapReference): Promise<ResolvedBeatmap>;
}
```

Create `apps/processor/src/services/BeatmapService.ts`:

```ts
import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import { NotFoundError, ServiceUnavailableError } from "@/types/errors";
import { LruCache } from "@/utils/LruCache";
import { md5 } from "@/utils/md5";
import type { BeatmapReference } from "@dpp/shared";
import { inject } from "tsyringe";
import type { IBeatmapService, ResolvedBeatmap } from "./IBeatmapService";

const cacheTtlMs = 5 * 60 * 1000;

@Injectable(dependencyTokens.beatmapService)
export class BeatmapService implements IBeatmapService {
    private readonly metadata = new LruCache<string, BeatmapMetadata>(
        5000,
        cacheTtlMs,
    );
    private readonly files = new LruCache<string, string>(200, cacheTtlMs);

    constructor(
        @inject(dependencyTokens.beatmapServiceClient)
        private readonly client: IBeatmapServiceClient,
    ) {}

    async resolve(reference: BeatmapReference): Promise<ResolvedBeatmap> {
        if ("file" in reference) {
            const { file } = reference;

            return {
                hash: md5(file),
                cacheable: false,
                getFile: () => Promise.resolve(file),
            };
        }

        const metadata = await this.getMetadata(reference);

        return {
            hash: metadata.hash,
            cacheable: true,
            getFile: () => this.getFile(metadata),
        };
    }

    private async getMetadata(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata> {
        const cached = this.metadata.get(
            "id" in reference
                ? `id:${reference.id.toString()}`
                : `hash:${reference.hash}`,
        );

        if (cached) {
            return cached;
        }

        const metadata = await this.client.getBeatmap(reference);

        if (!metadata) {
            throw new NotFoundError("BEATMAP_NOT_FOUND", "Beatmap not found");
        }

        this.metadata.set(`id:${metadata.id.toString()}`, metadata);
        this.metadata.set(`hash:${metadata.hash}`, metadata);

        return metadata;
    }

    private async getFile(metadata: BeatmapMetadata): Promise<string> {
        const cached = this.files.get(metadata.hash);

        if (cached !== undefined) {
            return cached;
        }

        const bytes = await this.client.getBeatmapFile(metadata.id);

        if (!bytes) {
            throw new NotFoundError(
                "BEATMAP_NOT_FOUND",
                "Beatmap file not found",
            );
        }

        // Hash the bytes, not decoded text: decoding can drop a byte order mark and change the hash.
        if (md5(bytes) !== metadata.hash) {
            this.metadata.delete(`id:${metadata.id.toString()}`);
            this.metadata.delete(`hash:${metadata.hash}`);

            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                "Beatmap changed while it was being fetched; retry the request",
            );
        }

        const file = bytes.toString("utf8");
        this.files.set(metadata.hash, file);

        return file;
    }
}
```

Create `apps/processor/src/services/index.ts`:

```ts
export * from "./BeatmapService";
export * from "./IBeatmapService";
```

Create `apps/processor/tests/utils/beatmaps.ts`:

```ts
import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import {
    beatmapFixtureNames,
    beatmapFixtures,
    md5Of,
    readBeatmapFixture,
} from "./fixtures";

/**
 * A beatmap service client that serves the beatmap fixtures.
 */
export class FixtureBeatmapServiceClient implements IBeatmapServiceClient {
    private readonly beatmaps = beatmapFixtureNames.map((name) => {
        const bytes = Buffer.from(readBeatmapFixture(name));

        return { id: beatmapFixtures[name].id, hash: md5Of(bytes), bytes };
    });

    getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null> {
        const beatmap = this.beatmaps.find((b) =>
            "id" in reference
                ? b.id === reference.id
                : b.hash === reference.hash,
        );

        return Promise.resolve(
            beatmap ? { id: beatmap.id, hash: beatmap.hash } : null,
        );
    }

    getBeatmapFile(id: number): Promise<Buffer | null> {
        return Promise.resolve(
            this.beatmaps.find((b) => b.id === id)?.bytes ?? null,
        );
    }
}
```

In `apps/processor/src/dependencies/tokens.ts`, add the imports `import type { IBeatmapServiceClient } from "@/clients/IBeatmapServiceClient";` and `import type { IBeatmapService } from "@/services/IBeatmapService";` and the entries:

```ts
    beatmapServiceClient: Symbol.for("beatmapServiceClient") as InjectionToken<IBeatmapServiceClient>,
    beatmapService: Symbol.for("beatmapService") as InjectionToken<IBeatmapService>,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add beatmap service client and beatmap resolution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Difficulty cache service

**Files:**

- Create: `apps/processor/src/services/IDifficultyCacheService.ts`, `apps/processor/src/services/DifficultyCacheService.ts`
- Modify: `apps/processor/src/services/index.ts`, `apps/processor/src/dependencies/tokens.ts`
- Test: `apps/processor/tests/unit/services/DifficultyCacheService.test.ts`

**Interfaces:**

- Consumes: `Algorithm` (Task 4), `ICalculationRunner`, `InlineRunner`, `calculateFixtureDifficulty` (Task 6), `VariantManifest` (Task 7), `IDifficultyAttributesRepository` (Task 8), `ResolvedBeatmap` (Task 9), `createModsKey`, `LruCache` (Task 3).
- Produces: `interface IDifficultyCacheService { get(beatmap: ResolvedBeatmap, mods: ModMap): Promise<CacheableDifficultyAttributes<IDifficultyAttributes>> }` (attributes carry the _difficulty-adjusting_ mods, not the requested ones); token `difficultyCacheService`.

- [ ] **Step 1: Write the failing test**

Create `apps/processor/tests/unit/services/DifficultyCacheService.test.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { VariantManifest } from "@/manifest/manifest";
import type { IDifficultyAttributesRepository } from "@/repositories/IDifficultyAttributesRepository";
import { DifficultyCacheService } from "@/services/DifficultyCacheService";
import type { ResolvedBeatmap } from "@/services/IBeatmapService";
import { ModDoubleTime, Modes, ModNoFail } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import { modMap } from "@test/utils/mods";
import { beforeEach, describe, expect, it, vi } from "vitest";

const algorithm = createAlgorithm(Modes.Droid);

const manifest: VariantManifest = {
    id: "test-droid",
    mode: Modes.Droid,
    algorithm: "live",
    calculatorVersion: "0123456789abcdef",
    source: "npm",
    builtAt: "2026-10-05T00:00:00.000Z",
};

const attributes = calculateFixtureDifficulty(
    "discoprince",
    Modes.Droid,
    modMap(new ModDoubleTime()),
);

describe("DifficultyCacheService", () => {
    let find: ReturnType<typeof vi.fn<IDifficultyAttributesRepository["find"]>>;
    let insert: ReturnType<
        typeof vi.fn<IDifficultyAttributesRepository["insert"]>
    >;
    let calculateDifficulty: ReturnType<
        typeof vi.fn<ICalculationRunner["calculateDifficulty"]>
    >;
    let getFile: ReturnType<typeof vi.fn<ResolvedBeatmap["getFile"]>>;
    let service: DifficultyCacheService;

    // NoFail is not difficulty-adjusting, so it must not be part of the key or the calculation.
    const mods = modMap(new ModNoFail(), new ModDoubleTime());
    const difficultyMods = modMap(new ModDoubleTime()).serializeMods();

    const beatmap = (cacheable = true): ResolvedBeatmap => ({
        hash: "a".repeat(32),
        cacheable,
        getFile,
    });

    beforeEach(() => {
        find = vi.fn<IDifficultyAttributesRepository["find"]>(() =>
            Promise.resolve(null),
        );
        insert = vi.fn<IDifficultyAttributesRepository["insert"]>(() =>
            Promise.resolve(),
        );
        getFile = vi.fn<ResolvedBeatmap["getFile"]>(() =>
            Promise.resolve("osu file"),
        );

        const runner = new InlineRunner(algorithm);
        calculateDifficulty = vi.fn<ICalculationRunner["calculateDifficulty"]>(
            () => Promise.resolve(attributes),
        );
        runner.calculateDifficulty = calculateDifficulty;

        service = new DifficultyCacheService(
            algorithm,
            manifest,
            { find, insert, deleteOtherVersions: () => Promise.resolve(0) },
            runner,
        );
    });

    it("calculates on a miss with difficulty-adjusting mods only, then stores the result", async () => {
        expect(await service.get(beatmap(), mods)).toBe(attributes);

        const key = {
            calculatorVersion: "0123456789abcdef",
            beatmapHash: "a".repeat(32),
            mods: '[{"acronym":"DT"}]',
        };

        expect(find).toHaveBeenCalledWith(key);
        expect(calculateDifficulty).toHaveBeenCalledWith({
            beatmapHash: "a".repeat(32),
            osuFile: "osu file",
            mods: difficultyMods,
        });
        expect(insert).toHaveBeenCalledWith(key, attributes);
    });

    it("serves stored attributes without fetching the file or calculating", async () => {
        find.mockResolvedValueOnce(attributes);

        expect(await service.get(beatmap(), mods)).toBe(attributes);
        expect(getFile).not.toHaveBeenCalled();
        expect(calculateDifficulty).not.toHaveBeenCalled();
    });

    it("serves repeated requests from memory", async () => {
        await service.get(beatmap(), mods);
        await service.get(beatmap(), modMap(new ModDoubleTime()));

        expect(find).toHaveBeenCalledTimes(1);
        expect(calculateDifficulty).toHaveBeenCalledTimes(1);
    });

    it("shares one calculation between concurrent misses", async () => {
        let finish: (
            value: CacheableDifficultyAttributes<IDifficultyAttributes>,
        ) => void = () => undefined;
        calculateDifficulty.mockReturnValueOnce(
            new Promise((resolve) => (finish = resolve)),
        );

        const pending = [
            service.get(beatmap(), mods),
            service.get(beatmap(), mods),
        ];
        await vi.waitFor(() => expect(calculateDifficulty).toHaveBeenCalled());
        finish(attributes);

        expect(await Promise.all(pending)).toEqual([attributes, attributes]);
        expect(calculateDifficulty).toHaveBeenCalledTimes(1);
    });

    it("retries after a failed calculation instead of caching the failure", async () => {
        calculateDifficulty.mockRejectedValueOnce(new Error("boom"));

        await expect(service.get(beatmap(), mods)).rejects.toThrow("boom");
        expect(await service.get(beatmap(), mods)).toBe(attributes);
    });

    it("treats database read and write failures as non-fatal", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        find.mockRejectedValueOnce(new Error("db down"));
        insert.mockRejectedValueOnce(new Error("db down"));

        expect(await service.get(beatmap(), mods)).toBe(attributes);
    });

    it("never reads or stores uploaded beatmaps", async () => {
        expect(await service.get(beatmap(false), mods)).toBe(attributes);
        expect(await service.get(beatmap(false), mods)).toBe(attributes);

        expect(find).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
        expect(calculateDifficulty).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpp/processor test tests/unit/services/DifficultyCacheService.test.ts`
Expected: FAIL; `@/services/DifficultyCacheService` not found.

- [ ] **Step 3: Implement**

Create `apps/processor/src/services/IDifficultyCacheService.ts`:

```ts
import type { ModMap } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import type { ResolvedBeatmap } from "./IBeatmapService";

/**
 * Read-through cache for difficulty attributes: memory, then the database, then calculation.
 */
export interface IDifficultyCacheService {
    /**
     * Gets difficulty attributes. The returned attributes carry only the difficulty-adjusting mods; callers must
     * put the requested mods back before calculating performance.
     */
    get(
        beatmap: ResolvedBeatmap,
        mods: ModMap,
    ): Promise<CacheableDifficultyAttributes<IDifficultyAttributes>>;
}
```

Create `apps/processor/src/services/DifficultyCacheService.ts`:

```ts
import type { Algorithm } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import type {
    DifficultyAttributesKey,
    IDifficultyAttributesRepository,
} from "@/repositories/IDifficultyAttributesRepository";
import { LruCache } from "@/utils/LruCache";
import { createModsKey } from "@/utils/modsKey";
import type { ModMap, SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import type { ResolvedBeatmap } from "./IBeatmapService";
import type { IDifficultyCacheService } from "./IDifficultyCacheService";

type Attributes = CacheableDifficultyAttributes<IDifficultyAttributes>;

const memoryEntries = 10_000;

@Injectable(dependencyTokens.difficultyCacheService)
export class DifficultyCacheService implements IDifficultyCacheService {
    private readonly memory = new LruCache<string, Attributes>(memoryEntries);
    private readonly inFlight = new Map<string, Promise<Attributes>>();

    constructor(
        @inject(dependencyTokens.algorithm)
        private readonly algorithm: Algorithm,
        @inject(dependencyTokens.manifest)
        private readonly manifest: VariantManifest,
        @inject(dependencyTokens.difficultyAttributesRepository)
        private readonly repository: IDifficultyAttributesRepository,
        @inject(dependencyTokens.calculationRunner)
        private readonly runner: ICalculationRunner,
    ) {}

    get(beatmap: ResolvedBeatmap, mods: ModMap): Promise<Attributes> {
        const difficultyMods =
            this.algorithm.retainDifficultyAdjustmentMods(mods);

        if (!beatmap.cacheable) {
            return this.calculate(beatmap, difficultyMods);
        }

        const key: DifficultyAttributesKey = {
            calculatorVersion: this.manifest.calculatorVersion,
            beatmapHash: beatmap.hash,
            mods: createModsKey(difficultyMods),
        };

        // The calculator version is constant for the process, so it is not part of the memory key.
        const memoryKey = `${key.beatmapHash}|${key.mods}`;
        const cached = this.memory.get(memoryKey);

        if (cached) {
            return Promise.resolve(cached);
        }

        let pending = this.inFlight.get(memoryKey);

        if (!pending) {
            pending = this.load(key, beatmap, difficultyMods)
                .then((attributes) => {
                    this.memory.set(memoryKey, attributes);

                    return attributes;
                })
                .finally(() => this.inFlight.delete(memoryKey));

            this.inFlight.set(memoryKey, pending);
        }

        return pending;
    }

    private async load(
        key: DifficultyAttributesKey,
        beatmap: ResolvedBeatmap,
        difficultyMods: SerializedMod[],
    ): Promise<Attributes> {
        const stored = await this.repository.find(key).catch((e: unknown) => {
            console.error(
                "Failed to read difficulty attributes; calculating instead:",
                e,
            );

            return null;
        });

        if (stored) {
            return stored;
        }

        const attributes = await this.calculate(beatmap, difficultyMods);

        await this.repository.insert(key, attributes).catch((e: unknown) => {
            console.error("Failed to store difficulty attributes:", e);
        });

        return attributes;
    }

    private async calculate(
        beatmap: ResolvedBeatmap,
        mods: SerializedMod[],
    ): Promise<Attributes> {
        return this.runner.calculateDifficulty({
            beatmapHash: beatmap.hash,
            osuFile: await beatmap.getFile(),
            mods,
        });
    }
}
```

Append to `apps/processor/src/services/index.ts`:

```ts
export * from "./DifficultyCacheService";
export * from "./IDifficultyCacheService";
```

In `apps/processor/src/dependencies/tokens.ts`, add `import type { IDifficultyCacheService } from "@/services/IDifficultyCacheService";` and the entry:

```ts
    difficultyCacheService: Symbol.for("difficultyCacheService") as InjectionToken<IDifficultyCacheService>,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add difficulty attributes cache service" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Calculation service

**Files:**

- Create: `apps/processor/src/services/ICalculationService.ts`, `apps/processor/src/services/CalculationService.ts`
- Modify: `apps/processor/src/services/index.ts`, `apps/processor/src/dependencies/tokens.ts`
- Test: `apps/processor/tests/unit/services/CalculationService.test.ts`

**Interfaces:**

- Consumes: `Algorithm` (Task 4), `AlgorithmInputError` (Task 4), `ICalculationRunner`, `InlineRunner`, `strainChartColor` (Task 6), `VariantManifest` (Task 7), `IBeatmapService`, `FixtureBeatmapServiceClient` (Task 9), `IDifficultyCacheService` (Task 10); request/response types from `@dpp/shared`.
- Produces: `interface ICalculationService`: `calculateDifficulty(request: DifficultyRequest): Promise<DifficultyResponse>`, `calculatePerformance(request: PerformanceRequest): Promise<PerformanceResponse>`, `calculateReplayPerformance(request: ReplayPerformanceRequest): Promise<ReplayPerformanceResponse>`; token `calculationService`.

- [ ] **Step 1: Write the failing test**

Create `apps/processor/tests/unit/services/CalculationService.test.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import type { ReplayAnalysis, ReplayHeader } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { VariantManifest } from "@/manifest/manifest";
import { BeatmapService } from "@/services/BeatmapService";
import { CalculationService } from "@/services/CalculationService";
import { DifficultyCacheService } from "@/services/DifficultyCacheService";
import { BadRequestError, UnprocessableEntityError } from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
import { FixtureBeatmapServiceClient } from "@test/utils/beatmaps";
import {
    beatmapFixtures,
    md5Of,
    readBeatmapFixture,
} from "@test/utils/fixtures";
import { describe, expect, it, vi } from "vitest";

function createService(
    mode: Modes,
    configure: (runner: InlineRunner) => void = () => undefined,
) {
    const algorithm = createAlgorithm(mode);
    const runner = new InlineRunner(algorithm);
    configure(runner);

    const manifest: VariantManifest = {
        id: `test-${mode}`,
        mode,
        algorithm: "live",
        calculatorVersion: "0123456789abcdef",
        source: "npm",
        builtAt: "2026-10-05T00:00:00.000Z",
    };

    const repository = {
        find: () => Promise.resolve(null),
        insert: () => Promise.resolve(),
        deleteOtherVersions: () => Promise.resolve(0),
    };

    const beatmaps = new BeatmapService(new FixtureBeatmapServiceClient());
    const cache = new DifficultyCacheService(
        algorithm,
        manifest,
        repository,
        runner,
    );

    return new CalculationService(algorithm, manifest, beatmaps, cache, runner);
}

const loveLetter = { id: beatmapFixtures.loveLetter.id };
const loveLetterHash = md5Of(Buffer.from(readBeatmapFixture("loveLetter")));

describe("CalculationService", () => {
    it("returns difficulty attributes carrying the requested mods", async () => {
        const service = createService(Modes.Droid);
        const mods = [{ acronym: "NF" }, { acronym: "HD" }];
        const response = await service.calculateDifficulty({
            beatmap: loveLetter,
            mods,
            strainChart: false,
        });

        expect(response.difficulty.mods).toEqual(mods);
        expect(response.difficulty.starRating).toBeGreaterThan(0);
        expect(response.strainChart).toBeUndefined();
    });

    it.each([Modes.Droid, Modes.Osu])(
        "applies NoFail to %s performance even though difficulty is shared",
        async (mode) => {
            const service = createService(mode);
            const score = { nmiss: 5 };

            const plain = await service.calculatePerformance({
                beatmap: loveLetter,
                mods: [],
                score,
                strainChart: false,
            });
            const noFail = await service.calculatePerformance({
                beatmap: loveLetter,
                mods: [{ acronym: "NF" }],
                score,
                strainChart: false,
            });

            expect(noFail.difficulty.starRating).toBe(
                plain.difficulty.starRating,
            );
            expect(noFail.performance.total).toBeLessThan(
                plain.performance.total,
            );
        },
    );

    it("rejects unknown and duplicate mods", async () => {
        const service = createService(Modes.Droid);

        await expect(
            service.calculateDifficulty({
                beatmap: loveLetter,
                mods: [{ acronym: "ZZ" }],
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);

        await expect(
            service.calculateDifficulty({
                beatmap: loveLetter,
                mods: [{ acronym: "HD" }, { acronym: "HD" }],
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("rejects hit counts above the object count", async () => {
        const service = createService(Modes.Droid);

        await expect(
            service.calculatePerformance({
                beatmap: loveLetter,
                mods: [],
                score: { n300: 100_000 },
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("renders a requested strain chart as base64 PNG", async () => {
        const service = createService(Modes.Osu);
        const response = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {},
            strainChart: true,
        });

        expect(
            Buffer.from(response.strainChart ?? "", "base64")
                .subarray(1, 4)
                .toString(),
        ).toBe("PNG");
    });

    it("calculates uploaded beatmaps", async () => {
        const service = createService(Modes.Droid);
        const byId = await service.calculateDifficulty({
            beatmap: loveLetter,
            mods: [],
            strainChart: false,
        });
        const uploaded = await service.calculateDifficulty({
            beatmap: { file: readBeatmapFixture("loveLetter") },
            mods: [],
            strainChart: false,
        });

        expect(uploaded.difficulty.starRating).toBe(byId.difficulty.starRating);
    });

    describe("replays", () => {
        const readReplay = (header: ReplayHeader) =>
            vi.fn<ICalculationRunner["readReplay"]>(() =>
                Promise.resolve(header),
            );

        const analysis: ReplayAnalysis = {
            score: {
                n300: 590,
                n100: 2,
                n50: 0,
                nmiss: 0,
                combo: 700,
                tapPenalty: 0.9,
            },
            replay: {
                hitError: null,
                sliderTickInformation: null,
                sliderEndInformation: null,
            },
        };

        it("requires mods for replays that do not record them", async () => {
            const service = createService(Modes.Droid, (runner) => {
                runner.readReplay = readReplay({
                    beatmapHash: loveLetterHash,
                    mods: null,
                });
            });

            const result = service.calculateReplayPerformance({
                replay: "AAEC",
                strainChart: false,
            });

            await expect(result).rejects.toBeInstanceOf(
                UnprocessableEntityError,
            );
            await expect(result).rejects.toMatchObject({
                code: "INVALID_REPLAY",
            });
        });

        it("uses the replay's own mods by default", async () => {
            const service = createService(Modes.Droid, (runner) => {
                runner.readReplay = readReplay({
                    beatmapHash: loveLetterHash,
                    mods: [{ acronym: "HD" }],
                });
                runner.analyzeReplay = vi.fn<
                    ICalculationRunner["analyzeReplay"]
                >(() => Promise.resolve(analysis));
            });

            const response = await service.calculateReplayPerformance({
                replay: "AAEC",
                strainChart: false,
            });

            expect(response.difficulty.mods).toEqual([{ acronym: "HD" }]);
            expect(response.score).toMatchObject({
                n300: 590,
                n100: 2,
                combo: 700,
                tapPenalty: 0.9,
            });
            expect(response.replay).toEqual(analysis.replay);
        });

        it("lets request mods and score override replay-derived values", async () => {
            const analyzeReplay = vi.fn<ICalculationRunner["analyzeReplay"]>(
                () => Promise.resolve(analysis),
            );

            const service = createService(Modes.Droid, (runner) => {
                runner.readReplay = readReplay({
                    beatmapHash: loveLetterHash,
                    mods: [{ acronym: "HD" }],
                });
                runner.analyzeReplay = analyzeReplay;
            });

            const response = await service.calculateReplayPerformance({
                replay: "AAEC",
                mods: [{ acronym: "HR" }],
                score: { combo: 100 },
                strainChart: false,
            });

            expect(response.difficulty.mods).toEqual([{ acronym: "HR" }]);
            expect(response.score).toMatchObject({
                n300: 590,
                combo: 100,
                tapPenalty: 0.9,
            });
            // The analysis must see the mods the score is calculated with.
            expect(analyzeReplay.mock.calls[0]?.[0].difficulty.mods).toEqual([
                { acronym: "HR" },
            ]);
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpp/processor test tests/unit/services/CalculationService.test.ts`
Expected: FAIL; `@/services/CalculationService` not found.

- [ ] **Step 3: Implement**

Create `apps/processor/src/services/ICalculationService.ts`:

```ts
import type {
    DifficultyRequest,
    DifficultyResponse,
    PerformanceRequest,
    PerformanceResponse,
    ReplayPerformanceRequest,
    ReplayPerformanceResponse,
} from "@dpp/shared";

/**
 * Orchestrates calculation requests. Requests must already be validated.
 */
export interface ICalculationService {
    calculateDifficulty(
        request: DifficultyRequest,
    ): Promise<DifficultyResponse>;
    calculatePerformance(
        request: PerformanceRequest,
    ): Promise<PerformanceResponse>;
    calculateReplayPerformance(
        request: ReplayPerformanceRequest,
    ): Promise<ReplayPerformanceResponse>;
}
```

Create `apps/processor/src/services/CalculationService.ts`:

```ts
import { AlgorithmInputError } from "@/algorithms/errors";
import type { Algorithm, PerformanceResult } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { strainChartColor } from "@/calculation/strainChartColor";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import { BadRequestError, UnprocessableEntityError } from "@/types/errors";
import type {
    DifficultyRequest,
    DifficultyResponse,
    PerformanceRequest,
    PerformanceResponse,
    ReplayPerformanceRequest,
    ReplayPerformanceResponse,
    ScoreParameters,
} from "@dpp/shared";
import { ModUtil, type ModMap, type SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import type { IBeatmapService, ResolvedBeatmap } from "./IBeatmapService";
import type { ICalculationService } from "./ICalculationService";
import type { IDifficultyCacheService } from "./IDifficultyCacheService";

type Attributes = CacheableDifficultyAttributes<IDifficultyAttributes>;

@Injectable(dependencyTokens.calculationService)
export class CalculationService implements ICalculationService {
    constructor(
        @inject(dependencyTokens.algorithm)
        private readonly algorithm: Algorithm,
        @inject(dependencyTokens.manifest)
        private readonly manifest: VariantManifest,
        @inject(dependencyTokens.beatmapService)
        private readonly beatmaps: IBeatmapService,
        @inject(dependencyTokens.difficultyCacheService)
        private readonly difficultyCache: IDifficultyCacheService,
        @inject(dependencyTokens.calculationRunner)
        private readonly runner: ICalculationRunner,
    ) {}

    async calculateDifficulty(
        request: DifficultyRequest,
    ): Promise<DifficultyResponse> {
        const beatmap = await this.beatmaps.resolve(request.beatmap);
        const difficulty = await this.getDifficulty(beatmap, request.mods);

        return {
            difficulty,
            ...(await this.renderStrainChart(
                request.strainChart,
                beatmap,
                difficulty,
            )),
        };
    }

    async calculatePerformance(
        request: PerformanceRequest,
    ): Promise<PerformanceResponse> {
        const beatmap = await this.beatmaps.resolve(request.beatmap);
        const difficulty = await this.getDifficulty(beatmap, request.mods);

        return {
            difficulty,
            ...this.calculatePerformanceAttributes(difficulty, request.score),
            ...(await this.renderStrainChart(
                request.strainChart,
                beatmap,
                difficulty,
            )),
        };
    }

    async calculateReplayPerformance(
        request: ReplayPerformanceRequest,
    ): Promise<ReplayPerformanceResponse> {
        const replay = Buffer.from(request.replay, "base64");
        const header = await this.runner.readReplay(replay);
        const mods = request.mods ?? header.mods;

        if (!mods) {
            throw new UnprocessableEntityError(
                "INVALID_REPLAY",
                "This replay does not record its mods; pass them in `mods`",
            );
        }

        const beatmap = await this.beatmaps.resolve({
            hash: header.beatmapHash,
        });
        const difficulty = await this.getDifficulty(beatmap, mods);

        const analysis = await this.runner.analyzeReplay({
            beatmapHash: beatmap.hash,
            osuFile: await beatmap.getFile(),
            replay,
            difficulty,
        });

        return {
            difficulty,
            ...this.calculatePerformanceAttributes(difficulty, {
                ...analysis.score,
                ...request.score,
            }),
            replay: analysis.replay,
            ...(await this.renderStrainChart(
                request.strainChart,
                beatmap,
                difficulty,
            )),
        };
    }

    /**
     * Gets difficulty attributes with the requested mods put back, since mods such as NoFail change performance
     * without changing difficulty.
     */
    private async getDifficulty(
        beatmap: ResolvedBeatmap,
        mods: SerializedMod[],
    ): Promise<Attributes> {
        const attributes = await this.difficultyCache.get(
            beatmap,
            this.parseMods(mods),
        );

        return { ...attributes, mods };
    }

    private parseMods(mods: SerializedMod[]): ModMap {
        const parsed = ModUtil.deserializeMods(mods);

        if (parsed.size !== mods.length) {
            throw new BadRequestError(
                "mods contains unknown or duplicate mods",
            );
        }

        return parsed;
    }

    private calculatePerformanceAttributes(
        difficulty: Attributes,
        score: ScoreParameters,
    ): PerformanceResult {
        try {
            return this.algorithm.calculatePerformance(difficulty, score);
        } catch (e) {
            throw e instanceof AlgorithmInputError ? e.toApiError() : e;
        }
    }

    private async renderStrainChart(
        requested: boolean,
        beatmap: ResolvedBeatmap,
        difficulty: Attributes,
    ): Promise<{ strainChart?: string }> {
        if (!requested) {
            return {};
        }

        const chart = await this.runner.renderStrainChart({
            beatmapHash: beatmap.hash,
            osuFile: await beatmap.getFile(),
            mods: difficulty.mods,
            clockRate: difficulty.clockRate,
            color: strainChartColor(
                this.manifest.mode,
                this.manifest.algorithm,
            ),
        });

        return { strainChart: chart.toString("base64") };
    }
}
```

Append to `apps/processor/src/services/index.ts`:

```ts
export * from "./CalculationService";
export * from "./ICalculationService";
```

In `apps/processor/src/dependencies/tokens.ts`, add `import type { ICalculationService } from "@/services/ICalculationService";` and the entry:

```ts
    calculationService: Symbol.for("calculationService") as InjectionToken<ICalculationService>,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add calculation service" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: HTTP layer and dependency registration

**Files:**

- Create: `apps/processor/src/decorators/controller.ts`, `apps/processor/src/decorators/routes.ts`, `apps/processor/src/router.ts`, `apps/processor/src/controllers/BaseController.ts`, `apps/processor/src/controllers/InfoController.ts`, `apps/processor/src/controllers/DifficultyController.ts`, `apps/processor/src/controllers/PerformanceController.ts`, `apps/processor/src/controllers/index.ts`, `apps/processor/src/middleware/apiKey.ts`, `apps/processor/src/middleware/errorHandlers.ts`, `apps/processor/src/validators/parseBody.ts`, `apps/processor/src/dependencies/register.ts`, `apps/processor/tests/utils/container.ts`
- Modify: `apps/processor/src/app.ts` (currently empty)
- Test: `apps/processor/tests/unit/controllers/controllers.test.ts`, `apps/processor/tests/integration/controllers/api.int.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 3–11.
- Produces:
    - `Controller(basePath: string): ClassDecorator`, `Get(path)`, `Post(path)`
    - `createRouter(container?: DependencyContainer): Router`
    - `createApp(container?: DependencyContainer): Express`
    - `interface RuntimeInstances { config: Config; manifest: VariantManifest; algorithm: Algorithm; runner: ICalculationRunner; db: Database }`, `registerDependencies(container: DependencyContainer, instances: RuntimeInstances): void`
    - Test utils: `testApiKey`, `testConfig: Config`, `testManifest(mode: Modes): VariantManifest`, `interface TestContainer extends AsyncDisposable { readonly container: DependencyContainer }`, `createTestContainer(options?: { mode?: Modes; db?: Database; overrides?: (container: DependencyContainer) => void }): Promise<TestContainer>` (disposing closes the test database it created, if any)

- [ ] **Step 1: Decorators, router, and validator**

Create `apps/processor/src/decorators/controller.ts`:

```ts
import { injectable } from "tsyringe";
import type { constructor } from "tsyringe/dist/typings/types";

/**
 * Marks a class as a controller.
 *
 * @param basePath The path prefix of the controller's routes, e.g. `/performance`.
 */
export function Controller(basePath: string): ClassDecorator {
    return (target) => {
        // ClassDecorator types its target as Function; tsyringe needs a constructor type.
        const targetConstructor = target as unknown as constructor<unknown>;

        Reflect.defineMetadata("basePath", basePath, targetConstructor);

        // Reflect metadata is untyped; this decorator is the only writer of "controllers".
        const controllers =
            (Reflect.getMetadata("controllers", globalThis) as
                constructor<unknown>[] | undefined) ?? [];

        Reflect.defineMetadata(
            "controllers",
            controllers.concat(targetConstructor),
            globalThis,
        );

        injectable()(targetConstructor);
    };
}
```

Create `apps/processor/src/decorators/routes.ts`:

```ts
export enum HttpMethod {
    Get = "get",
    Post = "post",
}

/**
 * A route registered by a method decorator.
 */
export interface RouteDefinition {
    readonly path: string;
    readonly method: HttpMethod;
    readonly handlerName: string;
}

function createRouteDecorator(method: HttpMethod) {
    return (path: string): MethodDecorator =>
        (target, propertyKey) => {
            // Reflect metadata is untyped; this decorator is the only writer of "routes".
            const routes =
                (Reflect.getMetadata("routes", target.constructor) as
                    RouteDefinition[] | undefined) ?? [];

            Reflect.defineMetadata(
                "routes",
                routes.concat({
                    path,
                    method,
                    handlerName: propertyKey.toString(),
                }),
                target.constructor,
            );
        };
}

/**
 * Marks a method as a GET handler. The path is appended to the controller's base path; use `""` for the base
 * path itself.
 */
export const Get = createRouteDecorator(HttpMethod.Get);

/**
 * Marks a method as a POST handler. The path is appended to the controller's base path; use `""` for the base
 * path itself.
 */
export const Post = createRouteDecorator(HttpMethod.Post);
```

Create `apps/processor/src/router.ts`:

```ts
import { Router, type RequestHandler } from "express";
import type { DependencyContainer } from "tsyringe";
// Load controllers so their metadata is registered.
import "./controllers";
import type { RouteDefinition } from "./decorators/routes";
import { getContainer } from "./dependencies/container";

type ControllerClass = new () => Record<string, RequestHandler>;

/**
 * Creates a router from the routes declared on controllers.
 */
export function createRouter(container = getContainer()): Router {
    const router = Router();

    // Reflect metadata is untyped; the @Controller and route decorators write these values.
    const controllers =
        (Reflect.getMetadata("controllers", globalThis) as
            ControllerClass[] | undefined) ?? [];

    for (const Controller of controllers) {
        const basePath = Reflect.getMetadata("basePath", Controller) as
            string | undefined;

        if (!basePath) {
            throw new Error(
                `Controller ${Controller.name} has no base path; decorate it with @Controller`,
            );
        }

        const routes =
            (Reflect.getMetadata("routes", Controller) as
                RouteDefinition[] | undefined) ?? [];

        if (!container.isRegistered(Controller)) {
            container.registerSingleton(Controller);
        }

        const instance = container.resolve(Controller);

        for (const route of routes) {
            const handler = instance[route.handlerName];

            if (!handler) {
                throw new Error(
                    `${Controller.name}.${route.handlerName} does not exist`,
                );
            }

            router[route.method](
                `${basePath}${route.path}`,
                handler.bind(instance),
            );
        }
    }

    return router;
}
```

Create `apps/processor/src/validators/parseBody.ts`:

```ts
import { BadRequestError } from "@/types/errors";
import type { z } from "zod";

/**
 * Validates a request body.
 *
 * @throws {BadRequestError} With the first validation issue as the message.
 */
export function parseBody<T extends z.ZodType>(
    schema: T,
    body: unknown,
): z.infer<T> {
    const result = schema.safeParse(body);

    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";

        throw new BadRequestError(
            `${path}${issue?.message ?? "Invalid request body"}`,
        );
    }

    return result.data;
}
```

- [ ] **Step 2: Controllers and middleware**

Create `apps/processor/src/controllers/BaseController.ts`:

```ts
import { APIError } from "@/types/errors";
import type { ErrorResponse } from "@dpp/shared";
import type { Response } from "express";

/**
 * Base class for controllers.
 */
export abstract class BaseController {
    /**
     * Sends the response for an error thrown by a handler. Unexpected errors are logged and reported as
     * `INTERNAL_ERROR` without details.
     */
    protected handleError(res: Response, error: unknown): void {
        if (error instanceof APIError) {
            res.status(error.statusCode).json(error.toResponse());

            return;
        }

        console.error("[Unhandled Error]:", error);

        res.status(500).json({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        } satisfies ErrorResponse);
    }
}
```

Create `apps/processor/src/controllers/InfoController.ts`:

```ts
import { Controller } from "@/decorators/controller";
import { Get } from "@/decorators/routes";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import type { InfoResponse } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController } from "./BaseController";

/**
 * Reports which variant this process runs. Public, so the broker can check its registry against it.
 */
@Controller("/info")
export class InfoController extends BaseController {
    constructor(
        @inject(dependencyTokens.manifest)
        private readonly manifest: VariantManifest,
    ) {
        super();
    }

    @Get("")
    getInfo(_req: Request, res: Response<InfoResponse>): void {
        const { id, mode, algorithm, calculatorVersion, builtAt } =
            this.manifest;

        res.json({ id, mode, algorithm, calculatorVersion, builtAt });
    }
}
```

Create `apps/processor/src/controllers/DifficultyController.ts`:

```ts
import { Controller } from "@/decorators/controller";
import { Post } from "@/decorators/routes";
import { dependencyTokens } from "@/dependencies/tokens";
import type { ICalculationService } from "@/services/ICalculationService";
import { parseBody } from "@/validators/parseBody";
import { difficultyRequestSchema } from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController } from "./BaseController";

@Controller("/difficulty")
export class DifficultyController extends BaseController {
    constructor(
        @inject(dependencyTokens.calculationService)
        private readonly calculations: ICalculationService,
    ) {
        super();
    }

    @Post("")
    async calculate(req: Request, res: Response): Promise<void> {
        try {
            res.json(
                await this.calculations.calculateDifficulty(
                    parseBody(difficultyRequestSchema, req.body),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
```

Create `apps/processor/src/controllers/PerformanceController.ts`:

```ts
import { Controller } from "@/decorators/controller";
import { Post } from "@/decorators/routes";
import { dependencyTokens } from "@/dependencies/tokens";
import type { ICalculationService } from "@/services/ICalculationService";
import { parseBody } from "@/validators/parseBody";
import {
    performanceRequestSchema,
    replayPerformanceRequestSchema,
} from "@dpp/shared";
import type { Request, Response } from "express";
import { inject } from "tsyringe";
import { BaseController } from "./BaseController";

@Controller("/performance")
export class PerformanceController extends BaseController {
    constructor(
        @inject(dependencyTokens.calculationService)
        private readonly calculations: ICalculationService,
    ) {
        super();
    }

    @Post("")
    async calculate(req: Request, res: Response): Promise<void> {
        try {
            res.json(
                await this.calculations.calculatePerformance(
                    parseBody(performanceRequestSchema, req.body),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }

    @Post("/replay")
    async calculateReplay(req: Request, res: Response): Promise<void> {
        try {
            res.json(
                await this.calculations.calculateReplayPerformance(
                    parseBody(replayPerformanceRequestSchema, req.body),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
```

Create `apps/processor/src/controllers/index.ts`:

```ts
export * from "./DifficultyController";
export * from "./InfoController";
export * from "./PerformanceController";
```

Create `apps/processor/src/middleware/apiKey.ts`:

```ts
import { UnauthorizedError } from "@/types/errors";
import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";

const publicPaths = new Set(["/info"]);

/**
 * Requires the `X-Api-Key` header on every route except `/info`.
 */
export function createApiKeyMiddleware(apiKey: string): RequestHandler {
    const expected = Buffer.from(apiKey);

    return (req, res, next) => {
        if (publicPaths.has(req.path)) {
            next();

            return;
        }

        const provided = Buffer.from(req.get("x-api-key") ?? "");

        if (
            provided.length !== expected.length ||
            !timingSafeEqual(provided, expected)
        ) {
            res.status(401).json(new UnauthorizedError().toResponse());

            return;
        }

        next();
    };
}
```

Create `apps/processor/src/middleware/errorHandlers.ts`:

```ts
import type { ErrorResponse } from "@dpp/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";

function isBodyParserError(
    error: unknown,
): error is { status: number; type: string } {
    return (
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        "status" in error &&
        typeof error.status === "number"
    );
}

/**
 * Responds to unknown routes with the JSON error shape.
 */
export const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json({
        error: { code: "INVALID_REQUEST", message: "Route not found" },
    } satisfies ErrorResponse);
};

/**
 * Responds to body parsing errors and anything unhandled with the JSON error shape.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (isBodyParserError(error)) {
        const message =
            error.type === "entity.too.large"
                ? "Request body is too large"
                : "Request body is not valid JSON";

        res.status(error.status).json({
            error: { code: "INVALID_REQUEST", message },
        } satisfies ErrorResponse);

        return;
    }

    console.error("[Unhandled Error]:", error);

    res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    } satisfies ErrorResponse);
};
```

- [ ] **Step 3: Registration and app**

Create `apps/processor/src/dependencies/register.ts`:

```ts
import type { Algorithm } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import type { VariantManifest } from "@/manifest/manifest";
import type { DependencyContainer, InjectionToken } from "tsyringe";
import type { constructor } from "tsyringe/dist/typings/types";
// Load injectable classes so their metadata is registered.
import "../clients";
import "../repositories";
import "../services";
import { dependencyTokens } from "./tokens";

/**
 * Instances created at startup rather than by the container.
 */
export interface RuntimeInstances {
    readonly config: Config;
    readonly manifest: VariantManifest;
    readonly algorithm: Algorithm;
    readonly runner: ICalculationRunner;
    readonly db: Database;
}

/**
 * Registers runtime instances and every `@Injectable` class to a container.
 */
export function registerDependencies(
    container: DependencyContainer,
    instances: RuntimeInstances,
): void {
    container.registerInstance(dependencyTokens.config, instances.config);
    container.registerInstance(dependencyTokens.manifest, instances.manifest);
    container.registerInstance(dependencyTokens.algorithm, instances.algorithm);
    container.registerInstance(
        dependencyTokens.calculationRunner,
        instances.runner,
    );
    container.registerInstance(dependencyTokens.db, instances.db);

    // Reflect metadata is untyped; `Injectable` writes these values.
    const classes =
        (Reflect.getMetadata("classes", globalThis) as
            constructor<unknown>[] | undefined) ?? [];

    for (const cls of classes) {
        const token = Reflect.getMetadata("registrationToken", cls) as
            InjectionToken<unknown> | undefined;

        if (!token) {
            throw new Error(
                `Class ${cls.name} has no registration token; decorate it with @Injectable`,
            );
        }

        container.registerSingleton(token, cls);
    }
}
```

Replace `apps/processor/src/app.ts` with:

```ts
import express from "express";
import helmet from "helmet";
import { getContainer } from "./dependencies/container";
import { dependencyTokens } from "./dependencies/tokens";
import { createApiKeyMiddleware } from "./middleware/apiKey";
import { errorHandler, notFoundHandler } from "./middleware/errorHandlers";
import { createRouter } from "./router";

/**
 * Creates the Express application. The API key is checked before the body is parsed, so unauthenticated
 * requests cost nothing.
 */
export function createApp(container = getContainer()) {
    const config = container.resolve(dependencyTokens.config);

    return express()
        .disable("x-powered-by")
        .set("trust proxy", 1)
        .use(helmet())
        .use(createApiKeyMiddleware(config.apiKey))
        .use(express.json({ limit: "1mb" }))
        .use(createRouter(container))
        .use(notFoundHandler)
        .use(errorHandler);
}
```

Create `apps/processor/tests/utils/container.ts`:

```ts
import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { InlineRunner } from "@/calculation/InlineRunner";
import type { Config } from "@/config/config";
import type { Database } from "@/database/types";
import { registerDependencies } from "@/dependencies/register";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import { Modes } from "@rian8337/osu-base";
import {
    container as globalContainer,
    type DependencyContainer,
} from "tsyringe";
import { FixtureBeatmapServiceClient } from "./beatmaps";
import { createTestDatabase } from "./database";

export const testApiKey = "test-api-key-0123456789";

export const testConfig: Config = {
    port: 0,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    beatmapService: { url: "http://beatmaps.invalid/api/beatmap", key: "" },
    apiKey: testApiKey,
    calculation: { threads: 0, maxQueue: 100 },
};

export function testManifest(mode: Modes): VariantManifest {
    return {
        id: `test-${mode}`,
        mode,
        algorithm: "live",
        calculatorVersion: "0123456789abcdef",
        source: "npm",
        builtAt: "2026-10-05T00:00:00.000Z",
    };
}

/**
 * A container for a test. Disposing releases what the container created: the runner, and the test database
 * unless one was passed in.
 */
export interface TestContainer extends AsyncDisposable {
    readonly container: DependencyContainer;
}

/**
 * Creates a child container with real implementations, an inline runner, a PGlite database (unless `db` is
 * given), and the fixture beatmap service client.
 */
export async function createTestContainer(
    options: {
        mode?: Modes;
        db?: Database;
        overrides?: (container: DependencyContainer) => void;
    } = {},
): Promise<TestContainer> {
    const mode = options.mode ?? Modes.Droid;
    const algorithm = createAlgorithm(mode);
    const resources = new AsyncDisposableStack();
    const runner = resources.use(new InlineRunner(algorithm));
    const db = options.db ?? resources.use(await createTestDatabase()).db;
    const container = globalContainer.createChildContainer();

    registerDependencies(container, {
        config: testConfig,
        manifest: testManifest(mode),
        algorithm,
        runner,
        db,
    });

    container.registerInstance(
        dependencyTokens.beatmapServiceClient,
        new FixtureBeatmapServiceClient(),
    );
    options.overrides?.(container);

    return { container, [Symbol.asyncDispose]: () => resources.disposeAsync() };
}
```

- [ ] **Step 4: Write the failing tests**

Create `apps/processor/tests/unit/controllers/controllers.test.ts`:

```ts
import { createApp } from "@/app";
import { dependencyTokens } from "@/dependencies/tokens";
import { BeatmapService } from "@/services/BeatmapService";
import type { ICalculationService } from "@/services/ICalculationService";
import { NotFoundError } from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
import { calculateFixtureDifficulty } from "@test/utils/attributes";
import {
    createTestContainer,
    testApiKey,
    type TestContainer,
} from "@test/utils/container";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const difficulty = calculateFixtureDifficulty("discoprince", Modes.Droid);

describe("controllers", () => {
    let calculateDifficulty: ReturnType<
        typeof vi.fn<ICalculationService["calculateDifficulty"]>
    >;
    let calculatePerformance: ReturnType<
        typeof vi.fn<ICalculationService["calculatePerformance"]>
    >;
    let calculateReplayPerformance: ReturnType<
        typeof vi.fn<ICalculationService["calculateReplayPerformance"]>
    >;
    let testContainer: TestContainer;
    let app: ReturnType<typeof createApp>;

    beforeEach(async () => {
        calculateDifficulty = vi.fn<ICalculationService["calculateDifficulty"]>(
            () => Promise.resolve({ difficulty }),
        );
        calculatePerformance =
            vi.fn<ICalculationService["calculatePerformance"]>();
        calculateReplayPerformance =
            vi.fn<ICalculationService["calculateReplayPerformance"]>();

        const calculations: ICalculationService = {
            calculateDifficulty,
            calculatePerformance,
            calculateReplayPerformance,
        };

        testContainer = await createTestContainer({
            overrides: (c) =>
                c.registerInstance(
                    dependencyTokens.calculationService,
                    calculations,
                ),
        });

        app = createApp(testContainer.container);
    });

    afterEach(() => testContainer[Symbol.asyncDispose]());

    it("serves /info without an API key", async () => {
        const response = await request(app).get("/info");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            id: `test-${Modes.Droid}`,
            mode: Modes.Droid,
            algorithm: "live",
            calculatorVersion: "0123456789abcdef",
            builtAt: "2026-10-05T00:00:00.000Z",
        });
    });

    it("requires the API key elsewhere", async () => {
        for (const key of [undefined, "wrong"]) {
            const req = request(app)
                .post("/difficulty")
                .send({ beatmap: { id: 1 } });
            const response = await (key ? req.set("X-Api-Key", key) : req);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({
                error: {
                    code: "UNAUTHORIZED",
                    message: "Missing or invalid API key",
                },
            });
        }

        expect(calculateDifficulty).not.toHaveBeenCalled();
    });

    it("passes validated requests with defaults to the service", async () => {
        const response = await request(app)
            .post("/difficulty")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 1 } });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            difficulty: { starRating: difficulty.starRating },
        });
        expect(calculateDifficulty).toHaveBeenCalledWith({
            beatmap: { id: 1 },
            mods: [],
            strainChart: false,
        });
    });

    it.each(["/difficulty", "/performance", "/performance/replay"])(
        "rejects invalid %s bodies with 400",
        async (path) => {
            const response = await request(app)
                .post(path)
                .set("X-Api-Key", testApiKey)
                .send({ beatmap: { id: -1 } });

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: { code: "INVALID_REQUEST" },
            });
            expect(calculateDifficulty).not.toHaveBeenCalled();
            expect(calculatePerformance).not.toHaveBeenCalled();
            expect(calculateReplayPerformance).not.toHaveBeenCalled();
        },
    );

    it("maps API errors to their status and code", async () => {
        calculatePerformance.mockRejectedValueOnce(
            new NotFoundError("BEATMAP_NOT_FOUND", "Beatmap not found"),
        );

        const response = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 1 } });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: { code: "BEATMAP_NOT_FOUND", message: "Beatmap not found" },
        });
    });

    it("hides unexpected errors", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        calculatePerformance.mockRejectedValueOnce(new Error("secret details"));

        const response = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 1 } });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        });
    });

    it("returns JSON errors for malformed JSON, oversized bodies, and unknown routes", async () => {
        const malformed = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .set("Content-Type", "application/json")
            .send("{ not json");

        expect(malformed.status).toBe(400);
        expect(malformed.body).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });

        const oversized = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { file: "x".repeat(1024 * 1024 + 1) } });

        expect(oversized.status).toBe(413);
        expect(oversized.body).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });

        const unknown = await request(app)
            .get("/nope")
            .set("X-Api-Key", testApiKey);

        expect(unknown.status).toBe(404);
        expect(unknown.body).toMatchObject({
            error: { code: "INVALID_REQUEST" },
        });
    });

    it("registers real services by default", async () => {
        await using defaults = await createTestContainer();

        expect(
            defaults.container.resolve(dependencyTokens.beatmapService),
        ).toBeInstanceOf(BeatmapService);
    });
});
```

Create `apps/processor/tests/integration/controllers/api.int.test.ts`:

```ts
import { createApp } from "@/app";
import { difficultyAttributesTable } from "@/database/schema";
import { Modes } from "@rian8337/osu-base";
import { createTestContainer, testApiKey } from "@test/utils/container";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { beatmapFixtures } from "@test/utils/fixtures";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.each([Modes.Droid, Modes.Osu])("%s API (integration)", (mode) => {
    const resources = new AsyncDisposableStack();
    let testDatabase: TestDatabase;
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
        testDatabase = resources.use(await createTestDatabase());
        const testContainer = resources.use(
            await createTestContainer({ mode, db: testDatabase.db }),
        );

        app = createApp(testContainer.container);
    });

    afterAll(() => resources.disposeAsync());

    it("calculates performance and stores difficulty attributes once", async () => {
        const body = {
            beatmap: { id: beatmapFixtures.highPowered.id },
            mods: [{ acronym: "HD" }],
            score: { nmiss: 1 },
        };

        const first = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send(body);
        const second = await request(app)
            .post("/performance")
            .set("X-Api-Key", testApiKey)
            .send(body);

        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({
            performance: { total: expect.any(Number) },
            score: { nmiss: 1 },
        });
        expect(second.body).toEqual(first.body);
        expect(
            await testDatabase.db.select().from(difficultyAttributesTable),
        ).toHaveLength(1);
    });

    it("returns 404 for an unknown beatmap", async () => {
        const response = await request(app)
            .post("/difficulty")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { id: 999 } });

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
            error: { code: "BEATMAP_NOT_FOUND" },
        });
    });

    it("returns 422 for an uploaded file that is not a beatmap", async () => {
        const response = await request(app)
            .post("/difficulty")
            .set("X-Api-Key", testApiKey)
            .send({ beatmap: { file: "definitely not a beatmap" } });

        expect(response.status).toBe(422);
        expect(response.body).toMatchObject({
            error: { code: "INVALID_BEATMAP" },
        });
    });
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0. If the oversized-body assertion returns 401, the API key header is missing; if it returns 400, check that `express.json({ limit: "1mb" })` comes before the router.

- [ ] **Step 6: Commit**

```bash
git add -A apps/processor
git commit -m "Add HTTP layer and dependency registration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Startup, shutdown, logging, and prune command

**Files:**

- Create: `apps/processor/src/runtime/logging.ts`, `apps/processor/src/runtime/shutdown.ts`, `apps/processor/src/cli/prune.ts`, `apps/processor/scripts/lib/buildOptions.ts`
- Modify: `apps/processor/src/index.ts`, `apps/processor/tsdown.config.ts`
- Test: `apps/processor/tests/unit/runtime/logging.test.ts`, `apps/processor/tests/unit/runtime/shutdown.test.ts`

**Interfaces:**

- Consumes: all previous tasks; `DatabaseConnection` (Task 8).
- Produces:
    - `installLogPrefix(id: string): Disposable` (disposing restores the original console methods)
    - `createShutdownHandler(options: { resources: AsyncDisposable; timeoutMs?: number; exit?: (code: number) => void }): (signal: string) => void`
    - `createBuildOptions(options: { outDir: string; alias?: Record<string, string> }): UserConfig` (used by Task 14)
    - Build outputs: `dist/index.mjs`, `dist/worker.mjs`, `dist/prune.mjs`, `dist/drizzle/`

**Design notes:**

- `main()` registers each resource on one `AsyncDisposableStack` as it is created: database, then runner, then HTTP server. A stack disposes in reverse order, so shutdown closes the server (finishing in-flight requests; Node 19+ also drops idle keep-alive connections), then the runner (waiting for running tasks), then the database. If startup fails partway, the same stack releases whatever already exists.
- `http.Server` already implements `[Symbol.asyncDispose]` (it calls `close()`), so the server needs no wrapper.

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/runtime/logging.test.ts`:

```ts
import { installLogPrefix } from "@/runtime/logging";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("installLogPrefix", () => {
    const original = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };
    let calls: unknown[][];

    beforeEach(() => {
        calls = [];

        for (const method of ["log", "info", "warn", "error"] as const) {
            console[method] = vi.fn((...args: unknown[]) => calls.push(args));
        }
    });

    afterEach(() => {
        Object.assign(console, original);
    });

    it("prefixes every console method with the variant ID until disposed", () => {
        {
            using _prefix = installLogPrefix("droid-live");

            console.log("a");
            console.info("b", 1);
            console.warn("c");
            console.error("d");
        }

        console.log("after");

        expect(calls).toEqual([
            ["[droid-live]", "a"],
            ["[droid-live]", "b", 1],
            ["[droid-live]", "c"],
            ["[droid-live]", "d"],
            ["after"],
        ]);
    });
});
```

Create `apps/processor/tests/unit/runtime/shutdown.test.ts`:

```ts
import { createShutdownHandler } from "@/runtime/shutdown";
import { describe, expect, it, vi } from "vitest";

describe("createShutdownHandler", () => {
    it("disposes resources in reverse registration order, then exits 0", async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        const order: string[] = [];
        const resources = new AsyncDisposableStack();
        const exit = vi.fn();

        resources.defer(async () => void order.push("database"));
        resources.defer(async () => void order.push("runner"));
        resources.defer(async () => void order.push("server"));

        createShutdownHandler({ resources, exit })("SIGTERM");

        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
        expect(order).toEqual(["server", "runner", "database"]);
    });

    it("ignores repeated signals", async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        const dispose = vi.fn(() => Promise.resolve());
        const exit = vi.fn();
        const shutdown = createShutdownHandler({
            resources: { [Symbol.asyncDispose]: dispose },
            exit,
        });

        shutdown("SIGINT");
        shutdown("SIGTERM");

        await vi.waitFor(() => expect(exit).toHaveBeenCalled());
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("exits 1 when shutdown takes too long", () => {
        vi.useFakeTimers();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const exit = vi.fn();
        const neverFinishes = {
            [Symbol.asyncDispose]: () => new Promise<void>(() => undefined),
        };

        createShutdownHandler({
            resources: neverFinishes,
            timeoutMs: 10_000,
            exit,
        })("SIGTERM");
        vi.advanceTimersByTime(10_000);

        expect(exit).toHaveBeenCalledWith(1);
        vi.useRealTimers();
    });

    it("still releases the other resources when one fails, then exits 1", async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const resources = new AsyncDisposableStack();
        const database = vi.fn(() => Promise.resolve());
        const exit = vi.fn();

        resources.defer(database);
        resources.defer(() => Promise.reject(new Error("pool stuck")));

        createShutdownHandler({ resources, exit })("SIGTERM");

        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
        expect(database).toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @dpp/processor test tests/unit/runtime`
Expected: FAIL; modules not found.

- [ ] **Step 3: Implement runtime helpers**

Create `apps/processor/src/runtime/logging.ts`:

```ts
const methods = ["log", "info", "warn", "error"] as const;

/**
 * Prefixes all console output with `[<id>]`, so the logs of different variants are easy to tell apart. Disposing
 * restores the original console methods; the processor keeps the prefix for its whole lifetime.
 */
export function installLogPrefix(id: string): Disposable {
    const prefix = `[${id}]`;
    const originals = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    for (const method of methods) {
        const original = originals[method];

        console[method] = (...args: unknown[]) => {
            original.call(console, prefix, ...args);
        };
    }

    return {
        [Symbol.dispose]: () => {
            Object.assign(console, originals);
        },
    };
}
```

Create `apps/processor/src/runtime/shutdown.ts`:

```ts
export interface ShutdownOptions {
    /**
     * Everything to release. Pass the `AsyncDisposableStack` the resources were registered on: it disposes them
     * in reverse order, and keeps going when one fails.
     */
    readonly resources: AsyncDisposable;

    /**
     * Force-exit after this long. Defaults to 10 seconds.
     */
    readonly timeoutMs?: number;
    readonly exit?: (code: number) => void;
}

/**
 * Creates a signal handler that releases the resources and exits: 0 if everything was released, 1 if anything
 * failed or it took longer than the timeout.
 */
export function createShutdownHandler(
    options: ShutdownOptions,
): (signal: string) => void {
    const {
        resources,
        timeoutMs = 10_000,
        exit = (code: number) => process.exit(code),
    } = options;
    let shuttingDown = false;

    return (signal) => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        console.log(`Received ${signal}; shutting down`);

        setTimeout(() => {
            console.error(
                `Shutdown did not finish within ${timeoutMs.toString()} ms; exiting`,
            );
            exit(1);
        }, timeoutMs).unref();

        resources[Symbol.asyncDispose]().then(
            () => {
                exit(0);
            },
            (e: unknown) => {
                console.error(
                    "Failed to release resources during shutdown:",
                    e,
                );
                exit(1);
            },
        );
    };
}
```

- [ ] **Step 4: Entry points**

Replace `apps/processor/src/index.ts` with:

```ts
import "reflect-metadata";
import { sql } from "drizzle-orm";
import type { Express } from "express";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { createAlgorithm } from "./algorithms/createAlgorithm";
import { createApp } from "./app";
import type { ICalculationRunner } from "./calculation/ICalculationRunner";
import { InlineRunner } from "./calculation/InlineRunner";
import { PiscinaRunner } from "./calculation/PiscinaRunner";
import { ConfigError, loadConfig } from "./config/config";
import { DatabaseConnection } from "./database/DatabaseConnection";
import { getContainer } from "./dependencies/container";
import { registerDependencies } from "./dependencies/register";
import { loadEnvironmentVariables } from "./env";
import { loadManifest } from "./manifest/manifest";
import { installLogPrefix } from "./runtime/logging";
import { createShutdownHandler } from "./runtime/shutdown";

function listen(app: Express, port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(server);
            }
        });
    });
}

async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);
    const manifest = await loadManifest(
        new URL("./manifest.json", import.meta.url),
        process.env,
    );

    // Kept for the process's whole lifetime, so never disposed.
    installLogPrefix(manifest.id);

    console.log(
        `Starting variant ${manifest.id} (${manifest.mode}, ${manifest.algorithm}, ${manifest.calculatorVersion})`,
    );

    // Released in reverse order on shutdown: server, then runner, then database.
    const resources = new AsyncDisposableStack();

    try {
        const database = resources.use(new DatabaseConnection(config.database));

        await database.db.execute(sql`select 1`);
        await database.migrate(
            fileURLToPath(new URL("./drizzle", import.meta.url)),
        );

        const algorithm = createAlgorithm(manifest.mode);

        const runner = resources.use<ICalculationRunner>(
            config.calculation.threads === 0
                ? new InlineRunner(algorithm)
                : new PiscinaRunner({
                      mode: manifest.mode,
                      threads: config.calculation.threads,
                      maxQueue: config.calculation.maxQueue,
                  }),
        );

        registerDependencies(getContainer(), {
            config,
            manifest,
            algorithm,
            runner,
            db: database.db,
        });

        resources.use(await listen(createApp(), config.port));
        console.log(`Listening on port ${config.port.toString()}`);
    } catch (e) {
        await resources.disposeAsync().catch((disposeError: unknown) => {
            console.error(
                "Failed to release resources after a startup failure:",
                disposeError,
            );
        });

        throw e;
    }

    const shutdown = createShutdownHandler({ resources });

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

main().catch((e: unknown) => {
    console.error("Startup failed:", e instanceof ConfigError ? e.message : e);
    process.exit(1);
});
```

Create `apps/processor/src/cli/prune.ts`:

```ts
import "reflect-metadata";
import { loadConfig } from "@/config/config";
import { DatabaseConnection } from "@/database/DatabaseConnection";
import { loadEnvironmentVariables } from "@/env";
import { loadManifest } from "@/manifest/manifest";
import { DifficultyAttributesRepository } from "@/repositories/DifficultyAttributesRepository";

/**
 * Deletes difficulty attributes calculated by other calculator versions. Run it from the snapshot whose
 * attributes should be kept: `node releases/<variant>/current/prune.mjs`.
 */
async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);
    const manifest = await loadManifest(
        new URL("./manifest.json", import.meta.url),
        process.env,
    );

    await using database = new DatabaseConnection(config.database);

    const deleted = await new DifficultyAttributesRepository(
        database.db,
    ).deleteOtherVersions(manifest.calculatorVersion);

    console.log(
        `Deleted ${deleted.toString()} rows not from calculator version ${manifest.calculatorVersion}`,
    );
}

main().catch((e: unknown) => {
    console.error("Prune failed:", e);
    process.exit(1);
});
```

- [ ] **Step 5: Build configuration**

Create `apps/processor/scripts/lib/buildOptions.ts`:

```ts
import { cp } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join } from "node:path";
import type { UserConfig } from "tsdown";

/**
 * Packages left out of bundles: native addons, and piscina, which spawns its own worker script from its package
 * directory.
 */
export const externalPackages = ["canvas", "piscina", "pg-native"];

function isExternal(id: string): boolean {
    return (
        id.startsWith("node:") ||
        builtinModules.includes(id) ||
        externalPackages.some(
            (name) => id === name || id.startsWith(`${name}/`),
        )
    );
}

/**
 * tsdown options for the processor. Everything except Node built-ins and {@link externalPackages} is bundled, so
 * a build does not depend on which osu packages are installed after it was made.
 *
 * Paths are relative to `apps/processor`.
 *
 * @param options.outDir The output directory.
 * @param options.alias Module redirections, used to pick the calculator source.
 */
export function createBuildOptions(options: {
    outDir: string;
    alias?: Record<string, string>;
}): UserConfig {
    return {
        entry: {
            index: "src/index.ts",
            worker: "src/calculation/worker.ts",
            prune: "src/cli/prune.ts",
        },
        format: "esm",
        platform: "node",
        tsconfig: "tsconfig.build.json",
        outDir: options.outDir,
        clean: true,
        alias: options.alias,
        deps: {
            neverBundle: externalPackages,
            alwaysBundle: (id) => !isExternal(id),
            onlyBundle: false,
        },
        onSuccess: async () => {
            await cp("drizzle", join(options.outDir, "drizzle"), {
                recursive: true,
            });
        },
    };
}
```

Replace `apps/processor/tsdown.config.ts` with:

```ts
import { defineConfig } from "tsdown";
import { createBuildOptions } from "./scripts/lib/buildOptions.ts";

export default defineConfig(createBuildOptions({ outDir: "dist" }));
```

- [ ] **Step 6: Run the tests and build**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck && pnpm --filter @dpp/processor build && ls apps/processor/dist`
Expected: tests pass; typecheck exits 0; build succeeds; `dist/` contains `index.mjs`, `worker.mjs`, `prune.mjs`, and `drizzle/`.

Then check that both entries fail fast without configuration:

Run: `cd apps/processor && CI=1 node dist/index.mjs; echo "exit $?"; CI=1 node dist/prune.mjs; echo "exit $?"`
Expected: `Startup failed: Invalid configuration:` and `Prune failed:` followed by the missing variable names, each followed by `exit 1`. If the bundled output fails to parse `using`/`await using`, set `target: "node24"` in `createBuildOptions` (Node 24 runs explicit resource management natively) and rebuild.

- [ ] **Step 7: Commit**

```bash
git add -A apps/processor
git commit -m "Add startup, graceful shutdown, and prune command" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Variant build command

**Files:**

- Create: `apps/processor/scripts/lib/variant.ts`, `apps/processor/scripts/build-variant.ts`, `apps/processor/README.md`
- Test: `apps/processor/tests/unit/scripts/variant.test.ts`

**Interfaces:**

- Consumes: `createBuildOptions` (Task 13), `computeCalculatorVersion` (Task 7).
- Produces:
    - `parseArguments(argv: string[]): VariantArguments` (`{ name; mode: Modes; algorithm: "live" | "rebalance"; source?: string; activate: boolean; releasesDir: string }`)
    - `resolveCalculatorSources(algorithm, source?): CalculatorSources` (`{ files: { base; calculator; replayAnalyzer; strainGraph }; aliases: Record<string, string> }`)
    - `createSnapshotName(date: Date): string` (`YYYYMMDD-HHMMSS`, UTC)
    - `createSnapshotDirectory(variantDir: string, date: Date): Promise<string>`
    - `writeManifest(snapshotDir: string, manifest: object): Promise<void>`
    - `activateSnapshot(variantDir: string, snapshotName: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `apps/processor/tests/unit/scripts/variant.test.ts`:

```ts
import { Modes } from "@rian8337/osu-base";
import {
    mkdir,
    mkdtempDisposable,
    readlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    activateSnapshot,
    createSnapshotDirectory,
    createSnapshotName,
    parseArguments,
    resolveCalculatorSources,
} from "../../../scripts/lib/variant.ts";

function createTemporaryDirectory() {
    return mkdtempDisposable(join(tmpdir(), "variant-"));
}

describe("parseArguments", () => {
    it("parses a full command line", () => {
        expect(
            parseArguments([
                "flowaim",
                "--mode",
                Modes.Droid,
                "--algorithm",
                "rebalance",
                "--source",
                "/src/odm",
                "--activate",
            ]),
        ).toEqual({
            name: "flowaim",
            mode: Modes.Droid,
            algorithm: "rebalance",
            source: "/src/odm",
            activate: true,
            releasesDir: "releases",
        });
    });

    it.each([
        [["Bad_Name", "--mode", Modes.Droid, "--algorithm", "live"]],
        [["ok", "--mode", "taiko", "--algorithm", "live"]],
        [["ok", "--mode", Modes.Droid, "--algorithm", "experimental"]],
        [["--mode", Modes.Droid, "--algorithm", "live"]],
    ])("rejects %j", (argv) => {
        expect(() => parseArguments(argv)).toThrow(/Usage/);
    });
});

describe("createSnapshotName", () => {
    it("formats the UTC time", () => {
        expect(createSnapshotName(new Date("2026-10-05T14:30:07.123Z"))).toBe(
            "20261005-143007",
        );
    });
});

describe("filesystem helpers", () => {
    it("never reuses an existing snapshot directory", async () => {
        await using directory = await createTemporaryDirectory();
        const date = new Date("2026-10-05T14:30:07Z");

        expect(await createSnapshotDirectory(directory.path, date)).toBe(
            join(directory.path, "20261005-143007"),
        );
        expect(await createSnapshotDirectory(directory.path, date)).toBe(
            join(directory.path, "20261005-143007-2"),
        );
    });

    it("points current at the activated snapshot with a relative link, replacing the previous one", async () => {
        await using directory = await createTemporaryDirectory();

        await mkdir(join(directory.path, "a"));
        await mkdir(join(directory.path, "b"));

        await activateSnapshot(directory.path, "a");
        expect(await readlink(join(directory.path, "current"))).toBe("a");

        await activateSnapshot(directory.path, "b");
        expect(await readlink(join(directory.path, "current"))).toBe("b");
    });

    it("resolves a local osu-droid-module checkout and requires built packages", async () => {
        await using directory = await createTemporaryDirectory();

        expect(() =>
            resolveCalculatorSources("rebalance", directory.path),
        ).toThrow(/build osu-droid-module/);

        for (const pkg of [
            "osu-base",
            "osu-rebalance-difficulty-calculator",
            "osu-droid-replay-analyzer",
            "osu-strain-graph-generator",
        ]) {
            await mkdir(join(directory.path, "packages", pkg, "dist"), {
                recursive: true,
            });
            await writeFile(
                join(directory.path, "packages", pkg, "dist", "index.js"),
                "",
            );
        }

        const sources = resolveCalculatorSources("rebalance", directory.path);

        expect(sources.files.calculator).toBe(
            join(
                directory.path,
                "packages",
                "osu-rebalance-difficulty-calculator",
                "dist",
                "index.js",
            ),
        );
        expect(sources.aliases["@rian8337/osu-difficulty-calculator"]).toBe(
            sources.files.calculator,
        );
        expect(sources.aliases["@rian8337/osu-base"]).toBe(sources.files.base);
    });
});

describe("resolveCalculatorSources from npm", () => {
    it("picks the live or rebalance package", () => {
        expect(resolveCalculatorSources("live").files.calculator).toMatch(
            /osu-difficulty-calculator/,
        );
        expect(resolveCalculatorSources("rebalance").files.calculator).toMatch(
            /osu-rebalance-difficulty-calculator/,
        );
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dpp/processor test tests/unit/scripts`
Expected: FAIL; `scripts/lib/variant.ts` not found.

- [ ] **Step 3: Implement**

Create `apps/processor/scripts/lib/variant.ts` (runs under Node type stripping: relative imports with `.ts`, no path aliases, no enums or parameter properties):

```ts
import { Modes } from "@rian8337/osu-base";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Algorithm = "live" | "rebalance";

export interface VariantArguments {
    readonly name: string;
    readonly mode: Modes;
    readonly algorithm: Algorithm;
    readonly source?: string;
    readonly activate: boolean;
    readonly releasesDir: string;
}

export interface CalculatorSources {
    readonly files: {
        readonly base: string;
        readonly calculator: string;
        readonly replayAnalyzer: string;
        readonly strainGraph: string;
    };
    readonly aliases: Record<string, string>;
}

const modes: readonly string[] = Object.values(Modes);

const usage = `Usage: build:variant <name> --mode ${modes.join("|")} --algorithm live|rebalance [--source <osu-droid-module path>] [--activate] [--releases-dir <dir>]`;

function isMode(value: string | undefined): value is Modes {
    return value !== undefined && modes.includes(value);
}

function isAlgorithm(value: string | undefined): value is Algorithm {
    return value === "live" || value === "rebalance";
}

/**
 * Parses build:variant arguments.
 *
 * @throws {Error} With the usage text if an argument is missing or invalid.
 */
export function parseArguments(argv: string[]): VariantArguments {
    const fail = (problem: string): never => {
        throw new Error(`${problem}\n${usage}`);
    };

    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            mode: { type: "string" },
            algorithm: { type: "string" },
            source: { type: "string" },
            activate: { type: "boolean", default: false },
            "releases-dir": { type: "string", default: "releases" },
        },
    });

    const name = positionals[0] ?? "";

    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        fail("The variant name must match ^[a-z0-9][a-z0-9-]*$.");
    }

    const { mode, algorithm } = values;

    if (!isMode(mode)) {
        return fail(`--mode must be one of ${modes.join(", ")}.`);
    }

    if (!isAlgorithm(algorithm)) {
        return fail("--algorithm must be live or rebalance.");
    }

    return {
        name,
        mode,
        algorithm,
        ...(values.source !== undefined && { source: resolve(values.source) }),
        activate: values.activate,
        releasesDir: values["releases-dir"],
    };
}

/**
 * Finds the entry files of the osu packages to bundle, from npm or a built osu-droid-module checkout.
 *
 * @throws {Error} If a package in the checkout has not been built.
 */
export function resolveCalculatorSources(
    algorithm: Algorithm,
    source?: string,
): CalculatorSources {
    const directories = {
        base: "osu-base",
        calculator:
            algorithm === "live"
                ? "osu-difficulty-calculator"
                : "osu-rebalance-difficulty-calculator",
        replayAnalyzer: "osu-droid-replay-analyzer",
        strainGraph: "osu-strain-graph-generator",
    };

    let resolveEntry: (directory: string) => string;

    if (source) {
        resolveEntry = (directory) => {
            const file = join(
                source,
                "packages",
                directory,
                "dist",
                "index.js",
            );

            if (!existsSync(file)) {
                throw new Error(
                    `Missing ${file}; build osu-droid-module first`,
                );
            }

            return file;
        };
    } else {
        const require = createRequire(import.meta.url);

        resolveEntry = (directory) => require.resolve(`@rian8337/${directory}`);
    }

    const files = {
        base: resolveEntry(directories.base),
        calculator: resolveEntry(directories.calculator),
        replayAnalyzer: resolveEntry(directories.replayAnalyzer),
        strainGraph: resolveEntry(directories.strainGraph),
    };

    return {
        files,
        aliases: {
            "@rian8337/osu-base": files.base,
            "@rian8337/osu-difficulty-calculator": files.calculator,
            "@rian8337/osu-droid-replay-analyzer": files.replayAnalyzer,
            "@rian8337/osu-strain-graph-generator": files.strainGraph,
        },
    };
}

/**
 * Formats a snapshot folder name: `YYYYMMDD-HHMMSS` in UTC.
 */
export function createSnapshotName(date: Date): string {
    return date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .slice(0, 15);
}

/**
 * Creates a new, empty snapshot directory. Never reuses an existing one.
 *
 * @returns The created directory.
 */
export async function createSnapshotDirectory(
    variantDir: string,
    date: Date,
): Promise<string> {
    const base = createSnapshotName(date);

    await mkdir(variantDir, { recursive: true });

    for (let attempt = 1; ; attempt++) {
        const directory = join(
            variantDir,
            attempt === 1 ? base : `${base}-${attempt.toString()}`,
        );

        try {
            await mkdir(directory);

            return directory;
        } catch (e) {
            if (!(e instanceof Error && "code" in e && e.code === "EEXIST")) {
                throw e;
            }
        }
    }
}

/**
 * Writes `manifest.json` into a snapshot.
 */
export async function writeManifest(
    snapshotDir: string,
    manifest: object,
): Promise<void> {
    await writeFile(
        join(snapshotDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
}

/**
 * Atomically points `<variantDir>/current` at a snapshot, using a relative symlink.
 */
export async function activateSnapshot(
    variantDir: string,
    snapshotName: string,
): Promise<void> {
    const temporary = join(variantDir, ".current-next");

    await rm(temporary, { force: true });
    await symlink(snapshotName, temporary);
    await rename(temporary, join(variantDir, "current"));
}
```

Create `apps/processor/scripts/build-variant.ts`:

```ts
import { basename, join } from "node:path";
import { build } from "tsdown";
import { computeCalculatorVersion } from "../src/manifest/calculatorVersion.ts";
import { createBuildOptions } from "./lib/buildOptions.ts";
import {
    activateSnapshot,
    createSnapshotDirectory,
    parseArguments,
    resolveCalculatorSources,
    writeManifest,
} from "./lib/variant.ts";

/**
 * Builds an immutable variant snapshot into `releases/<name>/<timestamp>/`.
 */
async function main(): Promise<void> {
    const args = parseArguments(process.argv.slice(2));
    const sources = resolveCalculatorSources(args.algorithm, args.source);
    const builtAt = new Date();
    const variantDir = join(args.releasesDir, args.name);
    const snapshotDir = await createSnapshotDirectory(variantDir, builtAt);

    await build({
        ...createBuildOptions({ outDir: snapshotDir, alias: sources.aliases }),
        config: false,
        logLevel: "warn",
    });

    await writeManifest(snapshotDir, {
        id: args.name,
        mode: args.mode,
        algorithm: args.algorithm,
        calculatorVersion: await computeCalculatorVersion([
            sources.files.calculator,
            sources.files.base,
        ]),
        source: args.source ?? "npm",
        builtAt: builtAt.toISOString(),
    });

    if (args.activate) {
        await activateSnapshot(variantDir, basename(snapshotDir));
    }

    console.log(
        `Built ${args.name} into ${snapshotDir}${args.activate ? " and activated it" : ""}`,
    );
}

main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
```

Create `apps/processor/README.md`:

````markdown
# Processor

Calculates difficulty and performance for one **variant**: a freely named build pairing one game mode with one
build of the calculator code. See `docs/superpowers/specs/2026-10-05-processor-design.md`.

## Building a variant

```bash
# From npm packages
pnpm build:variant droid-live --mode droid --algorithm live --activate

# From a local osu-droid-module checkout (build it first)
pnpm build:variant flowaim-experiment --mode droid --algorithm rebalance --source ~/Projects/osu-droid-module-flowaim --activate
```

Each build writes a new, never-modified snapshot to `apps/processor/releases/<variant>/<timestamp>/`.
`--activate` points `releases/<variant>/current` at it. Without `--activate`, switch later with:

```bash
ln -sfn <timestamp> apps/processor/releases/<variant>/current
```

## Running under PM2

One PM2 app per variant, fork mode, one instance:

```js
// ecosystem.config.cjs
module.exports = {
    apps: [
        {
            name: "dpp-droid-live",
            script: "apps/processor/releases/droid-live/current/index.mjs",
            exp_backoff_restart_delay: 1000,
            kill_timeout: 12000,
            env: {
                NODE_ENV: "production",
                PORT: 3006,
                DATABASE_HOST: "localhost",
                DATABASE_NAME: "dpp_droid_live",
                DATABASE_USER: "dpp",
                DATABASE_PASSWORD: "…",
                BEATMAP_SERVICE_URL: "http://localhost:3017/api/beatmap",
                BEATMAP_SERVICE_KEY: "…",
                API_KEY: "…",
                CALCULATION_THREADS: 4,
            },
        },
    ],
};
```

Switching code: rebuild, repoint `current`, then `pm2 restart dpp-droid-live`. Rolling back: point `current` at the
previous snapshot and restart.

A new variant needs only `CREATE DATABASE <name>;`. Migrations run at startup.

## Environment variables

| Variable                                          | Default                  | Purpose                                                                   |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `PORT`                                            | required                 | HTTP port                                                                 |
| `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER` | required                 | the variant's own Postgres database                                       |
| `DATABASE_PORT`                                   | `5432`                   |                                                                           |
| `DATABASE_PASSWORD`                               | empty                    |                                                                           |
| `BEATMAP_SERVICE_URL`                             | required                 | e.g. `http://localhost:3017/api/beatmap`                                  |
| `BEATMAP_SERVICE_KEY`                             | empty                    | beatmap service internal key                                              |
| `API_KEY`                                         | required, 16+ characters | key the broker sends in `X-Api-Key`                                       |
| `CALCULATION_THREADS`                             | CPU count                | worker threads; `0` calculates on the main thread                         |
| `CALCULATION_MAX_QUEUE`                           | `100`                    | queued tasks before responding `503 OVERLOADED`                           |
| `DEV_MODE`                                        | none                     | `droid` or `osu`; only used when running from source (no `manifest.json`) |

## Removing old cached attributes

```bash
node apps/processor/releases/<variant>/current/prune.mjs
```

Deletes attributes from every calculator version except the snapshot's own. Never run automatically, so rolling
back keeps its cache until you prune.

## Development

Put development settings in `apps/processor/.env.development` (loaded automatically; see the table above).

```bash
DEV_MODE=droid pnpm --filter @dpp/processor dev   # rebuilds and restarts on change; live npm calculator only
pnpm --filter @dpp/processor test                # unit and integration tests
pnpm --filter @dpp/processor test:e2e            # builds a snapshot and runs it as a real process
```
````

- [ ] **Step 4: Run the tests and a real build**

Run: `pnpm --filter @dpp/processor test && pnpm --filter @dpp/processor typecheck`
Expected: all tests pass; typecheck exits 0.

Run: `pnpm build:variant smoke-droid --mode droid --algorithm live --activate && cat apps/processor/releases/smoke-droid/current/manifest.json && ls apps/processor/releases/smoke-droid/current`
Expected: prints `Built smoke-droid into releases/smoke-droid/<timestamp> and activated it`; the manifest has `"id": "smoke-droid"`, `"mode": "droid"`, and a 16-character `calculatorVersion`; the snapshot contains `index.mjs`, `worker.mjs`, `prune.mjs`, `drizzle/`, `manifest.json`.

Run: `cat apps/processor/releases/smoke-droid/current/*.mjs | grep -c "#region.*osu-base/"`
Expected: `1` (exactly one bundled copy of osu-base across all output files). `2` means `index.mjs` and `worker.mjs` each embed a copy, which is still one copy per thread and acceptable. Anything higher means a package was resolved twice; check the aliases.

Run: `rm -rf apps/processor/releases/smoke-droid`

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add variant build command and processor README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-end tests

**Files:**

- Create: `apps/processor/vitest.e2e.config.mts`, `apps/processor/tests/e2e/processor.e2e.test.ts`
- Test: the file above

**Interfaces:**

- Consumes: the built snapshot (Tasks 13–14), fixtures and `modMap` (Task 1).

**Design notes:** every resource the suite creates (the temporary releases directory, PGlite, its socket server, the stub beatmap service, the processor process) is registered on one `AsyncDisposableStack`, so `afterAll` is a single `disposeAsync()` that tears them down in reverse order.

- [ ] **Step 1: E2E configuration**

Create `apps/processor/vitest.e2e.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: { alias: { "@test": "/tests" } },
    test: {
        include: ["tests/e2e/**/*.test.ts"],
        testTimeout: 60_000,
        hookTimeout: 180_000,
        maxWorkers: 1,
    },
});
```

- [ ] **Step 2: Write the test**

Create `apps/processor/tests/e2e/processor.e2e.test.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { BeatmapDecoder, ModHidden, Modes } from "@rian8337/osu-base";
import { DroidDifficultyCalculator } from "@rian8337/osu-difficulty-calculator";
import {
    beatmapFixtureNames,
    beatmapFixtures,
    hasReplayFixture,
    md5Of,
    readBeatmapFixture,
    replayFixture,
} from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempDisposable, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const processorDir = fileURLToPath(new URL("../../", import.meta.url));
const apiKey = "e2e-api-key-0123456789";

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createNetServer().listen(0, "127.0.0.1", () => {
            const address = server.address();

            server.close(() =>
                typeof address === "object" && address
                    ? resolve(address.port)
                    : reject(new Error("no port")),
            );
        });
    });
}

/**
 * A stand-in for the beatmap service, serving the fixtures.
 */
function startBeatmapService(port: number): Promise<Server> {
    const beatmaps = beatmapFixtureNames.map((name) => {
        const bytes = Buffer.from(readBeatmapFixture(name));

        return { id: beatmapFixtures[name].id, hash: md5Of(bytes), bytes };
    });

    const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = url.searchParams.get("id");
        const hash = url.searchParams.get("hash");
        const beatmap = beatmaps.find((b) =>
            id ? b.id === Number(id) : b.hash === hash,
        );

        if (!beatmap) {
            res.writeHead(404).end();
            return;
        }

        if (url.pathname.endsWith("/getbeatmapfile")) {
            res.writeHead(200, { "Content-Type": "text/plain" }).end(
                beatmap.bytes,
            );
        } else {
            res.writeHead(200, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                    beatmap_id: beatmap.id.toString(),
                    file_md5: beatmap.hash,
                }),
            );
        }
    });

    return new Promise((resolve) =>
        server.listen(port, "127.0.0.1", () => resolve(server)),
    );
}

describe("processor snapshot (e2e)", () => {
    const resources = new AsyncDisposableStack();
    let databasePort: number;
    let processor: ChildProcess;
    let baseUrl: string;
    let output = "";

    const post = (path: string, body: unknown, key: string | null = apiKey) =>
        fetch(`${baseUrl}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(key && { "X-Api-Key": key }),
            },
            body: JSON.stringify(body),
        });

    beforeAll(async () => {
        const releases = resources.use(
            await mkdtempDisposable(join(tmpdir(), "processor-e2e-")),
        );

        execFileSync(
            "node",
            [
                "scripts/build-variant.ts",
                "e2e-droid",
                "--mode",
                Modes.Droid,
                "--algorithm",
                "live",
                "--releases-dir",
                releases.path,
                "--activate",
            ],
            { cwd: processorDir, stdio: "inherit" },
        );

        databasePort = await freePort();
        const database = resources.use(new PGlite());
        const databaseServer = new PGLiteSocketServer({
            db: database,
            host: "127.0.0.1",
            port: databasePort,
            maxConnections: 10,
        });

        await databaseServer.start();
        resources.defer(() => databaseServer.stop());

        const beatmapPort = await freePort();
        resources.use(await startBeatmapService(beatmapPort));

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port.toString()}`;

        processor = spawn(
            "node",
            [join(releases.path, "e2e-droid", "current", "index.mjs")],
            {
                env: {
                    ...process.env,
                    CI: "1",
                    PORT: port.toString(),
                    DATABASE_HOST: "127.0.0.1",
                    DATABASE_PORT: databasePort.toString(),
                    DATABASE_NAME: "postgres",
                    DATABASE_USER: "postgres",
                    DATABASE_PASSWORD: "",
                    BEATMAP_SERVICE_URL: `http://127.0.0.1:${beatmapPort.toString()}/api/beatmap`,
                    API_KEY: apiKey,
                    CALCULATION_THREADS: "2",
                },
            },
        );

        resources.defer(() => {
            if (processor.exitCode === null) {
                processor.kill("SIGKILL");
            }
        });

        processor.stdout?.on(
            "data",
            (chunk: Buffer) => (output += chunk.toString()),
        );
        processor.stderr?.on(
            "data",
            (chunk: Buffer) => (output += chunk.toString()),
        );

        for (let attempt = 0; ; attempt++) {
            const ready = await fetch(`${baseUrl}/info`)
                .then((r) => r.ok)
                .catch(() => false);

            if (ready) {
                break;
            }

            if (attempt > 100 || processor.exitCode !== null) {
                throw new Error(`Processor did not start:\n${output}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    });

    afterAll(() => resources.disposeAsync());

    it("reports the variant from its manifest", async () => {
        const info: unknown = await (await fetch(`${baseUrl}/info`)).json();

        expect(info).toMatchObject({
            id: "e2e-droid",
            mode: Modes.Droid,
            algorithm: "live",
            calculatorVersion: expect.stringMatching(/^[0-9a-f]{16}$/),
        });
        expect(output).toContain("[e2e-droid]");
    });

    it("rejects requests without the API key", async () => {
        expect(
            (await post("/difficulty", { beatmap: { id: 1 } }, null)).status,
        ).toBe(401);
    });

    it("calculates difficulty through the worker pool, matching the calculator", async () => {
        const response = await post("/difficulty", {
            beatmap: { id: beatmapFixtures.loveLetter.id },
            mods: modMap(new ModHidden()).serializeMods(),
        });

        const expected = new DroidDifficultyCalculator().calculate(
            new BeatmapDecoder().decode(
                readBeatmapFixture("loveLetter"),
                Modes.Droid,
            ).result,
            modMap(new ModHidden()),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            difficulty: { starRating: expected.starRating },
        });
    });

    it("stores attributes in Postgres once", async () => {
        await post("/difficulty", {
            beatmap: { id: beatmapFixtures.discoprince.id },
        });
        await post("/difficulty", {
            beatmap: { id: beatmapFixtures.discoprince.id },
        });

        await using connection = new AsyncDisposableStack();
        const client = new pg.Client({
            host: "127.0.0.1",
            port: databasePort,
            user: "postgres",
            database: "postgres",
        });

        await client.connect();
        connection.defer(() => client.end());

        const result = await client.query<{ count: string }>(
            "select count(*) from difficulty_attributes where beatmap_hash = $1",
            [md5Of(Buffer.from(readBeatmapFixture("discoprince")))],
        );

        expect(result.rows[0]?.count).toBe("1");
    });

    it("calculates performance with a strain chart", async () => {
        const response = await post("/performance", {
            beatmap: { id: beatmapFixtures.highPowered.id },
            score: { n100: 3 },
            strainChart: true,
        });

        expect(response.status).toBe(200);

        const body: unknown = await response.json();

        expect(body).toMatchObject({
            performance: { total: expect.any(Number) },
            strainChart: expect.any(String),
        });

        if (
            typeof body === "object" &&
            body !== null &&
            "strainChart" in body &&
            typeof body.strainChart === "string"
        ) {
            expect(
                Buffer.from(body.strainChart, "base64")
                    .subarray(1, 4)
                    .toString(),
            ).toBe("PNG");
        }
    });

    it("calculates uploaded beatmaps", async () => {
        const response = await post("/performance", {
            beatmap: { file: readBeatmapFixture("discoprince") },
        });

        expect(response.status).toBe(200);
    });

    it.skipIf(!hasReplayFixture)("calculates replay performance", async () => {
        // The replay's beatmap must be served by the stub beatmap service; add it to beatmapFixtures when the
        // fixture is provided.
        const replay = (await readFile(replayFixture.replay)).toString(
            "base64",
        );
        const response = await post("/performance/replay", { replay });

        expect(response.status).toBe(200);
    });

    it("shuts down cleanly on SIGTERM", async () => {
        const exited = new Promise<number | null>((resolve) =>
            processor.once("exit", (code) => resolve(code)),
        );

        processor.kill("SIGTERM");

        expect(await exited).toBe(0);
        expect(output).toContain("Received SIGTERM");
    });
});
```

- [ ] **Step 3: Run the end-to-end tests**

Run: `pnpm test:e2e`
Expected: the build step prints `Built e2e-droid into …`, then all tests pass except the replay test, which is skipped until the replay fixture exists. If startup fails, the thrown error includes the processor's output.

If PGlite's socket server rejects the connection's authentication, set `DATABASE_PASSWORD` to `"postgres"` in the spawned environment and the `pg.Client` options; if it still fails, report the error output instead of working around it.

- [ ] **Step 4: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm format`
Expected: all exit 0; `pnpm format` changes nothing (if it reformats files, commit them in this step).

- [ ] **Step 5: Commit**

```bash
git add -A apps/processor
git commit -m "Add end-to-end tests for built snapshots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
