# Score Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/score-service`: the replay listener, the online-score lookup, the game's pp endpoints, the uncalculated-replay pass, and resumable score and total pp recalculation, all calculating through the broker. Also add slider hit counts to the processor contract.

**Architecture:** One app with two entry points: the server (`dist/index.mjs`: HTTP API, replay watcher, uncalculated scheduler) and the CLI (`dist/cli.mjs`: `recalculate-scores`, `recalculate-total-pp`, `job-status`). Same structure as the processor and the broker: `@Injectable(token)` classes behind `I*` interfaces, tsyringe tokens, `@dpp/server` plumbing. Stores: the official MySQL database (Drizzle + mysql2), two MongoDB clusters (official driver), the service's own Postgres (job progress, Drizzle + migrations), and local replay folders. Every pp value comes from the broker; the service parses replays locally but imports no calculator.

**Tech Stack:** TypeScript 7, Node 24, pnpm workspace, Express 5, tsyringe, zod 4, Drizzle (`pg` and `mysql2`), `mongodb`, `multer`, `chokidar`, `@rian8337/osu-droid-replay-analyzer`, vitest 5, PGlite, supertest, tsdown, oxlint/oxfmt.

**Spec:** `docs/superpowers/specs/2026-10-10-score-service-design.md`

## Global Constraints

- osu packages pinned exactly: `@rian8337/osu-base` and `@rian8337/osu-droid-replay-analyzer` at `4.0.0-beta.100`. The score service never depends on `@rian8337/osu-difficulty-calculator` or the rebalance calculator directly.
- New dependencies are added with `pnpm add` (the workspace's `minimumReleaseAge` picks versions that are old enough); never hand-edit versions newer than what pnpm resolves.
- Every HTTP input, upstream response, MongoDB document read, environment variable, and CLI argument is validated with zod (or `util.parseArgs` plus zod for the CLI).
- Errors use `{ error: { code, message } }`. Error codes live in `@dpp/shared`.
- Log prefix `[score-service]`. API keys and replay contents are never logged.
- Paths, hosts, keys, variants, and the official table prefix are configuration, never constants.
- Never mention production port numbers or hosts in committed files.
- Commits: one per task step that says "Commit"; message style as in `git log` (imperative, capitalized, no prefix), ending with the `Co-Authored-By` line the session gives. Chain edit, format, and commit with `&&`, never `;`.
- After every task: `pnpm typecheck`, `pnpm lint`, `pnpm exec oxfmt --check .` (or `pnpm format`), and the touched packages' `pnpm test` pass.
- `pp_multiplier` read from the database is always applied as `min(pp_multiplier ?? 1, 1)`.
- Tests build serialized mods from mod instances (`new ModHidden().serialize()`, imported from `@rian8337/osu-base`), never `{ acronym }` literals, except where a test is about an invalid acronym or malformed input. The test code below follows this; keep it that way in any test you add.
- Test fakes live one per file under `tests/utils/fakes/`, re-exported from `tests/utils/fakes/index.ts` (import them from `@test/utils/fakes`).
- "Retry later" (broker or beatmap service `502`/`503`/`504`/`429`, connection failure, timeout) never deletes data or records "not found".

## Review Focus

1. **The generated `total_score` column.** In production, `total_score` on `bbl_score` and `bbl_score_best` is `GENERATED ALWAYS AS (round(score * score_multiplier)) STORED`, and `bbl_score_uncalculated` has no `total_score` (and no `id`). Writing it fails the insert, so best rows are inserted without it. Task 5 declares the Drizzle schema to match the production export, generates the test tables from that schema (`drizzle-kit/api`), and inserts a best row through the repository; nullable hit counts are covered there too.
2. **A replay file that is still being written.** The watcher must only pick up a file after `awaitWriteFinish`; the backlog at startup may contain half-written files from a crash, which must fail parsing and be deleted (they can never become valid). Task 14 tests a file that appears in two writes.
3. **The same file offered twice** (backlog scan and the watcher's `add` event overlap at startup, or a retry timer fires while the file is in flight). Task 14 tests that a path is processed at most once at a time.
4. **A recalculation interrupted mid-chunk and resumed with a different `--concurrency`.** Chunks are claimed from Postgres, not assigned by worker number, so resuming with any concurrency must process every ID exactly once more at most. Task 16 tests resume after abort with a different concurrency.
5. **A broker response that is valid JSON but not the expected shape** (e.g. a processor of the wrong mode behind an alias). It must be a permanent failure for that item, never a crash or a retry loop. Task 7 tests malformed bodies; Task 13 tests a droid-shaped osu! response.

---

## File Structure

```
packages/shared/src/
  schemas.ts                 + slider hit fields and their rules (Task 1)
  scoreService.ts            score service HTTP schemas and types (Task 2)
  errors.ts                  + scoreServiceErrorCodes (Task 2)
packages/server/src/runtime/GracefulServer.ts   + optional host (Task 2)
apps/processor/src/
  algorithms/sliderHits.ts   SliderObjectCounts + convertSliderHits (Task 1)
  calculation/*              + sliderObjectCounts task (Task 1)
  services/CalculationService.ts  converts hits before resolveScore (Task 1)
apps/score-service/
  package.json tsconfig*.json tsdown.config.ts vitest*.mts drizzle.config.ts .env.example README.md
  drizzle/                   generated Postgres migrations (Task 4)
  src/
    polyfills.ts index.ts cli.ts app.ts
    config/config.ts         Config, CliConfig, loadConfig, loadCliConfig, ConfigError
    types/env.ts             EnvironmentVariableKey
    types/errors.ts          ScoreNotFoundError, UpstreamError, RetryLaterError
    types/upstream.ts        UpstreamResult, helpers
    dependencies/tokens.ts register.ts
    database/schema.ts types.ts          job progress (Postgres)
    official/schema.ts connection.ts types.ts   official MySQL
    mongo/connections.ts documents.ts
    clients/http.ts schemas.ts BrokerClient.ts BeatmapServiceClient.ts DiscordMetadataClient.ts I*.ts index.ts
    repositories/OfficialScoreRepository.ts RecentPlayRepository.ts DanCourseRepository.ts UserBindRepository.ts JobProgressRepository.ts I*.ts index.ts
    replays/ReplayStore.ts IReplayStore.ts parseReplay.ts replayValidity.ts
    services/ScoreCalculator.ts IScoreCalculator.ts userTotals.ts ppMultiplier.ts
             BestScoreWriter.ts IBestScoreWriter.ts
             OnlineScoreService.ts GamePPService.ts recentPlay.ts danCourseGrade.ts DanCourseService.ts
             ReplaySubmissionService.ts UncalculatedReplayService.ts ScoreRecalculationService.ts TotalPPService.ts I*.ts index.ts
    jobs/JobRunner.ts backoff.ts
    runtime/TaskQueue.ts ReplayWatcher.ts UncalculatedScheduler.ts
    controllers/OnlineScoresController.ts GamePPController.ts index.ts
    middleware/apiKey.ts loopbackOnly.ts
    cli/arguments.ts run.ts
  tests/
    setup.ts
    utils/  config.ts container.ts database.ts fakes/ bodies.ts rows.ts mariadb.ts officialDatabase.ts mongo.ts fixtures.ts stubServices.ts
    unit/ integration/ e2e/ fixtures/
```

Each task below lists its own files; later tasks only add to files earlier tasks created.

---

### Task 1: Slider hit counts in the processor contract

**Files:**

- Modify: `packages/shared/src/schemas.ts`
- Create: `packages/shared/tests/schemas.test.ts` (or add to the existing schema test file if one exists: check `ls packages/shared/tests`)
- Create: `apps/processor/src/algorithms/sliderHits.ts`
- Modify: `apps/processor/src/calculation/tasks.ts`, `ICalculationRunner.ts`, `BaseRunner.ts`
- Modify: `apps/processor/src/services/CalculationService.ts`
- Test: `apps/processor/tests/unit/algorithms/sliderHits.test.ts`, `apps/processor/tests/unit/services/CalculationService.test.ts`, `apps/processor/tests/unit/calculation/tasks.test.ts`

**Interfaces:**

- Produces: `ScoreParameters` gains optional `sliderHeadHits`, `sliderTickHits`, `sliderRepeatHits`, `sliderEndHits`. The processor's `/performance` and `/performance/replay` accept them. The score service (Task 9) sends them.
- Produces (processor-internal): `interface SliderObjectCounts { sliders: number; ticks: number; repeats: number; sliderEnds: number }`, `convertSliderHits(counts, score): ScoreParameters`, `ICalculationRunner.countSliderObjects(input: { beatmapHash: string; osuFile: string }): Promise<SliderObjectCounts>`.

- [ ] **Step 1: Write the failing schema tests**

`ls packages/shared/tests` first; if a schema test file exists, add a `describe` block there, otherwise create `packages/shared/tests/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { performanceRequestSchema, scoreParametersSchema } from "../src";

const hits = {
    sliderHeadHits: 10,
    sliderTickHits: 20,
    sliderRepeatHits: 3,
    sliderEndHits: 9,
};

describe("scoreParametersSchema slider hits", () => {
    it("accepts all four hit counts", () => {
        expect(scoreParametersSchema.parse(hits)).toEqual(hits);
    });

    it("accepts none of them", () => {
        expect(scoreParametersSchema.parse({ nmiss: 1 })).toEqual({ nmiss: 1 });
    });

    it.each(Object.keys(hits))("rejects a set missing %s", (missing) => {
        const partial: Record<string, number> = { ...hits };
        delete partial[missing];

        const result = scoreParametersSchema.safeParse(partial);

        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            "sliderHeadHits, sliderTickHits, sliderRepeatHits, and sliderEndHits must be given together",
        );
    });

    it.each(["sliderTicksMissed", "sliderEndsDropped"])(
        "rejects hit counts combined with %s",
        (field) => {
            const result = scoreParametersSchema.safeParse({
                ...hits,
                [field]: 0,
            });

            expect(result.success).toBe(false);
            expect(result.error?.issues[0]?.message).toBe(
                "Slider hit counts cannot be combined with sliderTicksMissed or sliderEndsDropped",
            );
        },
    );

    it("rejects negative and fractional hit counts", () => {
        expect(
            scoreParametersSchema.safeParse({ ...hits, sliderTickHits: -1 })
                .success,
        ).toBe(false);
        expect(
            scoreParametersSchema.safeParse({ ...hits, sliderEndHits: 1.5 })
                .success,
        ).toBe(false);
    });

    it("still defaults score to {} in a performance request", () => {
        const parsed = performanceRequestSchema.parse({
            beatmap: { id: 1 },
        });

        expect(parsed.score).toEqual({});
    });
});
```

If `packages/shared` has no vitest config and no `tests` folder, also create `packages/shared/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: { include: ["tests/**/*.test.ts"], silent: "passed-only" },
});
```

and add `"tests"` to `packages/shared/tsconfig.json`'s `include` if it lists folders.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @dpp/shared test`
Expected: FAIL (unknown keys rejected by `strictObject`, messages differ).

- [ ] **Step 3: Add the fields and rules**

In `packages/shared/src/schemas.ts`, replace the `scoreParametersSchema` definition with:

```ts
const sliderHitFields = [
    "sliderHeadHits",
    "sliderTickHits",
    "sliderRepeatHits",
    "sliderEndHits",
] as const;

/**
 * Score values that alter a performance calculation. Every field is optional.
 *
 * Slider hit counts (`sliderHeadHits`, `sliderTickHits`, `sliderRepeatHits`, `sliderEndHits`) are what the game
 * records; the processor converts them to `sliderTicksMissed` and `sliderEndsDropped` with the beatmap's object
 * counts. They are given all together or not at all, and never with the miss counts they replace.
 */
export const scoreParametersSchema = z
    .strictObject({
        n300: hitCount.optional(),
        n100: hitCount.optional(),
        n50: hitCount.optional(),
        nmiss: hitCount.optional(),
        combo: hitCount.optional(),
        sliderTicksMissed: hitCount.optional(),
        sliderEndsDropped: hitCount.optional(),
        sliderHeadHits: hitCount.optional(),
        sliderTickHits: hitCount.optional(),
        sliderRepeatHits: hitCount.optional(),
        sliderEndHits: hitCount.optional(),
        totalScore: hitCount.optional(),
        // A divisor of the tap performance, so at least 1.
        tapPenalty: z.number().min(1).optional(),
        // A multiplier of the slider performance, so in (0, 1].
        sliderCheesePenalty: z.number().positive().max(1).optional(),
    })
    .superRefine((score, context) => {
        const given = sliderHitFields.filter(
            (field) => score[field] !== undefined,
        );

        if (given.length === 0) {
            return;
        }

        if (given.length !== sliderHitFields.length) {
            context.addIssue({
                code: "custom",
                message:
                    "sliderHeadHits, sliderTickHits, sliderRepeatHits, and sliderEndHits must be given together",
            });

            return;
        }

        if (
            score.sliderTicksMissed !== undefined ||
            score.sliderEndsDropped !== undefined
        ) {
            context.addIssue({
                code: "custom",
                message:
                    "Slider hit counts cannot be combined with sliderTicksMissed or sliderEndsDropped",
            });
        }
    });
```

- [ ] **Step 4: Run the schema tests**

Run: `pnpm --filter @dpp/shared test`
Expected: PASS.

- [ ] **Step 5: Write the failing conversion tests**

Create `apps/processor/tests/unit/algorithms/sliderHits.test.ts`:

```ts
import { AlgorithmInputError } from "@/algorithms/errors";
import { convertSliderHits } from "@/algorithms/sliderHits";
import { describe, expect, it } from "vitest";

const counts = { sliders: 10, ticks: 20, repeats: 4, sliderEnds: 10 };

describe("convertSliderHits", () => {
    it("returns the score unchanged without hit counts", () => {
        const score = { nmiss: 1, sliderTicksMissed: 2 };

        expect(convertSliderHits(counts, score)).toEqual(score);
    });

    it("converts hits to misses as pp-processor-node does", () => {
        expect(
            convertSliderHits(counts, {
                n300: 5,
                sliderHeadHits: 9,
                sliderTickHits: 17,
                sliderRepeatHits: 4,
                sliderEndHits: 8,
            }),
        ).toEqual({
            n300: 5,
            // (10 - 9) + (20 - 17) + (4 - 4)
            sliderTicksMissed: 4,
            sliderEndsDropped: 2,
        });
    });

    it("gives zero misses when every slider object was hit", () => {
        expect(
            convertSliderHits(counts, {
                sliderHeadHits: 10,
                sliderTickHits: 20,
                sliderRepeatHits: 4,
                sliderEndHits: 10,
            }),
        ).toEqual({ sliderTicksMissed: 0, sliderEndsDropped: 0 });
    });

    it.each([
        ["sliderHeadHits", 11, "sliders"],
        ["sliderTickHits", 21, "slider ticks"],
        ["sliderRepeatHits", 5, "slider repeats"],
        ["sliderEndHits", 11, "slider ends"],
    ] as const)(
        "rejects %s above the beatmap's total",
        (field, value, noun) => {
            const score = {
                sliderHeadHits: 10,
                sliderTickHits: 20,
                sliderRepeatHits: 4,
                sliderEndHits: 10,
                [field]: value,
            };

            expect(() => convertSliderHits(counts, score)).toThrow(
                new AlgorithmInputError(
                    "INVALID_REQUEST",
                    `${field} is ${value.toString()}, but the beatmap has ${(value - 1).toString()} ${noun}`,
                ),
            );
        },
    );
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm --filter @dpp/processor exec vitest run tests/unit/algorithms/sliderHits.test.ts`
Expected: FAIL ("Cannot find module '@/algorithms/sliderHits'").

- [ ] **Step 7: Implement the conversion**

Create `apps/processor/src/algorithms/sliderHits.ts`:

```ts
import type { ScoreParameters } from "@dpp/shared";
import { AlgorithmInputError } from "./errors";

/**
 * A beatmap's slider objects, as decoded in the processor's mode.
 */
export interface SliderObjectCounts {
    readonly sliders: number;
    readonly ticks: number;
    readonly repeats: number;
    readonly sliderEnds: number;
}

/**
 * Converts slider hit counts (what the game records) to the miss counts the performance calculators take, exactly as
 * `pp-processor-node` does. Scores without hit counts are returned unchanged.
 *
 * @throws {AlgorithmInputError} With code `INVALID_REQUEST` if a hit count exceeds the beatmap's total.
 */
export function convertSliderHits(
    counts: SliderObjectCounts,
    score: ScoreParameters,
): ScoreParameters {
    const {
        sliderHeadHits,
        sliderTickHits,
        sliderRepeatHits,
        sliderEndHits,
        ...rest
    } = score;

    if (
        sliderHeadHits === undefined ||
        sliderTickHits === undefined ||
        sliderRepeatHits === undefined ||
        sliderEndHits === undefined
    ) {
        return score;
    }

    check("sliderHeadHits", sliderHeadHits, counts.sliders, "sliders");
    check("sliderTickHits", sliderTickHits, counts.ticks, "slider ticks");
    check(
        "sliderRepeatHits",
        sliderRepeatHits,
        counts.repeats,
        "slider repeats",
    );
    check("sliderEndHits", sliderEndHits, counts.sliderEnds, "slider ends");

    return {
        ...rest,
        sliderTicksMissed:
            counts.sliders -
            sliderHeadHits +
            (counts.ticks - sliderTickHits) +
            (counts.repeats - sliderRepeatHits),
        sliderEndsDropped: counts.sliderEnds - sliderEndHits,
    };
}

function check(field: string, hits: number, total: number, noun: string) {
    if (hits > total) {
        throw new AlgorithmInputError(
            "INVALID_REQUEST",
            `${field} is ${hits.toString()}, but the beatmap has ${total.toString()} ${noun}`,
        );
    }
}

/**
 * Whether a score carries slider hit counts (the schema guarantees all four or none).
 */
export function hasSliderHits(score: ScoreParameters | undefined): boolean {
    return score?.sliderHeadHits !== undefined;
}
```

- [ ] **Step 8: Run the conversion tests**

Run: `pnpm --filter @dpp/processor exec vitest run tests/unit/algorithms/sliderHits.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing task-handler test**

Add to `apps/processor/tests/unit/calculation/tasks.test.ts` (read its existing helpers first and reuse its way of building a `CalculationTaskHandler` and reading fixtures):

```ts
it.each([Modes.Droid, Modes.Osu])(
    "counts slider objects like pp-processor-node in %s",
    async (mode) => {
        const osuFile = readBeatmapFixture("loveLetter");
        const handler = new CalculationTaskHandler(createAlgorithm(mode));

        // pp-processor-node's loop, run on the same decode the handler uses.
        const beatmap = new BeatmapDecoder().decode(osuFile, mode).result;
        let ticks = 0;
        let repeats = 0;

        for (const object of beatmap.hitObjects.objects) {
            if (object instanceof Slider) {
                for (const nested of object.nestedHitObjects) {
                    if (nested instanceof SliderTick) {
                        ++ticks;
                    } else if (nested instanceof SliderRepeat) {
                        ++repeats;
                    }
                }
            }
        }

        const outcome = await handler.handle({
            kind: "sliderObjectCounts",
            beatmapHash: "loveletter",
            osuFile,
        });

        expect(outcome).toEqual({
            ok: true,
            value: {
                sliders: beatmap.hitObjects.sliders,
                ticks,
                repeats,
                sliderEnds: beatmap.hitObjects.sliders,
            },
        });
        expect(ticks).toBeGreaterThan(0);
    },
);
```

Imports needed: `BeatmapDecoder, Modes, Slider, SliderRepeat, SliderTick` from `@rian8337/osu-base`, `createAlgorithm` from `@/algorithms/createAlgorithm`, `readBeatmapFixture` from `@test/utils/fixtures`.

- [ ] **Step 10: Run it to see it fail**

Run: `pnpm --filter @dpp/processor exec vitest run tests/unit/calculation/tasks.test.ts`
Expected: FAIL (type error / unknown task kind returns `undefined`).

- [ ] **Step 11: Add the task**

In `apps/processor/src/calculation/tasks.ts`, add to the `CalculationTask` union:

```ts
    | { kind: "sliderObjectCounts"; beatmapHash: string; osuFile: string }
```

and to `execute`'s switch:

```ts
            case "sliderObjectCounts": {
                const { hitObjects } = this.decode(
                    task.beatmapHash,
                    task.osuFile,
                );

                return {
                    sliders: hitObjects.sliders,
                    ticks: hitObjects.sliderTicks,
                    repeats: hitObjects.sliderRepeatPoints,
                    sliderEnds: hitObjects.sliderEnds,
                } satisfies SliderObjectCounts;
            }
```

(import `type SliderObjectCounts` from `@/algorithms/sliderHits`). `sliderTicks` and `sliderRepeatPoints` iterate the objects; the result is cached by the caller, not here.

In `ICalculationRunner.ts` add:

```ts
    /**
     * Counts the beatmap's sliders, slider ticks, slider repeats, and slider ends, as decoded in this mode.
     */
    countSliderObjects(input: {
        beatmapHash: string;
        osuFile: string;
    }): Promise<SliderObjectCounts>;
```

In `BaseRunner.ts` add:

```ts
    async countSliderObjects(
        input: Parameters<ICalculationRunner["countSliderObjects"]>[0],
    ) {
        return unwrapOutcome<SliderObjectCounts>(
            await this.dispatch({ kind: "sliderObjectCounts", ...input }),
        );
    }
```

Run `pnpm --filter @dpp/processor typecheck`; any test fake that implements `ICalculationRunner` by hand must gain `countSliderObjects` (return `Promise.reject(new Error("not used"))` unless the test needs it).

- [ ] **Step 12: Run the task test**

Run: `pnpm --filter @dpp/processor exec vitest run tests/unit/calculation/tasks.test.ts`
Expected: PASS.

- [ ] **Step 13: Write the failing service tests**

Add to `apps/processor/tests/unit/services/CalculationService.test.ts` (uses the file's `createService`, `loveLetter`):

```ts
describe("slider hit counts", () => {
    async function counts() {
        const runner = new InlineRunner(createAlgorithm(Modes.Droid));

        return runner.countSliderObjects({
            beatmapHash: loveLetterHash,
            osuFile: readBeatmapFixture("loveLetter"),
        });
    }

    it("converts hit counts and reports the converted misses", async () => {
        const total = await counts();
        const service = createService(Modes.Droid);

        const response = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {
                sliderHeadHits: total.sliders - 1,
                sliderTickHits: total.ticks - 2,
                sliderRepeatHits: total.repeats,
                sliderEndHits: total.sliderEnds - 1,
            },
            strainChart: false,
        });

        expect(response.score.sliderTicksMissed).toBe(3);
        expect(response.score.sliderEndsDropped).toBe(1);
    });

    it("gives the same result as the equivalent miss counts", async () => {
        const total = await counts();
        const service = createService(Modes.Droid);

        const fromHits = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: {
                sliderHeadHits: total.sliders,
                sliderTickHits: total.ticks - 1,
                sliderRepeatHits: total.repeats,
                sliderEndHits: total.sliderEnds,
            },
            strainChart: false,
        });
        const fromMisses = await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score: { sliderTicksMissed: 1, sliderEndsDropped: 0 },
            strainChart: false,
        });

        expect(fromHits.performance).toEqual(fromMisses.performance);
    });

    it("rejects hit counts above the beatmap's totals", async () => {
        const total = await counts();
        const service = createService(Modes.Droid);

        await expect(
            service.calculatePerformance({
                beatmap: loveLetter,
                mods: [],
                score: {
                    sliderHeadHits: total.sliders + 1,
                    sliderTickHits: 0,
                    sliderRepeatHits: 0,
                    sliderEndHits: 0,
                },
                strainChart: false,
            }),
        ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("counts each beatmap's slider objects once", async () => {
        let runner!: InlineRunner;
        const service = createService(Modes.Droid, (created) => {
            runner = created;
            vi.spyOn(created, "countSliderObjects");
        });
        const score = {
            sliderHeadHits: 0,
            sliderTickHits: 0,
            sliderRepeatHits: 0,
            sliderEndHits: 0,
        };

        await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score,
            strainChart: false,
        });
        await service.calculatePerformance({
            beatmap: loveLetter,
            mods: [],
            score,
            strainChart: false,
        });

        expect(runner.countSliderObjects).toHaveBeenCalledTimes(1);
    });
});
```

If the replay fixture helpers in this file already have a `describe` that runs replay calculations (skipped until the user adds fixtures), add one test there too, skipped the same way: a replay request with `score: { sliderHeadHits, ... }` set to the beatmap totals gives `score.sliderTicksMissed === 0` and `score.sliderEndsDropped === 0` (the analysis's own slider misses are replaced, not combined).

- [ ] **Step 14: Run them to see them fail**

Run: `pnpm --filter @dpp/processor exec vitest run tests/unit/services/CalculationService.test.ts`
Expected: FAIL (hit counts ignored: `sliderTicksMissed` undefined).

- [ ] **Step 15: Convert in CalculationService**

In `apps/processor/src/services/CalculationService.ts`:

1. Add a field and import `LruCache` from `@/utils/LruCache`, `convertSliderHits`, `hasSliderHits`, `type SliderObjectCounts` from `@/algorithms/sliderHits`, and `AlgorithmInputError` (already imported):

```ts
    /**
     * Slider object counts by beatmap hash. Counting needs the decoded beatmap, which a cached difficulty lookup
     * never decodes, so the counts are kept separately.
     */
    private readonly sliderCounts = new LruCache<string, SliderObjectCounts>(
        256,
    );
```

2. Add:

```ts
    /**
     * Replaces slider hit counts with the miss counts they imply.
     */
    private async applySliderHits(
        beatmap: ResolvedBeatmap,
        score: ScoreParameters,
    ): Promise<ScoreParameters> {
        if (!hasSliderHits(score)) {
            return score;
        }

        let counts = this.sliderCounts.get(beatmap.hash);

        if (!counts) {
            counts = await this.runner.countSliderObjects({
                beatmapHash: beatmap.hash,
                osuFile: await beatmap.getFile(),
            });
            this.sliderCounts.set(beatmap.hash, counts);
        }

        try {
            return convertSliderHits(counts, score);
        } catch (e) {
            if (e instanceof AlgorithmInputError) {
                throw e.toApiError();
            }

            throw e;
        }
    }
```

3. In `calculatePerformance`, pass `await this.applySliderHits(beatmap, request.score)` instead of `request.score`.

4. In `calculateReplayPerformance`, replace the score argument with:

```ts
            ...this.calculatePerformanceAttributes(
                difficulty,
                await this.applySliderHits(beatmap, {
                    ...analysis.score,
                    // Hit counts in the overrides replace the analysis's own slider misses.
                    ...(hasSliderHits(request.score) && {
                        sliderTicksMissed: undefined,
                        sliderEndsDropped: undefined,
                    }),
                    ...request.score,
                }),
            ),
```

`convertSliderHits` spreads `rest`, so the `undefined` miss fields are overwritten by the converted values.

Check `LruCache`'s constructor signature (`src/utils/LruCache.ts`) and match it.

- [ ] **Step 16: Run the processor tests**

Run: `pnpm --filter @dpp/processor test`
Expected: PASS (all, including the new tests).

- [ ] **Step 17: Document the fields**

In `apps/processor/README.md`, where the performance request's `score` fields are listed, add the four hit fields with one sentence: "Slider hit counts as the game records them; given all together, never with `sliderTicksMissed`/`sliderEndsDropped`; converted with the beatmap's slider, tick, repeat, and slider end counts. The response's `score` reports the converted misses."

- [ ] **Step 18: Check and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm --filter @dpp/shared test && pnpm --filter @dpp/processor test && git add packages/shared apps/processor && git commit -m "Accept slider hit counts in performance requests"
```

---

### Task 2: Score service contract in `@dpp/shared` and a bind address in `@dpp/server`

**Files:**

- Create: `packages/shared/src/scoreService.ts`
- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/index.ts`
- Modify: `packages/server/src/runtime/GracefulServer.ts`
- Test: `packages/shared/tests/scoreService.test.ts`, `packages/server/tests/...` (find the existing GracefulServer test with `grep -rl GracefulServer packages/server/tests`)

**Interfaces:**

- Produces (in `@dpp/shared`):
    - `variantNameSchema`, `md5HashSchema`
    - `onlineScoreQuerySchema` → `OnlineScoreQuery { uid: number; hash: string; variant: string; best: boolean; strainChart: boolean }`
    - `OnlineScoreResponse { score: { id; uid; hash; best }; source: "replay" | "score"; ppMultiplier: number; pp: number; calculation: Record<string, unknown> }`
    - `calculateScoreFieldsSchema` → `CalculateScoreFields { hash; mods: SerializedMod[]; combo; perfect; good; bad; miss; totalScore; sliderHits: { head; tick; repeat; end } | null; ppMultiplier: number; variant?: string }`
    - `calculateReplayFieldsSchema` → `{ variant?: string }`
    - `GamePPResponse { pp: number | null; pp_multiplier: number | null }`
    - `scoreServiceErrorCodes = ["SCORE_NOT_FOUND", "BROKER_UNAVAILABLE"]`, included in `errorCodes`.
- Produces (in `@dpp/server`): `GracefulServer.listen(app, port, host?)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/tests/scoreService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
    calculateReplayFieldsSchema,
    calculateScoreFieldsSchema,
    errorCodes,
    onlineScoreQuerySchema,
} from "../src";

const hash = "0123456789abcdef0123456789abcdef";

describe("onlineScoreQuerySchema", () => {
    it("parses a query with defaults", () => {
        expect(
            onlineScoreQuerySchema.parse({
                uid: "42",
                hash,
                variant: "live-droid",
            }),
        ).toEqual({
            uid: 42,
            hash,
            variant: "live-droid",
            best: false,
            strainChart: false,
        });
    });

    it("parses booleans", () => {
        const parsed = onlineScoreQuerySchema.parse({
            uid: "1",
            hash,
            variant: "a",
            best: "true",
            strainChart: "false",
        });

        expect(parsed.best).toBe(true);
        expect(parsed.strainChart).toBe(false);
    });

    it.each([
        [{ uid: "0" }],
        [{ uid: "1.5" }],
        [{ uid: "abc" }],
        [{ hash: hash.toUpperCase() }],
        [{ hash: "abc" }],
        [{ variant: "Live" }],
        [{ variant: "-live" }],
        [{ best: "yes" }],
        [{ strainChart: "1" }],
    ])("rejects %j", (override) => {
        expect(
            onlineScoreQuerySchema.safeParse({
                uid: "1",
                hash,
                variant: "live",
                ...override,
            }).success,
        ).toBe(false);
    });
});

describe("calculateScoreFieldsSchema", () => {
    const fields = {
        hash: hash.toUpperCase(),
        mods: JSON.stringify([new ModHidden().serialize()]),
        combo: "100",
        perfect: "90",
        good: "5",
        bad: "1",
        miss: "2",
        total_score: "1000000",
    };

    it("parses form fields (strings) with defaults", () => {
        expect(calculateScoreFieldsSchema.parse(fields)).toEqual({
            hash,
            mods: [new ModHidden().serialize()],
            combo: 100,
            perfect: 90,
            good: 5,
            bad: 1,
            miss: 2,
            totalScore: 1000000,
            sliderHits: null,
            ppMultiplier: 1,
        });
    });

    it("parses JSON numbers, slider hits, a multiplier, and a variant", () => {
        expect(
            calculateScoreFieldsSchema.parse({
                ...fields,
                combo: 100,
                slider_head_hit: "10",
                slider_tick_hit: 20,
                slider_repeat_hit: "0",
                slider_end_hit: "9",
                pp_multiplier: "0.5",
                variant: "droid-test",
            }),
        ).toMatchObject({
            combo: 100,
            sliderHits: { head: 10, tick: 20, repeat: 0, end: 9 },
            ppMultiplier: 0.5,
            variant: "droid-test",
        });
    });

    it.each([
        ["a missing hash", { hash: undefined }],
        ["a short hash", { hash: "abc" }],
        ["mods that are not JSON", { mods: "HD" }],
        [
            "mods of the wrong shape",
            { mods: JSON.stringify(new ModHidden().serialize()) },
        ],
        ["a negative count", { miss: "-1" }],
        ["a fractional count", { combo: "1.5" }],
        ["an empty count", { good: "" }],
        ["a partial slider hit set", { slider_head_hit: "1" }],
        ["a zero multiplier", { pp_multiplier: "0" }],
        ["a multiplier above 1", { pp_multiplier: "1.01" }],
        ["a non-numeric multiplier", { pp_multiplier: "x" }],
        ["an invalid variant", { variant: "Bad Name" }],
    ])("rejects %s", (_name, override) => {
        expect(
            calculateScoreFieldsSchema.safeParse({ ...fields, ...override })
                .success,
        ).toBe(false);
    });
});

describe("calculateReplayFieldsSchema", () => {
    it("accepts no fields or a variant", () => {
        expect(calculateReplayFieldsSchema.parse({})).toEqual({});
        expect(calculateReplayFieldsSchema.parse({ variant: "x" })).toEqual({
            variant: "x",
        });
    });
});

describe("errorCodes", () => {
    it("includes the score service's codes", () => {
        expect(errorCodes).toContain("SCORE_NOT_FOUND");
        expect(errorCodes).toContain("BROKER_UNAVAILABLE");
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @dpp/shared test`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement the schemas and codes**

Create `packages/shared/src/scoreService.ts`:

```ts
import type { SerializedMod } from "@rian8337/osu-base";
import { z } from "zod";
import { modsSchema } from "./schemas";

/**
 * A variant name or alias, as the broker accepts it.
 */
export const variantNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/**
 * A beatmap MD5 hash in lowercase hex.
 */
export const md5HashSchema = z.string().regex(/^[0-9a-f]{32}$/);

const booleanString = z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true");

/**
 * The query of `GET /online-scores`.
 */
export const onlineScoreQuerySchema = z.strictObject({
    uid: z.string().regex(/^\d+$/).transform(Number).pipe(z.int().positive()),
    hash: md5HashSchema,
    variant: variantNameSchema,
    best: booleanString,
    strainChart: booleanString,
});

export type OnlineScoreQuery = z.infer<typeof onlineScoreQuerySchema>;

/**
 * The response of `GET /online-scores`. `calculation` is the processor's response unchanged.
 */
export interface OnlineScoreResponse {
    readonly score: {
        readonly id: number;
        readonly uid: number;
        readonly hash: string;
        readonly best: boolean;
    };
    readonly source: "replay" | "score";
    readonly ppMultiplier: number;
    readonly pp: number;
    readonly calculation: Record<string, unknown>;
}

/**
 * A non-negative integer sent as a form field (string) or JSON number.
 */
const formCount = z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(z.int().nonnegative());

const formNumber = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^\d+(\.\d+)?$/)
            .transform(Number),
    ])
    .pipe(z.number());

const modsJson = z.string().transform((value, context) => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        context.addIssue({ code: "custom", message: "mods is not JSON" });

        return z.NEVER;
    }
});

/**
 * The fields of the game's `POST /calculate-score`, in `pp-processor-node`'s names. Field values arrive as strings
 * (multipart or URL-encoded) or JSON values.
 */
export const calculateScoreFieldsSchema = z
    .object({
        hash: z
            .string()
            .regex(/^[0-9a-fA-F]{32}$/)
            .transform((value) => value.toLowerCase()),
        mods: modsJson.pipe(modsSchema),
        combo: formCount,
        perfect: formCount,
        good: formCount,
        bad: formCount,
        miss: formCount,
        total_score: formCount,
        slider_head_hit: formCount.optional(),
        slider_tick_hit: formCount.optional(),
        slider_repeat_hit: formCount.optional(),
        slider_end_hit: formCount.optional(),
        pp_multiplier: formNumber.pipe(z.number().positive().max(1)).default(1),
        variant: variantNameSchema.optional(),
    })
    .superRefine((fields, context) => {
        const given = [
            fields.slider_head_hit,
            fields.slider_tick_hit,
            fields.slider_repeat_hit,
            fields.slider_end_hit,
        ].filter((value) => value !== undefined).length;

        if (given !== 0 && given !== 4) {
            context.addIssue({
                code: "custom",
                message:
                    "slider_head_hit, slider_tick_hit, slider_repeat_hit, and slider_end_hit must be given together",
            });
        }
    })
    .transform((fields): CalculateScoreFields => ({
        hash: fields.hash,
        mods: fields.mods,
        combo: fields.combo,
        perfect: fields.perfect,
        good: fields.good,
        bad: fields.bad,
        miss: fields.miss,
        totalScore: fields.total_score,
        sliderHits:
            fields.slider_head_hit !== undefined &&
            fields.slider_tick_hit !== undefined &&
            fields.slider_repeat_hit !== undefined &&
            fields.slider_end_hit !== undefined
                ? {
                      head: fields.slider_head_hit,
                      tick: fields.slider_tick_hit,
                      repeat: fields.slider_repeat_hit,
                      end: fields.slider_end_hit,
                  }
                : null,
        ppMultiplier: fields.pp_multiplier,
        ...(fields.variant !== undefined && { variant: fields.variant }),
    }));

export interface CalculateScoreFields {
    readonly hash: string;
    readonly mods: SerializedMod[];
    readonly combo: number;
    readonly perfect: number;
    readonly good: number;
    readonly bad: number;
    readonly miss: number;
    readonly totalScore: number;
    readonly sliderHits: {
        readonly head: number;
        readonly tick: number;
        readonly repeat: number;
        readonly end: number;
    } | null;
    readonly ppMultiplier: number;
    readonly variant?: string;
}

/**
 * The text fields of the game's `POST /calculate-replay` (the replay itself is the `replayfile` file field).
 */
export const calculateReplayFieldsSchema = z.object({
    variant: variantNameSchema.optional(),
});

/**
 * The response of both game routes, as `pp-processor-node` answers. Both values are `null` on any failure.
 */
export interface GamePPResponse {
    readonly pp: number | null;
    readonly pp_multiplier: number | null;
}
```

Note: `z.object` (not strict) for the game fields: the game may send fields this service does not read; extra fields are ignored as `pp-processor-node` ignores them.

In `packages/shared/src/errors.ts`, add after `brokerErrorCodes`:

```ts
/**
 * Machine-readable error codes that only the score service returns.
 */
export const scoreServiceErrorCodes = [
    "SCORE_NOT_FOUND",
    "BROKER_UNAVAILABLE",
] as const;
```

include `...scoreServiceErrorCodes` in `errorCodes`, and add `export type ScoreServiceErrorCode = (typeof scoreServiceErrorCodes)[number];`. In `index.ts` add `export * from "./scoreService";`.

- [ ] **Step 4: Run the shared tests**

Run: `pnpm --filter @dpp/shared test`
Expected: PASS.

- [ ] **Step 5: Write the failing GracefulServer test**

Find the existing test: `grep -rl GracefulServer packages/server/tests`. Add:

```ts
it("binds to the given host", async () => {
    await using server = new GracefulServer();
    const app = express().get("/", (_req, res) => {
        res.send("ok");
    });

    const port = await server.listen(app, 0, "127.0.0.1");
    const response = await fetch(`http://127.0.0.1:${port.toString()}/`);

    expect(await response.text()).toBe("ok");
    // @ts-expect-error: reading the private server to check its address.
    expect(server.server.address().address).toBe("127.0.0.1");
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `pnpm --filter @dpp/server test`
Expected: FAIL (listens on `::`).

- [ ] **Step 7: Add the host parameter**

In `GracefulServer.listen`:

```ts
    /**
     * Starts listening. Without `host`, Node's default applies (every interface).
     *
     * @returns The port actually bound, useful when `port` is 0.
     */
    listen(app: Express, port: number, host?: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const onListening = (error?: Error) => {
                const address = server.address();

                if (error || !address || typeof address === "string") {
                    reject(error ?? new Error("Server has no TCP address"));
                } else {
                    resolve(address.port);
                }
            };
            const server =
                host === undefined
                    ? app.listen(port, onListening)
                    : app.listen(port, host, onListening);

            this.server = server;
        });
    }
```

Keep the existing doc comment's wording for the parts that still apply.

- [ ] **Step 8: Run tests and commit**

```bash
pnpm --filter @dpp/server test && pnpm typecheck && pnpm lint && pnpm format && git add packages && git commit -m "Add the score service contract and a bind address option"
```

---

### Task 3: Score service scaffold and configuration

**Files:**

- Create: `apps/score-service/package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.typecheck.json`, `tsdown.config.ts`, `vitest.config.mts`, `vitest.e2e.config.mts`, `drizzle.config.ts`, `.env.example`
- Create: `src/polyfills.ts`, `src/types/env.ts`, `src/types/errors.ts`, `src/types/upstream.ts`, `src/config/config.ts`, `src/dependencies/tokens.ts`
- Create: `tests/setup.ts`, `tests/utils/config.ts`
- Test: `tests/unit/config/config.test.ts`, `tests/unit/types/upstream.test.ts`

**Interfaces:**

- Produces:
    - `Config`, `CliConfig`, `OfficialDatabaseSettings`, `ReplayDirectories`, `loadConfig(env)`, `loadCliConfig(env)`, `ConfigError` (shapes below).
    - `UpstreamFailure`, `UpstreamResult<T>`, `RetryLaterError`, `requireValue(result)`, `retryAfterMs(response)`.
    - `ScoreNotFoundError` (404 `SCORE_NOT_FOUND`), `UpstreamError` (status and code passed through).
    - `dependencyTokens` (grows in later tasks), `testConfig`.

- [ ] **Step 1: Create the package files**

`apps/score-service/package.json`:

```json
{
    "name": "@dpp/score-service",
    "private": true,
    "version": "1.0.0",
    "description": "Owns osu!droid scores: replay listener, online-score lookup, game pp endpoints, and recalculations",
    "main": "dist/index.mjs",
    "type": "module",
    "scripts": {
        "build": "tsdown",
        "dev": "tsdown --watch --on-success \"node dist/index.mjs\"",
        "typecheck": "tsc -p tsconfig.typecheck.json",
        "test": "vitest run",
        "test:coverage": "vitest run --coverage",
        "test:e2e": "vitest run -c vitest.e2e.config.mts",
        "db:generate": "drizzle-kit generate",
        "cli": "node dist/cli.mjs"
    },
    "author": "Rian8337",
    "license": "MIT"
}
```

Then add dependencies (run from the repo root):

```bash
pnpm --filter @dpp/score-service add @dpp/server@workspace:* @dpp/shared@workspace:* @rian8337/osu-base@4.0.0-beta.100 @rian8337/osu-droid-replay-analyzer@4.0.0-beta.100 chokidar drizzle-orm express mongodb multer mysql2 pg reflect-metadata tsyringe zod
pnpm --filter @dpp/score-service add -D @electric-sql/pglite @electric-sql/pglite-socket @types/express @types/multer @types/pg @types/supertest @vitest/coverage-v8 drizzle-kit supertest tsdown vitest
```

Then edit `package.json` so the shared versions match the broker's (`drizzle-orm ^0.45.3`, `express ^5.2.1`, `pg ^8.23.1`, `zod ^4.6.5`, `tsyringe ^4.10.0`, `reflect-metadata ^0.2.2`, and the same dev tool versions as `apps/broker/package.json`), pin both `@rian8337` packages exactly (no `^`), and run `pnpm install`.

`tsconfig.json`, `tsconfig.build.json`, `tsconfig.typecheck.json`, `vitest.config.mts`, `vitest.e2e.config.mts`, `drizzle.config.ts`: copy from `apps/broker` unchanged.

`tsdown.config.ts`: copy the broker's, then change the external list:

```ts
/**
 * Packages left out of the bundle: optional native or cloud add-ons that `pg` and `mongodb` require only when
 * configured to, and that are not installed.
 */
const externalPackages = [
    "pg-native",
    "kerberos",
    "snappy",
    "socks",
    "aws4",
    "gcp-metadata",
    "mongodb-client-encryption",
    "@mongodb-js/zstd",
    "@aws-sdk/credential-providers",
];
```

`src/polyfills.ts`: copy from `apps/broker/src/polyfills.ts`.

`tests/setup.ts`:

```ts
// tsyringe needs the Reflect metadata polyfill before any decorated class is loaded.
import "reflect-metadata";
```

- [ ] **Step 2: Write the failing config tests**

Create `apps/score-service/tests/unit/config/config.test.ts`:

```ts
import { ConfigError, loadCliConfig, loadConfig } from "@/config/config";
import { describe, expect, it } from "vitest";

const cliEnvironment = {
    DATABASE_HOST: "localhost",
    DATABASE_NAME: "score_service",
    DATABASE_USER: "postgres",
    OFFICIAL_DB_HOST: "localhost",
    OFFICIAL_DB_NAME: "osudroid",
    OFFICIAL_DB_USER: "root",
    BROKER_URL: "http://127.0.0.1:4000/",
    BROKER_API_KEY: "broker-key-0123456789",
    BEATMAP_SERVICE_URL: "http://127.0.0.1:5000",
    BEATMAP_SERVICE_KEY: "beatmap-key",
    BEATMAP_SERVICE_BULK_KEY: "beatmap-bulk-key",
    LIVE_DROID_VARIANT: "live-droid",
    LIVE_OSU_VARIANT: "live-osu",
    UNPROCESSED_REPLAY_DIR: "/replays/unprocessed",
    ONLINE_REPLAY_DIR: "/replays/online",
    BEST_REPLAY_DIR: "/replays/best",
    UNCALCULATED_REPLAY_DIR: "/replays/uncalculated",
};

const serverEnvironment = {
    ...cliEnvironment,
    PORT: "3100",
    API_KEY: "score-service-key-0123",
    ALICE_DB_URI: "mongodb://localhost/alice",
    ELAINA_DB_URI: "mongodb://localhost/elaina",
    DISCORD_METADATA_URL: "http://127.0.0.1:3200/api/discord/update-metadata",
    DISCORD_METADATA_KEY: "discord-key",
};

describe("loadConfig", () => {
    it("reads every variable with defaults", () => {
        expect(loadConfig(serverEnvironment)).toEqual({
            port: 3100,
            host: "127.0.0.1",
            apiKey: "score-service-key-0123",
            database: {
                host: "localhost",
                port: 5432,
                name: "score_service",
                user: "postgres",
                password: "",
            },
            official: {
                host: "localhost",
                port: 3306,
                name: "osudroid",
                user: "root",
                password: "",
                tablePrefix: "bbl_",
            },
            mongo: {
                aliceUri: "mongodb://localhost/alice",
                elainaUri: "mongodb://localhost/elaina",
            },
            broker: {
                url: "http://127.0.0.1:4000",
                apiKey: "broker-key-0123456789",
            },
            beatmapService: {
                url: "http://127.0.0.1:5000",
                key: "beatmap-key",
                bulkKey: "beatmap-bulk-key",
            },
            variants: { liveDroid: "live-droid", liveOsu: "live-osu" },
            replayDirectories: {
                unprocessed: "/replays/unprocessed",
                online: "/replays/online",
                best: "/replays/best",
                uncalculated: "/replays/uncalculated",
            },
            discordMetadata: {
                url: "http://127.0.0.1:3200/api/discord/update-metadata",
                key: "discord-key",
            },
            replayConcurrency: 2,
            uncalculatedConcurrency: 1,
            uncalculatedIntervalMinutes: 10,
            danCourseRefreshMinutes: 60,
        });
    });

    it("names invalid variables without their values", () => {
        let error: unknown;

        try {
            loadConfig({
                ...serverEnvironment,
                API_KEY: "short-secret",
                PORT: "0",
                LIVE_DROID_VARIANT: "Live Droid",
                REPLAY_CONCURRENCY: "0",
            });
        } catch (e) {
            error = e;
        }

        expect(error).toBeInstanceOf(ConfigError);
        const message = (error as ConfigError).message;

        expect(message).toContain("API_KEY");
        expect(message).toContain("PORT");
        expect(message).toContain("LIVE_DROID_VARIANT");
        expect(message).toContain("REPLAY_CONCURRENCY");
        expect(message).not.toContain("short-secret");
    });

    it("treats empty variables as unset", () => {
        expect(() => loadConfig({ ...serverEnvironment, PORT: "" })).toThrow(
            ConfigError,
        );
        expect(loadConfig({ ...serverEnvironment, HOST: "" }).host).toBe(
            "127.0.0.1",
        );
    });

    it("rejects relative replay folders", () => {
        expect(() =>
            loadConfig({ ...serverEnvironment, BEST_REPLAY_DIR: "replays" }),
        ).toThrow(ConfigError);
    });
});

describe("loadCliConfig", () => {
    it("needs only the CLI variables", () => {
        const config = loadCliConfig(cliEnvironment);

        expect(config.official.tablePrefix).toBe("bbl_");
        expect(config).not.toHaveProperty("mongo");
    });

    it("reads a custom table prefix", () => {
        expect(
            loadCliConfig({ ...cliEnvironment, OFFICIAL_DB_PREFIX: "test_" })
                .official.tablePrefix,
        ).toBe("test_");
    });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm --filter @dpp/score-service test`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the configuration**

`src/types/env.ts`:

```ts
/**
 * Environment variable keys used by the score service.
 */
export enum EnvironmentVariableKey {
    Port = "PORT",
    Host = "HOST",
    ApiKey = "API_KEY",
    DatabaseHost = "DATABASE_HOST",
    DatabasePort = "DATABASE_PORT",
    DatabaseName = "DATABASE_NAME",
    DatabaseUser = "DATABASE_USER",
    DatabasePassword = "DATABASE_PASSWORD",
    OfficialDbHost = "OFFICIAL_DB_HOST",
    OfficialDbPort = "OFFICIAL_DB_PORT",
    OfficialDbName = "OFFICIAL_DB_NAME",
    OfficialDbUser = "OFFICIAL_DB_USER",
    OfficialDbPassword = "OFFICIAL_DB_PASSWORD",
    OfficialDbPrefix = "OFFICIAL_DB_PREFIX",
    AliceDbUri = "ALICE_DB_URI",
    ElainaDbUri = "ELAINA_DB_URI",
    BrokerUrl = "BROKER_URL",
    BrokerApiKey = "BROKER_API_KEY",
    BeatmapServiceUrl = "BEATMAP_SERVICE_URL",
    BeatmapServiceKey = "BEATMAP_SERVICE_KEY",
    BeatmapServiceBulkKey = "BEATMAP_SERVICE_BULK_KEY",
    LiveDroidVariant = "LIVE_DROID_VARIANT",
    LiveOsuVariant = "LIVE_OSU_VARIANT",
    UnprocessedReplayDir = "UNPROCESSED_REPLAY_DIR",
    OnlineReplayDir = "ONLINE_REPLAY_DIR",
    BestReplayDir = "BEST_REPLAY_DIR",
    UncalculatedReplayDir = "UNCALCULATED_REPLAY_DIR",
    DiscordMetadataUrl = "DISCORD_METADATA_URL",
    DiscordMetadataKey = "DISCORD_METADATA_KEY",
    ReplayConcurrency = "REPLAY_CONCURRENCY",
    UncalculatedConcurrency = "UNCALCULATED_CONCURRENCY",
    UncalculatedIntervalMinutes = "UNCALCULATED_INTERVAL_MINUTES",
    DanCourseRefreshMinutes = "DAN_COURSE_REFRESH_MINUTES",
}
```

`OFFICIAL_DB_PREFIX` (default `bbl_`) is not in the spec's table; it replaces the old code's `OFFICIAL_DB_PREFIX` variable and keeps table names configurable, which the tests also need.

`src/config/config.ts`:

```ts
import { EnvironmentVariableKey as Key } from "@/types/env";
import type { DatabaseSettings } from "@dpp/server";
import { variantNameSchema } from "@dpp/shared";
import { isAbsolute } from "node:path";
import { z } from "zod";

export interface OfficialDatabaseSettings extends DatabaseSettings {
    /**
     * Prepended to every official table name (`bbl_` gives `bbl_score`).
     */
    readonly tablePrefix: string;
}

export interface ReplayDirectories {
    /**
     * New replays from the game, watched by the replay listener.
     */
    readonly unprocessed: string;

    /**
     * Replays of `scores` rows, named `<score id>.odr`.
     */
    readonly online: string;

    /**
     * Replays of best pp scores, named `<score id>.odr`.
     */
    readonly best: string;

    /**
     * Replays of scores the game could not calculate.
     */
    readonly uncalculated: string;
}

/**
 * What both the CLI and the server need.
 */
export interface CliConfig {
    readonly database: DatabaseSettings;
    readonly official: OfficialDatabaseSettings;
    readonly broker: { readonly url: string; readonly apiKey: string };
    readonly beatmapService: {
        readonly url: string;
        /**
         * The priority lane, for interactive work.
         */
        readonly key: string;
        /**
         * The bulk lane, for recalculation.
         */
        readonly bulkKey: string;
    };
    readonly variants: { readonly liveDroid: string; readonly liveOsu: string };
    readonly replayDirectories: ReplayDirectories;
}

/**
 * The server's settings.
 */
export interface Config extends CliConfig {
    readonly port: number;
    readonly host: string;

    /**
     * Required in `X-Api-Key` by `GET /online-scores`.
     */
    readonly apiKey: string;
    readonly mongo: { readonly aliceUri: string; readonly elainaUri: string };
    readonly discordMetadata: { readonly url: string; readonly key: string };
    readonly replayConcurrency: number;
    readonly uncalculatedConcurrency: number;
    readonly uncalculatedIntervalMinutes: number;
    readonly danCourseRefreshMinutes: number;
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
const positive = z.coerce.number().int().min(1);
const text = z.string().min(1);
const url = z.url().transform((value) => value.replace(/\/+$/, ""));
const directory = text.refine(isAbsolute, "must be an absolute path");

const cliShape = {
    [Key.DatabaseHost]: text,
    [Key.DatabasePort]: port.default(5432),
    [Key.DatabaseName]: text,
    [Key.DatabaseUser]: text,
    [Key.DatabasePassword]: z.string().default(""),
    [Key.OfficialDbHost]: text,
    [Key.OfficialDbPort]: port.default(3306),
    [Key.OfficialDbName]: text,
    [Key.OfficialDbUser]: text,
    [Key.OfficialDbPassword]: z.string().default(""),
    [Key.OfficialDbPrefix]: z
        .string()
        .regex(/^[A-Za-z0-9_]*$/)
        .default("bbl_"),
    [Key.BrokerUrl]: url,
    [Key.BrokerApiKey]: text,
    [Key.BeatmapServiceUrl]: url,
    [Key.BeatmapServiceKey]: text,
    [Key.BeatmapServiceBulkKey]: text,
    [Key.LiveDroidVariant]: variantNameSchema,
    [Key.LiveOsuVariant]: variantNameSchema,
    [Key.UnprocessedReplayDir]: directory,
    [Key.OnlineReplayDir]: directory,
    [Key.BestReplayDir]: directory,
    [Key.UncalculatedReplayDir]: directory,
};

const cliSchema = z.object(cliShape);

const serverSchema = z.object({
    ...cliShape,
    [Key.Port]: port,
    [Key.Host]: text.default("127.0.0.1"),
    [Key.ApiKey]: z.string().min(16, "must be at least 16 characters"),
    [Key.AliceDbUri]: text,
    [Key.ElainaDbUri]: text,
    [Key.DiscordMetadataUrl]: z.url(),
    [Key.DiscordMetadataKey]: text,
    [Key.ReplayConcurrency]: positive.default(2),
    [Key.UncalculatedConcurrency]: positive.default(1),
    [Key.UncalculatedIntervalMinutes]: positive.default(10),
    [Key.DanCourseRefreshMinutes]: positive.default(60),
});

function parse<T extends z.ZodType>(
    target: T,
    env: NodeJS.ProcessEnv,
): z.infer<T> {
    // An empty variable (`PORT=`) counts as unset, instead of being coerced to 0.
    const present = Object.fromEntries(
        Object.entries(env).filter(([, value]) => value !== ""),
    );
    const result = target.safeParse(present);

    if (!result.success) {
        const problems = result.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
        );

        throw new ConfigError(
            `Invalid configuration:\n  ${problems.join("\n  ")}`,
        );
    }

    return result.data;
}

function toCliConfig(values: z.infer<typeof cliSchema>): CliConfig {
    return {
        database: {
            host: values[Key.DatabaseHost],
            port: values[Key.DatabasePort],
            name: values[Key.DatabaseName],
            user: values[Key.DatabaseUser],
            password: values[Key.DatabasePassword],
        },
        official: {
            host: values[Key.OfficialDbHost],
            port: values[Key.OfficialDbPort],
            name: values[Key.OfficialDbName],
            user: values[Key.OfficialDbUser],
            password: values[Key.OfficialDbPassword],
            tablePrefix: values[Key.OfficialDbPrefix],
        },
        broker: {
            url: values[Key.BrokerUrl],
            apiKey: values[Key.BrokerApiKey],
        },
        beatmapService: {
            url: values[Key.BeatmapServiceUrl],
            key: values[Key.BeatmapServiceKey],
            bulkKey: values[Key.BeatmapServiceBulkKey],
        },
        variants: {
            liveDroid: values[Key.LiveDroidVariant],
            liveOsu: values[Key.LiveOsuVariant],
        },
        replayDirectories: {
            unprocessed: values[Key.UnprocessedReplayDir],
            online: values[Key.OnlineReplayDir],
            best: values[Key.BestReplayDir],
            uncalculated: values[Key.UncalculatedReplayDir],
        },
    };
}

/**
 * Reads and validates the server's configuration.
 *
 * @throws {ConfigError} If any variable is missing or invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
    const values = parse(serverSchema, env);

    return {
        ...toCliConfig(values),
        port: values[Key.Port],
        host: values[Key.Host],
        apiKey: values[Key.ApiKey],
        mongo: {
            aliceUri: values[Key.AliceDbUri],
            elainaUri: values[Key.ElainaDbUri],
        },
        discordMetadata: {
            url: values[Key.DiscordMetadataUrl],
            key: values[Key.DiscordMetadataKey],
        },
        replayConcurrency: values[Key.ReplayConcurrency],
        uncalculatedConcurrency: values[Key.UncalculatedConcurrency],
        uncalculatedIntervalMinutes: values[Key.UncalculatedIntervalMinutes],
        danCourseRefreshMinutes: values[Key.DanCourseRefreshMinutes],
    };
}

/**
 * Reads only what the CLI needs.
 *
 * @throws {ConfigError} If any of those variables is missing or invalid.
 */
export function loadCliConfig(env: NodeJS.ProcessEnv): CliConfig {
    return toCliConfig(parse(cliSchema, env));
}
```

Check `DatabaseSettings` in `packages/server/src/database/DatabaseConnection.ts` and match its field names.

- [ ] **Step 5: Run the config tests**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/unit/config`
Expected: PASS.

- [ ] **Step 6: Write the failing upstream-result tests**

Create `tests/unit/types/upstream.test.ts`:

```ts
import { RetryLaterError, UpstreamError } from "@/types/errors";
import {
    failureFromResponse,
    requireValue,
    unreachable,
} from "@/types/upstream";
import { describe, expect, it } from "vitest";

function response(status: number, headers: Record<string, string> = {}) {
    return new Response(null, { status, headers });
}

describe("failureFromResponse", () => {
    it.each([502, 503, 504, 429])("treats %i as retry later", (status) => {
        expect(failureFromResponse(response(status), "X", "m").kind).toBe(
            "retry",
        );
    });

    it.each([400, 401, 403, 404, 422, 500])(
        "treats %i as rejected",
        (status) => {
            expect(failureFromResponse(response(status), "X", "m").kind).toBe(
                "rejected",
            );
        },
    );

    it("reads Retry-After in seconds", () => {
        expect(
            failureFromResponse(
                response(503, { "Retry-After": "7" }),
                "X",
                "m",
            ),
        ).toEqual({
            ok: false,
            kind: "retry",
            status: 503,
            code: "X",
            message: "m",
            retryAfterMs: 7000,
        });
    });

    it("ignores an unreadable Retry-After", () => {
        expect(
            failureFromResponse(
                response(503, { "Retry-After": "soon" }),
                "X",
                "m",
            ),
        ).not.toHaveProperty("retryAfterMs");
    });
});

describe("requireValue", () => {
    it("returns the value", () => {
        expect(requireValue({ ok: true, value: 3 })).toBe(3);
    });

    it("returns null for a permanent failure", () => {
        expect(
            requireValue({
                ok: false,
                kind: "rejected",
                status: 404,
                code: "BEATMAP_NOT_FOUND",
                message: "m",
            }),
        ).toBeNull();
    });

    it("throws RetryLaterError for retry later", () => {
        expect(() =>
            requireValue(unreachable("BROKER_UNAVAILABLE", "down")),
        ).toThrow(RetryLaterError);
    });
});

describe("UpstreamError", () => {
    it("passes status and code through", () => {
        const error = UpstreamError.from({
            ok: false,
            kind: "rejected",
            status: 404,
            code: "VARIANT_NOT_FOUND",
            message: "No variant",
        });

        expect(error.statusCode).toBe(404);
        expect(error.toResponse()).toEqual({
            error: { code: "VARIANT_NOT_FOUND", message: "No variant" },
        });
    });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/unit/types`
Expected: FAIL (module not found).

- [ ] **Step 8: Implement the result types and errors**

`src/types/upstream.ts`:

```ts
import type { ErrorCode } from "@dpp/shared";
import { RetryLaterError } from "./errors";

/**
 * Why a call to the broker, the beatmap service, or the Discord backend failed.
 *
 * - `rejected`: a definite answer (4xx, 500, or a malformed body). Retrying gets the same answer.
 * - `retry`: the upstream is busy or unreachable (`502`, `503`, `504`, `429`, connection failure, timeout).
 */
export interface UpstreamFailure {
    readonly ok: false;
    readonly kind: "rejected" | "retry";
    readonly status: number;
    readonly code: ErrorCode;
    readonly message: string;

    /**
     * From the response's `Retry-After`, when it has one.
     */
    readonly retryAfterMs?: number;
}

export type UpstreamResult<T> =
    { readonly ok: true; readonly value: T } | UpstreamFailure;

const retryStatuses = new Set([429, 502, 503, 504]);

/**
 * Classifies a non-2xx response.
 */
export function failureFromResponse(
    response: Response,
    code: ErrorCode,
    message: string,
): UpstreamFailure {
    const retry = retryStatuses.has(response.status);
    const retryAfter = Number(response.headers.get("retry-after"));

    return {
        ok: false,
        kind: retry ? "retry" : "rejected",
        status: response.status,
        code,
        message,
        ...(retry &&
            Number.isFinite(retryAfter) &&
            retryAfter >= 0 &&
            response.headers.has("retry-after") && {
                retryAfterMs: retryAfter * 1000,
            }),
    };
}

/**
 * The failure for an upstream that could not be reached or did not answer in time.
 */
export function unreachable(code: ErrorCode, message: string): UpstreamFailure {
    return { ok: false, kind: "retry", status: 503, code, message };
}

/**
 * The failure for a 2xx response whose body is not what was expected.
 */
export function malformed(code: ErrorCode, message: string): UpstreamFailure {
    return { ok: false, kind: "rejected", status: 502, code, message };
}

/**
 * For background work: the value, `null` for a permanent failure, or a thrown {@link RetryLaterError}.
 */
export function requireValue<T>(result: UpstreamResult<T>): T | null {
    if (result.ok) {
        return result.value;
    }

    if (result.kind === "retry") {
        throw new RetryLaterError(result.message, result.retryAfterMs);
    }

    return null;
}
```

`src/types/errors.ts`:

```ts
import { APIError } from "@dpp/server/errors";
import type { UpstreamFailure } from "./upstream";

/**
 * Background work hit a temporary failure; the item must be kept and tried again.
 */
export class RetryLaterError extends Error {
    constructor(
        message: string,
        readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = "RetryLaterError";
    }
}

export class ScoreNotFoundError extends APIError {
    constructor() {
        super(404, "SCORE_NOT_FOUND", "Score not found");
    }
}

/**
 * A broker or beatmap service failure passed through to the caller with its status and code.
 */
export class UpstreamError extends APIError {
    static from(failure: UpstreamFailure): UpstreamError {
        return new UpstreamError(failure.status, failure.code, failure.message);
    }
}
```

(`APIError`'s constructor is `(statusCode, code, message)`; `UpstreamError` inherits it.)

- [ ] **Step 9: Add the token map and test config**

`src/dependencies/tokens.ts`:

```ts
import type { CliConfig, Config } from "@/config/config";
import type { InjectionToken } from "tsyringe";

/**
 * Tokens for dependency injection. Each token is added by the task that introduces its interface.
 *
 * `Symbol.for(...) as InjectionToken<T>` is how tsyringe gives a symbol token its type.
 */
export const dependencyTokens = {
    /**
     * The server's config. Classes the CLI also uses depend on `cliConfig` instead.
     */
    config: Symbol.for("config") as InjectionToken<Config>,
    cliConfig: Symbol.for("cliConfig") as InjectionToken<CliConfig>,
} satisfies Record<string, InjectionToken<unknown>>;
```

`tests/utils/config.ts`:

```ts
import type { Config } from "@/config/config";

export const testApiKey = "test-score-service-key-0123";

/**
 * Settings for tests. Replay folders are placeholders; tests that touch disk pass their own.
 */
export const testConfig: Config = {
    port: 0,
    host: "127.0.0.1",
    apiKey: testApiKey,
    database: {
        host: "localhost",
        port: 5432,
        name: "test",
        user: "test",
        password: "",
    },
    official: {
        host: "localhost",
        port: 3306,
        name: "test",
        user: "test",
        password: "",
        tablePrefix: "bbl_",
    },
    mongo: { aliceUri: "mongodb://unused", elainaUri: "mongodb://unused" },
    broker: { url: "http://127.0.0.1:1", apiKey: "test-broker-key" },
    beatmapService: {
        url: "http://127.0.0.1:1",
        key: "test-beatmap-key",
        bulkKey: "test-beatmap-bulk-key",
    },
    variants: { liveDroid: "live-droid", liveOsu: "live-osu" },
    replayDirectories: {
        unprocessed: "/nonexistent/unprocessed",
        online: "/nonexistent/online",
        best: "/nonexistent/best",
        uncalculated: "/nonexistent/uncalculated",
    },
    discordMetadata: { url: "http://127.0.0.1:1/update", key: "test-key" },
    replayConcurrency: 2,
    uncalculatedConcurrency: 1,
    uncalculatedIntervalMinutes: 10,
    danCourseRefreshMinutes: 60,
};
```

`.env.example`: one line per variable from `EnvironmentVariableKey`, with placeholder values (`changeme`, `http://127.0.0.1:<port>`), the defaults commented, and no real hosts or ports.

- [ ] **Step 10: Run all checks and commit**

```bash
pnpm install && pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service pnpm-lock.yaml && git commit -m "Scaffold the score service with its configuration"
```

---

### Task 4: Job progress in the score service's Postgres

**Files:**

- Create: `src/database/schema.ts`, `src/database/types.ts`
- Create: `src/repositories/IJobProgressRepository.ts`, `src/repositories/JobProgressRepository.ts`, `src/repositories/index.ts`
- Create: `drizzle/` (generated)
- Create: `tests/utils/database.ts`
- Modify: `src/dependencies/tokens.ts`
- Test: `tests/integration/repositories/JobProgressRepository.int.test.ts`

**Interfaces:**

- Produces:

```ts
export type JobKind = "scores" | "total-pp";

export interface JobDefinition {
    readonly name: string;
    readonly kind: JobKind;
    readonly from: number;
    readonly to: number;
    readonly chunkSize: number;
}

export interface ClaimedChunk {
    readonly start: number;
    readonly end: number;
    /** The last ID processed in an earlier run, or null. Work resumes after it. */
    readonly lastProcessedId: number | null;
}

export interface JobStatus {
    readonly job: JobDefinition;
    readonly chunks: {
        readonly done: number;
        readonly inProgress: number;
        readonly pending: number;
    };
    /** Chunks in progress, with the worker that last held each and the last ID it processed. */
    readonly active: readonly {
        readonly start: number;
        readonly end: number;
        readonly worker: number | null;
        readonly lastProcessedId: number | null;
    }[];
}

export class JobConflictError extends Error {}

export interface IJobProgressRepository {
    /** Creates the job and its chunks, or returns false if an identical job exists. Throws JobConflictError if a job with this name differs. */
    createJob(job: JobDefinition): Promise<boolean>;
    /** Returns chunks left in progress by an interrupted run to pending. Returns how many. */
    releaseInProgress(name: string): Promise<number>;
    /** Atomically claims the lowest pending chunk for a worker. */
    claimChunk(name: string, worker: number): Promise<ClaimedChunk | null>;
    recordProgress(
        name: string,
        start: number,
        lastProcessedId: number,
    ): Promise<void>;
    completeChunk(name: string, start: number): Promise<void>;
    status(name: string): Promise<JobStatus | null>;
}
```

- Token: `jobProgressRepository`, `db` (`Database`).

- [ ] **Step 1: Write the schema**

`src/database/schema.ts`:

```ts
import {
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

/**
 * Recalculation jobs. A job is identified by its name; re-running a name resumes it.
 */
export const jobsTable = pgTable("jobs", {
    name: text().primaryKey(),
    kind: text({ enum: ["scores", "total-pp"] }).notNull(),
    rangeFrom: integer().notNull(),
    rangeTo: integer().notNull(),
    chunkSize: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * A job's ID range split into chunks. Workers claim pending chunks; a chunk in progress keeps the last ID it
 * processed, so an interrupted run resumes after it.
 */
export const jobChunksTable = pgTable(
    "job_chunks",
    {
        jobName: text()
            .notNull()
            .references(() => jobsTable.name, { onDelete: "cascade" }),
        start: integer().notNull(),
        end: integer().notNull(),
        status: text({ enum: ["pending", "in_progress", "done"] })
            .notNull()
            .default("pending"),
        worker: integer(),
        lastProcessedId: integer(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.jobName, table.start] })],
);

export const schema = { jobsTable, jobChunksTable };
```

`src/database/types.ts`: copy the broker's, with the comment saying "the job progress schema".

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @dpp/score-service db:generate`
Expected: `drizzle/0000_*.sql` and `drizzle/meta/` created. Commit them as generated.

- [ ] **Step 3: Write the test helper and failing tests**

`tests/utils/database.ts`: copy the broker's (same `createTestDatabase` using `@dpp/server/testing`, with this app's schema).

Create `tests/integration/repositories/JobProgressRepository.int.test.ts`:

```ts
import {
    JobConflictError,
    JobProgressRepository,
} from "@/repositories/JobProgressRepository";
import { createTestDatabase, type TestDatabase } from "@test/utils/database";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const job = {
    name: "rescore",
    kind: "scores" as const,
    from: 1,
    to: 2500,
    chunkSize: 1000,
};

describe("JobProgressRepository", () => {
    let database: TestDatabase;
    let repository: JobProgressRepository;

    beforeEach(async () => {
        database = await createTestDatabase();
        repository = new JobProgressRepository(database.db);
    });

    afterEach(async () => {
        await database[Symbol.asyncDispose]();
    });

    it("splits the range into chunks, the last one shorter", async () => {
        expect(await repository.createJob(job)).toBe(true);

        const status = await repository.status("rescore");

        expect(status?.job).toEqual(job);
        expect(status?.chunks).toEqual({ done: 0, inProgress: 0, pending: 3 });

        const claimed = [
            await repository.claimChunk("rescore", 0),
            await repository.claimChunk("rescore", 1),
            await repository.claimChunk("rescore", 2),
        ];

        expect(claimed).toEqual([
            { start: 1, end: 1000, lastProcessedId: null },
            { start: 1001, end: 2000, lastProcessedId: null },
            { start: 2001, end: 2500, lastProcessedId: null },
        ]);
        expect(await repository.claimChunk("rescore", 0)).toBeNull();
    });

    it("accepts an identical job again and refuses a different one", async () => {
        await repository.createJob(job);

        expect(await repository.createJob(job)).toBe(false);
        await expect(
            repository.createJob({ ...job, to: 3000 }),
        ).rejects.toBeInstanceOf(JobConflictError);
        await expect(
            repository.createJob({ ...job, kind: "total-pp" }),
        ).rejects.toBeInstanceOf(JobConflictError);
        await expect(
            repository.createJob({ ...job, chunkSize: 10 }),
        ).rejects.toBeInstanceOf(JobConflictError);
    });

    it("resumes a released chunk after its last processed ID", async () => {
        await repository.createJob(job);
        const chunk = await repository.claimChunk("rescore", 0);

        await repository.recordProgress("rescore", chunk!.start, 42);

        expect(await repository.releaseInProgress("rescore")).toBe(1);
        expect(await repository.claimChunk("rescore", 3)).toEqual({
            start: 1,
            end: 1000,
            lastProcessedId: 42,
        });
    });

    it("never hands out a done chunk", async () => {
        await repository.createJob({ ...job, to: 1000 });
        const chunk = await repository.claimChunk("rescore", 0);

        await repository.completeChunk("rescore", chunk!.start);

        expect(await repository.releaseInProgress("rescore")).toBe(0);
        expect(await repository.claimChunk("rescore", 0)).toBeNull();
        expect((await repository.status("rescore"))?.chunks).toEqual({
            done: 1,
            inProgress: 0,
            pending: 0,
        });
    });

    it("gives concurrent claims different chunks", async () => {
        await repository.createJob(job);

        const claims = await Promise.all(
            [0, 1, 2, 3].map((worker) =>
                repository.claimChunk("rescore", worker),
            ),
        );
        const starts = claims.filter((c) => c !== null).map((c) => c.start);

        expect(new Set(starts).size).toBe(3);
        expect(claims.filter((c) => c === null)).toHaveLength(1);
    });

    it("reports active chunks with their worker and progress", async () => {
        await repository.createJob(job);
        await repository.claimChunk("rescore", 5);
        await repository.recordProgress("rescore", 1, 7);

        expect((await repository.status("rescore"))?.active).toEqual([
            { start: 1, end: 1000, worker: 5, lastProcessedId: 7 },
        ]);
    });

    it("creates large ranges in batches", async () => {
        await repository.createJob({
            ...job,
            name: "big",
            from: 1,
            to: 25_000_000,
            chunkSize: 1000,
        });

        expect((await repository.status("big"))?.chunks.pending).toBe(25_000);
    });

    it("returns null for an unknown job", async () => {
        expect(await repository.status("missing")).toBeNull();
    });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/integration/repositories/JobProgressRepository.int.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement the repository**

`src/repositories/IJobProgressRepository.ts`: the interface and types from **Interfaces** above (with the doc comments), plus `JobConflictError`:

```ts
/**
 * A job with this name exists with a different kind, range, or chunk size.
 */
export class JobConflictError extends Error {
    // Not `name`: that would read like `Error.name`, which is set below.
    constructor(jobName: string) {
        super(
            `A job named ${jobName} already exists with a different kind, range, or chunk size`,
        );
        this.name = "JobConflictError";
    }
}
```

`src/repositories/JobProgressRepository.ts`:

```ts
import { jobChunksTable, jobsTable } from "@/database/schema";
import type { Database } from "@/database/types";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { inject } from "tsyringe";
import {
    JobConflictError,
    type ClaimedChunk,
    type IJobProgressRepository,
    type JobDefinition,
    type JobStatus,
} from "./IJobProgressRepository";

export { JobConflictError } from "./IJobProgressRepository";

const insertBatchSize = 1000;

@Injectable(dependencyTokens.jobProgressRepository)
export class JobProgressRepository implements IJobProgressRepository {
    constructor(@inject(dependencyTokens.db) private readonly db: Database) {}

    async createJob(job: JobDefinition): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const inserted = await tx
                .insert(jobsTable)
                .values({
                    name: job.name,
                    kind: job.kind,
                    rangeFrom: job.from,
                    rangeTo: job.to,
                    chunkSize: job.chunkSize,
                })
                .onConflictDoNothing()
                .returning({ name: jobsTable.name });

            if (inserted.length === 0) {
                const [existing] = await tx
                    .select()
                    .from(jobsTable)
                    .where(eq(jobsTable.name, job.name));

                if (
                    existing?.kind !== job.kind ||
                    existing.rangeFrom !== job.from ||
                    existing.rangeTo !== job.to ||
                    existing.chunkSize !== job.chunkSize
                ) {
                    throw new JobConflictError(job.name);
                }

                return false;
            }

            let batch: (typeof jobChunksTable.$inferInsert)[] = [];

            for (
                let start = job.from;
                start <= job.to;
                start += job.chunkSize
            ) {
                batch.push({
                    jobName: job.name,
                    start,
                    end: Math.min(start + job.chunkSize - 1, job.to),
                });

                if (batch.length === insertBatchSize) {
                    await tx.insert(jobChunksTable).values(batch);
                    batch = [];
                }
            }

            if (batch.length > 0) {
                await tx.insert(jobChunksTable).values(batch);
            }

            return true;
        });
    }

    async releaseInProgress(name: string): Promise<number> {
        const released = await this.db
            .update(jobChunksTable)
            .set({ status: "pending", updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.status, "in_progress"),
                ),
            )
            .returning({ start: jobChunksTable.start });

        return released.length;
    }

    async claimChunk(
        name: string,
        worker: number,
    ): Promise<ClaimedChunk | null> {
        // One statement, so two workers can never claim the same chunk.
        const claimed = await this.db
            .update(jobChunksTable)
            .set({ status: "in_progress", worker, updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(
                        jobChunksTable.start,
                        sql`(select ${jobChunksTable.start} from ${jobChunksTable}
                             where ${jobChunksTable.jobName} = ${name} and ${jobChunksTable.status} = 'pending'
                             order by ${jobChunksTable.start} limit 1 for update skip locked)`,
                    ),
                ),
            )
            .returning({
                start: jobChunksTable.start,
                end: jobChunksTable.end,
                lastProcessedId: jobChunksTable.lastProcessedId,
            });

        return claimed[0] ?? null;
    }

    async recordProgress(
        name: string,
        start: number,
        lastProcessedId: number,
    ): Promise<void> {
        await this.db
            .update(jobChunksTable)
            .set({ lastProcessedId, updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.start, start),
                ),
            );
    }

    async completeChunk(name: string, start: number): Promise<void> {
        await this.db
            .update(jobChunksTable)
            .set({ status: "done", updatedAt: new Date() })
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.start, start),
                ),
            );
    }

    async status(name: string): Promise<JobStatus | null> {
        const [job] = await this.db
            .select()
            .from(jobsTable)
            .where(eq(jobsTable.name, name));

        if (!job) {
            return null;
        }

        const counts = await this.db
            .select({ status: jobChunksTable.status, count: count() })
            .from(jobChunksTable)
            .where(eq(jobChunksTable.jobName, name))
            .groupBy(jobChunksTable.status);

        const countOf = (status: string) =>
            counts.find((row) => row.status === status)?.count ?? 0;

        const active = await this.db
            .select({
                start: jobChunksTable.start,
                end: jobChunksTable.end,
                worker: jobChunksTable.worker,
                lastProcessedId: jobChunksTable.lastProcessedId,
            })
            .from(jobChunksTable)
            .where(
                and(
                    eq(jobChunksTable.jobName, name),
                    eq(jobChunksTable.status, "in_progress"),
                ),
            )
            .orderBy(asc(jobChunksTable.start));

        return {
            job: {
                name: job.name,
                kind: job.kind,
                from: job.rangeFrom,
                to: job.rangeTo,
                chunkSize: job.chunkSize,
            },
            chunks: {
                done: countOf("done"),
                inProgress: countOf("in_progress"),
                pending: countOf("pending"),
            },
            active,
        };
    }
}
```

If PGlite rejects `for update skip locked` inside the subquery, keep the single statement but drop `skip locked`, and say so in the report: the update's row lock still serializes concurrent claims (the second waits, then its subquery finds the next pending chunk because the statement re-evaluates under READ COMMITTED only for the locked row; verify with the concurrent-claims test, which must pass either way).

`src/repositories/index.ts`: `export * from "./JobProgressRepository";`

Add to `dependencyTokens`:

```ts
    db: Symbol.for("db") as InjectionToken<Database>,
    jobProgressRepository: Symbol.for(
        "jobProgressRepository",
    ) as InjectionToken<IJobProgressRepository>,
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/integration/repositories/JobProgressRepository.int.test.ts`
Expected: PASS.

- [ ] **Step 7: Check and commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Store recalculation job progress in Postgres"
```

---

### Task 5: Official MySQL database

**Files:**

- Create: `src/official/schema.ts`, `src/official/types.ts`, `src/official/connection.ts`
- Create: `src/repositories/IOfficialScoreRepository.ts`, `src/repositories/OfficialScoreRepository.ts`
- Modify: `src/repositories/index.ts`, `src/dependencies/tokens.ts`
- Create: `tests/utils/officialDatabase.ts`, `tests/utils/rows.ts`
- Test: `tests/integration/repositories/OfficialScoreRepository.int.test.ts`
- Create: `tests/utils/mariadb.ts`

**Interfaces:**

- Produces:

```ts
// src/official/schema.ts
export function createOfficialTables(prefix: string): { users; scores; bestScores; uncalculatedScores };
export type OfficialTables = ReturnType<typeof createOfficialTables>;

// src/official/types.ts
export type ScoreRow = OfficialTables["scores"]["$inferSelect"];
export type BestScoreRow = OfficialTables["bestScores"]["$inferSelect"];
export type BestScoreInsert = OfficialTables["bestScores"]["$inferInsert"];
export type UncalculatedScoreRow = OfficialTables["uncalculatedScores"]["$inferSelect"];
/** What a calculation from stored stats reads. `totalScore` (the generated `round(score × score_multiplier)`) is sent as the processor's `totalScore`, as the game sends `total_score` to `/calculate-score`. */
export type ScoreStats = Pick<ScoreRow, "hash" | "mods" | "totalScore" | "combo" | "perfect" | "good" | "bad" | "miss" | "sliderHeadHit" | "sliderTickHit" | "sliderRepeatHit" | "sliderEndHit">;
/** A score's own columns: a best row without `pp`, `ppMultiplier`, `filename` (the title), and the generated `totalScore`. An uncalculated row has exactly these, minus `id`. */
export type ScoreColumns = Omit<BestScoreRow, "pp" | "ppMultiplier" | "filename" | "totalScore">;
export function scoreColumns(row: ScoreRow | BestScoreRow): ScoreColumns;
export interface UserTotals { readonly pp: number; readonly accuracy: number }

// src/official/connection.ts
export type OfficialDatabase = /* Drizzle mysql2 database or transaction */;
export class OfficialDatabaseConnection implements AsyncDisposable { readonly db: OfficialDatabase; readonly tables: OfficialTables; constructor(settings: OfficialDatabaseSettings) }

// src/repositories/IOfficialScoreRepository.ts
export interface IOfficialScoreRepository {
    /** Runs `work` in one transaction with a repository bound to it. Nested calls use a savepoint. */
    transaction<T>(work: (repository: IOfficialScoreRepository) => Promise<T>): Promise<T>;
    findScoreById(id: number): Promise<ScoreRow | null>;
    findScore(uid: number, hash: string): Promise<ScoreRow | null>;
    /** Every best row for the player and beatmap, highest pp first (more than one only for old duplicates). */
    findBestScores(uid: number, hash: string): Promise<BestScoreRow[]>;
    findUncalculatedScore(replayFilename: string): Promise<UncalculatedScoreRow | null>;
    deleteUncalculatedScore(replayFilename: string): Promise<void>;
    findUserId(username: string): Promise<number | null>;
    findUserLastLogin(uid: number): Promise<{ lastLoginTime: Date | null } | null>;
    /** `SELECT … FOR UPDATE` on the user's row: serializes best-score writes for one player. Only meaningful in a transaction. */
    lockUser(uid: number): Promise<void>;
    setScorePP(id: number, pp: number | null): Promise<void>;
    setBestScorePP(id: number, pp: number): Promise<void>;
    /** Deletes the player's best rows for the beatmap, except `keepId`. Returns the deleted IDs. */
    deleteBestScores(uid: number, hash: string, keepId?: number): Promise<number[]>;
    insertBestScore(row: BestScoreInsert): Promise<void>;
    /** The player's best rows' pp and accuracy, highest pp first. */
    topBestScores(uid: number, limit: number): Promise<{ pp: number; accuracy: number }[]>;
    setUserTotals(uid: number, totals: UserTotals): Promise<void>;
}
```

- Tokens: `officialDb` (`OfficialDatabase`), `officialTables` (`OfficialTables`), `officialScoreRepository`.

- [ ] **Step 1: Write the schema**

`src/official/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
    bigint,
    double,
    float,
    int,
    longtext,
    mediumint,
    mysqlTable,
    timestamp,
    varchar,
} from "drizzle-orm/mysql-core";

/**
 * Columns every score table shares, as in the production schema, with the
 * official database's names (Drizzle maps them to snake_case). A function, so each table gets its own column
 * builders.
 *
 * The hit counts, `combo`, and `accuracy` default to 0 but are nullable in production; readers treat `null` as 0.
 */
function sharedScoreColumns() {
    return {
        uid: mediumint().notNull(),
        filename: varchar({ length: 255 }).notNull(),
        hash: varchar({ length: 36 }).notNull(),
        // Serialized mods as a JSON string. The connection uses `jsonStrings`, so it is never auto-parsed.
        mods: longtext().notNull().default("[]"),
        score: bigint({ mode: "number" }).notNull().default(0),
        combo: int().default(0),
        mark: varchar({ length: 2 }),
        geki: mediumint().default(0),
        perfect: mediumint().default(0),
        katu: mediumint().default(0),
        good: mediumint().default(0),
        bad: mediumint().default(0),
        miss: mediumint().default(0),
        sliderHeadHit: mediumint(),
        sliderTickHit: mediumint(),
        sliderRepeatHit: mediumint(),
        sliderEndHit: mediumint(),
        date: timestamp().notNull().defaultNow(),
        accuracy: float().default(0),
        scoreMultiplier: double().notNull().default(1),
    };
}

/**
 * `round(score * score_multiplier)`, generated by the database: read, never written.
 */
function totalScoreColumn() {
    return bigint({ mode: "number" }).generatedAlwaysAs(
        sql`round(\`score\` * \`score_multiplier\`)`,
        { mode: "stored" },
    );
}

/**
 * The official tables this service reads and writes, named with a configurable prefix. Only the columns this service
 * uses are declared; the real tables have more.
 */
export function createOfficialTables(prefix: string) {
    return {
        users: mysqlTable(`${prefix}user`, {
            id: mediumint().primaryKey().autoincrement(),
            username: varchar({ length: 64 }).notNull(),
            pp: float().notNull().default(0),
            accuracy: float().notNull().default(1),
            lastLoginTime: timestamp(),
        }),
        scores: mysqlTable(`${prefix}score`, {
            id: int().primaryKey().autoincrement(),
            ...sharedScoreColumns(),
            totalScore: totalScoreColumn(),
            pp: float(),
            ppMultiplier: float(),
        }),
        bestScores: mysqlTable(`${prefix}score_best`, {
            id: int().primaryKey(),
            ...sharedScoreColumns(),
            totalScore: totalScoreColumn(),
            pp: float().notNull(),
            ppMultiplier: float().notNull(),
        }),
        uncalculatedScores: mysqlTable(`${prefix}score_uncalculated`, {
            // This table has no `id` and no `total_score`.
            ...sharedScoreColumns(),
            replayfilename: varchar({ length: 255 }),
        }),
    };
}

export type OfficialTables = ReturnType<typeof createOfficialTables>;
```

`src/official/types.ts`: the types from **Interfaces**, and:

```ts
/**
 * A score's own columns, for building a best row from it.
 */
export function scoreColumns(row: ScoreRow | BestScoreRow): ScoreColumns {
    const {
        pp: _pp,
        ppMultiplier: _ppMultiplier,
        filename: _filename,
        totalScore: _totalScore,
        ...columns
    } = row;

    return columns;
}
```

`src/official/connection.ts`:

```ts
import type { OfficialDatabaseSettings } from "@/config/config";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { createOfficialTables, type OfficialTables } from "./schema";

/**
 * The official database through Drizzle. Transactions are assignable to it.
 */
export type OfficialDatabase = MySql2Database;

/**
 * A pool of connections to the official MySQL database. Disposing closes the pool.
 */
export class OfficialDatabaseConnection implements AsyncDisposable {
    readonly db: OfficialDatabase;
    readonly tables: OfficialTables;
    private readonly pool: Pool;

    constructor(settings: OfficialDatabaseSettings) {
        this.pool = createPool({
            host: settings.host,
            port: settings.port,
            database: settings.name,
            user: settings.user,
            password: settings.password,
            connectionLimit: 10,
            // MariaDB marks some columns (e.g. `mods`) as JSON, which mysql2 would parse; keep them as strings.
            jsonStrings: true,
        });
        this.db = drizzle(this.pool, { casing: "snake_case" });
        this.tables = createOfficialTables(settings.tablePrefix);
    }

    [Symbol.asyncDispose](): Promise<void> {
        return this.pool.end();
    }
}
```

If `MySql2Database` and the transaction type are not mutually assignable, define `OfficialDatabase` as the common base `MySqlDatabase<MySql2QueryResultHKT, MySql2PreparedQueryHKT>` (from `drizzle-orm/mysql-core` and `drizzle-orm/mysql2`), and say so in the report.

- [ ] **Step 2: Implement the repository**

`src/repositories/OfficialScoreRepository.ts`:

```ts
import { dependencyTokens } from "@/dependencies/tokens";
import type { OfficialDatabase } from "@/official/connection";
import type { OfficialTables } from "@/official/schema";
import type {
    BestScoreInsert,
    BestScoreRow,
    ScoreRow,
    UncalculatedScoreRow,
    UserTotals,
} from "@/official/types";
import { Injectable } from "@dpp/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { inject } from "tsyringe";
import type { IOfficialScoreRepository } from "./IOfficialScoreRepository";

@Injectable(dependencyTokens.officialScoreRepository)
export class OfficialScoreRepository implements IOfficialScoreRepository {
    constructor(
        @inject(dependencyTokens.officialDb)
        private readonly db: OfficialDatabase,
        @inject(dependencyTokens.officialTables)
        private readonly tables: OfficialTables,
    ) {}

    transaction<T>(
        work: (repository: IOfficialScoreRepository) => Promise<T>,
    ): Promise<T> {
        return this.db.transaction((tx) =>
            work(new OfficialScoreRepository(tx, this.tables)),
        );
    }

    async findScoreById(id: number): Promise<ScoreRow | null> {
        const { scores } = this.tables;
        const [row] = await this.db
            .select()
            .from(scores)
            .where(eq(scores.id, id))
            .limit(1);

        return row ?? null;
    }

    async findScore(uid: number, hash: string): Promise<ScoreRow | null> {
        const { scores } = this.tables;
        const [row] = await this.db
            .select()
            .from(scores)
            .where(and(eq(scores.uid, uid), eq(scores.hash, hash)))
            .limit(1);

        return row ?? null;
    }

    findBestScores(uid: number, hash: string): Promise<BestScoreRow[]> {
        const { bestScores } = this.tables;

        return this.db
            .select()
            .from(bestScores)
            .where(and(eq(bestScores.uid, uid), eq(bestScores.hash, hash)))
            .orderBy(desc(bestScores.pp), bestScores.id);
    }

    async findUncalculatedScore(
        replayFilename: string,
    ): Promise<UncalculatedScoreRow | null> {
        const { uncalculatedScores } = this.tables;
        const [row] = await this.db
            .select()
            .from(uncalculatedScores)
            .where(eq(uncalculatedScores.replayfilename, replayFilename))
            .limit(1);

        return row ?? null;
    }

    async deleteUncalculatedScore(replayFilename: string): Promise<void> {
        const { uncalculatedScores } = this.tables;

        await this.db
            .delete(uncalculatedScores)
            .where(eq(uncalculatedScores.replayfilename, replayFilename));
    }

    async findUserId(username: string): Promise<number | null> {
        const { users } = this.tables;
        const [row] = await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.username, username))
            .limit(1);

        return row?.id ?? null;
    }

    async findUserLastLogin(
        uid: number,
    ): Promise<{ lastLoginTime: Date | null } | null> {
        const { users } = this.tables;
        const [row] = await this.db
            .select({ lastLoginTime: users.lastLoginTime })
            .from(users)
            .where(eq(users.id, uid))
            .limit(1);

        return row ?? null;
    }

    async lockUser(uid: number): Promise<void> {
        const { users } = this.tables;

        await this.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, uid))
            .for("update");
    }

    async setScorePP(id: number, pp: number | null): Promise<void> {
        const { scores } = this.tables;

        await this.db.update(scores).set({ pp }).where(eq(scores.id, id));
    }

    async setBestScorePP(id: number, pp: number): Promise<void> {
        const { bestScores } = this.tables;

        await this.db
            .update(bestScores)
            .set({ pp })
            .where(eq(bestScores.id, id));
    }

    async deleteBestScores(
        uid: number,
        hash: string,
        keepId?: number,
    ): Promise<number[]> {
        const { bestScores } = this.tables;
        const condition = and(
            eq(bestScores.uid, uid),
            eq(bestScores.hash, hash),
            keepId === undefined ? undefined : ne(bestScores.id, keepId),
        );
        const rows = await this.db
            .select({ id: bestScores.id })
            .from(bestScores)
            .where(condition);

        if (rows.length > 0) {
            await this.db.delete(bestScores).where(condition);
        }

        return rows.map((row) => row.id);
    }

    async insertBestScore(row: BestScoreInsert): Promise<void> {
        await this.db.insert(this.tables.bestScores).values(row);
    }

    topBestScores(
        uid: number,
        limit: number,
    ): Promise<{ pp: number; accuracy: number }[]> {
        const { bestScores } = this.tables;

        return this.db
            .select({
                pp: bestScores.pp,
                // Nullable in production; a missing accuracy counts as 0.
                accuracy: sql<number>`coalesce(${bestScores.accuracy}, 0)`,
            })
            .from(bestScores)
            .where(eq(bestScores.uid, uid))
            .orderBy(desc(bestScores.pp))
            .limit(limit);
    }

    async setUserTotals(uid: number, totals: UserTotals): Promise<void> {
        const { users } = this.tables;

        await this.db
            .update(users)
            .set({ pp: totals.pp, accuracy: totals.accuracy })
            .where(eq(users.id, uid));
    }
}
```

Note: the DI container constructs this class with the root database; `transaction` creates bound instances by hand. tsyringe's `@inject` parameters do not prevent calling the constructor directly.

Add the tokens (`officialDb`, `officialTables`, `officialScoreRepository`) and export the repository from `src/repositories/index.ts`.

- [ ] **Step 3: Write the test helpers**

`tests/utils/rows.ts` (also used by unit tests from Task 9 on):

```ts
import type {
    BestScoreRow,
    ScoreRow,
    UncalculatedScoreRow,
} from "@/official/types";

export const testHash = "0123456789abcdef0123456789abcdef";

const shared = {
    uid: 7,
    filename: "Artist - Title (Mapper) [Hard]",
    hash: testHash,
    mods: "[]",
    score: 1_000_000,
    combo: 500,
    mark: "S",
    geki: 50,
    perfect: 400,
    katu: 10,
    good: 20,
    bad: 2,
    miss: 1,
    date: new Date("2026-10-01T00:00:00Z"),
    sliderHeadHit: 100,
    sliderTickHit: 200,
    sliderRepeatHit: 10,
    sliderEndHit: 99,
    accuracy: 0.95,
    scoreMultiplier: 1,
};

/**
 * A score row. `totalScore` is generated as the database would, unless overridden.
 */
export function scoreRow(overrides: Partial<ScoreRow> = {}): ScoreRow {
    const row = { id: 1, ...shared, pp: 100, ppMultiplier: 1, ...overrides };

    return { totalScore: Math.round(row.score * row.scoreMultiplier), ...row };
}

export function bestScoreRow(
    overrides: Partial<BestScoreRow> = {},
): BestScoreRow {
    const row = { id: 1, ...shared, pp: 100, ppMultiplier: 1, ...overrides };

    return { totalScore: Math.round(row.score * row.scoreMultiplier), ...row };
}

export function uncalculatedRow(
    overrides: Partial<UncalculatedScoreRow> = {},
): UncalculatedScoreRow {
    return { ...shared, replayfilename: "7_replay.odr", ...overrides };
}
```

`tests/utils/mariadb.ts` — a throwaway MariaDB server, started like `startTestPostgres` but with the system's `mariadbd`:

```ts
import type { DatabaseSettings } from "@dpp/server";
import { freePort } from "@dpp/server/testing";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createConnection } from "mysql2/promise";

/**
 * A MariaDB server in a temporary folder, with database `test` and passwordless `root`. Disposing stops it and
 * deletes the folder.
 */
export interface TestMariaDb extends AsyncDisposable {
    readonly settings: DatabaseSettings;
}

/**
 * Whether `mariadbd` and `mariadb-install-db` are on PATH. Tests that need MariaDB are skipped without them
 * (CI installs the `mariadb-server` package).
 */
export async function hasMariaDb(): Promise<boolean> {
    try {
        await promisify(execFile)("mariadbd", ["--version"]);
        await promisify(execFile)("mariadb-install-db", ["--help"]);
        return true;
    } catch {
        return false;
    }
}

export async function startTestMariaDb(): Promise<TestMariaDb> {
    const directory = await mkdtemp(join(tmpdir(), "score-service-mariadb-"));
    const dataDirectory = join(directory, "data");
    const port = await freePort();
    // `--no-defaults` keeps the system's /etc/mysql configuration out; `--user` lets it run as root too.
    const common = [
        "--no-defaults",
        `--user=${userInfo().username}`,
        `--datadir=${dataDirectory}`,
    ];

    await promisify(execFile)("mariadb-install-db", [
        ...common,
        "--auth-root-authentication-method=normal",
        "--skip-test-db",
    ]);

    const server = spawn(
        "mariadbd",
        [
            ...common,
            `--port=${port.toString()}`,
            "--bind-address=127.0.0.1",
            `--socket=${join(directory, "mariadb.sock")}`,
            `--pid-file=${join(directory, "mariadb.pid")}`,
            "--skip-grant-tables",
            "--skip-log-bin",
        ],
        { stdio: "ignore" },
    );
    const exited = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
    );
    const stop = async () => {
        server.kill("SIGTERM");
        await exited;
        await rm(directory, { recursive: true, force: true });
    };

    try {
        await waitUntilReady(port);
    } catch (e) {
        await stop();
        throw e;
    }

    return {
        settings: {
            host: "127.0.0.1",
            port,
            name: "test",
            user: "root",
            password: "",
        },
        [Symbol.asyncDispose]: stop,
    };
}

async function waitUntilReady(port: number): Promise<void> {
    const deadline = Date.now() + 30_000;

    for (;;) {
        try {
            const connection = await createConnection({
                host: "127.0.0.1",
                port,
                user: "root",
            });

            await connection.query("CREATE DATABASE IF NOT EXISTS test");
            await connection.end();
            return;
        } catch (e) {
            if (Date.now() > deadline) {
                throw new Error("MariaDB did not start within 30 s", {
                    cause: e,
                });
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
}
```

`--skip-grant-tables` makes every connection root without a password, which is all a throwaway test server needs. If `mariadb-install-db` on the system needs other flags (check `mariadb-install-db --help`), adjust and say so in the report. Stop the server only through the returned handle, never with `pkill`.

`tests/utils/officialDatabase.ts`:

```ts
import type { DatabaseSettings } from "@dpp/server";
import type { OfficialDatabaseSettings } from "@/config/config";
import { OfficialDatabaseConnection } from "@/official/connection";
import { randomBytes } from "node:crypto";
import { createOfficialTables } from "@/official/schema";
import {
    generateMySQLDrizzleJson,
    generateMySQLMigration,
} from "drizzle-kit/api";
import { createConnection } from "mysql2/promise";

/**
 * Official tables under a random prefix, created on a test MariaDB server. Disposing drops them. Each test gets
 * its own prefix, so one server serves a whole test file.
 */
export interface OfficialTestDatabase extends AsyncDisposable {
    readonly connection: OfficialDatabaseConnection;
    readonly settings: OfficialDatabaseSettings;
}

export async function createOfficialTestDatabase(
    settings: DatabaseSettings,
): Promise<OfficialTestDatabase> {
    const prefix = `t${randomBytes(4).toString("hex")}_`;
    const admin = await createConnection({
        host: settings.host,
        port: settings.port,
        database: settings.name,
        user: settings.user,
        password: settings.password,
        multipleStatements: true,
    });

    // The tables as `src/official/schema.ts` declares them: the schema is the only description of the official
    // tables in this repository.
    const statements = await generateMySQLMigration(
        await generateMySQLDrizzleJson({}),
        await generateMySQLDrizzleJson(
            createOfficialTables(prefix),
            undefined,
            "snake_case",
        ),
    );

    for (const statement of statements) {
        await admin.query(statement);
    }

    const full = { ...settings, tablePrefix: prefix };
    const connection = new OfficialDatabaseConnection(full);

    return {
        connection,
        settings: full,
        [Symbol.asyncDispose]: async () => {
            await connection[Symbol.asyncDispose]();
            await admin.query(
                `DROP TABLE ${prefix}user, ${prefix}score, ${prefix}score_best, ${prefix}score_uncalculated`,
            );
            await admin.end();
        },
    };
}
```

Check `generateMySQLDrizzleJson`'s signature in `node_modules/drizzle-kit/api.d.ts` (the casing argument's position may differ) and pass `snake_case` so the generated column names match the connection's.

Because the test tables come from the Drizzle schema, the tests can only catch a mismatch with production if the schema itself matches production. Before writing the tests, compare `src/official/schema.ts` with the production export (`/var/www/html/osudroid/docs/export_ibancho.sql`, tables `bbl_user`, `bbl_score`, `bbl_score_best`, `bbl_score_uncalculated`) column by column, for the columns the schema declares: type, nullability, default, the generated `total_score`, the primary keys (`bbl_user.id`, `bbl_score.id`, `bbl_score_best.id`; none on `bbl_score_uncalculated`), and `bbl_user.username`'s unique key. Add those keys and the indexes this service queries by (`(uid, hash)` lookups, `replayfilename`, best rows by `uid`) to the schema with the export's index names. Print the generated DDL once (`console.log(statements.join(";\n"))` in a scratch script) and list in the report every remaining difference from the export (expected: undeclared columns such as `password` or `game_session_id`, column charsets, and the `json_valid` check on `mods`). `bbl_score_best`'s primary key is `id`, so production duplicates are rows with different IDs for the same player and beatmap.

- [ ] **Step 4: Write the integration tests**

`tests/integration/repositories/OfficialScoreRepository.int.test.ts`:

```ts
import {
    scoreColumns,
    type BestScoreRow,
    type ScoreRow,
} from "@/official/types";
import { OfficialScoreRepository } from "@/repositories/OfficialScoreRepository";
import {
    hasMariaDb,
    startTestMariaDb,
    type TestMariaDb,
} from "@test/utils/mariadb";
import {
    createOfficialTestDatabase,
    type OfficialTestDatabase,
} from "@test/utils/officialDatabase";
import {
    bestScoreRow,
    scoreRow,
    testHash,
    uncalculatedRow,
} from "@test/utils/rows";
import { eq } from "drizzle-orm";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest";

/**
 * A best row as the service inserts it: without the generated total score.
 */
function bestInsert(row: BestScoreRow) {
    return {
        ...scoreColumns(row),
        filename: row.filename,
        pp: row.pp,
        ppMultiplier: row.ppMultiplier,
    };
}

/**
 * A score row without the generated total score.
 */
function scoreInsert(row: ScoreRow) {
    const { totalScore: _generated, ...columns } = row;

    return columns;
}

describe.skipIf(!(await hasMariaDb()))(
    "OfficialScoreRepository (MariaDB)",
    () => {
        let server: TestMariaDb;
        let database: OfficialTestDatabase;
        let repository: OfficialScoreRepository;

        beforeAll(async () => {
            server = await startTestMariaDb();
        }, 60_000);

        afterAll(async () => {
            await server[Symbol.asyncDispose]();
        });

        beforeEach(async () => {
            database = await createOfficialTestDatabase(server.settings);
            repository = new OfficialScoreRepository(
                database.connection.db,
                database.connection.tables,
            );

            const { db, tables } = database.connection;

            await db.insert(tables.users).values([
                {
                    id: 7,
                    username: "player",
                    lastLoginTime: new Date("2026-09-01T00:00:00Z"),
                },
                { id: 8, username: "other" },
            ]);
        });

        afterEach(async () => {
            await database[Symbol.asyncDispose]();
        });

        it("reads scores with mods as a string and the generated total score", async () => {
            const { db, tables } = database.connection;

            await db.insert(tables.scores).values(
                scoreInsert(
                    scoreRow({
                        id: 10,
                        mods: JSON.stringify([new ModHidden().serialize()]),
                        score: 1000,
                        scoreMultiplier: 1.5,
                    }),
                ),
            );

            expect(await repository.findScoreById(10)).toMatchObject({
                id: 10,
                mods: JSON.stringify([new ModHidden().serialize()]),
                ppMultiplier: 1,
                totalScore: 1500,
            });
            expect(await repository.findScore(7, testHash)).toMatchObject({
                id: 10,
            });
            expect(await repository.findScore(8, testHash)).toBeNull();
            expect(await repository.findScoreById(11)).toBeNull();
        });

        it("reads null hit counts as null", async () => {
            const { db, tables } = database.connection;

            await db.insert(tables.scores).values({
                ...scoreInsert(scoreRow({ id: 10 })),
                combo: null,
                miss: null,
            });

            expect(await repository.findScoreById(10)).toMatchObject({
                combo: null,
                miss: null,
            });
        });

        it("lists best rows highest pp first and deletes all but one", async () => {
            const { db, tables } = database.connection;

            await db
                .insert(tables.bestScores)
                .values([
                    bestInsert(bestScoreRow({ id: 1, pp: 50 })),
                    bestInsert(bestScoreRow({ id: 2, pp: 80 })),
                    bestInsert(bestScoreRow({ id: 3, pp: 60 })),
                ]);

            expect(
                (await repository.findBestScores(7, testHash)).map((r) => r.id),
            ).toEqual([2, 3, 1]);
            expect(
                (await repository.deleteBestScores(7, testHash, 2)).sort(),
            ).toEqual([1, 3]);
            expect(
                (await repository.findBestScores(7, testHash)).map((r) => r.id),
            ).toEqual([2]);
            expect(await repository.deleteBestScores(7, testHash)).toEqual([2]);
            expect(await repository.deleteBestScores(7, testHash)).toEqual([]);
        });

        it("inserts a best row without writing the generated total score", async () => {
            await repository.insertBestScore(
                bestInsert(
                    bestScoreRow({
                        id: 5,
                        pp: 10,
                        score: 1000,
                        scoreMultiplier: 1.5,
                    }),
                ),
            );
            await repository.setBestScorePP(5, 20);

            expect(
                (await repository.findBestScores(7, testHash))[0],
            ).toMatchObject({ id: 5, pp: 20, totalScore: 1500 });
        });

        it("sets and clears a score's pp", async () => {
            const { db, tables } = database.connection;

            await db
                .insert(tables.scores)
                .values(scoreInsert(scoreRow({ id: 10 })));
            await repository.setScorePP(10, null);

            expect((await repository.findScoreById(10))?.pp).toBeNull();
        });

        it("finds and deletes uncalculated rows by replay file name", async () => {
            const { db, tables } = database.connection;

            await db
                .insert(tables.uncalculatedScores)
                .values(uncalculatedRow({ replayfilename: "a.odr" }));

            expect(
                await repository.findUncalculatedScore("a.odr"),
            ).toMatchObject({
                uid: 7,
            });
            await repository.deleteUncalculatedScore("a.odr");
            expect(await repository.findUncalculatedScore("a.odr")).toBeNull();
        });

        it("finds users and writes totals", async () => {
            expect(await repository.findUserId("player")).toBe(7);
            expect(await repository.findUserId("nobody")).toBeNull();
            expect(await repository.findUserLastLogin(7)).toEqual({
                lastLoginTime: new Date("2026-09-01T00:00:00Z"),
            });

            await repository.setUserTotals(7, { pp: 123.5, accuracy: 0.9 });

            const { db, tables } = database.connection;
            const [user] = await db
                .select()
                .from(tables.users)
                .where(eq(tables.users.id, 7));

            expect(user?.pp).toBeCloseTo(123.5, 3);
        });

        it("reads top best scores, a null accuracy as 0", async () => {
            const { db, tables } = database.connection;

            await db.insert(tables.bestScores).values([
                bestInsert(
                    bestScoreRow({ id: 1, pp: 50, hash: "a".repeat(32) }),
                ),
                {
                    ...bestInsert(
                        bestScoreRow({ id: 2, pp: 80, hash: "b".repeat(32) }),
                    ),
                    accuracy: null,
                },
            ]);

            expect(await repository.topBestScores(7, 1)).toEqual([
                { pp: 80, accuracy: 0 },
            ]);
        });

        it("rolls a transaction back on error", async () => {
            await expect(
                repository.transaction(async (tx) => {
                    await tx.insertBestScore(
                        bestInsert(bestScoreRow({ id: 9 })),
                    );
                    throw new Error("boom");
                }),
            ).rejects.toThrow("boom");

            expect(await repository.findBestScores(7, testHash)).toEqual([]);
        });

        it("makes a second transaction wait for a user lock", async () => {
            const order: string[] = [];
            let releaseFirst!: () => void;
            const firstHolds = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let firstLocked!: () => void;
            const locked = new Promise<void>((resolve) => {
                firstLocked = resolve;
            });

            const first = repository.transaction(async (tx) => {
                await tx.lockUser(7);
                firstLocked();
                await firstHolds;
                order.push("first commits");
            });

            await locked;

            const second = repository.transaction(async (tx) => {
                await tx.lockUser(7);
                order.push("second locked");
            });

            // Give the second transaction time to block on the lock.
            await new Promise((resolve) => setTimeout(resolve, 300));
            releaseFirst();
            await Promise.all([first, second]);

            expect(order).toEqual(["first commits", "second locked"]);
        });
    },
);
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/integration/repositories/OfficialScoreRepository.int.test.ts`
Expected: PASS (MariaDB is installed on the development machine; the suite starts its own server on a free port and never touches a running one). If it is skipped, `hasMariaDb()` failed: report why instead of installing anything.

- [ ] **Step 6: Check and commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Read and write official scores through Drizzle"
```

---

### Task 6: MongoDB repositories

**Files:**

- Create: `src/mongo/connections.ts`, `src/mongo/documents.ts`
- Create: `src/repositories/IRecentPlayRepository.ts`, `RecentPlayRepository.ts`, `IDanCourseRepository.ts`, `DanCourseRepository.ts`, `IUserBindRepository.ts`, `UserBindRepository.ts`
- Modify: `src/repositories/index.ts`, `src/dependencies/tokens.ts`
- Create: `tests/utils/mongo.ts`
- Test: `tests/integration/repositories/mongo.int.test.ts`, `tests/unit/mongo/documents.test.ts`

**Interfaces:**

- Produces:

```ts
// src/mongo/documents.ts
export interface CalculationParams {
    mods: SerializedMod[];
    accuracy: { n300: number; n100: number; n50: number; nmiss: number };
    combo: number;
    totalScore?: number;
    sliderTicksMissed?: number;
    sliderEndsDropped?: number;
    tapPenalty: number;
    sliderCheesePenalty: number;
}
export interface RecentPlayAttributes<TPerformance> {
    params: CalculationParams;
    difficulty: Record<string, unknown> & { mods: SerializedMod[] };
    performance: TPerformance;
}
export interface DroidRecentPerformance { total; aim; tap; accuracy; flashlight; reading; deviation; tapDeviation; tapPenalty; sliderCheesePenalty: number }
export interface OsuRecentPerformance { total; aim; speed; accuracy; flashlight: number }
export interface RecentPlayDocument {
    uid: number; title: string; combo: number; score: number; rank: string; date: Date;
    accuracy: { n300: number; n100: number; n50: number; nmiss: number };
    mods: SerializedMod[]; hash: string; scoreId: number;
    hitError?: unknown; sliderTickInformation?: unknown; sliderEndInformation?: unknown;
    droidAttribs?: RecentPlayAttributes<DroidRecentPerformance>;
    osuAttribs?: RecentPlayAttributes<OsuRecentPerformance>;
}
export const danCourseSchema; export type DanCourse = { hash: string; requirement: { id: string; value: number } } (loose: other fields kept)
export interface DanCourseScore { uid; username; hash; mods: SerializedMod[]; score; maxCombo; rank: string; geki; perfect; katu; good; bad; miss; date: number; grade: number }

// repositories
export interface IRecentPlayRepository { insert(play: RecentPlayDocument): Promise<void> }
export interface IDanCourseRepository {
    /** Raw course documents; the caller validates them. */
    listCourses(): Promise<unknown[]>;
    /** The grade of the player's leaderboard entry, or null if none (or unreadable). */
    findGrade(uid: number, hash: string): Promise<number | null>;
    upsertScore(score: DanCourseScore): Promise<void>;
}
export interface IUserBindRepository {
    /** The Discord ID bound to the uid (current or previous bind), or null. */
    findDiscordId(uid: number): Promise<string | null>;
}

// src/mongo/connections.ts
export class MongoConnections implements AsyncDisposable {
    static connect(settings: { aliceUri: string; elainaUri: string }): Promise<MongoConnections>;
    readonly aliceDb: Db; readonly elainaDb: Db;
}
```

- Tokens: `aliceDb` (`Db`), `elainaDb` (`Db`), `recentPlayRepository`, `danCourseRepository`, `userBindRepository`.

- [ ] **Step 1: Write the failing document-schema test**

`tests/unit/mongo/documents.test.ts`:

```ts
import { danCourseSchema, userBindSchema } from "@/mongo/documents";
import { describe, expect, it } from "vitest";

describe("danCourseSchema", () => {
    it("accepts a course and keeps its other fields", () => {
        const course = {
            courseName: "Dan 1",
            hash: "0123456789abcdef0123456789abcdef",
            requirement: { id: "acc", value: 95 },
            fileName: "dan1.osu",
            roleId: "1",
        };

        expect(danCourseSchema.parse(course)).toEqual(course);
    });

    it.each([
        [{ hash: 1, requirement: { id: "acc", value: 1 } }],
        [{ hash: "a", requirement: { value: 1 } }],
        [{ hash: "a" }],
    ])("rejects %j", (document) => {
        expect(danCourseSchema.safeParse(document).success).toBe(false);
    });
});

describe("userBindSchema", () => {
    it("reads the Discord ID", () => {
        expect(userBindSchema.parse({ discordid: "123" })).toEqual({
            discordid: "123",
        });
    });

    it("rejects an empty or missing ID", () => {
        expect(userBindSchema.safeParse({ discordid: "" }).success).toBe(false);
        expect(userBindSchema.safeParse({}).success).toBe(false);
    });
});
```

- [ ] **Step 2: Run it to see it fail, then write the documents module**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/unit/mongo` → FAIL.

`src/mongo/documents.ts`: the interfaces from **Interfaces** (with doc comments: "Unchanged from the old backend's `IRecentPlay`; the Discord bot reads it", "Unchanged from the old backend's `IDanCourseScore`"), plus:

```ts
/**
 * A dan course as read from `dancoursemaps`. Only the fields grading needs are checked; unknown requirement IDs are
 * kept (they grade 0, as before).
 */
export const danCourseSchema = z.looseObject({
    hash: z.string().min(1),
    requirement: z.looseObject({ id: z.string(), value: z.number() }),
});

export type DanCourse = z.infer<typeof danCourseSchema>;

export const userBindSchema = z.object({ discordid: z.string().min(1) });

/**
 * The part of a leaderboard entry grading reads. Entries are written by this service and by older code, so they are
 * checked rather than trusted.
 */
export const danCourseGradeSchema = z.object({ grade: z.number() });
```

Run again → PASS.

- [ ] **Step 3: Implement the connections and repositories**

`src/mongo/connections.ts`:

```ts
import { MongoClient, type Db } from "mongodb";

/**
 * Both MongoDB clusters. Disposing closes both clients.
 */
export class MongoConnections implements AsyncDisposable {
    private constructor(
        private readonly clients: readonly MongoClient[],
        readonly aliceDb: Db,
        readonly elainaDb: Db,
    ) {}

    /**
     * Connects to both clusters. If the second connection fails, the first is closed before rethrowing.
     */
    static async connect(settings: {
        aliceUri: string;
        elainaUri: string;
    }): Promise<MongoConnections> {
        const alice = await MongoClient.connect(settings.aliceUri);

        try {
            const elaina = await MongoClient.connect(settings.elainaUri);

            return new MongoConnections(
                [alice, elaina],
                alice.db("AliceDB"),
                elaina.db("ElainaDB"),
            );
        } catch (e) {
            await alice.close();
            throw e;
        }
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await Promise.all(this.clients.map((client) => client.close()));
    }
}
```

Database names `AliceDB` and `ElainaDB` and collection names (`recentplays`, `dancoursemaps`, `dancourseleaderboard`, `userbind`) are the old backend's.

`src/repositories/RecentPlayRepository.ts`:

```ts
@Injectable(dependencyTokens.recentPlayRepository)
export class RecentPlayRepository implements IRecentPlayRepository {
    private readonly collection: Collection<RecentPlayDocument>;

    constructor(@inject(dependencyTokens.aliceDb) db: Db) {
        this.collection = db.collection("recentplays");
    }

    async insert(play: RecentPlayDocument): Promise<void> {
        await this.collection.insertOne(play);
    }
}
```

`insertOne` adds `_id` to the object it is given; pass a copy (`{ ...play }`) so callers' objects stay unchanged.

Collections this service writes are typed with their document interfaces (`recentplays`, `dancourseleaderboard`). Collections it only reads (`dancoursemaps`, `userbind`) stay `Collection<Document>`, and what is read from them, including leaderboard grades, goes through a zod schema: the driver's generic type is only a promise about stored data, which other programs also write.

`src/repositories/DanCourseRepository.ts`:

```ts
@Injectable(dependencyTokens.danCourseRepository)
export class DanCourseRepository implements IDanCourseRepository {
    // Read only, and validated by the caller: typing it would promise a shape nothing has checked.
    private readonly courses: Collection<Document>;
    private readonly leaderboard: Collection<DanCourseScore>;

    constructor(@inject(dependencyTokens.aliceDb) db: Db) {
        this.courses = db.collection("dancoursemaps");
        this.leaderboard = db.collection("dancourseleaderboard");
    }

    listCourses(): Promise<unknown[]> {
        return this.courses.find({}, { projection: { _id: 0 } }).toArray();
    }

    async findGrade(uid: number, hash: string): Promise<number | null> {
        const document = await this.leaderboard.findOne(
            { uid, hash },
            { projection: { _id: 0, grade: 1 } },
        );
        const parsed = danCourseGradeSchema.safeParse(document);

        return parsed.success ? parsed.data.grade : null;
    }

    async upsertScore(score: DanCourseScore): Promise<void> {
        await this.leaderboard.updateOne(
            { uid: score.uid, hash: score.hash },
            { $set: score },
            { upsert: true },
        );
    }
}
```

`src/repositories/UserBindRepository.ts`:

```ts
@Injectable(dependencyTokens.userBindRepository)
export class UserBindRepository implements IUserBindRepository {
    // Read only, and validated with `userBindSchema` on every read.
    private readonly collection: Collection<Document>;

    constructor(@inject(dependencyTokens.elainaDb) db: Db) {
        this.collection = db.collection("userbind");
    }

    async findDiscordId(uid: number): Promise<string | null> {
        // `previous_bind` lists every uid ever bound, including the current one.
        const document = await this.collection.findOne(
            { previous_bind: { $all: [uid] } },
            { projection: { _id: 0, discordid: 1 } },
        );
        const parsed = userBindSchema.safeParse(document);

        return parsed.success ? parsed.data.discordid : null;
    }
}
```

Each with its `I*` interface file and full imports; add tokens and exports.

- [ ] **Step 4: Write the integration tests**

Add the dev dependency and keep its install script disabled (it would download `mongod` during `pnpm install`; without it, the binary is downloaded on first use and cached in `~/.cache/mongodb-binaries`):

```bash
pnpm --filter @dpp/score-service add -D mongodb-memory-server
```

In `pnpm-workspace.yaml`, add `mongodb-memory-server: false` (and `mongodb-memory-server-core: false` if pnpm reports its build was ignored) under `allowBuilds`, next to `libpq: false`.

`tests/utils/mongo.ts`:

```ts
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * A throwaway MongoDB server (a real `mongod`, downloaded once and cached). Every test file gets its own, so the
 * fixed database names (`AliceDB`, `ElainaDB`) are safe to use. Disposing stops it and deletes its data.
 */
export interface TestMongo extends AsyncDisposable {
    readonly uri: string;
}

export async function startTestMongo(): Promise<TestMongo> {
    const server = await MongoMemoryServer.create();

    return {
        uri: server.getUri(),
        [Symbol.asyncDispose]: async () => {
            await server.stop({ doCleanup: true });
        },
    };
}
```

The first run downloads `mongod` for this OS. The development machine runs Ubuntu 26.04, which `mongodb-memory-server` may not map to a build yet; if `create()` fails to find a binary, set `MONGOMS_DISTRO=ubuntu-24.04` in `vitest.config.mts`'s `test.env` (and `vitest.e2e.config.mts`), confirm it works, and say so in the report. Tests that start MongoDB need a longer hook timeout: give `beforeAll` 120 s.

`tests/integration/repositories/mongo.int.test.ts` starts one server in `beforeAll` (stopped in `afterAll`), connects a `MongoClient`, and gives each test fresh `AliceDB` and `ElainaDB` (drop both in `beforeEach`). Cases:

- `RecentPlayRepository.insert` stores the document unchanged (read it back without `_id`, compare with `toEqual`), and the caller's object has no `_id` afterwards.
- `DanCourseRepository.listCourses` returns inserted courses without `_id`.
- `findGrade` returns `null` with no entry, the grade after `upsertScore`, and `upsertScore` twice for the same uid and hash leaves one document with the second score.
- `UserBindRepository.findDiscordId` finds `{ discordid: "1", previous_bind: [5, 6] }` by 6, returns `null` for 7, and `null` for a document with `discordid: 5` (a number).
- `MongoConnections.connect` with both URIs set to the test server returns `AliceDB` and `ElainaDB`, and disposing closes both clients; connecting with an unreachable second URI (`mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=500`) rejects and closes the first client.

- [ ] **Step 5: Run and commit**

Run: `pnpm --filter @dpp/score-service test`
Expected: PASS, including the MongoDB tests.

```bash
pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service pnpm-workspace.yaml pnpm-lock.yaml && git commit -m "Read and write recent plays, dan courses, and binds in MongoDB"
```

---

### Task 7: Broker, beatmap service, and Discord clients

**Files:**

- Create: `src/clients/http.ts`, `src/clients/schemas.ts`
- Create: `src/clients/IBrokerClient.ts`, `BrokerClient.ts`, `IBeatmapServiceClient.ts`, `BeatmapServiceClient.ts`, `IDiscordMetadataClient.ts`, `DiscordMetadataClient.ts`, `index.ts`
- Modify: `src/dependencies/tokens.ts`
- Move: `apps/broker/tests/utils/httpServer.ts` → `packages/server/src/testing/httpServer.ts` (exported from `@dpp/server/testing`; update the broker's imports)
- Test: `tests/unit/clients/http.test.ts`, `BrokerClient.test.ts`, `BeatmapServiceClient.test.ts`, `DiscordMetadataClient.test.ts`

**Interfaces:**

- Consumes: `UpstreamResult`, `failureFromResponse`, `unreachable`, `malformed` (Task 3); `CliConfig`, `Config`.
- Produces:

```ts
// src/clients/schemas.ts
export const resolvedScoreSchema;
export const performanceBodySchema;
export const replayPerformanceBodySchema;
export type PerformanceBody = z.infer<typeof performanceBodySchema>; // loose: unknown keys kept
export type ReplayPerformanceBody = z.infer<typeof replayPerformanceBodySchema>;
export const beatmapMetadataSchema;

// src/clients/http.ts
export interface JsonRequest {
    readonly url: string;
    readonly method?: "GET" | "POST";
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
    readonly timeoutMs: number;
    /** Named in failure messages, e.g. "Broker". */
    readonly service: string;
    /** For failures without an error code in the body (unreachable, non-JSON errors). */
    readonly fallbackCode: ErrorCode;
    /** For 2xx bodies that do not match the schema. */
    readonly malformedCode: ErrorCode;
}
export function requestJson<T>(
    request: JsonRequest,
    schema: z.ZodType<T>,
): Promise<UpstreamResult<T>>;

// clients
export type PerformanceRequestInput = z.input<typeof performanceRequestSchema>;
export type ReplayPerformanceRequestInput = z.input<
    typeof replayPerformanceRequestSchema
>;
export interface IBrokerClient {
    performance(
        variant: string,
        request: PerformanceRequestInput,
    ): Promise<UpstreamResult<PerformanceBody>>;
    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
    ): Promise<UpstreamResult<ReplayPerformanceBody>>;
    /** The variant's mode from `GET /variants/:name`, cached for 5 minutes. A variant with no mode yet is "retry later". */
    variantMode(variant: string): Promise<UpstreamResult<Modes>>;
}
export type BeatmapLane = "priority" | "bulk";
export interface BeatmapInfo {
    readonly hash: string;
    readonly title: string;
    readonly rankedStatus: RankedStatus;
}
export interface IBeatmapServiceClient {
    /** `null` value: the beatmap does not exist (404). */
    getBeatmap(
        lane: BeatmapLane,
        hash: string,
    ): Promise<UpstreamResult<BeatmapInfo | null>>;
}
export interface IDiscordMetadataClient {
    /** Whether the update was accepted. Never throws. */
    update(discordId: string): Promise<boolean>;
}
```

- Tokens: `brokerClient`, `beatmapServiceClient`, `discordMetadataClient`.

- [ ] **Step 1: Write the failing `requestJson` tests**

Move `apps/broker/tests/utils/httpServer.ts` to `packages/server/src/testing/httpServer.ts` with `git mv`, export it from `packages/server/src/testing/index.ts`, change every broker import of `@test/utils/httpServer` to `@dpp/server/testing`, and run `pnpm --filter @dpp/broker test` (must still pass). Check whether `apps/processor/tests` has its own copy (`grep -rn "createServer" apps/processor/tests/utils`); if it is the same helper, switch it too. Then create `tests/unit/clients/http.test.ts`:

```ts
import { requestJson } from "@/clients/http";
import { startHttpServer } from "@dpp/server/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const schema = z.object({ value: z.number() });
const base = {
    timeoutMs: 1000,
    service: "Test",
    fallbackCode: "BROKER_UNAVAILABLE" as const,
    malformedCode: "PROCESSOR_ERROR" as const,
};

describe("requestJson", () => {
    it("sends JSON and parses the body", async () => {
        await using server = await startHttpServer((req, res) => {
            let body = "";
            req.on("data", (chunk: Buffer) => (body += chunk.toString()));
            req.on("end", () => {
                res.setHeader("Content-Type", "application/json");
                res.end(
                    JSON.stringify({
                        value: (JSON.parse(body) as { n: number }).n + 1,
                        extra: req.headers["x-api-key"],
                    }),
                );
            });
        });

        const result = await requestJson(
            {
                ...base,
                url: `${server.url}/x`,
                method: "POST",
                headers: { "X-Api-Key": "k" },
                body: { n: 1 },
            },
            z.looseObject({ value: z.number() }),
        );

        expect(result).toEqual({ ok: true, value: { value: 2, extra: "k" } });
    });

    it("passes an error body's code and message through", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    error: {
                        code: "VARIANT_NOT_FOUND",
                        message: "No variant x",
                    },
                }),
            );
        });

        expect(await requestJson({ ...base, url: server.url }, schema)).toEqual(
            {
                ok: false,
                kind: "rejected",
                status: 404,
                code: "VARIANT_NOT_FOUND",
                message: "No variant x",
            },
        );
    });

    it("uses the fallback code for an error without a readable body", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 503;
            res.setHeader("Retry-After", "3");
            res.end("busy");
        });

        expect(await requestJson({ ...base, url: server.url }, schema)).toEqual(
            {
                ok: false,
                kind: "retry",
                status: 503,
                code: "BROKER_UNAVAILABLE",
                message: "Test responded with status 503",
                retryAfterMs: 3000,
            },
        );
    });

    it("ignores an unknown error code", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.statusCode = 500;
            res.end(
                JSON.stringify({ error: { code: "WHATEVER", message: "m" } }),
            );
        });

        const result = await requestJson({ ...base, url: server.url }, schema);

        expect(result).toMatchObject({
            ok: false,
            kind: "rejected",
            code: "BROKER_UNAVAILABLE",
            message: "m",
        });
    });

    it("treats a body of the wrong shape as a permanent failure", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.end(JSON.stringify({ value: "nope" }));
        });

        expect(await requestJson({ ...base, url: server.url }, schema)).toEqual(
            {
                ok: false,
                kind: "rejected",
                status: 502,
                code: "PROCESSOR_ERROR",
                message: "Test returned an unexpected response",
            },
        );
    });

    it("treats non-JSON success as a permanent failure", async () => {
        await using server = await startHttpServer((_req, res) => {
            res.end("<html>");
        });

        expect(
            await requestJson({ ...base, url: server.url }, schema),
        ).toMatchObject({
            ok: false,
            kind: "rejected",
            status: 502,
        });
    });

    it("treats a refused connection as retry later", async () => {
        const server = await startHttpServer(() => undefined);
        const url = server.url;

        await server[Symbol.asyncDispose]();

        expect(await requestJson({ ...base, url }, schema)).toEqual({
            ok: false,
            kind: "retry",
            status: 503,
            code: "BROKER_UNAVAILABLE",
            message: "Test is unreachable",
        });
    });

    it("treats a timeout as retry later", async () => {
        await using server = await startHttpServer(() => undefined);

        expect(
            await requestJson(
                { ...base, url: server.url, timeoutMs: 100 },
                schema,
            ),
        ).toMatchObject({
            ok: false,
            kind: "retry",
            message: "Test did not respond in time",
        });
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/unit/clients/http.test.ts` → FAIL.

- [ ] **Step 3: Implement `requestJson`**

`src/clients/http.ts`:

```ts
import {
    failureFromResponse,
    malformed,
    unreachable,
    type UpstreamResult,
} from "@/types/upstream";
import { errorCodes, type ErrorCode } from "@dpp/shared";
import { z } from "zod";

export interface JsonRequest {
    // (fields as in Interfaces, with their doc comments)
}

const errorBodySchema = z.object({
    error: z.object({ code: z.string(), message: z.string() }),
});

function isErrorCode(code: string): code is ErrorCode {
    return (errorCodes as readonly string[]).includes(code);
}

/**
 * Sends a request and validates a JSON response. Never throws: every failure is classified (see `UpstreamFailure`).
 */
export async function requestJson<T>(
    request: JsonRequest,
    schema: z.ZodType<T>,
): Promise<UpstreamResult<T>> {
    let response: Response;

    try {
        response = await fetch(request.url, {
            method: request.method ?? "GET",
            headers: {
                ...(request.body !== undefined && {
                    "Content-Type": "application/json",
                }),
                ...request.headers,
            },
            body:
                request.body === undefined
                    ? undefined
                    : JSON.stringify(request.body),
            signal: AbortSignal.timeout(request.timeoutMs),
        });
    } catch (e) {
        return unreachable(
            request.fallbackCode,
            e instanceof Error && e.name === "TimeoutError"
                ? `${request.service} did not respond in time`
                : `${request.service} is unreachable`,
        );
    }

    let body: unknown;

    try {
        body = await response.json();
    } catch (e) {
        if (e instanceof Error && e.name === "TimeoutError") {
            return unreachable(
                request.fallbackCode,
                `${request.service} did not respond in time`,
            );
        }

        body = undefined;
    }

    if (!response.ok) {
        const error = errorBodySchema.safeParse(body);

        return failureFromResponse(
            response,
            error.success && isErrorCode(error.data.error.code)
                ? error.data.error.code
                : request.fallbackCode,
            error.success
                ? error.data.error.message
                : `${request.service} responded with status ${response.status.toString()}`,
        );
    }

    const parsed = schema.safeParse(body);

    return parsed.success
        ? { ok: true, value: parsed.data }
        : malformed(
              request.malformedCode,
              `${request.service} returned an unexpected response`,
          );
}
```

Run the tests → PASS.

- [ ] **Step 4: Write the response schemas**

`src/clients/schemas.ts`:

```ts
import { md5HashSchema, modsSchema } from "@dpp/shared";
import { Modes, RankedStatus } from "@rian8337/osu-base";
import { z } from "zod";

const count = z.int().nonnegative();

/**
 * The processor's resolved score. Loose: fields this service does not read are kept.
 */
export const resolvedScoreSchema = z.looseObject({
    n300: count,
    n100: count,
    n50: count,
    nmiss: count,
    combo: count,
    sliderTicksMissed: count.optional(),
    sliderEndsDropped: count.optional(),
    totalScore: count.optional(),
    tapPenalty: z.number(),
    sliderCheesePenalty: z.number(),
});

/**
 * A processor's performance response, as the broker returns it. Only the fields this service reads are checked;
 * the parsed object keeps everything else, so it can be passed through unchanged.
 */
export const performanceBodySchema = z.looseObject({
    difficulty: z.looseObject({ mods: modsSchema }),
    performance: z.looseObject({ total: z.number().nonnegative() }),
    score: resolvedScoreSchema,
    strainChart: z.string().optional(),
});

export type PerformanceBody = z.infer<typeof performanceBodySchema>;

export const replayPerformanceBodySchema = performanceBodySchema.extend({
    replay: z.looseObject({
        hitError: z.unknown(),
        sliderTickInformation: z.unknown(),
        sliderEndInformation: z.unknown(),
    }),
});

export type ReplayPerformanceBody = z.infer<typeof replayPerformanceBodySchema>;

export const variantSummarySchema = z.looseObject({
    name: z.string(),
    mode: z.enum(Modes).nullable(),
});

/**
 * `GET /getbeatmap` of the beatmap service (osu! API v1 format). Only these fields are used.
 */
export const beatmapMetadataSchema = z.looseObject({
    file_md5: md5HashSchema,
    artist: z.string(),
    title: z.string(),
    creator: z.string(),
    version: z.string(),
    // osu! API v1 sends the status as a string ("1"); RankedStatus has number members.
    approved: z
        .string()
        .regex(/^-?\d+$/)
        .transform(Number)
        .pipe(z.enum(RankedStatus)),
});
```

- [ ] **Step 5: Write the failing client tests**

`tests/unit/clients/BrokerClient.test.ts` — a stub server recording requests; `new BrokerClient({ ...testConfig, broker: { url: server.url, apiKey: "broker-key" } })`. Cases:

1. `performance("live-droid", { beatmap: { hash }, mods: [], score: { n300: 1 } })` posts to `/variants/live-droid/performance` with `X-Api-Key: broker-key` and the JSON body, and returns the parsed body; a body with an extra field `foo: 1` keeps it (`expect(result.value.foo).toBe(1)`).
2. `replayPerformance` posts to `/variants/x/performance/replay`; a response without `replay` is `{ ok: false, kind: "rejected", status: 502, code: "PROCESSOR_ERROR" }`.
3. A variant name is URL-encoded in the path (`"a b"` → `/variants/a%20b/performance`).
4. `variantMode("live-osu")` reads `GET /variants/live-osu` → `{ ok: true, value: Modes.Osu }`; a second call within 5 minutes makes no request (count requests); with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(+5 min +1 ms)`, a third call requests again.
5. `variantMode` with `mode: null` → `{ ok: false, kind: "retry", status: 503, code: "VARIANT_UNAVAILABLE" }`, and is not cached.
6. `variantMode` for a `404 VARIANT_NOT_FOUND` → rejected with that code; not cached.

Response helper for the stub:

```ts
export function performanceBody(
    total: number,
    extra: Record<string, unknown> = {},
) {
    return {
        difficulty: { mods: [], starRating: 5 },
        performance: { total, aim: 1 },
        score: {
            n300: 100,
            n100: 0,
            n50: 0,
            nmiss: 0,
            combo: 200,
            tapPenalty: 1,
            sliderCheesePenalty: 1,
        },
        ...extra,
    };
}
```

Put it in `tests/utils/bodies.ts` (later tasks use it too), with `replayPerformanceBody(total, extra)` adding `replay: { hitError: null, sliderTickInformation: null, sliderEndInformation: null }`.

`tests/unit/clients/BeatmapServiceClient.test.ts`:

1. `getBeatmap("priority", hash)` requests `GET /getbeatmap?key=<key>&hash=<hash>` and returns `{ hash, title: "Artist - Title (Creator) [Version]", rankedStatus: 1 }` for `{ file_md5: hash, artist: "Artist", title: "Title", creator: "Creator", version: "Version", approved: "1" }`.
2. `"bulk"` uses the bulk key.
3. `404` → `{ ok: true, value: null }`.
4. `503` with `Retry-After: 30` → retry with `code: "BEATMAP_SERVICE_UNAVAILABLE"`, `retryAfterMs: 30000`.
5. A body with a different `file_md5` than requested → rejected (`502`, `BEATMAP_SERVICE_UNAVAILABLE` malformed code).
6. An unknown status (`approved: "9"`) or a non-numeric one (`"ranked"`) → rejected (`502`), like any malformed body.

`tests/unit/clients/DiscordMetadataClient.test.ts`:

1. `update("123")` posts `{ key, userId: "123" }` as JSON to the configured URL and returns `true` on `200`.
2. Returns `false` on `500` and on a refused connection.

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm --filter @dpp/score-service exec vitest run tests/unit/clients` → FAIL.

- [ ] **Step 7: Implement the clients**

`src/clients/BrokerClient.ts`:

```ts
import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { Modes } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import { requestJson, type JsonRequest } from "./http";
import type {
    IBrokerClient,
    PerformanceRequestInput,
    ReplayPerformanceRequestInput,
} from "./IBrokerClient";
import {
    performanceBodySchema,
    replayPerformanceBodySchema,
    variantSummarySchema,
    type PerformanceBody,
    type ReplayPerformanceBody,
} from "./schemas";

/**
 * Long enough for the broker's own retry of a slow processor (replay analysis with a strain chart).
 */
const timeoutMs = 70_000;
const modeCacheMs = 5 * 60 * 1000;

@Injectable(dependencyTokens.brokerClient)
export class BrokerClient implements IBrokerClient {
    private readonly modes = new Map<
        string,
        { mode: Modes; expiresAt: number }
    >();

    constructor(
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    performance(
        variant: string,
        request: PerformanceRequestInput,
    ): Promise<UpstreamResult<PerformanceBody>> {
        return requestJson(
            this.request(variant, "/performance", "POST", request),
            performanceBodySchema,
        );
    }

    replayPerformance(
        variant: string,
        request: ReplayPerformanceRequestInput,
    ): Promise<UpstreamResult<ReplayPerformanceBody>> {
        return requestJson(
            this.request(variant, "/performance/replay", "POST", request),
            replayPerformanceBodySchema,
        );
    }

    async variantMode(variant: string): Promise<UpstreamResult<Modes>> {
        const cached = this.modes.get(variant);

        if (cached && cached.expiresAt > Date.now()) {
            return { ok: true, value: cached.mode };
        }

        const result = await requestJson(
            this.request(variant, "", "GET"),
            variantSummarySchema,
        );

        if (!result.ok) {
            return result;
        }

        if (result.value.mode === null) {
            return {
                ok: false,
                kind: "retry",
                status: 503,
                code: "VARIANT_UNAVAILABLE",
                message: `Variant ${variant} has no available processor yet`,
            };
        }

        this.modes.set(variant, {
            mode: result.value.mode,
            expiresAt: Date.now() + modeCacheMs,
        });

        return { ok: true, value: result.value.mode };
    }

    private request(
        variant: string,
        path: string,
        method: "GET" | "POST",
        body?: unknown,
    ): JsonRequest {
        return {
            url: `${this.config.broker.url}/variants/${encodeURIComponent(variant)}${path}`,
            method,
            headers: { "X-Api-Key": this.config.broker.apiKey },
            body,
            timeoutMs,
            service: "Broker",
            fallbackCode: "BROKER_UNAVAILABLE",
            malformedCode: "PROCESSOR_ERROR",
        };
    }
}
```

`src/clients/BeatmapServiceClient.ts`:

```ts
const timeoutMs = 15_000;

@Injectable(dependencyTokens.beatmapServiceClient)
export class BeatmapServiceClient implements IBeatmapServiceClient {
    constructor(
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async getBeatmap(
        lane: BeatmapLane,
        hash: string,
    ): Promise<UpstreamResult<BeatmapInfo | null>> {
        const { url, key, bulkKey } = this.config.beatmapService;
        const requestUrl = new URL(`${url}/getbeatmap`);

        requestUrl.searchParams.set("key", lane === "bulk" ? bulkKey : key);
        requestUrl.searchParams.set("hash", hash);

        const result = await requestJson(
            {
                url: requestUrl.toString(),
                timeoutMs,
                service: "Beatmap service",
                fallbackCode: "BEATMAP_SERVICE_UNAVAILABLE",
                malformedCode: "BEATMAP_SERVICE_UNAVAILABLE",
            },
            beatmapMetadataSchema.refine(
                (beatmap) => beatmap.file_md5 === hash,
            ),
        );

        if (!result.ok) {
            // Only a real "not found" is 404; refusals and outages are 503 with Retry-After.
            return result.status === 404 ? { ok: true, value: null } : result;
        }

        const beatmap = result.value;

        return {
            ok: true,
            value: {
                hash: beatmap.file_md5,
                title: `${beatmap.artist} - ${beatmap.title} (${beatmap.creator}) [${beatmap.version}]`,
                rankedStatus: beatmap.approved,
            },
        };
    }
}
```

The title format is osu-base's `MapInfo.fullTitle`, which the old backend stored.

`src/clients/DiscordMetadataClient.ts`:

```ts
@Injectable(dependencyTokens.discordMetadataClient)
export class DiscordMetadataClient implements IDiscordMetadataClient {
    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async update(discordId: string): Promise<boolean> {
        const { url, key } = this.config.discordMetadata;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, userId: discordId }),
                signal: AbortSignal.timeout(10_000),
            });

            await response.body?.cancel();

            return response.ok;
        } catch {
            return false;
        }
    }
}
```

Interface files with doc comments; add tokens; `src/clients/index.ts` exports all three classes.

- [ ] **Step 8: Run and commit**

Run: `pnpm --filter @dpp/score-service test` → PASS.

```bash
pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Call the broker, beatmap service, and Discord backend"
```

---

### Task 8: Replay store, parsing, and validity

**Files:**

- Create: `src/replays/IReplayStore.ts`, `ReplayStore.ts`, `parseReplay.ts`, `replayValidity.ts`
- Modify: `src/dependencies/tokens.ts`
- Create: `tests/utils/fixtures.ts`, `tests/fixtures/replays/.gitkeep`
- Test: `tests/unit/replays/ReplayStore.test.ts`, `parseReplay.test.ts`, `replayValidity.test.ts`

**Interfaces:**

- Produces (why `ParsedReplay` rather than the analyzer's `ReplayData`: `ReplayData` is a class holding every cursor movement and hit object, which a parsed replay keeps alive in queues for as long as the item waits; its constructor needs a complete `ReplayInformation`, so tests cannot build one by hand; and its mods are a `ModMap`. `ParsedReplay` is a small plain value with only what this service reads, which tests construct directly):

```ts
export type ReplayFolder = "unprocessed" | "online" | "best" | "uncalculated";
export interface IReplayStore {
    /** The file's contents, or null if it does not exist. Other read errors throw. */
    read(folder: ReplayFolder, fileName: string): Promise<Buffer | null>;
    /** `<scoreId>.odr` in the online or best folder. */
    readScoreReplay(
        folder: "online" | "best",
        scoreId: number,
    ): Promise<Buffer | null>;
    /** Writes `<scoreId>.odr` to the best folder, readable by everyone (as the old code did). */
    writeBestReplay(scoreId: number, replay: Buffer): Promise<void>;
    /** Deletes `<scoreId>.odr` from the best folder; a missing file is not an error. */
    deleteBestReplay(scoreId: number): Promise<void>;
    /** File names in a folder (not directories). A missing folder throws. */
    list(folder: ReplayFolder): Promise<string[]>;
    /** Deletes a file; a missing file is not an error. */
    delete(folder: ReplayFolder, fileName: string): Promise<void>;
}

export interface HitCounts {
    readonly n300: number;
    readonly n100: number;
    readonly n50: number;
    readonly nmiss: number;
}
export interface ParsedReplay {
    readonly version: number;
    readonly hash: string;
    /** The `.osu` file name the replay names. */
    readonly fileName: string;
    readonly accuracy: HitCounts;
    readonly rank: string;
    readonly hit300k: number;
    readonly hit100k: number;
    /** Version 3 and later only. */
    readonly v3: {
        readonly score: number;
        readonly maxCombo: number;
        readonly mods: SerializedMod[];
        readonly playerName: string;
        readonly time: Date;
    } | null;
}
export function parseReplay(file: Buffer): Promise<ParsedReplay | null>;
export type ValidatedScore = Pick<
    ScoreRow,
    | "hash"
    | "perfect"
    | "good"
    | "bad"
    | "miss"
    | "score"
    | "combo"
    | "geki"
    | "katu"
    | "mark"
    | "mods"
>;
export function isReplayValid(
    score: ValidatedScore,
    replay: ParsedReplay,
): boolean;
```

- Token: `replayStore`.

- [ ] **Step 1: Write the failing store tests**

`tests/unit/replays/ReplayStore.test.ts` — each test makes four folders with `mkdtempDisposable(join(tmpdir(), "replays-"))` and builds `new ReplayStore({ ...testConfig, replayDirectories: { unprocessed, online, best, uncalculated } })`. Cases:

1. `read` returns the contents, and `null` for a missing file.
2. `readScoreReplay("online", 5)` reads `<online>/5.odr`; `"best"` reads from the best folder.
3. `writeBestReplay(5, buffer)` writes `<best>/5.odr` with mode `0o777` (`(await stat(path)).mode & 0o777` equals `0o777`), and overwrites an existing file.
4. `deleteBestReplay(6)` on a missing file resolves.
5. `list` returns file names only (a subdirectory is not listed).
6. `delete` removes a file; deleting again resolves.
7. `read("unprocessed", "../online/5.odr")` and `"a/b.odr"` throw `Error("Invalid replay file name: ...")` (no path traversal).

- [ ] **Step 2: Run, implement, run**

Run → FAIL. `src/replays/ReplayStore.ts`:

```ts
@Injectable(dependencyTokens.replayStore)
export class ReplayStore implements IReplayStore {
    constructor(
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async read(folder: ReplayFolder, fileName: string): Promise<Buffer | null> {
        try {
            return await readFile(this.path(folder, fileName));
        } catch (e) {
            if (isMissing(e)) {
                return null;
            }

            throw e;
        }
    }

    readScoreReplay(folder: "online" | "best", scoreId: number) {
        return this.read(folder, `${scoreId.toString()}.odr`);
    }

    async writeBestReplay(scoreId: number, replay: Buffer): Promise<void> {
        const path = this.path("best", `${scoreId.toString()}.odr`);

        await writeFile(path, replay, { mode: 0o777 });
        // The umask can strip bits from `mode`; set them explicitly, as the old code did.
        await chmod(path, 0o777);
    }

    deleteBestReplay(scoreId: number): Promise<void> {
        return this.delete("best", `${scoreId.toString()}.odr`);
    }

    async list(folder: ReplayFolder): Promise<string[]> {
        const entries = await readdir(this.config.replayDirectories[folder], {
            withFileTypes: true,
        });

        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
    }

    async delete(folder: ReplayFolder, fileName: string): Promise<void> {
        try {
            await unlink(this.path(folder, fileName));
        } catch (e) {
            if (!isMissing(e)) {
                throw e;
            }
        }
    }

    private path(folder: ReplayFolder, fileName: string): string {
        if (
            basename(fileName) !== fileName ||
            fileName === "." ||
            fileName === ".."
        ) {
            throw new Error(`Invalid replay file name: ${fileName}`);
        }

        return join(this.config.replayDirectories[folder], fileName);
    }
}

function isMissing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
```

Run → PASS.

- [ ] **Step 3: Write the failing validity tests**

`tests/unit/replays/replayValidity.test.ts`:

```ts
import type { ParsedReplay } from "@/replays/parseReplay";
import { isReplayValid } from "@/replays/replayValidity";
import { scoreRow, testHash } from "@test/utils/rows";
import { describe, expect, it } from "vitest";

const score = scoreRow({ mods: JSON.stringify([new ModHidden().serialize()]) });

function replay(overrides: Partial<ParsedReplay> = {}): ParsedReplay {
    return {
        version: 4,
        hash: testHash,
        fileName: "map.osu",
        accuracy: {
            n300: score.perfect,
            n100: score.good,
            n50: score.bad,
            nmiss: score.miss,
        },
        rank: score.mark!,
        hit300k: score.geki,
        hit100k: score.katu,
        v3: {
            score: score.score,
            maxCombo: score.combo,
            mods: [new ModHidden().serialize()],
            playerName: "player",
            time: new Date(),
        },
        ...overrides,
    };
}

describe("isReplayValid", () => {
    it("accepts a v3+ replay matching every field", () => {
        expect(isReplayValid(score, replay())).toBe(true);
    });

    it("accepts a v1/v2 replay matching hash and hit counts", () => {
        expect(
            isReplayValid(
                score,
                replay({ version: 2, v3: null, rank: "D", hit300k: 0 }),
            ),
        ).toBe(true);
    });

    it.each<[string, Partial<ParsedReplay>]>([
        ["another beatmap", { hash: "f".repeat(32) }],
        [
            "other hit counts",
            { accuracy: { n300: 1, n100: 0, n50: 0, nmiss: 0 } },
        ],
        [
            "no hits at all",
            { accuracy: { n300: 0, n100: 0, n50: 0, nmiss: 5 } },
        ],
        ["another rank", { rank: "A" }],
        ["other geki", { hit300k: 1 }],
        ["other katu", { hit100k: 1 }],
    ])("rejects %s", (_name, overrides) => {
        expect(isReplayValid(score, replay(overrides))).toBe(false);
    });

    it.each<[string, Partial<NonNullable<ParsedReplay["v3"]>>]>([
        ["another score", { score: 1 }],
        ["another combo", { maxCombo: 1 }],
        ["other mods", { mods: [new ModHardRock().serialize()] }],
    ])("rejects a v3 replay with %s", (_name, overrides) => {
        expect(
            isReplayValid(
                score,
                replay({ v3: { ...replay().v3!, ...overrides } }),
            ),
        ).toBe(false);
    });

    it("compares mods by meaning, not by order", () => {
        const both = scoreRow({
            ...score,
            mods: JSON.stringify([
                new ModHidden().serialize(),
                new ModDoubleTime().serialize(),
            ]),
        });

        expect(
            isReplayValid(
                both,
                replay({
                    v3: {
                        ...replay().v3!,
                        mods: [
                            new ModDoubleTime().serialize(),
                            new ModHidden().serialize(),
                        ],
                    },
                }),
            ),
        ).toBe(true);
    });

    it("rejects a score whose mods column is unreadable", () => {
        expect(
            isReplayValid(scoreRow({ ...score, mods: "not json" }), replay()),
        ).toBe(false);
    });
});
```

- [ ] **Step 4: Run, implement, run**

Run → FAIL. `src/replays/replayValidity.ts` (port of the old backend's `isReplayValid`):

```ts
import type { ScoreRow } from "@/official/types";
import { modsSchema } from "@dpp/shared";
import { Accuracy, ModUtil } from "@rian8337/osu-base";
import type { ParsedReplay } from "./parseReplay";

export type ValidatedScore = Pick<
    ScoreRow,
    | "hash"
    | "perfect"
    | "good"
    | "bad"
    | "miss"
    | "score"
    | "combo"
    | "geki"
    | "katu"
    | "mark"
    | "mods"
>;

/**
 * Whether a replay belongs to a score. Version 1 and 2 replays record little, so only the beatmap and hit counts are
 * compared; version 3 and later also compare score, combo, geki, katu, rank, and mods.
 */
export function isReplayValid(
    score: ValidatedScore,
    replay: ParsedReplay,
): boolean {
    const counts = replay.accuracy;

    if (
        score.hash !== replay.hash ||
        (score.perfect ?? 0) !== counts.n300 ||
        (score.good ?? 0) !== counts.n100 ||
        (score.bad ?? 0) !== counts.n50 ||
        (score.miss ?? 0) !== counts.nmiss ||
        // A replay without any hit is empty.
        new Accuracy(counts).value === 0
    ) {
        return false;
    }

    if (!replay.v3) {
        return true;
    }

    if (
        score.score !== replay.v3.score ||
        (score.combo ?? 0) !== replay.v3.maxCombo ||
        (score.geki ?? 0) !== replay.hit300k ||
        (score.katu ?? 0) !== replay.hit100k ||
        score.mark !== replay.rank
    ) {
        return false;
    }

    const scoreMods = parseModsColumn(score.mods);

    return (
        scoreMods !== null &&
        ModUtil.deserializeMods(scoreMods).equals(
            ModUtil.deserializeMods(replay.v3.mods),
        )
    );
}

/**
 * Parses a `mods` column (serialized mods as JSON). `null` if unreadable.
 */
export function parseModsColumn(mods: string) {
    try {
        const parsed = modsSchema.safeParse(JSON.parse(mods));

        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
```

The v1/v2 test sets `rank: "D"` and `hit300k: 0`: the old code compared rank and geki only for v3, and this test pins that.

Run → PASS.

- [ ] **Step 5: Implement `parseReplay` with fixture-gated tests**

`src/replays/parseReplay.ts`:

```ts
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";

// (ParsedReplay and HitCounts interfaces from Interfaces, with doc comments)

/**
 * Reads a replay's header and score data. Never throws: an unreadable replay gives `null`.
 */
export async function parseReplay(file: Buffer): Promise<ParsedReplay | null> {
    const analyzer = new ReplayAnalyzer();

    analyzer.originalODR = file;

    try {
        await analyzer.analyze();
    } catch {
        return null;
    }

    const { data } = analyzer;

    if (!data) {
        return null;
    }

    return {
        version: data.replayVersion,
        hash: data.hash,
        fileName: data.fileName,
        accuracy: {
            n300: data.accuracy.n300,
            n100: data.accuracy.n100,
            n50: data.accuracy.n50,
            nmiss: data.accuracy.nmiss,
        },
        rank: data.rank,
        hit300k: data.hit300k,
        hit100k: data.hit100k,
        v3: data.isReplayV3()
            ? {
                  score: data.score,
                  maxCombo: data.maxCombo,
                  mods: data.convertedMods.serializeMods(),
                  playerName: data.playerName,
                  time: data.time,
              }
            : null,
    };
}
```

`tests/utils/fixtures.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));

/**
 * A replay fixture provided by the user, or null while it is missing (tests using it are skipped).
 * Expected: `replays/v3.odr` (version 3 or later, `replayVersion > 6`) and optionally `replays/v2.odr`.
 */
export function readReplayFixture(name: "v3" | "v2"): Buffer | null {
    const path = `${fixtures}replays/${name}.odr`;

    return existsSync(path) ? readFileSync(path) : null;
}
```

`tests/unit/replays/parseReplay.test.ts`:

```ts
const v3 = readReplayFixture("v3");

describe("parseReplay", () => {
    it("returns null for bytes that are not a replay", async () => {
        expect(await parseReplay(Buffer.from("not a replay"))).toBeNull();
        expect(await parseReplay(Buffer.alloc(0))).toBeNull();
    });

    it.skipIf(!v3)("reads a v3 replay", async () => {
        const parsed = await parseReplay(v3!);

        expect(parsed?.v3).not.toBeNull();
        expect(parsed?.hash).toMatch(/^[0-9a-f]{32}$/);
        expect(parsed?.v3?.playerName.length).toBeGreaterThan(0);
    });

    it.skipIf(!v3)("returns null for a truncated replay", async () => {
        expect(
            await parseReplay(v3!.subarray(0, Math.floor(v3!.length / 2))),
        ).toBeNull();
    });
});
```

If the truncated-replay test shows that the analyzer returns partial data instead of failing, keep the behavior (return what it parsed) and change that test to assert only that no exception escapes; report it.

- [ ] **Step 6: Run and commit**

Run: `pnpm --filter @dpp/score-service test` → PASS (fixture tests skipped).

```bash
pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Store, parse, and validate replays"
```

---

### Task 9: Score calculator, user totals, and pp multipliers

**Files:**

- Create: `src/services/IScoreCalculator.ts`, `ScoreCalculator.ts`, `ppMultiplier.ts`, `userTotals.ts`, `src/services/index.ts`
- Modify: `src/dependencies/tokens.ts`
- Create: `tests/utils/fakes/brokerClient.ts`, `tests/utils/fakes/index.ts` (re-exports; later tasks add one file per fake)
- Test: `tests/unit/services/ScoreCalculator.test.ts`, `ppMultiplier.test.ts`, `userTotals.test.ts`

**Interfaces:**

- Consumes: `IBrokerClient` (Task 7), `ScoreStats` (Task 5), `parseModsColumn` (Task 8).
- Produces:

```ts
export interface StatsOptions {
    readonly strainChart?: boolean;
}
export interface ReplayOptions {
    /** For replays that do not record mods (v1/v2): the score's mods and stats override the replay's. */
    readonly overrides?: ScoreStats;
    readonly strainChart?: boolean;
}
export interface IScoreCalculator {
    /** Calculates a score from stored stats: hit counts, combo, `score` as total score, slider hit counts (when all four are recorded), and mods. */
    calculateStats(
        variant: string,
        stats: ScoreStats,
        options?: StatsOptions,
    ): Promise<UpstreamResult<PerformanceBody>>;
    calculateReplay(
        variant: string,
        replay: Buffer,
        options?: ReplayOptions,
    ): Promise<UpstreamResult<ReplayPerformanceBody>>;
    /** The total without tap and slider cheese penalties and without total score, for the resolved score of an earlier calculation. */
    noPenaltyTotal(
        variant: string,
        hash: string,
        calculation: PerformanceBody,
    ): Promise<UpstreamResult<number>>;
}

// ppMultiplier.ts
/** How a stored pp_multiplier is applied: missing means 1, never above 1. */
export function effectiveMultiplier(stored: number | null | undefined): number;
/** pp ÷ no-penalty total, or 1 when the no-penalty total is 0. */
export function ppMultiplierFrom(pp: number, noPenaltyTotal: number): number;

// userTotals.ts
/** Total pp and accuracy from best scores sorted by pp descending, weighted 0.95^i. Accuracy 1 when empty. */
export function calculateUserTotals(
    scores: readonly { pp: number; accuracy: number }[],
): UserTotals;
```

- Token: `scoreCalculator`.

- [ ] **Step 1: Write the failing pure-function tests**

`tests/unit/services/ppMultiplier.test.ts`:

```ts
describe("effectiveMultiplier", () => {
    it.each([
        [null, 1],
        [undefined, 1],
        [0.8, 0.8],
        [1, 1],
        [1.2, 1],
    ])("%s → %s", (stored, expected) => {
        expect(effectiveMultiplier(stored)).toBe(expected);
    });
});

describe("ppMultiplierFrom", () => {
    it("divides pp by the no-penalty total", () => {
        expect(ppMultiplierFrom(80, 100)).toBe(0.8);
    });

    it("is 1 when the no-penalty total is 0", () => {
        expect(ppMultiplierFrom(0, 0)).toBe(1);
    });
});
```

`tests/unit/services/userTotals.test.ts`:

```ts
describe("calculateUserTotals", () => {
    it("weights by 0.95^i", () => {
        const totals = calculateUserTotals([
            { pp: 100, accuracy: 1 },
            { pp: 50, accuracy: 0.5 },
        ]);

        // Weights are 0.95^0 = 1 and 0.95^1 = 0.95, so they add up to 1.95.
        const weights = 1 + 0.95;

        expect(totals.pp).toBeCloseTo(100 * 1 + 50 * 0.95);
        expect(totals.accuracy).toBeCloseTo((1 * 1 + 0.5 * 0.95) / weights);
    });

    it("gives 0 pp and accuracy 1 without scores", () => {
        expect(calculateUserTotals([])).toEqual({ pp: 0, accuracy: 1 });
    });

    it("uses the first 100 scores only", () => {
        const scores = Array.from({ length: 150 }, () => ({
            pp: 1,
            accuracy: 1,
        }));
        const expected = Array.from(
            { length: 100 },
            (_, i) => 0.95 ** i,
        ).reduce((a, b) => a + b);

        expect(calculateUserTotals(scores).pp).toBeCloseTo(expected);
    });
});
```

- [ ] **Step 2: Run, implement, run**

Run → FAIL. Implement:

```ts
// src/services/ppMultiplier.ts
export function effectiveMultiplier(stored: number | null | undefined): number {
    return Math.min(stored ?? 1, 1);
}

export function ppMultiplierFrom(pp: number, noPenaltyTotal: number): number {
    return noPenaltyTotal === 0 ? 1 : pp / noPenaltyTotal;
}
```

```ts
// src/services/userTotals.ts
import type { UserTotals } from "@/official/types";

/**
 * How many best scores count toward a player's totals.
 */
export const countedBestScores = 100;

export function calculateUserTotals(
    scores: readonly { pp: number; accuracy: number }[],
): UserTotals {
    let pp = 0;
    let accuracy = 0;
    let weight = 0;

    for (const [i, score] of scores.slice(0, countedBestScores).entries()) {
        const multiplier = 0.95 ** i;

        pp += score.pp * multiplier;
        accuracy += score.accuracy * multiplier;
        weight += multiplier;
    }

    return { pp, accuracy: weight > 0 ? accuracy / weight : 1 };
}
```

Run → PASS.

- [ ] **Step 3: Write the fake broker**

`tests/utils/fakes/brokerClient.ts` (and `tests/utils/fakes/index.ts` with `export * from "./brokerClient";`):

```ts
import type {
    IBrokerClient,
    PerformanceRequestInput,
    ReplayPerformanceRequestInput,
} from "@/clients/IBrokerClient";
import type { PerformanceBody, ReplayPerformanceBody } from "@/clients/schemas";
import type { UpstreamResult } from "@/types/upstream";
import { Modes } from "@rian8337/osu-base";

export type BrokerCall =
    | { kind: "performance"; variant: string; request: PerformanceRequestInput }
    | {
          kind: "replay";
          variant: string;
          request: ReplayPerformanceRequestInput;
      };

/**
 * A broker that answers with scripted handlers and records every call.
 */
export class FakeBrokerClient implements IBrokerClient {
    readonly calls: BrokerCall[] = [];
    modes = new Map<string, Modes>([
        ["live-droid", Modes.Droid],
        ["live-osu", Modes.Osu],
    ]);

    constructor(
        public onPerformance: (
            variant: string,
            request: PerformanceRequestInput,
        ) => UpstreamResult<PerformanceBody> = () => {
            throw new Error("Unexpected performance call");
        },
        public onReplay: (
            variant: string,
            request: ReplayPerformanceRequestInput,
        ) => UpstreamResult<ReplayPerformanceBody> = () => {
            throw new Error("Unexpected replay call");
        },
    ) {}

    performance(variant: string, request: PerformanceRequestInput) {
        this.calls.push({ kind: "performance", variant, request });
        return Promise.resolve(this.onPerformance(variant, request));
    }

    replayPerformance(variant: string, request: ReplayPerformanceRequestInput) {
        this.calls.push({ kind: "replay", variant, request });
        return Promise.resolve(this.onReplay(variant, request));
    }

    variantMode(variant: string): Promise<UpstreamResult<Modes>> {
        const mode = this.modes.get(variant);

        return Promise.resolve(
            mode
                ? { ok: true, value: mode }
                : {
                      ok: false,
                      kind: "rejected",
                      status: 404,
                      code: "VARIANT_NOT_FOUND",
                      message: `No variant ${variant}`,
                  },
        );
    }
}

export const retryLater = {
    ok: false,
    kind: "retry",
    status: 503,
    code: "VARIANT_UNAVAILABLE",
    message: "busy",
} as const;

export const beatmapNotFound = {
    ok: false,
    kind: "rejected",
    status: 404,
    code: "BEATMAP_NOT_FOUND",
    message: "No beatmap",
} as const;
```

`tests/utils/bodies.ts` already has `performanceBody` and `replayPerformanceBody` (Task 7); make them return types `PerformanceBody` / `ReplayPerformanceBody` (cast through the schemas' `parse` so they are validated).

- [ ] **Step 4: Write the failing calculator tests**

`tests/unit/services/ScoreCalculator.test.ts`:

```ts
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { performanceBody, replayPerformanceBody } from "@test/utils/bodies";
import { FakeBrokerClient } from "@test/utils/fakes";
import { scoreRow, testHash } from "@test/utils/rows";
import { describe, expect, it } from "vitest";

describe("ScoreCalculator", () => {
    it("calculates stored stats with slider hit counts and total score", async () => {
        const broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(100),
        }));
        const calculator = new ScoreCalculator(broker);
        // The generated total score (score × score multiplier) is sent, as the game sends total_score.
        const stats = scoreRow({
            mods: JSON.stringify([new ModHidden().serialize()]),
            score: 1_000_000,
            scoreMultiplier: 1.1,
        });

        const result = await calculator.calculateStats("live-droid", stats, {
            strainChart: true,
        });

        expect(result.ok).toBe(true);
        expect(broker.calls).toEqual([
            {
                kind: "performance",
                variant: "live-droid",
                request: {
                    beatmap: { hash: testHash },
                    mods: [new ModHidden().serialize()],
                    score: {
                        n300: 400,
                        n100: 20,
                        n50: 2,
                        nmiss: 1,
                        combo: 500,
                        totalScore: 1_100_000,
                        sliderHeadHits: 100,
                        sliderTickHits: 200,
                        sliderRepeatHits: 10,
                        sliderEndHits: 99,
                    },
                    strainChart: true,
                },
            },
        ]);
    });

    it("leaves slider hit counts out unless all four are recorded", async () => {
        const broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(1),
        }));

        await new ScoreCalculator(broker).calculateStats(
            "v",
            scoreRow({ sliderTickHit: null }),
        );

        const call = broker.calls[0];

        expect(
            call?.kind === "performance" && call.request.score,
        ).not.toHaveProperty("sliderHeadHits");
    });

    it("fails permanently, without calling the broker, for unreadable mods", async () => {
        const broker = new FakeBrokerClient();

        expect(
            await new ScoreCalculator(broker).calculateStats(
                "v",
                scoreRow({ mods: "{" }),
            ),
        ).toEqual({
            ok: false,
            kind: "rejected",
            status: 422,
            code: "INVALID_REQUEST",
            message: "The score's mods are unreadable",
        });
        expect(broker.calls).toEqual([]);
    });

    it("sends a replay base64-encoded", async () => {
        const broker = new FakeBrokerClient(undefined, () => ({
            ok: true,
            value: replayPerformanceBody(5),
        }));

        await new ScoreCalculator(broker).calculateReplay(
            "v",
            Buffer.from("odr"),
        );

        expect(broker.calls[0]).toEqual({
            kind: "replay",
            variant: "v",
            request: {
                replay: Buffer.from("odr").toString("base64"),
                strainChart: false,
            },
        });
    });

    it("overrides an old replay's mods and stats with the score's", async () => {
        const broker = new FakeBrokerClient(undefined, () => ({
            ok: true,
            value: replayPerformanceBody(5),
        }));

        await new ScoreCalculator(broker).calculateReplay(
            "v",
            Buffer.from("odr"),
            {
                overrides: scoreRow({
                    mods: JSON.stringify([new ModDoubleTime().serialize()]),
                }),
            },
        );

        expect(broker.calls[0]).toMatchObject({
            request: {
                mods: [new ModDoubleTime().serialize()],
                score: {
                    n300: 400,
                    n100: 20,
                    n50: 2,
                    nmiss: 1,
                    combo: 500,
                    sliderHeadHits: 100,
                    sliderTickHits: 200,
                    sliderRepeatHits: 10,
                    sliderEndHits: 99,
                },
            },
        });
        // Old replays never carried a total score, so none is sent.
        const call = broker.calls[0];
        expect(
            call?.kind === "replay" && call.request.score,
        ).not.toHaveProperty("totalScore");
    });

    it("calculates the no-penalty total from a resolved score", async () => {
        const broker = new FakeBrokerClient(() => ({
            ok: true,
            value: performanceBody(120),
        }));
        const earlier = performanceBody(100, {
            difficulty: { mods: [new ModHardRock().serialize()] },
            score: {
                n300: 9,
                n100: 1,
                n50: 0,
                nmiss: 0,
                combo: 30,
                sliderTicksMissed: 2,
                sliderEndsDropped: 1,
                totalScore: 5000,
                tapPenalty: 1.5,
                sliderCheesePenalty: 0.9,
            },
        });

        expect(
            await new ScoreCalculator(broker).noPenaltyTotal(
                "v",
                testHash,
                earlier,
            ),
        ).toEqual({ ok: true, value: 120 });
        expect(broker.calls[0]).toEqual({
            kind: "performance",
            variant: "v",
            request: {
                beatmap: { hash: testHash },
                mods: [new ModHardRock().serialize()],
                score: {
                    n300: 9,
                    n100: 1,
                    n50: 0,
                    nmiss: 0,
                    combo: 30,
                    sliderTicksMissed: 2,
                    sliderEndsDropped: 1,
                    tapPenalty: 1,
                    sliderCheesePenalty: 1,
                },
            },
        });
    });

    it("passes broker failures through", async () => {
        const failure = {
            ok: false,
            kind: "retry",
            status: 503,
            code: "VARIANT_UNAVAILABLE",
            message: "m",
        } as const;
        const broker = new FakeBrokerClient(() => failure);

        expect(
            await new ScoreCalculator(broker).calculateStats("v", scoreRow()),
        ).toEqual(failure);
    });
});
```

- [ ] **Step 5: Run, implement, run**

Run → FAIL. `src/services/ScoreCalculator.ts`:

```ts
import type { IBrokerClient } from "@/clients/IBrokerClient";
import type { PerformanceBody, ReplayPerformanceBody } from "@/clients/schemas";
import { dependencyTokens } from "@/dependencies/tokens";
import type { ScoreStats } from "@/official/types";
import { parseModsColumn } from "@/replays/replayValidity";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import type { ScoreParameters } from "@dpp/shared";
import { inject } from "tsyringe";
import type {
    IScoreCalculator,
    ReplayOptions,
    StatsOptions,
} from "./IScoreCalculator";

@Injectable(dependencyTokens.scoreCalculator)
export class ScoreCalculator implements IScoreCalculator {
    constructor(
        @inject(dependencyTokens.brokerClient)
        private readonly broker: IBrokerClient,
    ) {}

    calculateStats(
        variant: string,
        stats: ScoreStats,
        options: StatsOptions = {},
    ): Promise<UpstreamResult<PerformanceBody>> {
        const mods = parseModsColumn(stats.mods);

        if (!mods) {
            return Promise.resolve(unreadableMods());
        }

        return this.broker.performance(variant, {
            beatmap: { hash: stats.hash },
            mods,
            score: {
                ...statsParameters(stats),
                ...(stats.totalScore !== null && {
                    totalScore: stats.totalScore,
                }),
            },
            strainChart: options.strainChart ?? false,
        });
    }

    calculateReplay(
        variant: string,
        replay: Buffer,
        options: ReplayOptions = {},
    ): Promise<UpstreamResult<ReplayPerformanceBody>> {
        const { overrides } = options;
        const mods = overrides ? parseModsColumn(overrides.mods) : undefined;

        if (mods === null) {
            return Promise.resolve(unreadableMods());
        }

        return this.broker.replayPerformance(variant, {
            replay: replay.toString("base64"),
            ...(overrides && { mods, score: statsParameters(overrides) }),
            strainChart: options.strainChart ?? false,
        });
    }

    async noPenaltyTotal(
        variant: string,
        hash: string,
        calculation: PerformanceBody,
    ): Promise<UpstreamResult<number>> {
        const { score } = calculation;
        const result = await this.broker.performance(variant, {
            beatmap: { hash },
            mods: calculation.difficulty.mods,
            score: {
                n300: score.n300,
                n100: score.n100,
                n50: score.n50,
                nmiss: score.nmiss,
                combo: score.combo,
                ...(score.sliderTicksMissed !== undefined && {
                    sliderTicksMissed: score.sliderTicksMissed,
                }),
                ...(score.sliderEndsDropped !== undefined && {
                    sliderEndsDropped: score.sliderEndsDropped,
                }),
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            },
        });

        return result.ok
            ? { ok: true, value: result.value.performance.total }
            : result;
    }
}

/**
 * Hit counts, combo, and (when all four are recorded) slider hit counts from a stored score.
 */
function statsParameters(stats: ScoreStats): ScoreParameters {
    const { sliderHeadHit, sliderTickHit, sliderRepeatHit, sliderEndHit } =
        stats;

    return {
        n300: stats.perfect ?? 0,
        n100: stats.good ?? 0,
        n50: stats.bad ?? 0,
        nmiss: stats.miss ?? 0,
        combo: stats.combo ?? 0,
        ...(sliderHeadHit !== null &&
            sliderTickHit !== null &&
            sliderRepeatHit !== null &&
            sliderEndHit !== null && {
                sliderHeadHits: sliderHeadHit,
                sliderTickHits: sliderTickHit,
                sliderRepeatHits: sliderRepeatHit,
                sliderEndHits: sliderEndHit,
            }),
    };
}

function unreadableMods() {
    return {
        ok: false,
        kind: "rejected",
        status: 422,
        code: "INVALID_REQUEST",
        message: "The score's mods are unreadable",
    } as const;
}
```

`IScoreCalculator.ts` with the interface and options from **Interfaces**; token `scoreCalculator`; `src/services/index.ts` exports `ScoreCalculator`.

Run → PASS.

- [ ] **Step 6: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Build broker calculations from scores and replays"
```

---

### Task 10: Best score writer

**Files:**

- Create: `src/services/IBestScoreWriter.ts`, `src/services/BestScoreWriter.ts`
- Modify: `src/services/index.ts`, `src/dependencies/tokens.ts`
- Create: `tests/utils/fakes/officialScoreRepository.ts`, `tests/utils/fakes/replayStore.ts` (and re-export both from `tests/utils/fakes/index.ts`)
- Test: `tests/unit/services/BestScoreWriter.test.ts`, `tests/unit/utils/fakes.test.ts`

**Interfaces:**

- Consumes: `IOfficialScoreRepository`, `ScoreColumns`, `scoreColumns` (Task 5); `IReplayStore` (Task 8); `IScoreCalculator`, `effectiveMultiplier` (Task 9); `requireValue` (Task 3).
- Produces:

```ts
export interface BestScoreCandidate {
    /** The score's own columns, including its ID (the best row takes it). */
    readonly score: ScoreColumns;
    readonly pp: number;
    /** Stored on the best row as is. */
    readonly ppMultiplier: number;
    /** Stored as the best row's `filename`. */
    readonly title: string;
    /** Copied to the best folder when the candidate wins; null records the row without a replay. */
    readonly replay: Buffer | null;
}
export interface BestScoreOutcome {
    readonly changed: boolean;
    /** Best replays of rows this call deleted. Remove them with `removeReplays` after the transaction commits. */
    readonly staleReplayIds: readonly number[];
}
export interface IBestScoreWriter {
    /** Applies the one-best-per-beatmap rule in the caller's transaction (`repository` must be bound to it). Throws RetryLaterError when the current best cannot be recalculated now. */
    consider(
        repository: IOfficialScoreRepository,
        candidate: BestScoreCandidate,
    ): Promise<BestScoreOutcome>;
    removeReplays(ids: readonly number[]): Promise<void>;
}

// tests/utils/fakes/officialScoreRepository.ts
export class InMemoryOfficialScoreRepository implements IOfficialScoreRepository {
    scores;
    bestScores;
    uncalculatedScores;
    users;
    lockedUsers: number[];
}
export class InMemoryReplayStore implements IReplayStore {
    files: Map<ReplayFolder, Map<string, Buffer>>;
}
```

- Token: `bestScoreWriter`.

`consider` takes the repository as a parameter instead of injecting it: it must write inside the caller's transaction, and only the caller holds the repository bound to that transaction (`IOfficialScoreRepository.transaction` hands it out). An injected repository would write outside the transaction, so a rollback would leave half-written best rows.

Deleting old replay files only after the commit is a refinement of the spec's step 2 (it deletes the previous best's replay inside the same item): if the transaction rolled back, the restored row would otherwise point at a deleted file.

- [ ] **Step 1: Write the fakes**

`tests/utils/fakes/officialScoreRepository.ts` holds `InMemoryOfficialScoreRepository` and `tests/utils/fakes/replayStore.ts` holds `InMemoryReplayStore` (one block below; split it at the `Replay folders in memory` comment):

```ts
/**
 * The official repository in memory. `transaction` restores every table if the work throws.
 */
export class InMemoryOfficialScoreRepository implements IOfficialScoreRepository {
    scores: ScoreRow[] = [];
    bestScores: BestScoreRow[] = [];
    uncalculatedScores: UncalculatedScoreRow[] = [];
    users: {
        id: number;
        username: string;
        pp: number;
        accuracy: number;
        lastLoginTime: Date | null;
    }[] = [];
    readonly lockedUsers: number[] = [];

    async transaction<T>(
        work: (repository: IOfficialScoreRepository) => Promise<T>,
    ): Promise<T> {
        const snapshot = structuredClone({
            scores: this.scores,
            bestScores: this.bestScores,
            uncalculatedScores: this.uncalculatedScores,
            users: this.users,
        });

        try {
            return await work(this);
        } catch (e) {
            Object.assign(this, snapshot);
            throw e;
        }
    }

    findScoreById(id: number) {
        return Promise.resolve(this.scores.find((s) => s.id === id) ?? null);
    }

    findScore(uid: number, hash: string) {
        return Promise.resolve(
            this.scores.find((s) => s.uid === uid && s.hash === hash) ?? null,
        );
    }

    findBestScores(uid: number, hash: string) {
        return Promise.resolve(
            this.bestScores
                .filter((s) => s.uid === uid && s.hash === hash)
                .sort((a, b) => b.pp - a.pp || a.id - b.id),
        );
    }

    findUncalculatedScore(replayFilename: string) {
        return Promise.resolve(
            this.uncalculatedScores.find(
                (s) => s.replayfilename === replayFilename,
            ) ?? null,
        );
    }

    deleteUncalculatedScore(replayFilename: string) {
        this.uncalculatedScores = this.uncalculatedScores.filter(
            (s) => s.replayfilename !== replayFilename,
        );
        return Promise.resolve();
    }

    findUserId(username: string) {
        return Promise.resolve(
            this.users.find((u) => u.username === username)?.id ?? null,
        );
    }

    findUserLastLogin(uid: number) {
        const user = this.users.find((u) => u.id === uid);
        return Promise.resolve(
            user ? { lastLoginTime: user.lastLoginTime } : null,
        );
    }

    lockUser(uid: number) {
        this.lockedUsers.push(uid);
        return Promise.resolve();
    }

    setScorePP(id: number, pp: number | null) {
        for (const score of this.scores.filter((s) => s.id === id)) {
            score.pp = pp;
        }
        return Promise.resolve();
    }

    setBestScorePP(id: number, pp: number) {
        for (const score of this.bestScores.filter((s) => s.id === id)) {
            score.pp = pp;
        }
        return Promise.resolve();
    }

    deleteBestScores(uid: number, hash: string, keepId?: number) {
        const deleted = this.bestScores.filter(
            (s) => s.uid === uid && s.hash === hash && s.id !== keepId,
        );
        this.bestScores = this.bestScores.filter((s) => !deleted.includes(s));
        return Promise.resolve(deleted.map((s) => s.id));
    }

    insertBestScore(row: BestScoreInsert) {
        // `id` is the table's primary key in production.
        if (this.bestScores.some((s) => s.id === row.id)) {
            return Promise.reject(
                new Error(`Duplicate best score ID ${String(row.id)}`),
            );
        }

        this.bestScores.push(bestScoreRow(row));
        return Promise.resolve();
    }

    topBestScores(uid: number, limit: number) {
        return Promise.resolve(
            this.bestScores
                .filter((s) => s.uid === uid)
                .sort((a, b) => b.pp - a.pp)
                .slice(0, limit)
                .map(({ pp, accuracy }) => ({ pp, accuracy: accuracy ?? 0 })),
        );
    }

    setUserTotals(uid: number, totals: UserTotals) {
        const user = this.users.find((u) => u.id === uid);
        if (user) {
            user.pp = totals.pp;
            user.accuracy = totals.accuracy;
        }
        return Promise.resolve();
    }
}

/**
 * Replay folders in memory.
 */
export class InMemoryReplayStore implements IReplayStore {
    readonly files = new Map<ReplayFolder, Map<string, Buffer>>(
        (["unprocessed", "online", "best", "uncalculated"] as const).map(
            (folder) => [folder, new Map()],
        ),
    );

    put(folder: ReplayFolder, fileName: string, contents: Buffer | string) {
        this.files.get(folder)!.set(fileName, Buffer.from(contents));
    }

    read(folder: ReplayFolder, fileName: string) {
        return Promise.resolve(this.files.get(folder)!.get(fileName) ?? null);
    }

    readScoreReplay(folder: "online" | "best", scoreId: number) {
        return this.read(folder, `${scoreId.toString()}.odr`);
    }

    writeBestReplay(scoreId: number, replay: Buffer) {
        this.put("best", `${scoreId.toString()}.odr`, replay);
        return Promise.resolve();
    }

    deleteBestReplay(scoreId: number) {
        return this.delete("best", `${scoreId.toString()}.odr`);
    }

    list(folder: ReplayFolder) {
        return Promise.resolve([...this.files.get(folder)!.keys()]);
    }

    delete(folder: ReplayFolder, fileName: string) {
        this.files.get(folder)!.delete(fileName);
        return Promise.resolve();
    }
}
```

`bestScoreRow(row)` (from `tests/utils/rows.ts`) fills defaults for omitted insert columns and generates `totalScore` as the database would; insert rows always carry every column in these tests. Add a short `tests/unit/utils/fakes.test.ts` checking that `transaction` restores the tables after a throw and keeps changes after success.

- [ ] **Step 2: Write the failing writer tests**

`tests/unit/services/BestScoreWriter.test.ts`:

```ts
import { scoreColumns } from "@/official/types";
import { BestScoreWriter } from "@/services/BestScoreWriter";
import { ScoreCalculator } from "@/services/ScoreCalculator";
import { RetryLaterError } from "@/types/errors";
import { performanceBody } from "@test/utils/bodies";
import { testConfig } from "@test/utils/config";
import {
    FakeBrokerClient,
    InMemoryOfficialScoreRepository,
    InMemoryReplayStore,
    beatmapNotFound,
    retryLater,
} from "@test/utils/fakes";
import { bestScoreRow, scoreRow, testHash } from "@test/utils/rows";
import { describe, expect, it, vi } from "vitest";

function setup(
    currentTotal: () => ReturnType<FakeBrokerClient["onPerformance"]> = () => ({
        ok: true,
        value: performanceBody(100),
    }),
) {
    const repository = new InMemoryOfficialScoreRepository();
    const replays = new InMemoryReplayStore();
    const broker = new FakeBrokerClient(currentTotal);
    const writer = new BestScoreWriter(
        new ScoreCalculator(broker),
        replays,
        testConfig,
    );

    return { repository, replays, broker, writer };
}

function candidate(
    id: number,
    pp: number,
    replay: Buffer | null = Buffer.from(`replay ${id.toString()}`),
) {
    return {
        score: scoreColumns(scoreRow({ id })),
        pp,
        ppMultiplier: 0.9,
        title: "New Title",
        replay,
    };
}

describe("BestScoreWriter", () => {
    it("records the candidate when there is no best score", async () => {
        const { repository, replays, writer } = setup();

        const outcome = await writer.consider(repository, candidate(5, 50));

        expect(outcome).toEqual({ changed: true, staleReplayIds: [] });
        expect(repository.bestScores).toEqual([
            {
                ...bestScoreRow({ id: 5 }),
                filename: "New Title",
                pp: 50,
                ppMultiplier: 0.9,
            },
        ]);
        expect(replays.files.get("best")!.get("5.odr")?.toString()).toBe(
            "replay 5",
        );
        expect(repository.lockedUsers).toEqual([7]);
    });

    it("replaces a lower best score and reports its replay as stale", async () => {
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(40),
        }));

        repository.bestScores = [bestScoreRow({ id: 3, pp: 999 })];

        const outcome = await writer.consider(repository, candidate(5, 50));

        expect(outcome).toEqual({ changed: true, staleReplayIds: [3] });
        expect(repository.bestScores.map((s) => s.id)).toEqual([5]);
    });

    it("compares against the recalculated pp, with the stored multiplier", async () => {
        // Stored 999, but recalculated 100 × 0.4 = 40 < 50.
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(100),
        }));

        repository.bestScores = [
            bestScoreRow({ id: 3, pp: 999, ppMultiplier: 0.4 }),
        ];

        expect(
            (await writer.consider(repository, candidate(5, 50))).changed,
        ).toBe(true);
    });

    it("keeps the current best on a tie and updates its pp", async () => {
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(50),
        }));

        repository.bestScores = [bestScoreRow({ id: 3, pp: 70 })];

        const outcome = await writer.consider(repository, candidate(5, 50));

        expect(outcome).toEqual({ changed: false, staleReplayIds: [] });
        expect(repository.bestScores).toMatchObject([{ id: 3, pp: 50 }]);
    });

    it("keeps a higher best score", async () => {
        const { repository, replays, writer } = setup(() => ({
            ok: true,
            value: performanceBody(80),
        }));

        repository.bestScores = [bestScoreRow({ id: 3, pp: 80 })];

        expect(
            (await writer.consider(repository, candidate(5, 50))).changed,
        ).toBe(false);
        expect(replays.files.get("best")!.has("5.odr")).toBe(false);
    });

    it("removes duplicates in both branches", async () => {
        const higher = setup(() => ({ ok: true, value: performanceBody(10) }));

        higher.repository.bestScores = [
            bestScoreRow({ id: 3, pp: 30 }),
            bestScoreRow({ id: 4, pp: 20 }),
        ];
        expect(
            await higher.writer.consider(higher.repository, candidate(5, 50)),
        ).toEqual({ changed: true, staleReplayIds: [3, 4] });
        expect(higher.repository.bestScores.map((s) => s.id)).toEqual([5]);

        const lower = setup(() => ({ ok: true, value: performanceBody(80) }));

        lower.repository.bestScores = [
            bestScoreRow({ id: 3, pp: 30 }),
            bestScoreRow({ id: 4, pp: 20 }),
        ];
        expect(
            await lower.writer.consider(lower.repository, candidate(5, 50)),
        ).toEqual({ changed: false, staleReplayIds: [4] });
        expect(lower.repository.bestScores.map((s) => s.id)).toEqual([3]);
    });

    it("does not report the candidate's own replay as stale when it replaces its own row", async () => {
        const { repository, writer } = setup(() => ({
            ok: true,
            value: performanceBody(10),
        }));

        repository.bestScores = [bestScoreRow({ id: 5, pp: 10 })];

        expect(await writer.consider(repository, candidate(5, 50))).toEqual({
            changed: true,
            staleReplayIds: [],
        });
    });

    it("records a candidate without a replay and logs it", async () => {
        const log = vi
            .spyOn(console, "log")
            .mockImplementation(() => undefined);
        const { repository, replays, writer } = setup();

        expect(
            (await writer.consider(repository, candidate(5, 50, null))).changed,
        ).toBe(true);
        expect(replays.files.get("best")!.size).toBe(0);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining("score 5 has no replay"),
        );
    });

    it("uses the stored pp when the current best cannot be calculated", async () => {
        const { repository, writer } = setup(() => beatmapNotFound);

        repository.bestScores = [bestScoreRow({ id: 3, pp: 60 })];

        expect(
            (await writer.consider(repository, candidate(5, 50))).changed,
        ).toBe(false);
        expect(repository.bestScores).toMatchObject([{ id: 3, pp: 60 }]);
    });

    it("throws RetryLaterError when the broker asks to retry", async () => {
        const { repository, writer } = setup(() => retryLater);

        repository.bestScores = [bestScoreRow({ id: 3, pp: 60 })];

        await expect(
            writer.consider(repository, candidate(5, 50)),
        ).rejects.toBeInstanceOf(RetryLaterError);
    });

    it("recalculates the current best with the live droid variant", async () => {
        const { repository, broker, writer } = setup();

        repository.bestScores = [bestScoreRow({ id: 3, pp: 60 })];
        await writer.consider(repository, candidate(5, 50));

        expect(broker.calls[0]).toMatchObject({
            kind: "performance",
            variant: "live-droid",
            request: { beatmap: { hash: testHash } },
        });
    });

    it("removes stale replays", async () => {
        const { replays, writer } = setup();

        replays.put("best", "3.odr", "old");
        await writer.removeReplays([3, 4]);

        expect(replays.files.get("best")!.size).toBe(0);
    });
});
```

- [ ] **Step 3: Run, implement, run**

Run → FAIL. `src/services/BestScoreWriter.ts`:

```ts
@Injectable(dependencyTokens.bestScoreWriter)
export class BestScoreWriter implements IBestScoreWriter {
    constructor(
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async consider(
        repository: IOfficialScoreRepository,
        candidate: BestScoreCandidate,
    ): Promise<BestScoreOutcome> {
        const { id, uid, hash } = candidate.score;

        // Serializes best-score writes for this player across processes, so two writers never both see no best.
        await repository.lockUser(uid);

        const [current] = await repository.findBestScores(uid, hash);
        const currentPP = current ? await this.recalculate(current) : null;

        if (
            current === undefined ||
            currentPP === null ||
            candidate.pp > currentPP
        ) {
            const deleted = await repository.deleteBestScores(uid, hash);

            await repository.insertBestScore({
                ...candidate.score,
                filename: candidate.title,
                pp: candidate.pp,
                ppMultiplier: candidate.ppMultiplier,
            });

            if (candidate.replay) {
                await this.replays.writeBestReplay(id, candidate.replay);
            } else {
                console.log(
                    `Best score ${id.toString()} recorded, but score ${id.toString()} has no replay`,
                );
            }

            return {
                changed: true,
                staleReplayIds: deleted.filter((deletedId) => deletedId !== id),
            };
        }

        if (currentPP !== current.pp) {
            await repository.setBestScorePP(current.id, currentPP);
        }

        const duplicates = await repository.deleteBestScores(
            uid,
            hash,
            current.id,
        );

        return {
            changed: false,
            staleReplayIds: duplicates.filter(
                (deletedId) => deletedId !== current.id,
            ),
        };
    }

    async removeReplays(ids: readonly number[]): Promise<void> {
        for (const id of ids) {
            await this.replays.deleteBestReplay(id);
        }
    }

    /**
     * The current best's pp with today's algorithm, or its stored pp if it cannot be calculated.
     *
     * @throws {RetryLaterError} If the broker asks to retry.
     */
    private async recalculate(current: BestScoreRow): Promise<number> {
        const result = requireValue(
            await this.calculator.calculateStats(
                this.config.variants.liveDroid,
                current,
            ),
        );

        return result
            ? result.performance.total *
                  effectiveMultiplier(current.ppMultiplier)
            : current.pp;
    }
}
```

Fix the type of `currentPP` (it is `number | null` only because `current` may be undefined); simplify the condition accordingly. The log line must not depend on the replay's contents.

Run → PASS.

- [ ] **Step 4: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Keep one best pp score per player and beatmap"
```

---

### Task 11: Online-score lookup

**Files:**

- Create: `src/services/IOnlineScoreService.ts`, `src/services/OnlineScoreService.ts`
- Create: `src/controllers/OnlineScoresController.ts`, `src/controllers/index.ts`
- Create: `src/middleware/apiKey.ts`, `src/app.ts`
- Create: `src/dependencies/register.ts`
- Create: `tests/utils/container.ts`
- Modify: `src/services/index.ts`, `src/dependencies/tokens.ts`
- Test: `tests/unit/services/OnlineScoreService.test.ts`, `tests/integration/app.int.test.ts`

**Interfaces:**

- Consumes: Tasks 5, 7, 8, 9.
- Produces:

```ts
export interface IOnlineScoreService {
    /** @throws {ScoreNotFoundError} | {UpstreamError} */
    lookup(query: OnlineScoreQuery): Promise<OnlineScoreResponse>;
}

// src/dependencies/register.ts
export interface RuntimeInstances {
    readonly cliConfig: CliConfig;
    /** Server only. */
    readonly config?: Config;
    readonly db: Database;
    readonly officialDb: OfficialDatabase;
    readonly officialTables: OfficialTables;
    /** Server only. */
    readonly aliceDb?: Db;
    readonly elainaDb?: Db;
}
export function registerDependencies(
    container: DependencyContainer,
    instances: RuntimeInstances,
): void;

// src/app.ts
export function createApp(
    container?: DependencyContainer,
    ...first: RequestHandler[]
): Express;
```

- Token: `onlineScoreService`.

- [ ] **Step 1: Write the failing service tests**

`tests/unit/services/OnlineScoreService.test.ts`. Setup: `InMemoryOfficialScoreRepository`, `InMemoryReplayStore`, `FakeBrokerClient`, and the service built as `new OnlineScoreService(repository, replays, new ScoreCalculator(broker), broker, parse)` where the last argument is the replay parser (`parseReplay` by default; tests pass a function returning a scripted `ParsedReplay` for a given buffer, so no real replay is needed). A matching replay for `scoreRow({ id: 10 })` is the `replay()` helper from Task 8's validity test; move that helper into `tests/utils/rows.ts` as `parsedReplayFor(score, overrides)`.

Cases (query: `{ uid: 7, hash: testHash, variant: "live-droid", best: false, strainChart: false }` unless stated):

1. No score → rejects with `ScoreNotFoundError`. `best: true` with no best row → same.
2. Valid v3 replay in `online/10.odr` → one `replay` call with `{ replay: base64, strainChart: false }` and no overrides; response `{ score: { id: 10, uid: 7, hash, best: false }, source: "replay", ppMultiplier: 1, pp: 120, calculation: <body> }` where the body's total is 120.
3. Valid v2 replay → `replay` call with `mods` and `score` overrides from the row.
4. Invalid replay (parser returns a replay with another hash) → `performance` call with the row's stats; droid variant with `ppMultiplier: 0.5` → `ppMultiplier: 0.5`, `pp` = total × 0.5, `source: "score"`.
5. Missing replay file → same as 4. A stored `ppMultiplier` of 1.3 → 1. `null` → 1.
6. Osu variant (`variant: "live-osu"`) with `ppMultiplier: 0.5` and no replay → `ppMultiplier: 1`.
7. `best: true` reads the highest best row and `best/<id>.odr`; `score.best` is `true`.
8. `strainChart: true` is forwarded in both paths; `calculation.strainChart` is passed through unchanged.
9. A broker failure `{ status: 404, code: "BEATMAP_NOT_FOUND" }` → rejects with `UpstreamError` with `statusCode` 404 and that code; a retry failure → `UpstreamError` 503.
10. Unknown variant on the stats path (`variantMode` fails 404) → `UpstreamError` 404 `VARIANT_NOT_FOUND`.

- [ ] **Step 2: Run, implement, run**

Run → FAIL. `src/services/OnlineScoreService.ts`:

```ts
export type ReplayParser = (file: Buffer) => Promise<ParsedReplay | null>;

@Injectable(dependencyTokens.onlineScoreService)
export class OnlineScoreService implements IOnlineScoreService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.brokerClient)
        private readonly broker: IBrokerClient,
        @inject(dependencyTokens.replayParser)
        private readonly parse: ReplayParser,
    ) {}

    async lookup(query: OnlineScoreQuery): Promise<OnlineScoreResponse> {
        const { uid, hash, variant, best, strainChart } = query;
        const score = best
            ? ((await this.official.findBestScores(uid, hash))[0] ?? null)
            : await this.official.findScore(uid, hash);

        if (!score) {
            throw new ScoreNotFoundError();
        }

        const file = await this.replays.readScoreReplay(
            best ? "best" : "online",
            score.id,
        );
        const replay = file ? await this.parse(file) : null;
        const header = { id: score.id, uid, hash, best };

        if (file && replay && isReplayValid(score, replay)) {
            const result = await this.calculator.calculateReplay(
                variant,
                file,
                {
                    // Replays older than v3 do not record mods; take mods and stats from the score.
                    ...(!replay.v3 && { overrides: score }),
                    strainChart,
                },
            );

            return respond(header, "replay", 1, result);
        }

        const mode = await this.broker.variantMode(variant);

        if (!mode.ok) {
            throw UpstreamError.from(mode);
        }

        const result = await this.calculator.calculateStats(variant, score, {
            strainChart,
        });
        // pp_multiplier carries replay-based penalties of droid scores whose replay is gone.
        const multiplier =
            mode.value === Modes.Droid
                ? effectiveMultiplier(score.ppMultiplier)
                : 1;

        return respond(header, "score", multiplier, result);
    }
}

function respond(
    score: OnlineScoreResponse["score"],
    source: OnlineScoreResponse["source"],
    ppMultiplier: number,
    result: UpstreamResult<PerformanceBody>,
): OnlineScoreResponse {
    if (!result.ok) {
        throw UpstreamError.from(result);
    }

    return {
        score,
        source,
        ppMultiplier,
        pp: result.value.performance.total * ppMultiplier,
        calculation: result.value,
    };
}
```

Add token `replayParser` (`InjectionToken<ReplayParser>`); `registerDependencies` registers `parseReplay` as its value (`container.registerInstance(dependencyTokens.replayParser, parseReplay)`). Define `ReplayParser` in `src/replays/parseReplay.ts` rather than in the service, since later services use it too.

Run → PASS.

- [ ] **Step 3: Write registration, app, and middleware**

`src/dependencies/register.ts`:

```ts
// Load injectable classes so their metadata is registered. Tasks 14–16 add `../runtime/ReplayWatcher`,
// `../runtime/UncalculatedScheduler`, and `../jobs/JobRunner` here.
import "../clients";
import "../replays/ReplayStore";
import "../repositories";
import "../services";

/**
 * Registers runtime instances and every `@Injectable` class. The CLI passes no server-only instances; classes that
 * need them are registered but never resolved there.
 */
export function registerDependencies(
    container: DependencyContainer,
    instances: RuntimeInstances,
): void {
    container.registerInstance(dependencyTokens.cliConfig, instances.cliConfig);

    if (instances.config) {
        container.registerInstance(dependencyTokens.config, instances.config);
    }

    container.registerInstance(dependencyTokens.db, instances.db);
    container.registerInstance(
        dependencyTokens.officialDb,
        instances.officialDb,
    );
    container.registerInstance(
        dependencyTokens.officialTables,
        instances.officialTables,
    );

    if (instances.aliceDb) {
        container.registerInstance(dependencyTokens.aliceDb, instances.aliceDb);
    }

    if (instances.elainaDb) {
        container.registerInstance(
            dependencyTokens.elainaDb,
            instances.elainaDb,
        );
    }

    container.registerInstance(dependencyTokens.replayParser, parseReplay);
    registerInjectables(container);
}
```

Read `packages/server/src/dependencies/registerInjectables.ts` first: if it registers classes as singletons, keep that; if `registerInjectables` throws for classes whose dependencies are missing, it does not (tsyringe resolves lazily).

`src/middleware/apiKey.ts`: the processor's `createApiKeyMiddleware`, without public paths:

```ts
/**
 * Requires `X-Api-Key` to equal `apiKey` (compared in constant time).
 */
export function createApiKeyMiddleware(apiKey: string): RequestHandler {
    /* processor's body, minus publicPaths */
}
```

`src/controllers/OnlineScoresController.ts`:

```ts
@Controller("/online-scores")
export class OnlineScoresController extends BaseController {
    constructor(
        @inject(dependencyTokens.onlineScoreService)
        private readonly service: IOnlineScoreService,
    ) {
        super();
    }

    @Get("")
    async lookup(
        req: Request,
        res: Response<OnlineScoreResponse>,
    ): Promise<void> {
        try {
            res.json(
                await this.service.lookup(
                    parseBody(onlineScoreQuerySchema, req.query),
                ),
            );
        } catch (e) {
            this.handleError(res, e);
        }
    }
}
```

`src/app.ts`:

```ts
// Load controllers so their metadata is registered before the router is built.
import "./controllers";

/**
 * Creates the Express application.
 *
 * @param first Middleware to run before everything else, such as `GracefulServer.middleware`.
 */
export function createApp(
    container = getContainer(),
    ...first: RequestHandler[]
) {
    const config = container.resolve(dependencyTokens.config);
    const app = express().disable("x-powered-by");

    // Express rejects `.use()` without handlers.
    if (first.length > 0) {
        app.use(...first);
    }

    return app
        .use("/online-scores", createApiKeyMiddleware(config.apiKey))
        .use(createRouter(container))
        .use(notFoundHandler)
        .use(errorHandler);
}
```

Task 12 adds the game routes' middleware.

`tests/utils/container.ts`:

```ts
/**
 * A child container with real implementations except where `overrides` registers fakes, a PGlite job database, and
 * placeholder official and MongoDB handles (tests that reach them must override the repositories).
 */
export async function createTestContainer(
    options: {
        config?: Config;
        overrides?: (container: DependencyContainer) => void;
    } = {},
): Promise<{ container: DependencyContainer } & AsyncDisposable> {
    const resources = new AsyncDisposableStack();
    const { db } = resources.use(await createTestDatabase());
    const config = options.config ?? testConfig;
    const container = globalContainer.createChildContainer();

    registerDependencies(container, {
        cliConfig: config,
        config,
        db,
        officialDb: {} as OfficialDatabase,
        officialTables: createOfficialTables(config.official.tablePrefix),
        aliceDb: {} as Db,
        elainaDb: {} as Db,
    });
    options.overrides?.(container);

    return { container, [Symbol.asyncDispose]: () => resources.disposeAsync() };
}
```

The empty-object casts are deliberate: any accidental use fails loudly. Say so in a comment.

- [ ] **Step 4: Write the failing HTTP tests**

`tests/integration/app.int.test.ts` — a container whose `officialScoreRepository`, `replayStore`, and `brokerClient` are overridden with the in-memory fakes and `FakeBrokerClient` (`container.registerInstance(token, fake)`). Requests through `supertest(createApp(container))`:

1. No `X-Api-Key` → `401 { error: { code: "UNAUTHORIZED" } }`; a wrong key → 401.
2. Invalid query (`uid=abc`) → `400 INVALID_REQUEST` with a message starting `uid: `.
3. Unknown score → `404 SCORE_NOT_FOUND`.
4. A score without a replay → `200` with `source: "score"` and the body's `calculation`.
5. Broker `503 VARIANT_UNAVAILABLE` → `503` with that code.
6. Unknown route → `404 INVALID_REQUEST "Route not found"`.

Run → FAIL, then PASS once Step 3 is complete.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Look up online scores for the Discord bot"
```

---

### Task 12: Game pp endpoints

**Files:**

- Create: `src/services/IGamePPService.ts`, `src/services/GamePPService.ts`
- Create: `src/controllers/GamePPController.ts`
- Create: `src/middleware/loopbackOnly.ts`, `src/http/runMiddleware.ts`
- Modify: `src/app.ts`, `src/controllers/index.ts`, `src/services/index.ts`, `src/dependencies/tokens.ts`
- Test: `tests/unit/services/GamePPService.test.ts`, `tests/unit/middleware/loopbackOnly.test.ts`, `tests/integration/gamePP.int.test.ts`

**Interfaces:**

- Consumes: `calculateScoreFieldsSchema`, `calculateReplayFieldsSchema`, `GamePPResponse` (Task 2); `IScoreCalculator`, `ppMultiplierFrom` (Task 9); `ReplayParser` (Task 11).
- Produces:

```ts
export interface IGamePPService {
    /** Never throws: any failure gives `{ pp: null, pp_multiplier: null }` and a log line. */
    calculateScore(fields: CalculateScoreFields): Promise<GamePPResponse>;
    calculateReplay(replay: Buffer, variant?: string): Promise<GamePPResponse>;
}
export const loopbackOnly: RequestHandler;
export function runMiddleware(
    req: Request,
    res: Response,
    middleware: RequestHandler,
): Promise<void>;
```

- Token: `gamePPService`.

- [ ] **Step 1: Write the failing service tests**

`tests/unit/services/GamePPService.test.ts` (fake broker; replay parser scripted as in Task 11; `vi.spyOn(console, "log")` silenced and asserted where stated):

```ts
const fields: CalculateScoreFields = {
    hash: testHash,
    mods: [new ModHidden().serialize()],
    combo: 100,
    perfect: 90,
    good: 5,
    bad: 1,
    miss: 2,
    totalScore: 123456,
    sliderHits: { head: 10, tick: 20, repeat: 1, end: 9 },
    ppMultiplier: 0.5,
};
```

1. `calculateScore(fields)`: first call is `performance` on `live-droid` with `mods: [HD]`, `score: { n300: 90, n100: 5, n50: 1, nmiss: 2, combo: 100, totalScore: 123456, sliderHeadHits: 10, sliderTickHits: 20, sliderRepeatHits: 1, sliderEndHits: 9 }`; second is the no-penalty call (resolved score of the first, `tapPenalty: 1`, `sliderCheesePenalty: 1`, no `totalScore`). With totals 80 then 100 → `{ pp: 40, pp_multiplier: 0.4 }` (pp = 80 × 0.5; multiplier = 40 / 100).
2. No-penalty total 0 → `pp_multiplier: 1`.
3. `fields.variant = "droid-test"` → both calls use `droid-test`.
4. First call fails (`beatmapNotFound`) → `{ pp: null, pp_multiplier: null }` and a log line containing `calculate-score failed` and `BEATMAP_NOT_FOUND`; no second call.
5. Second call fails (`retryLater`) → nulls.
6. `calculateReplay(buffer)` with a parsed v3 replay of version 7 → `replay` call (no overrides), then the no-penalty `performance` call with `beatmap: { hash: <replay hash> }` and the first response's `difficulty.mods`; totals 90 and 100 → `{ pp: 90, pp_multiplier: 0.9 }`.
7. Replay version 6, a v2 replay, and an unparsable replay → nulls without any broker call; the log line says `unsupported or unreadable replay`.
8. `calculateReplay(buffer, "droid-test")` uses that variant for both calls.

- [ ] **Step 2: Run, implement, run**

Run → FAIL. `src/services/GamePPService.ts`:

```ts
const nothing: GamePPResponse = { pp: null, pp_multiplier: null };

@Injectable(dependencyTokens.gamePPService)
export class GamePPService implements IGamePPService {
    constructor(
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.replayParser)
        private readonly parse: ReplayParser,
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async calculateScore(
        fields: CalculateScoreFields,
    ): Promise<GamePPResponse> {
        const variant = fields.variant ?? this.config.variants.liveDroid;
        const result = await this.calculator.calculateStats(variant, {
            hash: fields.hash,
            mods: JSON.stringify(fields.mods),
            totalScore: fields.totalScore,
            combo: fields.combo,
            perfect: fields.perfect,
            good: fields.good,
            bad: fields.bad,
            miss: fields.miss,
            sliderHeadHit: fields.sliderHits?.head ?? null,
            sliderTickHit: fields.sliderHits?.tick ?? null,
            sliderRepeatHit: fields.sliderHits?.repeat ?? null,
            sliderEndHit: fields.sliderHits?.end ?? null,
        });

        if (!result.ok) {
            return failed("calculate-score", variant, result);
        }

        return this.withMultiplier(
            "calculate-score",
            variant,
            fields.hash,
            result.value,
            result.value.performance.total * fields.ppMultiplier,
        );
    }

    async calculateReplay(
        replay: Buffer,
        requestedVariant?: string,
    ): Promise<GamePPResponse> {
        const variant = requestedVariant ?? this.config.variants.liveDroid;
        const parsed = await this.parse(replay);

        // As pp-processor-node: only replays of v3 and later, with replayVersion above 6.
        if (!parsed?.v3 || parsed.version <= 6) {
            console.log(
                `calculate-replay failed (variant ${variant}): unsupported or unreadable replay`,
            );
            return nothing;
        }

        const result = await this.calculator.calculateReplay(variant, replay);

        if (!result.ok) {
            return failed("calculate-replay", variant, result);
        }

        return this.withMultiplier(
            "calculate-replay",
            variant,
            parsed.hash,
            result.value,
            result.value.performance.total,
        );
    }

    private async withMultiplier(
        route: string,
        variant: string,
        hash: string,
        body: PerformanceBody,
        pp: number,
    ): Promise<GamePPResponse> {
        const noPenalty = await this.calculator.noPenaltyTotal(
            variant,
            hash,
            body,
        );

        if (!noPenalty.ok) {
            return failed(route, variant, noPenalty);
        }

        return { pp, pp_multiplier: ppMultiplierFrom(pp, noPenalty.value) };
    }
}

function failed(
    route: string,
    variant: string,
    failure: UpstreamFailure,
): GamePPResponse {
    console.log(
        `${route} failed (variant ${variant}): ${failure.code} ${failure.message}`,
    );
    return nothing;
}
```

Run → PASS.

- [ ] **Step 3: Write the failing middleware test**

`tests/unit/middleware/loopbackOnly.test.ts`: call `loopbackOnly` with a fake `req` (`{ socket: { remoteAddress } }`) and a fake `res` recording `status` and `json`:

- `127.0.0.1`, `::1`, `::ffff:127.0.0.1` → `next()` called.
- `10.0.0.5`, `::ffff:10.0.0.5`, and `undefined` → `403` with `{ error: { code: "UNAUTHORIZED", message: "This route only accepts local connections" } }`.

Implement `src/middleware/loopbackOnly.ts`:

```ts
const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Lets only loopback connections through. The game routes have no key (the game server never sent one), so they
 * stay internal even if `HOST` is widened.
 */
export const loopbackOnly: RequestHandler = (req, res, next) => {
    if (loopback.has(req.socket.remoteAddress ?? "")) {
        next();
        return;
    }

    res.status(403).json({
        error: {
            code: "UNAUTHORIZED",
            message: "This route only accepts local connections",
        },
    } satisfies ErrorResponse);
};
```

The connection's address is used, never `X-Forwarded-For`.

- [ ] **Step 4: Write the controller**

`src/http/runMiddleware.ts`:

```ts
/**
 * Runs Express middleware inside a handler, so its errors can be answered the handler's way.
 */
export function runMiddleware(
    req: Request,
    res: Response,
    middleware: RequestHandler,
): Promise<void> {
    return new Promise((resolve, reject) => {
        void middleware(req, res, (error?: unknown) => {
            if (error) {
                reject(
                    error instanceof Error ? error : new Error(String(error)),
                );
            } else {
                resolve();
            }
        });
    });
}
```

`src/controllers/GamePPController.ts`:

```ts
const maxReplayBytes = 2 * 1024 * 1024;
const json = express.json({ limit: "64kb" });
const urlencoded = express.urlencoded({ extended: false, limit: "64kb" });
const multipart = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxReplayBytes, files: 1, fields: 32 },
});
const nothing: GamePPResponse = { pp: null, pp_multiplier: null };

/**
 * Drop-in replacement for pp-processor-node's routes. Every failure, including unreadable bodies, answers
 * `200 { pp: null, pp_multiplier: null }` so the game records the score as uncalculated.
 */
@Controller("")
export class GamePPController {
    constructor(
        @inject(dependencyTokens.gamePPService)
        private readonly service: IGamePPService,
    ) {}

    @Post("/calculate-score")
    async calculateScore(
        req: Request,
        res: Response<GamePPResponse>,
    ): Promise<void> {
        try {
            await this.readBody(req, res, multipart.none());

            const fields = calculateScoreFieldsSchema.safeParse(req.body);

            if (!fields.success) {
                console.log(
                    `calculate-score rejected: ${describe(fields.error)}`,
                );
                res.json(nothing);
                return;
            }

            res.json(await this.service.calculateScore(fields.data));
        } catch (e) {
            console.log(
                `calculate-score failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            res.json(nothing);
        }
    }

    @Post("/calculate-replay")
    async calculateReplay(
        req: Request,
        res: Response<GamePPResponse>,
    ): Promise<void> {
        try {
            await this.readBody(req, res, multipart.single("replayfile"));

            const fields = calculateReplayFieldsSchema.safeParse(
                req.body ?? {},
            );

            if (!req.file || !fields.success) {
                console.log(
                    `calculate-replay rejected: ${req.file ? describe(fields.error!) : "no replayfile"}`,
                );
                res.json(nothing);
                return;
            }

            res.json(
                await this.service.calculateReplay(
                    req.file.buffer,
                    fields.data.variant,
                ),
            );
        } catch (e) {
            console.log(
                `calculate-replay failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            res.json(nothing);
        }
    }

    private async readBody(
        req: Request,
        res: Response,
        files: RequestHandler,
    ): Promise<void> {
        await runMiddleware(req, res, json);
        await runMiddleware(req, res, urlencoded);
        await runMiddleware(req, res, files);
    }
}

/**
 * The first issue's field and message, never its value.
 */
function describe(error: z.ZodError): string {
    const issue = error.issues[0];

    return issue
        ? `${issue.path.join(".") || "body"}: ${issue.message}`
        : "invalid body";
}
```

Check how `@Controller("")` with `@Post("/calculate-score")` builds paths in `packages/server/src/http/router.ts`; adjust to produce exactly `/calculate-score` and `/calculate-replay`.

In `src/app.ts`, before the router:

```ts
        .use(["/calculate-score", "/calculate-replay"], loopbackOnly)
```

- [ ] **Step 5: Write the HTTP tests**

`tests/integration/gamePP.int.test.ts` with `gamePPService` overridden by a fake recording its arguments and returning `{ pp: 1, pp_multiplier: 0.5 }`:

1. `/calculate-score` as URL-encoded form, as multipart fields (`.field(...)`), and as JSON: each reaches the service with the same parsed `CalculateScoreFields` (`hash` lowercased, `ppMultiplier` 1 by default) and answers `200 { pp: 1, pp_multiplier: 0.5 }`.
2. `/calculate-score` with `miss=-1`, with malformed JSON, and with a file attached → `200 { pp: null, pp_multiplier: null }`, service not called.
3. `/calculate-replay` with `.attach("replayfile", buffer, "x.odr")` and `.field("variant", "droid-test")` → service called with the buffer and `"droid-test"`.
4. `/calculate-replay` without a file, with a file in another field, and with a file of 2 MiB + 1 byte → nulls, service not called.
5. A request with `X-Forwarded-For: 10.0.0.1` from loopback is still accepted (the header is ignored).

- [ ] **Step 6: Run and commit**

Run: `pnpm --filter @dpp/score-service test` → PASS.

```bash
pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Serve the game's pp endpoints"
```

---

### Task 13: Replay submission (recent plays and dan courses)

**Files:**

- Create: `src/services/recentPlay.ts`, `src/services/danCourseGrade.ts`
- Create: `src/services/IDanCourseService.ts`, `DanCourseService.ts`, `IReplaySubmissionService.ts`, `ReplaySubmissionService.ts`
- Modify: `src/services/index.ts`, `src/dependencies/tokens.ts`
- Create: `tests/utils/fakes/recentPlayRepository.ts`, `danCourseRepository.ts`, `userBindRepository.ts`, `beatmapServiceClient.ts`, `discordMetadataClient.ts` (one class each, re-exported from `tests/utils/fakes/index.ts`)
- Test: `tests/unit/services/recentPlay.test.ts`, `danCourseGrade.test.ts`, `DanCourseService.test.ts`, `ReplaySubmissionService.test.ts`

**Interfaces:**

- Consumes: Tasks 6–9, `ReplayParser`.
- Produces:

```ts
// recentPlay.ts
export interface RecentPlayInput {
    readonly uid: number;
    readonly scoreId: number;
    /** Must be v3 or later. */
    readonly replay: ParsedReplay;
    readonly title: string;
    readonly droid: ReplayPerformanceBody | null;
    readonly osu: ReplayPerformanceBody | null;
    readonly date: Date;
}
export function toRecentPlay(input: RecentPlayInput): RecentPlayDocument;

// danCourseGrade.ts
export function danCourseGrade(
    requirementId: string,
    score: DanCourseScore,
): number;

export interface IDanCourseService {
    /** Replaces the loaded courses; invalid documents are skipped with a log line. */
    load(): Promise<void>;
    /** Reloads every `minutes`; failures are logged and the previous courses kept. */
    startRefreshing(minutes: number): Disposable;
    /** Records a v3 replay on its course's leaderboard if it is a course and the grade improves. */
    submit(uid: number, replay: ParsedReplay): Promise<void>;
}

export type SubmissionResult =
    | { readonly action: "delete"; readonly reason: string }
    | {
          readonly action: "keep";
          readonly reason: string;
          readonly retryAfterMs?: number;
      };
export interface IReplaySubmissionService {
    /** Never throws: temporary failures are `keep`. */
    process(fileName: string, file: Buffer): Promise<SubmissionResult>;
}
```

- Tokens: `danCourseService`, `replaySubmissionService`.

- [ ] **Step 1: Write the failing grade tests**

`tests/unit/services/danCourseGrade.test.ts` — for a score `{ score: 1000, maxCombo: 300, perfect: 90, good: 8, bad: 1, miss: 1, rank: "S", ... }`:

- `score` → 1000; `combo` → 300; `m300` → 90; `m100` → 8; `m50` → 1; `miss` → 1 (the old code's rule: a higher count is a higher grade, also for misses; kept as is);
- `acc` → `new Accuracy({ n300: 90, n100: 8, n50: 1, nmiss: 1 }).value`;
- `rank`: XH 8, SH 7, X 6, S 5, A 4, B 3, C 2, D 1, anything else 1;
- an unknown requirement → 0.

Implement `src/services/danCourseGrade.ts` (port of `danCourseUtil.ts`'s `getGrade` and `getRankGrade`, same switch).

- [ ] **Step 2: Write the failing mapping test**

`tests/unit/services/recentPlay.test.ts` pins the document against what the old backend's `insertRecentScore` builds for the same inputs (written out from that code; the field order does not matter):

```ts
const replay: ParsedReplay = {
    version: 4,
    hash: testHash,
    fileName: "Artist - Title (Mapper) [Hard].osu",
    accuracy: { n300: 100, n100: 2, n50: 1, nmiss: 0 },
    rank: "S",
    hit300k: 10,
    hit100k: 1,
    v3: {
        score: 50000,
        maxCombo: 150,
        mods: [new ModHidden().serialize()],
        playerName: "player",
        time: new Date("2026-10-01T00:00:00Z"),
    },
};

const droid = replayPerformanceBody(0, {
    difficulty: {
        mods: [new ModHidden().serialize()],
        starRating: 5,
        maxCombo: 160,
    },
    performance: {
        total: 120,
        aim: 50,
        tap: 40,
        accuracy: 20,
        flashlight: 0,
        reading: 10,
        deviation: 15,
        tapDeviation: 12,
        tapPenalty: 1,
        sliderCheesePenalty: 1,
        effectiveMissCount: 0,
    },
    score: {
        n300: 100,
        n100: 2,
        n50: 1,
        nmiss: 0,
        combo: 150,
        totalScore: 50000,
        sliderTicksMissed: 3,
        sliderEndsDropped: 1,
        tapPenalty: 1,
        sliderCheesePenalty: 1,
    },
    replay: {
        hitError: { negativeAvg: -10, positiveAvg: 10, unstableRate: 80 },
        sliderTickInformation: { obtained: 10, total: 13 },
        sliderEndInformation: { obtained: 9, total: 10 },
    },
});

const osu = replayPerformanceBody(0, {
    difficulty: { mods: [new ModHidden().serialize()], starRating: 4 },
    performance: {
        total: 90,
        aim: 40,
        speed: 30,
        accuracy: 15,
        flashlight: 0,
        reading: 5,
        effectiveMissCount: 0,
    },
    score: {
        n300: 100,
        n100: 2,
        n50: 1,
        nmiss: 0,
        combo: 150,
        totalScore: 50000,
        tapPenalty: 1,
        sliderCheesePenalty: 1,
    },
});

const date = new Date("2026-10-10T00:00:00Z");

it("builds today's recent play document", () => {
    expect(
        toRecentPlay({
            uid: 7,
            scoreId: 99,
            replay,
            title: "Artist - Title (Mapper) [Hard]",
            droid,
            osu,
            date,
        }),
    ).toEqual({
        uid: 7,
        title: "Artist - Title (Mapper) [Hard]",
        combo: 150,
        score: 50000,
        rank: "S",
        date,
        accuracy: { n300: 100, n100: 2, n50: 1, nmiss: 0 },
        mods: [new ModHidden().serialize()],
        hash: testHash,
        scoreId: 99,
        hitError: { negativeAvg: -10, positiveAvg: 10, unstableRate: 80 },
        sliderTickInformation: { obtained: 10, total: 13 },
        sliderEndInformation: { obtained: 9, total: 10 },
        droidAttribs: {
            params: {
                mods: [new ModHidden().serialize()],
                accuracy: { n300: 100, n100: 2, n50: 1, nmiss: 0 },
                combo: 150,
                totalScore: 50000,
                sliderTicksMissed: 3,
                sliderEndsDropped: 1,
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            },
            difficulty: {
                mods: [new ModHidden().serialize()],
                starRating: 5,
                maxCombo: 160,
            },
            performance: {
                total: 120,
                aim: 50,
                tap: 40,
                accuracy: 20,
                flashlight: 0,
                reading: 10,
                deviation: 15,
                tapDeviation: 12,
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            },
        },
        osuAttribs: {
            params: {
                mods: [new ModHidden().serialize()],
                accuracy: { n300: 100, n100: 2, n50: 1, nmiss: 0 },
                combo: 150,
                totalScore: 50000,
                tapPenalty: 1,
                sliderCheesePenalty: 1,
            },
            difficulty: { mods: [new ModHidden().serialize()], starRating: 4 },
            performance: {
                total: 90,
                aim: 40,
                speed: 30,
                accuracy: 15,
                flashlight: 0,
            },
        },
    });
});
```

Further cases:

- Without calculations (`droid: null, osu: null`) the document has no `droidAttribs`, `osuAttribs`, `hitError`, or slider information.
- A droid body whose `replay` fields are `null` leaves out `hitError` and slider information.
- A droid-shaped body passed as `osu` (no `speed`) and an osu!-shaped body passed as `droid` (no `tap`) leave out that attribute set and log `unexpected performance attributes` (Review Focus 5).
- Undefined optional params (no `totalScore`) are left out, not stored as `undefined`.

Once the user provides a real recent play document from the old backend, add it as `tests/fixtures/recent-play.json` and a test comparing against it (listed in the README's open items).

- [ ] **Step 3: Run, implement, run**

Run → FAIL. `src/services/recentPlay.ts`:

```ts
const droidPerformanceSchema = z.object({
    total: z.number(),
    aim: z.number(),
    tap: z.number(),
    accuracy: z.number(),
    flashlight: z.number(),
    reading: z.number(),
    deviation: z.number(),
    tapDeviation: z.number(),
    tapPenalty: z.number(),
    sliderCheesePenalty: z.number(),
});

const osuPerformanceSchema = z.object({
    total: z.number(),
    aim: z.number(),
    speed: z.number(),
    accuracy: z.number(),
    flashlight: z.number(),
});

/**
 * Builds the recent play document in the old backend's shape (`IRecentPlay`), which the Discord bot reads.
 * `z.object` strips the performance fields the old documents did not have.
 */
export function toRecentPlay(input: RecentPlayInput): RecentPlayDocument {
    const { replay } = input;
    const v3 = replay.v3!;
    const document: RecentPlayDocument = {
        uid: input.uid,
        title: input.title,
        combo: v3.maxCombo,
        score: v3.score,
        rank: replay.rank,
        date: input.date,
        accuracy: { ...replay.accuracy },
        mods: v3.mods,
        hash: replay.hash,
        scoreId: input.scoreId,
    };

    const droid =
        input.droid && attributes(input.droid, droidPerformanceSchema, "droid");

    if (droid && input.droid) {
        document.droidAttribs = droid;

        const { hitError, sliderTickInformation, sliderEndInformation } =
            input.droid.replay;

        if (hitError) document.hitError = hitError;
        if (sliderTickInformation)
            document.sliderTickInformation = sliderTickInformation;
        if (sliderEndInformation)
            document.sliderEndInformation = sliderEndInformation;
    }

    const osu = input.osu && attributes(input.osu, osuPerformanceSchema, "osu");

    if (osu) {
        document.osuAttribs = osu;
    }

    return document;
}

function attributes<T>(
    body: ReplayPerformanceBody,
    schema: z.ZodType<T>,
    mode: string,
): RecentPlayAttributes<T> | null {
    const performance = schema.safeParse(body.performance);

    if (!performance.success) {
        console.log(
            `Recent play: unexpected performance attributes for ${mode}; leaving them out`,
        );
        return null;
    }

    const { score } = body;

    return {
        params: {
            mods: body.difficulty.mods,
            accuracy: {
                n300: score.n300,
                n100: score.n100,
                n50: score.n50,
                nmiss: score.nmiss,
            },
            combo: score.combo,
            ...(score.totalScore !== undefined && {
                totalScore: score.totalScore,
            }),
            ...(score.sliderTicksMissed !== undefined && {
                sliderTicksMissed: score.sliderTicksMissed,
            }),
            ...(score.sliderEndsDropped !== undefined && {
                sliderEndsDropped: score.sliderEndsDropped,
            }),
            tapPenalty: score.tapPenalty,
            sliderCheesePenalty: score.sliderCheesePenalty,
        },
        difficulty: body.difficulty,
        performance: performance.data,
    };
}
```

Adjust `RecentPlayAttributes` and the `if` one-liners to the repo's style (braces on separate lines). Run → PASS.

- [ ] **Step 4: Write the fakes and the failing dan course tests**

One file per class under `tests/utils/fakes/` (names in **Files**), each re-exported from `index.ts`:

```ts
export class InMemoryRecentPlayRepository implements IRecentPlayRepository {
    readonly plays: RecentPlayDocument[] = [];
    fail: Error | null = null;
    insert(play: RecentPlayDocument) {
        if (this.fail) return Promise.reject(this.fail);
        this.plays.push(play);
        return Promise.resolve();
    }
}

export class InMemoryDanCourseRepository implements IDanCourseRepository {
    courses: unknown[] = [];
    readonly scores: DanCourseScore[] = [];
    listCourses() {
        return Promise.resolve(this.courses);
    }
    findGrade(uid: number, hash: string) {
        return Promise.resolve(
            this.scores.find((s) => s.uid === uid && s.hash === hash)?.grade ??
                null,
        );
    }
    upsertScore(score: DanCourseScore) {
        const index = this.scores.findIndex(
            (s) => s.uid === score.uid && s.hash === score.hash,
        );
        if (index === -1) this.scores.push(score);
        else this.scores[index] = score;
        return Promise.resolve();
    }
}

export class InMemoryUserBindRepository implements IUserBindRepository {
    readonly binds = new Map<number, string>();
    findDiscordId(uid: number) {
        return Promise.resolve(this.binds.get(uid) ?? null);
    }
}

export class FakeBeatmapServiceClient implements IBeatmapServiceClient {
    readonly calls: { lane: BeatmapLane; hash: string }[] = [];
    constructor(
        public answer: (hash: string) => UpstreamResult<BeatmapInfo | null> = (
            hash,
        ) => ({
            ok: true,
            value: {
                hash,
                title: "Artist - Title (Mapper) [Hard]",
                rankedStatus: RankedStatus.Ranked,
            },
        }),
    ) {}
    getBeatmap(lane: BeatmapLane, hash: string) {
        this.calls.push({ lane, hash });
        return Promise.resolve(this.answer(hash));
    }
}

export class FakeDiscordMetadataClient implements IDiscordMetadataClient {
    readonly updates: string[] = [];
    accept = true;
    update(discordId: string) {
        this.updates.push(discordId);
        return Promise.resolve(this.accept);
    }
}
```

(format to the repo's style when writing them.)

`tests/unit/services/DanCourseService.test.ts`:

1. `load` keeps valid courses and logs one line per invalid document (`{ hash: 5 }`).
2. `submit` for a replay whose hash is not a course does nothing.
3. `submit` for a course with requirement `score` and no entry → upserts `{ uid, username: playerName, hash, mods, score, maxCombo, rank, geki: hit300k, perfect, katu: hit100k, good, bad, miss, date: time.getTime(), grade: score }`.
4. A lower or equal grade than the existing entry does not upsert; a higher one does.
5. A v2 replay (`v3: null`) does nothing.
6. `startRefreshing(1)` with fake timers reloads after one minute; a failing reload (repository throws) logs and keeps the previous courses; disposing stops the timer.

Implement `src/services/DanCourseService.ts`:

```ts
@Injectable(dependencyTokens.danCourseService)
export class DanCourseService implements IDanCourseService {
    private courses = new Map<string, DanCourse>();

    constructor(
        @inject(dependencyTokens.danCourseRepository)
        private readonly repository: IDanCourseRepository,
    ) {}

    async load(): Promise<void> {
        const courses = new Map<string, DanCourse>();

        for (const document of await this.repository.listCourses()) {
            const parsed = danCourseSchema.safeParse(document);

            if (parsed.success) {
                courses.set(parsed.data.hash, parsed.data);
            } else {
                console.log("Skipping an invalid dan course document");
            }
        }

        this.courses = courses;
    }

    startRefreshing(minutes: number): Disposable {
        const timer = setInterval(() => {
            this.load().catch((e: unknown) => {
                console.error(
                    "Failed to reload dan courses; keeping the previous ones:",
                    e,
                );
            });
        }, minutes * 60_000);

        timer.unref();

        return { [Symbol.dispose]: () => clearInterval(timer) };
    }

    async submit(uid: number, replay: ParsedReplay): Promise<void> {
        const course = this.courses.get(replay.hash);

        if (!course || !replay.v3) {
            return;
        }

        const score: DanCourseScore = {
            /* fields as in test case 3 */ grade: 0,
        };

        score.grade = danCourseGrade(course.requirement.id, score);

        const existing = await this.repository.findGrade(uid, replay.hash);

        if (existing === null || score.grade > existing) {
            await this.repository.upsertScore(score);
        }
    }
}
```

Run → PASS.

- [ ] **Step 5: Write the failing submission tests**

`tests/unit/services/ReplaySubmissionService.test.ts`. The service is built from: in-memory official repository (with user `{ id: 7, username: "player" }`), `FakeBrokerClient`, `ScoreCalculator`, `FakeBeatmapServiceClient`, in-memory recent play and bind repositories (bind 7 → `"discord-7"`), a real `DanCourseService` over the in-memory dan repository, `FakeDiscordMetadataClient`, a scripted replay parser, and `testConfig`. The broker answers `replay` calls by variant: `live-droid` → a droid-shaped body, `live-osu` → an osu!-shaped body.

1. `process("99_abc.odr", file)` for a v3 replay of `player` → `{ action: "delete", reason: "processed" }`; one recent play with `uid: 7`, `scoreId: 99`, the beatmap service's title, both attribute sets; Discord update for `discord-7`; beatmap service called with lane `priority`.
2. File name without one underscore (`"abc.odr"`, `"1_2_3.odr"`) → `scoreId: 0`.
3. Unparsable replay and v2 replay → `delete` with reason `unreadable or older than v3`; nothing stored.
4. Unknown player → `delete` with reason `unknown player`.
5. Droid call `beatmapNotFound` → recent play stored without `droidAttribs` (osu! attributes still there).
6. Beatmap service `null` → title is the replay's file name without `.osu`.
7. No bind → no recent play, no Discord update, dan course still processed.
8. Discord update rejected → still `delete`; a log line.
9. Broker `retryLater` → `{ action: "keep", reason: <message> }` and nothing stored; with `retryAfterMs` set on the failure, it is passed on.
10. Beatmap service retry → `keep`.
11. Official repository `findUserId` throws (database down) → `keep` with the error message; recent play repository `insert` throws → `keep`.
12. Ordering: dan course submission happens before the recent play insert (a throwing recent play insert leaves the dan course entry written, so a retry does not duplicate anything but the upsert).

- [ ] **Step 6: Run, implement, run**

Run → FAIL. `src/services/ReplaySubmissionService.ts`:

```ts
@Injectable(dependencyTokens.replaySubmissionService)
export class ReplaySubmissionService implements IReplaySubmissionService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.beatmapServiceClient)
        private readonly beatmaps: IBeatmapServiceClient,
        @inject(dependencyTokens.recentPlayRepository)
        private readonly recentPlays: IRecentPlayRepository,
        @inject(dependencyTokens.userBindRepository)
        private readonly binds: IUserBindRepository,
        @inject(dependencyTokens.danCourseService)
        private readonly danCourses: IDanCourseService,
        @inject(dependencyTokens.discordMetadataClient)
        private readonly discord: IDiscordMetadataClient,
        @inject(dependencyTokens.replayParser)
        private readonly parse: ReplayParser,
        @inject(dependencyTokens.cliConfig) private readonly config: CliConfig,
    ) {}

    async process(fileName: string, file: Buffer): Promise<SubmissionResult> {
        try {
            return await this.submit(fileName, file);
        } catch (e) {
            return {
                action: "keep",
                reason: e instanceof Error ? e.message : String(e),
                ...(e instanceof RetryLaterError &&
                    e.retryAfterMs !== undefined && {
                        retryAfterMs: e.retryAfterMs,
                    }),
            };
        }
    }

    private async submit(
        fileName: string,
        file: Buffer,
    ): Promise<SubmissionResult> {
        const replay = await this.parse(file);

        if (!replay?.v3) {
            return { action: "delete", reason: "unreadable or older than v3" };
        }

        const uid = await this.official.findUserId(replay.v3.playerName);

        if (uid === null) {
            return { action: "delete", reason: "unknown player" };
        }

        const { liveDroid, liveOsu } = this.config.variants;
        const droid = this.attributes(
            await this.calculator.calculateReplay(liveDroid, file),
            liveDroid,
        );
        const osu = this.attributes(
            await this.calculator.calculateReplay(liveOsu, file),
            liveOsu,
        );
        const beatmap = requireValue(
            await this.beatmaps.getBeatmap("priority", replay.hash),
        );
        const title = beatmap?.title ?? replay.fileName.replace(".osu", "");

        await this.danCourses.submit(uid, replay);

        const discordId = await this.binds.findDiscordId(uid);

        if (discordId) {
            await this.recentPlays.insert(
                toRecentPlay({
                    uid,
                    scoreId: scoreIdOf(fileName),
                    replay,
                    title,
                    droid,
                    osu,
                    date: new Date(),
                }),
            );

            if (!(await this.discord.update(discordId))) {
                console.log(
                    `Discord metadata update failed for player ${uid.toString()}`,
                );
            }
        }

        return { action: "delete", reason: "processed" };
    }

    /**
     * The calculation, or null (logged) if it failed permanently.
     *
     * @throws {RetryLaterError} If the broker asks to retry.
     */
    private attributes(
        result: UpstreamResult<ReplayPerformanceBody>,
        variant: string,
    ) {
        const value = requireValue(result);

        if (!result.ok) {
            console.log(
                `Replay calculation with ${variant} failed: ${result.code} ${result.message}`,
            );
        }

        return value;
    }
}

/**
 * `<score id>_<rest>.odr` gives the score ID; any other name gives 0, as before.
 */
export function scoreIdOf(fileName: string): number {
    const parts = basename(fileName).split("_");
    const id = parts.length === 2 ? Number.parseInt(parts[0]!, 10) : 0;

    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}
```

Run → PASS.

- [ ] **Step 7: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Submit replays as recent plays and dan course scores"
```

---

### Task 14: Replay watcher

**Files:**

- Modify: `src/dependencies/register.ts` (add `import "../runtime/ReplayWatcher";` so the class registers)
- Create: `src/runtime/TaskQueue.ts`, `src/runtime/ReplayWatcher.ts`, `src/jobs/backoff.ts`
- Modify: `src/dependencies/tokens.ts`
- Test: `tests/unit/runtime/TaskQueue.test.ts`, `tests/unit/runtime/ReplayWatcher.test.ts`, `tests/unit/jobs/backoff.test.ts`

**Interfaces:**

- Consumes: `IReplaySubmissionService` (Task 13), `IReplayStore` (Task 8), `Config`.
- Produces:

```ts
// src/jobs/backoff.ts
/** min(baseMs × 2^attempt, maxMs), attempt counted from 0. */
export function backoffDelay(
    attempt: number,
    baseMs: number,
    maxMs: number,
): number;
/** Resolves after `ms`, or early (without throwing) when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void>;

// src/runtime/TaskQueue.ts
export class TaskQueue implements AsyncDisposable {
    constructor(concurrency: number);
    /** Queues a task under a key; ignored (returns false) while that key is queued or running. Task errors are logged. */
    add(key: string, task: () => Promise<void>): boolean;
    /** Queued plus running. */
    get size(): number;
    /** Resolves when nothing is queued or running. */
    onIdle(): Promise<void>;
    /** Drops queued tasks and waits for running ones. */
    [Symbol.asyncDispose](): Promise<void>;
}

// src/runtime/ReplayWatcher.ts
export class ReplayWatcher implements AsyncDisposable {
    constructor(
        config: Config,
        store: IReplayStore,
        submissions: IReplaySubmissionService,
    );
    /** Watches the unprocessed folder, then queues the files already there. */
    start(): Promise<void>;
    /** Processes one file now (used by the watcher and the backlog; exposed for tests). */
    handle(fileName: string): Promise<void>;
}
```

- Token: `replayWatcher` (an `@Injectable` class; `index.ts` resolves it).

- [ ] **Step 1: Write the failing backoff and queue tests**

`tests/unit/jobs/backoff.test.ts`: `backoffDelay(0, 30_000, 600_000)` = 30 000; `(1)` = 60 000; `(4)` = 480 000; `(5)` = 600 000; `(50)` = 600 000. `sleep(10_000, aborted signal)` resolves immediately; `sleep` resolves early when aborted midway (fake timers).

`tests/unit/runtime/TaskQueue.test.ts`:

1. Never runs more than `concurrency` tasks at once (record a running counter's maximum with deferred promises).
2. `add` with a key that is queued or running returns `false` and does not run twice; after it finishes, the same key can be added again.
3. A throwing task is logged (`console.error` spy) and the queue continues.
4. `onIdle` resolves after all tasks finish, and immediately when empty.
5. Disposing drops queued tasks (they never run) and waits for running ones; `add` after disposal returns `false`.

- [ ] **Step 2: Run, implement, run**

Run → FAIL. Implement:

```ts
// src/jobs/backoff.ts
import { setTimeout as delay } from "node:timers/promises";

export function backoffDelay(
    attempt: number,
    baseMs: number,
    maxMs: number,
): number {
    return Math.min(baseMs * 2 ** Math.min(attempt, 30), maxMs);
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    try {
        await delay(ms, undefined, { signal });
    } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
            throw e;
        }
    }
}
```

```ts
// src/runtime/TaskQueue.ts
/**
 * Runs keyed tasks with a concurrency limit. A key is never queued or running twice at once.
 */
export class TaskQueue implements AsyncDisposable {
    private readonly queue: { key: string; task: () => Promise<void> }[] = [];
    private readonly keys = new Set<string>();
    private readonly running = new Set<Promise<void>>();
    private idleWaiters: (() => void)[] = [];
    private disposed = false;

    constructor(private readonly concurrency: number) {}

    get size(): number {
        return this.queue.length + this.running.size;
    }

    add(key: string, task: () => Promise<void>): boolean {
        if (this.disposed || this.keys.has(key)) {
            return false;
        }

        this.keys.add(key);
        this.queue.push({ key, task });
        this.next();

        return true;
    }

    onIdle(): Promise<void> {
        return this.size === 0
            ? Promise.resolve()
            : new Promise((resolve) => this.idleWaiters.push(resolve));
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.disposed = true;

        for (const { key } of this.queue.splice(0)) {
            this.keys.delete(key);
        }

        await Promise.all(this.running);
    }

    private next(): void {
        while (
            !this.disposed &&
            this.running.size < this.concurrency &&
            this.queue.length > 0
        ) {
            const { key, task } = this.queue.shift()!;
            const run = task()
                .catch((e: unknown) => {
                    console.error(`Task ${key} failed:`, e);
                })
                .finally(() => {
                    this.running.delete(run);
                    this.keys.delete(key);
                    this.next();

                    if (this.size === 0) {
                        for (const resolve of this.idleWaiters.splice(0)) {
                            resolve();
                        }
                    }
                });

            this.running.add(run);
        }
    }
}
```

Run → PASS.

- [ ] **Step 3: Write the failing watcher tests**

`tests/unit/runtime/ReplayWatcher.test.ts`. Uses a real temp folder for the unprocessed directory (`mkdtempDisposable`), a real `ReplayStore` over it, and a fake submission service whose `process` is a `vi.fn` returning scripted results.

1. `handle("a.txt")` deletes the file without calling the service.
2. `handle("1_x.odr")` with result `delete` → service called with `("1_x.odr", contents)`, file deleted, a log line `Processed replay 1_x.odr: processed`.
3. Result `keep` → file kept; with fake timers (`vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })`), the file is handled again after 30 s, then 60 s after a second `keep`; once it returns `delete`, no more retries and the attempt count resets.
4. `keep` with `retryAfterMs: 120_000` on the first attempt → next attempt after 120 s (the larger of backoff and `retryAfterMs`, capped at 10 minutes).
5. `handle` for a file that disappeared → no service call, no error.
6. `start()` processes files already in the folder (backlog) and files created later (`writeFile` after `start`; wait with `vi.waitFor(..., { timeout: 10_000 })`), each exactly once even though the backlog scan and the watcher may both see a file at startup (count service calls per file name).
7. A file written in two parts 500 ms apart (`open`, write half, wait, write the rest, close) is processed once, with the full contents (Review Focus 2).
8. Disposing stops the watcher (a file created afterwards is not processed within 3 s), cancels retry timers, and waits for a running `process` call to finish.
9. Concurrency: with `replayConcurrency: 2` and five backlog files whose `process` waits on a deferred promise, at most two calls are in flight.

- [ ] **Step 4: Run, implement, run**

Run → FAIL. `src/runtime/ReplayWatcher.ts`:

```ts
const retryBaseMs = 30_000;
const retryMaxMs = 10 * 60_000;

/**
 * Processes replays the game drops into the unprocessed folder: those present at startup, then new ones once fully
 * written. Files that fail temporarily stay on disk and are retried with backoff (and at the latest on the next
 * startup).
 */
@Injectable(dependencyTokens.replayWatcher)
export class ReplayWatcher implements AsyncDisposable {
    private readonly queue: TaskQueue;
    private readonly attempts = new Map<string, number>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private watcher: FSWatcher | undefined;
    private stopped = false;

    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
        @inject(dependencyTokens.replayStore)
        private readonly store: IReplayStore,
        @inject(dependencyTokens.replaySubmissionService)
        private readonly submissions: IReplaySubmissionService,
    ) {
        this.queue = new TaskQueue(config.replayConcurrency);
    }

    async start(): Promise<void> {
        const watcher = watch(this.config.replayDirectories.unprocessed, {
            ignoreInitial: true,
            depth: 0,
            awaitWriteFinish: true,
        });

        this.watcher = watcher;
        watcher.on("add", (path) => this.enqueue(basename(path)));
        watcher.on("error", (e) => console.error("Replay watcher error:", e));
        await new Promise<void>((resolve) =>
            watcher.once("ready", () => resolve()),
        );

        const backlog = await this.store.list("unprocessed");

        if (backlog.length > 0) {
            console.log(
                `Processing ${backlog.length.toString()} unprocessed replay file(s)`,
            );
        }

        for (const fileName of backlog) {
            this.enqueue(fileName);
        }
    }

    async handle(fileName: string): Promise<void> {
        if (!fileName.endsWith(".odr")) {
            await this.store.delete("unprocessed", fileName);
            return;
        }

        const file = await this.store.read("unprocessed", fileName);

        if (!file) {
            this.attempts.delete(fileName);
            return;
        }

        const result = await this.submissions.process(fileName, file);

        if (result.action === "delete") {
            await this.store.delete("unprocessed", fileName);
            this.attempts.delete(fileName);
            console.log(`Processed replay ${fileName}: ${result.reason}`);
            return;
        }

        this.scheduleRetry(fileName, result.retryAfterMs, result.reason);
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.stopped = true;

        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }

        this.timers.clear();
        await this.watcher?.close();
        await this.queue[Symbol.asyncDispose]();
    }

    private enqueue(fileName: string): void {
        if (!this.stopped) {
            this.queue.add(fileName, () => this.handle(fileName));
        }
    }

    private scheduleRetry(
        fileName: string,
        retryAfterMs: number | undefined,
        reason: string,
    ): void {
        if (this.stopped) {
            return;
        }

        const attempt = this.attempts.get(fileName) ?? 0;
        const delayMs = Math.min(
            Math.max(
                backoffDelay(attempt, retryBaseMs, retryMaxMs),
                retryAfterMs ?? 0,
            ),
            retryMaxMs,
        );

        this.attempts.set(fileName, attempt + 1);
        console.log(
            `Keeping replay ${fileName} (${reason}); retrying in ${Math.round(delayMs / 1000).toString()} s`,
        );
        clearTimeout(this.timers.get(fileName));
        this.timers.set(
            fileName,
            setTimeout(() => {
                this.timers.delete(fileName);
                this.enqueue(fileName);
            }, delayMs),
        );
    }
}
```

`handle`'s errors (a failed read or delete) are caught and logged by `TaskQueue`; the file stays and is retried on the next startup. Check chokidar 5's types for `FSWatcher` and the `add` handler's path argument.

Run → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Watch the unprocessed folder for new replays"
```

---

### Task 15: Uncalculated-replay pass

**Files:**

- Modify: `src/dependencies/register.ts` (add `import "../runtime/UncalculatedScheduler";` so the class registers)
- Create: `src/services/IUncalculatedReplayService.ts`, `src/services/UncalculatedReplayService.ts`
- Create: `src/runtime/UncalculatedScheduler.ts`
- Modify: `src/services/index.ts`, `src/dependencies/tokens.ts`
- Test: `tests/unit/services/UncalculatedReplayService.test.ts`, `tests/unit/runtime/UncalculatedScheduler.test.ts`

**Interfaces:**

- Consumes: `IOfficialScoreRepository`, `scoreColumns` (Task 5); `IReplayStore` (Task 8); `IScoreCalculator`, `ppMultiplierFrom`, `calculateUserTotals`, `countedBestScores` (Task 9); `IBestScoreWriter` (Task 10); `TaskQueue` (Task 14).
- Produces:

```ts
export type UncalculatedOutcome = "processed" | "kept";
export interface IUncalculatedReplayService {
    /** One pass over the uncalculated folder, `UNCALCULATED_CONCURRENCY` files at once. Stops taking new files when `signal` aborts. */
    runPass(signal?: AbortSignal): Promise<void>;
    processFile(fileName: string): Promise<UncalculatedOutcome>;
}
export class UncalculatedScheduler implements AsyncDisposable {
    /** Runs a pass now, then every `UNCALCULATED_INTERVAL_MINUTES`; a pass never overlaps another. */
    start(): void;
}
```

- Tokens: `uncalculatedReplayService`, `uncalculatedScheduler`.

- [ ] **Step 1: Write the failing service tests**

`tests/unit/services/UncalculatedReplayService.test.ts`. Setup: in-memory official repository with user 7, leaderboard score `scoreRow({ id: 50, score: 1_000_000, pp: null })`, uncalculated row `uncalculatedRow({ replayfilename: "r.odr", score: 1_000_000, perfect: 401 })`, `uncalculated/r.odr` in the in-memory replay store, a real `BestScoreWriter` and `ScoreCalculator` over a `FakeBrokerClient` (replay total 90; `performance` calls: no-penalty total 100, best-score recalculation total as the test needs).

1. Happy path → `"processed"`: leaderboard `pp` is 90; best rows are `[{ id: 50, perfect: 401 (from the uncalculated row), pp: 90, ppMultiplier: 0.9, filename: <uncalculated row's filename> }]`; `best/50.odr` holds the replay; user 7's `pp` and `accuracy` come from `calculateUserTotals`; the uncalculated row and `uncalculated/r.odr` are gone.
2. Leaderboard score with a different `score` value → its `pp` stays `null`; the best row is still written.
3. An existing best row recalculating to 95 → not replaced (`changed: false`), user totals not written, row and file deleted.
4. An existing best row recalculating to 50 with ID 40 → replaced; `best/40.odr` deleted after the transaction.
5. No uncalculated row for the file → file deleted, nothing else touched.
6. No leaderboard score → row and file deleted.
7. Replay calculation fails permanently (`beatmapNotFound`) → `"processed"`; leaderboard `pp` set to `null`; no best row; row and file deleted.
8. No-penalty call fails permanently → same as 7.
9. Broker `retryLater` (first call, or the best-score recalculation) → `"kept"`; every table unchanged (transaction rolled back), file kept, no best replay written... (if a best replay was copied before the rollback, it is harmless; assert only the tables and the uncalculated file).
10. Repository throws (database error) → `"kept"`, file kept, error logged.
11. Missing file (listed, then gone) → its row is deleted.
12. `runPass` processes every file in the folder with at most `uncalculatedConcurrency` at once, logs `Calculating N uncalculated replay(s)` and one line per file; with an aborted signal it starts none.

- [ ] **Step 2: Run, implement, run**

Run → FAIL. `src/services/UncalculatedReplayService.ts`:

```ts
@Injectable(dependencyTokens.uncalculatedReplayService)
export class UncalculatedReplayService implements IUncalculatedReplayService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.bestScoreWriter)
        private readonly bestScores: IBestScoreWriter,
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async runPass(signal?: AbortSignal): Promise<void> {
        const files = await this.replays.list("uncalculated");

        if (files.length === 0 || signal?.aborted) {
            return;
        }

        console.log(
            `Calculating ${files.length.toString()} uncalculated replay(s)`,
        );

        await using queue = new TaskQueue(this.config.uncalculatedConcurrency);

        for (const fileName of files) {
            queue.add(fileName, async () => {
                if (!signal?.aborted) {
                    await this.processFile(fileName);
                }
            });
        }

        await queue.onIdle();
    }

    async processFile(fileName: string): Promise<UncalculatedOutcome> {
        try {
            const file = await this.replays.read("uncalculated", fileName);

            if (!file) {
                await this.official.deleteUncalculatedScore(fileName);
                console.log(
                    `Uncalculated replay ${fileName} is missing; removed its row`,
                );
                return "processed";
            }

            const stale = await this.official.transaction((repository) =>
                this.calculate(repository, fileName, file),
            );

            await this.replays.delete("uncalculated", fileName);
            await this.bestScores.removeReplays(stale);
            console.log(`Processed uncalculated replay ${fileName}`);

            return "processed";
        } catch (e) {
            console.error(
                `Keeping uncalculated replay ${fileName} for the next pass:`,
                e instanceof RetryLaterError ? e.message : e,
            );
            return "kept";
        }
    }

    /**
     * Everything that touches the official database, in one transaction. Returns best replays to delete after commit.
     */
    private async calculate(
        repository: IOfficialScoreRepository,
        fileName: string,
        file: Buffer,
    ): Promise<readonly number[]> {
        const row = await repository.findUncalculatedScore(fileName);

        if (!row) {
            return [];
        }

        const leaderboard = await repository.findScore(row.uid, row.hash);

        if (!leaderboard) {
            await repository.deleteUncalculatedScore(fileName);
            return [];
        }

        const variant = this.config.variants.liveDroid;
        const body = requireValue(
            await this.calculator.calculateReplay(variant, file),
        );
        const noPenalty =
            body &&
            requireValue(
                await this.calculator.noPenaltyTotal(variant, row.hash, body),
            );
        const pp = body && noPenalty !== null ? body.performance.total : null;

        // Both rows describe the same play only if their score values match.
        if (row.score === leaderboard.score) {
            await repository.setScorePP(leaderboard.id, pp);
        }

        let stale: readonly number[] = [];

        if (pp !== null && noPenalty !== null) {
            const {
                replayfilename: _replayfilename,
                filename,
                ...columns
            } = row;
            const outcome = await this.bestScores.consider(repository, {
                score: { ...columns, id: leaderboard.id },
                pp,
                ppMultiplier: ppMultiplierFrom(pp, noPenalty),
                title: filename,
                replay: file,
            });

            if (outcome.changed) {
                await repository.setUserTotals(
                    row.uid,
                    calculateUserTotals(
                        await repository.topBestScores(
                            row.uid,
                            countedBestScores,
                        ),
                    ),
                );
            }

            stale = outcome.staleReplayIds;
        }

        await repository.deleteUncalculatedScore(fileName);

        return stale;
    }
}
```

The candidate's title is the uncalculated row's `filename` (the game's title for the beatmap), as `pp-processor-node` stored it; no beatmap service call is needed. Adjust the destructuring so `ScoreColumns` type-checks (the uncalculated row has every shared column; `id` comes from the leaderboard score).

Run → PASS.

- [ ] **Step 3: Write the failing scheduler tests, implement**

`tests/unit/runtime/UncalculatedScheduler.test.ts` (fake timers, fake service with a `runPass` `vi.fn`):

1. `start()` runs a pass immediately, then every `uncalculatedIntervalMinutes` minutes.
2. A pass still running when the interval fires is not started again (deferred promise), and a log line says it was skipped.
3. A failing pass is logged and the next interval still runs.
4. Disposing aborts the running pass's signal, waits for it to finish, and stops the interval.

```ts
@Injectable(dependencyTokens.uncalculatedScheduler)
export class UncalculatedScheduler implements AsyncDisposable {
    private timer: NodeJS.Timeout | undefined;
    private running: Promise<void> | undefined;
    private readonly abort = new AbortController();

    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
        @inject(dependencyTokens.uncalculatedReplayService)
        private readonly service: IUncalculatedReplayService,
    ) {}

    start(): void {
        this.run();
        this.timer = setInterval(
            () => this.run(),
            this.config.uncalculatedIntervalMinutes * 60_000,
        );
    }

    async [Symbol.asyncDispose](): Promise<void> {
        clearInterval(this.timer);
        this.abort.abort();
        await this.running;
    }

    private run(): void {
        if (this.running) {
            console.log(
                "Previous uncalculated pass still running; skipping this one",
            );
            return;
        }

        this.running = this.service
            .runPass(this.abort.signal)
            .catch((e: unknown) => {
                console.error("Uncalculated pass failed:", e);
            })
            .finally(() => {
                this.running = undefined;
            });
    }
}
```

Run → PASS.

- [ ] **Step 4: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Calculate scores the game recorded as uncalculated"
```

---

### Task 16: Recalculation jobs

**Files:**

- Modify: `src/dependencies/register.ts` (add `import "../jobs/JobRunner";` so the class registers)
- Create: `src/jobs/IJobRunner.ts`, `src/jobs/JobRunner.ts`
- Create: `src/services/IScoreRecalculationService.ts`, `ScoreRecalculationService.ts`, `ITotalPPService.ts`, `TotalPPService.ts`
- Modify: `src/services/index.ts`, `src/dependencies/tokens.ts`
- Test: `tests/unit/jobs/JobRunner.test.ts`, `tests/unit/services/ScoreRecalculationService.test.ts`, `tests/unit/services/TotalPPService.test.ts`

**Interfaces:**

- Consumes: `IJobProgressRepository` (Task 4), `backoffDelay`, `sleep` (Task 14), `RetryLaterError` (Task 3), and Tasks 5, 7, 8, 9, 10.
- Produces:

```ts
export interface JobRunOptions {
    readonly job: JobDefinition;
    readonly concurrency: number;
    readonly signal: AbortSignal;
    /** Processes one ID. Throwing (any error) retries the same ID with backoff. */
    readonly process: (id: number) => Promise<void>;
}
export type JobRunResult = "finished" | "interrupted";
export interface IJobRunner {
    /** @throws {JobConflictError} */
    run(options: JobRunOptions): Promise<JobRunResult>;
}
export class JobRunner implements IJobRunner {
    constructor(repository: IJobProgressRepository);
    /** Waits between retries; tests replace it. */
    wait: (ms: number, signal: AbortSignal) => Promise<void>;
}
export interface IScoreRecalculationService {
    recalculate(scoreId: number): Promise<void>;
}
export interface ITotalPPService {
    recalculate(uid: number, now?: Date): Promise<void>;
}
```

- Tokens: `scoreRecalculationService`, `totalPPService`, `jobRunner` (`InjectionToken<IJobRunner>`). `IJobRunner` lives in `src/jobs/IJobRunner.ts`; the CLI depends on the interface (Task 17's tests pass a fake). `wait` is a public property with a default rather than a constructor parameter, so the container never tries to inject it.

- [ ] **Step 1: Write the failing runner tests**

`tests/unit/jobs/JobRunner.test.ts`, against a real `JobProgressRepository` on PGlite (`createTestDatabase`), `wait` replaced by a `vi.fn` that resolves immediately and records delays:

1. Processes every ID of `[1, 2500]` with chunk size 1000 and concurrency 3 exactly once (collect IDs, compare with the full range) and returns `"finished"`; status afterwards: 3 done.
2. Each chunk is processed in ascending order.
3. A `RetryLaterError("busy", 7000)` on ID 5 once → ID 5 retried after 7000 ms, then the run continues; no ID skipped.
4. A plain `Error` on ID 5 twice → retried after 5000, then 10000 ms (backoff from 5 s, doubling, max 5 minutes: `backoffDelay(attempt, 5000, 300_000)`), logged each time.
5. Abort after ID 1500 is processed (the `process` callback aborts the controller at 1500): returns `"interrupted"`; the chunk `[1001, 2000]` is in progress with `lastProcessedId` 1500. A second `run` with concurrency 1 (Review Focus 4) processes exactly `1501..2500` plus any chunk never started, and returns `"finished"`.
6. Abort during a retry wait → returns `"interrupted"` without recording the failed ID as processed.
7. A run with the same name and a different range rejects with `JobConflictError` before processing anything.
8. Logs one line per finished chunk (`Chunk 1–1000 done`), not per ID.

- [ ] **Step 2: Run, implement, run**

Run → FAIL. `src/jobs/JobRunner.ts`:

```ts
const retryBaseMs = 5000;
const retryMaxMs = 5 * 60_000;

/**
 * Runs a chunked, resumable job. Workers claim chunks from Postgres, so any concurrency can resume any run. An ID is
 * never skipped: failures retry the same ID until it succeeds or the run is interrupted.
 */
@Injectable(dependencyTokens.jobRunner)
export class JobRunner implements IJobRunner {
    wait: (ms: number, signal: AbortSignal) => Promise<void> = sleep;

    constructor(
        @inject(dependencyTokens.jobProgressRepository)
        private readonly repository: IJobProgressRepository,
    ) {}

    async run(options: JobRunOptions): Promise<JobRunResult> {
        const { job, signal } = options;
        const created = await this.repository.createJob(job);

        if (!created) {
            const released = await this.repository.releaseInProgress(job.name);

            console.log(
                `Resuming job ${job.name}${released > 0 ? ` (${released.toString()} interrupted chunk(s))` : ""}`,
            );
        }

        await Promise.all(
            Array.from({ length: options.concurrency }, (_, worker) =>
                this.work(worker, options),
            ),
        );

        return signal.aborted ? "interrupted" : "finished";
    }

    private async work(worker: number, options: JobRunOptions): Promise<void> {
        const { job, signal } = options;

        while (!signal.aborted) {
            const chunk = await this.repository.claimChunk(job.name, worker);

            if (!chunk) {
                return;
            }

            const first = Math.max(
                chunk.start,
                (chunk.lastProcessedId ?? chunk.start - 1) + 1,
            );

            for (let id = first; id <= chunk.end; ++id) {
                if (!(await this.processWithRetry(id, options))) {
                    return;
                }

                await this.repository.recordProgress(job.name, chunk.start, id);
            }

            await this.repository.completeChunk(job.name, chunk.start);
            console.log(
                `Chunk ${chunk.start.toString()}–${chunk.end.toString()} done`,
            );
        }
    }

    /**
     * @returns false if the run was interrupted before the ID succeeded.
     */
    private async processWithRetry(
        id: number,
        options: JobRunOptions,
    ): Promise<boolean> {
        for (let attempt = 0; !options.signal.aborted; ++attempt) {
            try {
                await options.process(id);
                return true;
            } catch (e) {
                const backoff = backoffDelay(attempt, retryBaseMs, retryMaxMs);
                const delayMs =
                    e instanceof RetryLaterError && e.retryAfterMs !== undefined
                        ? Math.min(e.retryAfterMs, retryMaxMs)
                        : backoff;

                console.log(
                    `ID ${id.toString()} failed (${e instanceof Error ? e.message : String(e)}); retrying in ${Math.round(delayMs / 1000).toString()} s`,
                );
                await this.wait(delayMs, options.signal);
            }
        }

        return false;
    }
}
```

Run → PASS.

- [ ] **Step 3: Write the failing per-score tests**

`tests/unit/services/ScoreRecalculationService.test.ts`. Setup: in-memory official repository and replay store, `FakeBrokerClient`, `FakeBeatmapServiceClient` (default: ranked, title "T"), real `ScoreCalculator` and `BestScoreWriter`, `testConfig`.

1. Missing score → nothing changes, no calls.
2. Score value 0 → `scores.pp = null` and `pp = 0` on the best row with that ID (if any); no broker call.
3. Beatmap not found, and beatmap `RankedStatus.Loved` / `Qualified` → invalidated the same way; `Approved` is calculated.
4. Beatmap service retry → throws `RetryLaterError`; nothing changes.
5. Calculation (total 100) with `ppMultiplier: 0.8` → `scores.pp = 80`; best row for the player and beatmap is the score's own row with `pp: 80`, `ppMultiplier: 0.8`, `filename: "T"`; `best/<id>.odr` copied from `online/<id>.odr`; beatmap service called with lane `bulk`.
6. `ppMultiplier: null` → pp × 1, best row's `ppMultiplier` 1. `ppMultiplier: 1.4` → pp × 1, best row's `ppMultiplier` 1.4 (stored as is).
7. A higher existing best row of another score (recalculated higher) → kept; `scores.pp` still written.
8. Calculation fails permanently → `scores.pp = null`; best rows untouched.
9. Calculation retry → throws `RetryLaterError`; nothing changes.
10. A stale replay from a replaced best row is deleted after the transaction.
11. The score's own best row from an earlier run is replaced by its recalculated self (no duplicate rows; its replay not deleted).

- [ ] **Step 4: Run, implement, run**

Run → FAIL. `src/services/ScoreRecalculationService.ts`:

```ts
const rankedStatuses = new Set([RankedStatus.Ranked, RankedStatus.Approved]);

@Injectable(dependencyTokens.scoreRecalculationService)
export class ScoreRecalculationService implements IScoreRecalculationService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
        @inject(dependencyTokens.beatmapServiceClient)
        private readonly beatmaps: IBeatmapServiceClient,
        @inject(dependencyTokens.scoreCalculator)
        private readonly calculator: IScoreCalculator,
        @inject(dependencyTokens.bestScoreWriter)
        private readonly bestScores: IBestScoreWriter,
        @inject(dependencyTokens.replayStore)
        private readonly replays: IReplayStore,
        @inject(dependencyTokens.cliConfig) private readonly config: CliConfig,
    ) {}

    /**
     * @throws {RetryLaterError} If the beatmap service or broker asks to retry. Database errors are thrown as is.
     */
    async recalculate(scoreId: number): Promise<void> {
        const score = await this.official.findScoreById(scoreId);

        if (!score) {
            return;
        }

        if (score.score === 0) {
            await this.invalidate(scoreId);
            return;
        }

        const beatmap = requireValue(
            await this.beatmaps.getBeatmap("bulk", score.hash),
        );

        if (!beatmap || !rankedStatuses.has(beatmap.rankedStatus)) {
            await this.invalidate(scoreId);
            return;
        }

        const result = requireValue(
            await this.calculator.calculateStats(
                this.config.variants.liveDroid,
                score,
            ),
        );
        const replay = result
            ? await this.replays.readScoreReplay("online", scoreId)
            : null;

        const stale = await this.official.transaction(async (repository) => {
            if (!result) {
                await repository.setScorePP(scoreId, null);
                return [];
            }

            const pp =
                result.performance.total *
                effectiveMultiplier(score.ppMultiplier);

            await repository.setScorePP(scoreId, pp);

            const outcome = await this.bestScores.consider(repository, {
                score: scoreColumns(score),
                pp,
                ppMultiplier: score.ppMultiplier ?? 1,
                title: beatmap.title,
                replay,
            });

            return outcome.staleReplayIds;
        });

        await this.bestScores.removeReplays(stale);
    }

    private invalidate(scoreId: number): Promise<void> {
        return this.official.transaction(async (repository) => {
            await repository.setScorePP(scoreId, null);
            await repository.setBestScorePP(scoreId, 0);
        });
    }
}
```

Run → PASS.

- [ ] **Step 5: Write the failing total pp tests, implement**

`tests/unit/services/TotalPPService.test.ts` with `now = new Date("2026-10-10T00:00:00Z")`:

1. Unknown user → nothing written.
2. Last login 91 days before `now` → `{ pp: 0, accuracy: 1 }` written to that user (and not to the next user: put users 7 and 8 in the repository and check 8 is unchanged; this is the old script's off-by-one).
3. Last login 89 days ago, or `null` → totals from the best rows (two rows: pp 100/acc 1 and pp 50/acc 0.5).
4. No best rows → `{ pp: 0, accuracy: 1 }`.

```ts
const inactiveAfterMs = 3 * 30 * 24 * 60 * 60 * 1000;

@Injectable(dependencyTokens.totalPPService)
export class TotalPPService implements ITotalPPService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
    ) {}

    async recalculate(uid: number, now = new Date()): Promise<void> {
        const user = await this.official.findUserLastLogin(uid);

        if (!user) {
            return;
        }

        // Players who have not logged in for 3 months are left out of the rankings, as before.
        const inactive =
            user.lastLoginTime !== null &&
            user.lastLoginTime.getTime() < now.getTime() - inactiveAfterMs;

        await this.official.setUserTotals(
            uid,
            inactive
                ? { pp: 0, accuracy: 1 }
                : calculateUserTotals(
                      await this.official.topBestScores(uid, countedBestScores),
                  ),
        );
    }
}
```

Run → PASS.

- [ ] **Step 6: Commit**

```bash
pnpm --filter @dpp/score-service test && pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Recalculate scores and total pp as resumable jobs"
```

---

### Task 17: CLI

**Files:**

- Create: `src/cli/arguments.ts`, `src/cli/run.ts`, `src/cli.ts`
- Test: `tests/unit/cli/arguments.test.ts`, `tests/unit/cli/run.test.ts`

**Interfaces:**

- Consumes: `JobRunner`, `IScoreRecalculationService`, `ITotalPPService`, `IJobProgressRepository` (Tasks 4, 16).
- Produces:

```ts
export type CliCommand =
    | {
          readonly name: "recalculate-scores" | "recalculate-total-pp";
          readonly job: string;
          readonly from: number;
          readonly to: number;
          readonly concurrency: number;
          readonly chunkSize: number;
      }
    | { readonly name: "job-status"; readonly job: string };
export class CliUsageError extends Error {}
/** @throws {CliUsageError} */
export function parseCliArguments(argv: readonly string[]): CliCommand;

export interface CliDependencies {
    readonly runner: IJobRunner;
    readonly scores: IScoreRecalculationService;
    readonly totalPP: ITotalPPService;
    readonly progress: Pick<IJobProgressRepository, "status">;
    readonly signal: AbortSignal;
    readonly out: { log(line: string): void; error(line: string): void };
}
/** Exit code: 0 finished or status printed, 1 usage or conflict error, 130 interrupted. */
export function runCli(
    argv: readonly string[],
    deps: CliDependencies,
): Promise<number>;
```

- [ ] **Step 1: Write the failing argument tests**

`tests/unit/cli/arguments.test.ts`:

1. `["recalculate-scores", "--name", "rescore-2026", "--from", "1", "--to", "100"]` → defaults `concurrency: 4`, `chunkSize: 1000`.
2. `--concurrency 8 --chunk-size 50` are read; `recalculate-total-pp` has the same options.
3. `["job-status", "rescore-2026"]` → `{ name: "job-status", job: "rescore-2026" }`.
4. Rejected with `CliUsageError` and a message naming the problem: no command; unknown command; missing `--name`, `--from`, or `--to`; `--from 5 --to 4` ("--from must not be greater than --to"); `--from 0`, `--from 1.5`, `--from abc`; `--concurrency 0`; `--chunk-size 0`; `--name Bad_Name`; an unknown option; `job-status` without a name or with two.

Implement with `util.parseArgs({ args, options: { name: { type: "string" }, from: { type: "string" }, to: { type: "string" }, concurrency: { type: "string" }, "chunk-size": { type: "string" } }, allowPositionals: true, strict: true })`, wrapping its `TypeError` in `CliUsageError`, and validate values with zod (`variantNameSchema` from `@dpp/shared` for job names, positive integers via `/^\d+$/` then `z.int().positive()`).

- [ ] **Step 2: Write the failing run tests**

`tests/unit/cli/run.test.ts` with fakes for `runner` (records options, returns a scripted result and calls `process` for a few IDs), `scores`, `totalPP`, `progress`, and an `out` collecting lines:

1. `recalculate-scores` calls `runner.run` with `job: { name, kind: "scores", from, to, chunkSize }`, the concurrency, the signal, and a `process` that calls `scores.recalculate(id)`; prints `Job rescore-2026 finished` and returns 0.
2. `recalculate-total-pp` uses `kind: "total-pp"` and `totalPP.recalculate`.
3. Runner returns `"interrupted"` → prints `Job rescore-2026 interrupted; run the same command to resume` and returns 130.
4. Runner throws `JobConflictError` → prints its message to `error`, returns 1.
5. Usage error → prints the message and a usage summary to `error`, returns 1.
6. `job-status` prints `Job rescore-2026 (scores): IDs 1–2500, chunk size 1000`, `Chunks: 1 done, 1 in progress, 1 pending`, and one line per active chunk `  1001–2000: worker 2, last processed 1500` (or `not started` when `lastProcessedId` is null); an unknown job prints `No job named x` and returns 1.

Implement `src/cli/run.ts` accordingly, with the usage text:

```
Usage:
  recalculate-scores --name <job> --from <score id> --to <score id> [--concurrency 4] [--chunk-size 1000]
  recalculate-total-pp --name <job> --from <uid> --to <uid> [--concurrency 4] [--chunk-size 1000]
  job-status <job>
```

- [ ] **Step 3: Write the CLI entry**

`src/cli.ts`:

```ts
import "./polyfills";
import {
    DatabaseConnection,
    getContainer,
    installLogPrefix,
    loadEnvironmentVariables,
} from "@dpp/server";
import { fileURLToPath } from "node:url";
import { runCli } from "./cli/run";
import { ConfigError, loadCliConfig } from "./config/config";
import { schema } from "./database/schema";
import { registerDependencies } from "./dependencies/register";
import { dependencyTokens } from "./dependencies/tokens";
import { OfficialDatabaseConnection } from "./official/connection";

/**
 * Recalculation jobs: `node dist/cli.mjs <command>`. Reads only the CLI variables. Applies pending migrations first.
 * SIGINT/SIGTERM let workers finish their current ID; the next run with the same name resumes.
 */
async function main(): Promise<number> {
    loadEnvironmentVariables(true);
    installLogPrefix("score-service");

    const config = loadCliConfig(process.env);

    await using database = new DatabaseConnection(config.database, schema);
    await using official = new OfficialDatabaseConnection(config.official);

    await database.migrate(
        fileURLToPath(new URL("./drizzle", import.meta.url)),
    );

    const container = getContainer();

    registerDependencies(container, {
        cliConfig: config,
        db: database.db,
        officialDb: official.db,
        officialTables: official.tables,
    });

    const abort = new AbortController();
    const stop = (signal: string) => {
        console.log(`Received ${signal}; finishing the current IDs`);
        abort.abort();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    // Awaited so the connections stay open until the command finishes.
    return await runCli(process.argv.slice(2), {
        runner: container.resolve(dependencyTokens.jobRunner),
        scores: container.resolve(dependencyTokens.scoreRecalculationService),
        totalPP: container.resolve(dependencyTokens.totalPPService),
        progress: container.resolve(dependencyTokens.jobProgressRepository),
        signal: abort.signal,
        out: console,
    });
}

main().then(
    (code) => {
        process.exitCode = code;
    },
    (e: unknown) => {
        console.error(e instanceof ConfigError ? e.message : e);
        process.exitCode = 1;
    },
);
```

Check `installLogPrefix`'s signature (it returns a disposable in the broker; the broker keeps it for the process lifetime) and match the broker's usage.

- [ ] **Step 4: Run, build, and commit**

Run: `pnpm --filter @dpp/score-service test` → PASS. Run: `pnpm --filter @dpp/score-service build` → `dist/index.mjs` does not exist yet (Task 18), but `dist/cli.mjs` must build. If tsdown fails on the missing `src/index.ts` entry, create `src/index.ts` with `import "./polyfills";` only and a comment `// Server entry: written in the next task.`

```bash
pnpm typecheck && pnpm lint && pnpm format && git add apps/score-service && git commit -m "Run recalculations from the command line"
```

---

### Task 18: Server entry, end-to-end tests, and documentation

**Files:**

- Create/replace: `src/index.ts`
- Create: `tests/e2e/score-service.e2e.test.ts`, `tests/utils/stubServices.ts`
- Create: `apps/score-service/README.md`

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Write the server entry**

`src/index.ts`:

```ts
import "./polyfills";
import {
    createShutdownHandler,
    DatabaseConnection,
    getContainer,
    GracefulServer,
    installLogPrefix,
    loadEnvironmentVariables,
} from "@dpp/server";
import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config/config";
import { schema } from "./database/schema";
import { registerDependencies } from "./dependencies/register";
import { dependencyTokens } from "./dependencies/tokens";
import { MongoConnections } from "./mongo/connections";
import { OfficialDatabaseConnection } from "./official/connection";

async function main(): Promise<void> {
    loadEnvironmentVariables();

    const config = loadConfig(process.env);

    // Kept for the process's whole lifetime, so never disposed.
    installLogPrefix("score-service");

    // Released in reverse order on shutdown: scheduler, watcher, server, dan course timer, then the databases.
    const resources = new AsyncDisposableStack();
    const container = getContainer();

    try {
        const database = resources.use(
            new DatabaseConnection(config.database, schema),
        );

        await database.db.execute(sql`select 1`);
        await database.migrate(
            fileURLToPath(new URL("./drizzle", import.meta.url)),
        );

        const official = resources.use(
            new OfficialDatabaseConnection(config.official),
        );

        await official.db.execute(sql`select 1`);

        const mongo = resources.use(
            await MongoConnections.connect(config.mongo),
        );

        registerDependencies(container, {
            cliConfig: config,
            config,
            db: database.db,
            officialDb: official.db,
            officialTables: official.tables,
            aliceDb: mongo.aliceDb,
            elainaDb: mongo.elainaDb,
        });

        const danCourses = container.resolve(dependencyTokens.danCourseService);

        await danCourses.load();
        resources.use(
            danCourses.startRefreshing(config.danCourseRefreshMinutes),
        );

        const server = resources.use(new GracefulServer());
        const port = await server.listen(
            createApp(container, server.middleware),
            config.port,
            config.host,
        );

        console.log(`Listening on ${config.host}:${port.toString()}`);

        const watcher = resources.use(
            container.resolve(dependencyTokens.replayWatcher),
        );

        await watcher.start();

        const scheduler = resources.use(
            container.resolve(dependencyTokens.uncalculatedScheduler),
        );

        scheduler.start();
    } catch (e) {
        await resources.disposeAsync().catch((disposeError: unknown) => {
            console.error(
                "Failed to release resources after a startup failure:",
                disposeError,
            );
        });

        throw e;
    }

    const shutdown = createShutdownHandler({ resources, timeoutMs: 30_000 });

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
}

main().catch((e: unknown) => {
    console.error("Startup failed:", e instanceof ConfigError ? e.message : e);
    process.exit(1);
});
```

The replay watcher and the uncalculated scheduler must be singletons (resolved once). Check how `registerInjectables` registers classes; if not as singletons, register these two with `Lifecycle.Singleton` in `registerDependencies`.

The `select 1` on the official database uses Drizzle's MySQL `execute`; adjust to whatever the mysql2 driver's API is (`official.db.execute(sql\`select 1\`)` works on Drizzle's mysql2 driver).

- [ ] **Step 2: Write the end-to-end tests**

`tests/utils/stubServices.ts`, built on `startHttpServer`:

```ts
/**
 * A broker stand-in. Performance calls answer 90 when the request has a total score or a replay (the scored call)
 * and 100 otherwise (the no-penalty call), so the game routes answer `pp_multiplier` 0.9.
 */
export async function startStubBroker(): Promise<
    TestHttpServer & { readonly requests: { path: string; body: unknown }[] }
>;

/**
 * A beatmap service stand-in: every hash is a ranked beatmap titled "Artist - Title (Mapper) [Hard]".
 */
export function startStubBeatmapService(): Promise<TestHttpServer>;

/**
 * A Discord metadata endpoint that records request bodies.
 */
export async function startStubDiscord(): Promise<
    TestHttpServer & { readonly bodies: unknown[] }
>;
```

The broker stub answers `GET /variants/<name>` with `{ name, mode: name.includes("osu") ? "osu" : "droid" }`, `POST /variants/<name>/performance` with `performanceBody(body.score?.totalScore === undefined ? 100 : 90)`, and `POST /variants/<name>/performance/replay` with `replayPerformanceBody(90)`; it records `{ path, body }` for each POST.

`tests/e2e/score-service.e2e.test.ts` has two parts.

**Always runs:**

```ts
const serviceDir = fileURLToPath(new URL("../../", import.meta.url));

beforeAll(() => {
    execFileSync("pnpm", ["run", "build"], {
        cwd: serviceDir,
        stdio: "inherit",
    });
});

it("stops with a message naming missing variables", async () => {
    const { code, stderr } = await runNode(
        join(serviceDir, "dist", "index.mjs"),
        { PATH: process.env.PATH, CI: "1" },
    );

    expect(code).toBe(1);
    expect(stderr).toContain("PORT");
    expect(stderr).toContain("BROKER_URL");
});

it("refuses to run the CLI without its variables", async () => {
    const { code, stderr } = await runNode(
        join(serviceDir, "dist", "cli.mjs"),
        { PATH: process.env.PATH, CI: "1" },
    );

    expect(code).toBe(1);
    expect(stderr).toContain("OFFICIAL_DB_HOST");
});
```

where `runNode(script, env)` spawns `node <script>` with exactly that environment (no inherited variables, so a developer's `.env` file is not read: `CI=1` disables `.env` loading) and resolves `{ code, stderr }` on exit.

**Runs when MariaDB is installed** (`describe.skipIf(!(await hasMariaDb()))`; MongoDB always comes from `mongodb-memory-server`). `beforeAll` (timeout 180 s):

1. `startTestPostgres()` (from `@dpp/server/testing`), `startTestMariaDb()` with `createOfficialTestDatabase(mariadb.settings)`, and insert user `{ id: 7, username: "player" }`.
2. `startTestMongo()`; connect a `MongoClient` to its URI and insert `{ discordid: "discord-7", previous_bind: [7] }` into `ElainaDB.userbind`. The server is fresh, so the fixed database names are safe.
3. Start the three stubs, make four folders with `mkdtempDisposable`, get a port with `freePort()`.
4. `startProcess` (from `@dpp/server/testing`; read its options in `packages/server/src/testing/process.ts`) running `node dist/index.mjs` with every variable from Task 3's test environment pointed at these resources (`OFFICIAL_DB_PREFIX` = the test database's prefix, both MongoDB URIs = the test server's URI, `CI=1`), then wait until `GET /online-scores` answers 401 (see how `apps/broker/tests/e2e/broker.e2e.test.ts` waits for readiness and reuse it).

`afterAll`: stop the service if still running (through its handle, never by name), then dispose everything else in reverse order.

Tests, in order:

```ts
it("answers /calculate-score in pp-processor-node's format", async () => {
    const response = await fetch(`${baseUrl}/calculate-score`, {
        method: "POST",
        body: new URLSearchParams({
            hash: testHash,
            mods: "[]",
            combo: "100",
            perfect: "90",
            good: "5",
            bad: "1",
            miss: "0",
            total_score: "1000",
        }),
    });

    expect(await response.json()).toEqual({ pp: 90, pp_multiplier: 0.9 });
});

it("answers null for an invalid /calculate-score", async () => {
    const response = await fetch(`${baseUrl}/calculate-score`, {
        method: "POST",
        body: new URLSearchParams({ hash: "x" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pp: null, pp_multiplier: null });
});

it("requires the API key for /online-scores", async () => {
    const response = await fetch(
        `${baseUrl}/online-scores?uid=7&hash=${testHash}&variant=live-droid`,
    );

    expect(response.status).toBe(401);
});

it.skipIf(!readReplayFixture("v3"))(
    "processes and deletes a dropped replay",
    async () => {
        const replay = readReplayFixture("v3")!;
        const parsed = (await parseReplay(replay))!;

        // The fixture's player must exist for the replay to be stored.
        await official.connection.db
            .insert(official.connection.tables.users)
            .values({ id: 8, username: parsed.v3!.playerName });
        await mongo
            .db("ElainaDB")
            .collection("userbind")
            .insertOne({ discordid: "discord-8", previous_bind: [8] });
        await writeFile(join(folders.unprocessed, "123_x.odr"), replay);

        await vi.waitFor(
            async () => expect(await readdir(folders.unprocessed)).toEqual([]),
            { timeout: 20_000 },
        );

        const replayCalls = broker.requests
            .filter((r) => r.path.endsWith("/performance/replay"))
            .map((r) => r.path);

        expect(replayCalls).toEqual(
            expect.arrayContaining([
                "/variants/live-droid/performance/replay",
                "/variants/live-osu/performance/replay",
            ]),
        );
        expect(
            await mongo
                .db("AliceDB")
                .collection("recentplays")
                .countDocuments({ uid: 8, scoreId: 123 }),
        ).toBe(1);
        expect(discord.bodies).toContainEqual(
            expect.objectContaining({ userId: "discord-8" }),
        );
    },
);

it("shuts down cleanly on SIGTERM", async () => {
    service.process.kill("SIGTERM");

    expect(await service.exited).toBe(0);
});
```

Adapt `service.process`/`service.exited` to what `startProcess` returns.

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @dpp/score-service test:e2e`
Expected: PASS. Stop any process you start by its handle or PID only.

- [ ] **Step 4: Write the README**

`apps/score-service/README.md`, following `apps/broker/README.md`'s structure:

1. **What it does:** the six jobs from the spec's Goals, one line each.
2. **Configuration:** every variable from `EnvironmentVariableKey` with default and purpose (the spec's table plus `OFFICIAL_DB_PREFIX`); the broker key must have no rate limit and `all_variants`; `LIVE_DROID_VARIANT`/`LIVE_OSU_VARIANT` should be aliases (e.g. `live-droid`), so a live update is a repointed alias. No production hosts or ports.
3. **Build and run:** `pnpm --filter @dpp/score-service build`; PM2 runs `dist/index.mjs` from `apps/score-service` (Node 24).
4. **Before the first deployment:**
    - If the production schema of the four official tables changed, update `src/official/schema.ts` to match (the tests generate their tables from it).
    - Count existing duplicate best rows: `SELECT uid, hash, COUNT(*) FROM <prefix>score_best GROUP BY uid, hash HAVING COUNT(*) > 1` (read-only), to know how much the first recalculation will clean up.
5. **Deployment:** one PM2 app for the server; it must never run at the same time as `pp-processor-node` (both would scan the uncalculated folder).
6. **CLI:** the three commands with examples; resuming; SIGINT behavior; run `recalculate-total-pp` after a score recalculation; run from `apps/score-service` with the same `.env`.
7. **API:** `GET /online-scores` (query, response, errors) and the two game routes (fields, `variant`, loopback only, always `200`).
8. **Tests:** `pnpm test` and `pnpm test:e2e`. MongoDB tests use `mongodb-memory-server` (downloads `mongod` once into `~/.cache/mongodb-binaries`; set `MONGOMS_DISTRO` if the OS is newer than its known builds); MariaDB tests start a throwaway `mariadbd` and are skipped when `mariadbd`/`mariadb-install-db` are missing (CI: install `mariadb-server`); replay fixtures (`tests/fixtures/replays/v3.odr`, optionally `v2.odr`) still to be provided; a real recent play document from the old backend to pin the mapping (`tests/fixtures/recent-play.json`).

- [ ] **Step 5: Full check and commit**

```bash
pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm --filter @dpp/score-service test:e2e && git add apps/score-service && git commit -m "Start the score service and document its deployment"
```

No root README yet: it is written after all services are done.
