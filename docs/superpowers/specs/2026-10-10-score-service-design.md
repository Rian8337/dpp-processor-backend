# Score Service Design

Date: 2026-10-10
Status: Draft, pending review

## Context

`dpp-processor-backend` is being rewritten as smaller services:

- **Processors** (done): each calculates difficulty and performance for one variant. Pure calculation; they depend only on their own database and the beatmap service.
- **Broker** (done): the public entry point for calculations; routes by variant name or alias, with per-key access and rate limits.
- **Score service** (this spec): everything that involves osu!droid scores, players, and replay files. It calls processors only through the broker.

Today this work is spread over two codebases:

- **The old dpp backend** (`~/Projects/dpp-processor-backend`):
    - the replay listener (`src/utils/dppUtil.ts`): watches a folder for new replays, stores recent plays and dan course scores in MongoDB, updates Discord metadata;
    - the online-score lookup route (`src/routes/get-online-score-attributes.ts`);
    - ten copies of the score recalculation script (`src/calculateScores*.ts`, each with a hard-coded ID range and process ID);
    - the total pp script (`src/calculateTotalPP.ts`).
- **`pp-processor-node`** (`~/Projects/pp-processor-node`):
    - the game server's pp endpoints (`/calculate-score`, `/calculate-replay`);
    - the uncalculated-replay pass: the game's recovery path, which calculates scores the game recorded as uncalculated while the pp processor was down.

Both embed calculator code, so a live algorithm update means rebuilding both. After this change, a live update is a new processor variant and a repointed alias; the game, the Discord bot, and recalculations all follow.

**`pp_multiplier`** (on scores and best scores): the ratio of a score's penalized pp to its no-penalty pp, recorded when the score was calculated from its replay. It compensates for missing replays: when an old score is recalculated from its stored stats alone, the replay-based penalties (tap, slider cheese) cannot be recomputed, so the stored multiplier carries them over. It is never above 1; a missing value means 1.

## Goals

- One service owns all score work: the replay listener, the online-score lookup for the Discord bot, the game server's pp endpoints, the uncalculated-replay pass, score recalculation, and total pp recalculation.
- Every pp value comes from a processor through the broker. The score service imports no difficulty or performance calculator.
- The game server keeps its contract: same endpoints, same request and response formats; only the address changes.
- Recent play and dan course documents keep their current shape (the Discord bot reads them).
- Recalculation is one resumable command with configurable concurrency, replacing the ten script copies.
- Temporary failures (a "retry later" from the broker or beatmap service, an unreachable database) never lose data: work is retried, not dropped or recorded as "not found".
- Paths, hosts, keys, and variants are configuration, never constants.

## Non-goals

- **How recalculation results are published.** This spec ports today's behavior: in place, score by score, while the game runs. A better strategy (e.g. shadow tables, per-user switching) is to be designed separately after the rewrite.
- **The score multiplier.** `pp-processor-node`'s `/calculate-score-multiplier` is a legacy route the game no longer calls; score multipliers belong to `score-processor-node`. It is not ported.
- **One-off migrations** (`populatePPMultiplier.ts`, `populateSliderInformation.ts`): not ported.
- Changes to the game server, the Discord bot's reading of MongoDB, or `score-processor-node`.
- Exposing the score service publicly. It is internal; the broker is the public entry point.

## Repository layout

```
apps/processor/        @dpp/processor (done; gains slider hit counts, see Processor contract addition)
apps/broker/           @dpp/broker (done)
apps/score-service/    @dpp/score-service (this spec)
packages/shared/       @dpp/shared (gains the slider hit count fields)
packages/server/       @dpp/server (reused)
```

## Processor contract addition

The game and the official database store slider **hits** (head, tick, repeat, end); the processor accepts slider **misses** (`sliderTicksMissed`, `sliderEndsDropped`). Converting needs the beatmap's object counts, which only the processor has after decoding the beatmap.

`scoreParametersSchema` in `@dpp/shared` gains four optional fields: `sliderHeadHits`, `sliderTickHits`, `sliderRepeatHits`, `sliderEndHits` (non-negative integers). Rules:

- Either all four hit counts are given, or none.
- They cannot be combined with `sliderTicksMissed` or `sliderEndsDropped` (`400 INVALID_REQUEST`).
- When given, the processor converts them exactly as `pp-processor-node` does (`src/utils/workers/calculationProcessor.ts`): `sliderTicksMissed = (sliders − sliderHeadHits) + (ticks − sliderTickHits) + (repeats − sliderRepeatHits)` and `sliderEndsDropped = sliderEnds − sliderEndHits`, using the decoded beatmap's counts. Counts above the beatmap's totals are `400 INVALID_REQUEST`.
- The resolved `score` in the response reports the converted miss counts.

This is a processor change, implemented and tested in `apps/processor` before the score service uses it. It is a backward-compatible addition: existing requests behave the same.

## Architecture

One app with two entry points:

- **Server** (`dist/index.mjs`, one PM2 app): the HTTP API, the replay listener, and the uncalculated-replay pass.
- **CLI** (`dist/cli.mjs`): `recalculate-scores`, `recalculate-total-pp`, `job-status`.

Same structure as the processor and broker: `@Injectable(token)` classes, tsyringe tokens, `I*` interfaces, and `@dpp/server` plumbing (router, error handling, `GracefulServer`, shutdown, log prefix `[score-service]`, `DatabaseConnection`).

### Data stores and outside services

| Store / service                         | Used for                                                                                                              | Access                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Official osu!droid **MySQL**            | scores, best scores, uncalculated scores, users: read; write `pp`, `pp_multiplier`, best scores, user `pp`/`accuracy` | Drizzle (mysql2); the same tables and columns the old code uses     |
| **MongoDB `aliceDb`** (remote cluster)  | recent plays, dan courses, dan course leaderboard                                                                     | official `mongodb` driver                                           |
| **MongoDB `elainaDb`** (remote cluster) | Discord user binds                                                                                                    | official `mongodb` driver                                           |
| Score service **Postgres**              | recalculation job progress                                                                                            | Drizzle, migrations applied at startup                              |
| Replay folders (local)                  | replays to read; best replays to write                                                                                | `ReplayStore`                                                       |
| **Broker**                              | every pp calculation                                                                                                  | HTTP, `X-Api-Key` (a key with no rate limit and `all_variants`)     |
| **Beatmap service**                     | beatmap title and ranked status                                                                                       | HTTP; priority key for interactive work, bulk key for recalculation |
| Discord OAuth backend                   | metadata update after a recent play                                                                                   | HTTP                                                                |

Everything runs on the same machine except the two MongoDB clusters.

### Units

- **Clients**
    - `BrokerClient`: `performance(variant, request)`, `replayPerformance(variant, request)`, `variantInfo(variant)` (from `GET /variants/:name`, cached for 5 minutes). Results distinguish success, "not found / rejected" (4xx from the processor or broker), and "retry later" (`503`, `504`, `502`, `429`, connection failure), with any `Retry-After`.
    - `BeatmapServiceClient`: `getBeatmap(lane, hash)` returning title and ranked status, or "not found", or "retry later" (the beatmap service's `503`).
    - `DiscordMetadataClient`: `update(discordId)`.
- **Repositories**
    - `OfficialScoreRepository`: scores, best scores, uncalculated scores, users (MySQL).
    - `RecentPlayRepository`, `DanCourseRepository`, `UserBindRepository` (MongoDB).
    - `JobProgressRepository` (Postgres).
- **`ReplayStore`**: read, write, list, and delete replays in the configured folders.
- **Services**
    - `ScoreCalculator` (the shared core):
        - builds broker requests from an official score (stats and slider hit counts) or a replay;
        - checks whether a replay matches its score (port of `isReplayValid`);
        - applies `pp_multiplier`;
        - computes the no-penalty pp for the game's `pp_multiplier`.
    - `UserTotalsCalculator`: total pp and accuracy from a user's top 100 best scores, weighted by 0.95ⁱ (accuracy 1 when there are no scores).
    - `OnlineScoreService`, `GamePPService`, `ReplaySubmissionService`, `UncalculatedReplayService`, `ScoreRecalculationService`, `TotalPPService`.
- **Runtime**: `ReplayWatcher` (folder watch and startup backlog), `UncalculatedScheduler` (interval), the CLI.

The score service parses replays locally with the replay analyzer (header and v3 data: hash, player name, accuracy, mods) but never calculates difficulty or performance.

## HTTP API

The server binds to `HOST` (default `127.0.0.1`) and `PORT`. It is never exposed publicly.

### Online-score lookup (for the Discord bot)

`GET /online-scores?uid=<number>&hash=<md5>&variant=<name>&best=<bool>&strainChart=<bool>`

- Requires `X-Api-Key: API_KEY` (`401 UNAUTHORIZED` otherwise).
- `best=false` (default) reads the player's score from `scores` and its replay from `ONLINE_REPLAY_DIR`; `best=true` reads `best_scores` and `BEST_REPLAY_DIR`. No score: `404 SCORE_NOT_FOUND`.
- The replay is parsed locally. A missing or unreadable replay counts as missing.
- Calculation, as the old route does:

| Replay                                         | Broker call                                                                                            | Multiplier                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| present, matches the score, version 3 or later | `POST /variants/:variant/performance/replay` with the replay                                           | 1                                                               |
| present, matches the score, version 1 or 2     | `/performance/replay` with mods and stats from the score as overrides (old replays do not record mods) | 1                                                               |
| missing, or does not match the score           | `POST /variants/:variant/performance` with the score's stats and slider hit counts                     | `min(1, pp_multiplier)` for droid variants; 1 for osu! variants |

The variant's mode comes from `variantInfo`.

- Response:

```json
{
    "score": {
        "id": 1,
        "uid": 2,
        "hash": "0123456789abcdef0123456789abcdef",
        "best": false
    },
    "source": "replay",
    "ppMultiplier": 1,
    "pp": 123.4,
    "calculation": {}
}
```

`source` is `"replay"` or `"score"`. `calculation` is the processor's response unchanged (including `strainChart` when requested). `pp` is `calculation.performance.total × ppMultiplier`.

- Errors: broker and processor errors pass through with their status and code (e.g. `404 VARIANT_NOT_FOUND`, `404 BEATMAP_NOT_FOUND`, `503`). Errors use the `{ error: { code, message } }` shape. `SCORE_NOT_FOUND` is added to the score service's error codes in `@dpp/shared`.

### Game pp endpoints (drop-in replacement for `pp-processor-node`)

Same paths, field names, body formats (multipart, URL-encoded, or JSON), and responses as `pp-processor-node`:

- `POST /calculate-score`. Fields:
    - `hash`, `mods` (serialized mods JSON);
    - `combo`, `perfect`, `good`, `bad`, `miss`, `total_score`;
    - optional `slider_head_hit`, `slider_tick_hit`, `slider_repeat_hit`, `slider_end_hit`, `pp_multiplier` (default 1).
- `POST /calculate-replay`: multipart field `replayfile`. Only replays of version 3 or later with `replayVersion > 6` are calculated, as today.
- Both accept an optional `variant` field (default `LIVE_DROID_VARIANT`). The game never sends it; it lets local tools calculate other variants.
- Response: `200 { "pp": number | null, "pp_multiplier": number | null }`.
    - `/calculate-score`: first call `/performance` with the score's stats, slider hit counts, and `totalScore`; `pp` = its total × the given `pp_multiplier`. A second call with the same stats but `tapPenalty: 1`, `sliderCheesePenalty: 1`, and no `totalScore` gives the no-penalty total. Response `pp_multiplier` = `pp / no-penalty total` (as `pp-processor-node` computes it).
    - `/calculate-replay`: `/performance/replay`; the no-penalty total comes from `/performance` with the resolved score from the first response (the beatmap by the replay's hash, its mods, `tapPenalty: 1`, `sliderCheesePenalty: 1`, no `totalScore`). `pp_multiplier` = `pp / no-penalty total`.
    - If the no-penalty total is 0, `pp_multiplier` is 1.
- Any failure (missing beatmap, a "retry later" from the broker, invalid input, unknown variant) answers `200 { "pp": null, "pp_multiplier": null }`, exactly as today, so the game records the score as uncalculated. A failure is logged with the reason (and the variant, when one was given).
- No key, as today. These two routes only accept connections from loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) and answer `403` otherwise, so they stay internal even if `HOST` is widened. Anyone who can reach them can calculate any variant, including private ones, through the score service's broker key; loopback is trusted, as with `pp-processor-node` today.

## Validation

Every boundary validates its input with zod (schemas for the HTTP inputs live in `@dpp/shared`, next to the processor's).

| Input                                            | Validation                                                                                                                                                                                                                                                                                 | On failure                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /online-scores` query                       | `uid` positive integer; `hash` 32 lowercase hex; `variant` matches `^[a-z0-9][a-z0-9-]*$`; `best` and `strainChart` booleans (`true`/`false`, default `false`)                                                                                                                             | `400 INVALID_REQUEST` with the first issue (`parseBody`-style message)                                                    |
| `/calculate-score` fields                        | `hash` 32 hex; `mods` parsed as JSON and checked with the shared serialized-mod schema; `combo`, `perfect`, `good`, `bad`, `miss`, `total_score` non-negative integers; the four `slider_*_hit` all or none, non-negative integers; `pp_multiplier` a number in (0, 1]; `variant` as above | `200 { "pp": null, "pp_multiplier": null }` (the game's contract) and a log line naming the invalid field                 |
| `/calculate-replay` upload                       | `replayfile` present and at most 2 MB; `variant` as above                                                                                                                                                                                                                                  | same `null` response                                                                                                      |
| Broker responses                                 | the fields the score service reads (`performance.total` and the other performance fields, the resolved `score`, `replay`, `difficulty`)                                                                                                                                                    | a malformed response is a permanent failure for that item (logged), not "retry later": retrying would get the same answer |
| Beatmap service responses                        | title and ranked status                                                                                                                                                                                                                                                                    | same as broker responses                                                                                                  |
| MongoDB documents read (dan courses, user binds) | checked when loaded                                                                                                                                                                                                                                                                        | an invalid dan course is skipped with a log line; an invalid bind is treated as "no bind"                                 |
| Official MySQL rows                              | typed by the Drizzle schema; nullable columns (`pp_multiplier`, slider hits, `pp`) handled explicitly                                                                                                                                                                                      | —                                                                                                                         |
| Environment                                      | zod (see Configuration)                                                                                                                                                                                                                                                                    | the process stops                                                                                                         |
| CLI arguments                                    | `util.parseArgs`; `from ≤ to`, positive integers, job names matching `^[a-z0-9][a-z0-9-]*$`                                                                                                                                                                                                | message and exit 1                                                                                                        |

## Replay listener

Port of the old backend's `initiateReplayProcessing` and `submitReplay`.

- **Trigger:** watch `UNPROCESSED_REPLAY_DIR` for new `.odr` files (only once a file has finished writing), and process the existing files at startup. Files that do not end in `.odr` are deleted, as today.
- **Score ID:** from the file name `<scoreId>_<rest>.odr`; otherwise 0.
- **Concurrency:** at most `REPLAY_CONCURRENCY` replays at once.
- **Per replay:**
    1. Parse it. Unparsable, or not version 3 or later: log and delete (the player cannot be identified).
    2. Find the player's uid by the replay's player name in the official database. Not found: log and delete.
    3. Calculate with `LIVE_DROID_VARIANT` and `LIVE_OSU_VARIANT` through `/performance/replay`. A beatmap that does not exist (`404 BEATMAP_NOT_FOUND`): store the recent play without attributes, as today.
    4. Get the beatmap title from the beatmap service (priority key); fall back to the replay's file name without `.osu`, as today.
    5. If the player has a Discord bind in `elainaDb`:
        - insert the recent play into `aliceDb` in today's document shape (below);
        - call the Discord metadata update; its failure is only logged.
    6. If the beatmap hash is a dan course: compute the grade (score, accuracy, combo, or the other requirement types, ported from `danCourseUtil.ts`) and update the leaderboard when the grade improves.
    7. Delete the file.
- **Retry instead of losing data:** a "retry later" from the broker or beatmap service, or an unreachable MySQL or MongoDB, keeps the file. It is retried with backoff (30 s, doubling up to 10 minutes) and at the latest at the next startup. (Today such failures delete the file.)
- **Dan courses** are loaded from `aliceDb` at startup and reloaded every `DAN_COURSE_REFRESH_MINUTES`.

### Recent play document

The document shape is unchanged (`IRecentPlay` in the old backend):

- `uid`, `title`, `combo`, `score`, `rank`, `date` (insert time), `accuracy` (`n300`, `n100`, `n50`, `nmiss`), `mods` (serialized), `hash`, `scoreId`;
- `hitError`, `sliderTickInformation`, `sliderEndInformation` (from the droid calculation's `replay`);
- `droidAttribs` and `osuAttribs`, each `{ params, difficulty, performance }`:
    - `params` maps the processor's resolved score to the old cloneable parameters: `accuracy`, `combo`, `sliderTicksMissed`, `sliderEndsDropped`, `tapPenalty`, `sliderCheesePenalty`, `totalScore`, and the mods;
    - `difficulty` is the processor's `difficulty` with `mods` serialized;
    - `performance` lists the same fields as today: droid `total`, `aim`, `tap`, `accuracy`, `flashlight`, `reading`, `deviation`, `tapDeviation`, `tapPenalty`, `sliderCheesePenalty`; osu! `total`, `aim`, `speed`, `accuracy`, `flashlight`.

A test pins this mapping against a document produced by the old code.

## Uncalculated-replay pass

Port of `pp-processor-node`'s `processUncalculatedReplay`.

- **Trigger:** at startup, then every `UNCALCULATED_INTERVAL_MINUTES` (today: startup only; the interval only acts on rows the game has marked uncalculated, so the game's normal flow is unaffected). Only one pass runs at a time; it processes `UNCALCULATED_CONCURRENCY` files at once.
- **Per file in `UNCALCULATED_REPLAY_DIR`**, in one MySQL transaction:
    1. Find the uncalculated score row by `replayfilename`. Missing: delete the file and move on.
    2. Find the leaderboard score by uid and hash. Missing: delete the row and the file.
    3. Calculate the replay with `LIVE_DROID_VARIANT`, plus the no-penalty call (as in `/calculate-replay`).
    4. If the leaderboard score has the same score value as the uncalculated one, set its `pp`.
    5. Find the best score for uid, hash, and mods:
        - if it exists, recalculate it from its stats; if its pp is at least the new pp, delete the row and the file and stop;
        - otherwise build a new best score from the uncalculated row (`pp` 0, `pp_multiplier` 1).
    6. Set the best score's `pp` and `pp_multiplier` (pp ÷ no-penalty pp). Copy the replay to `BEST_REPLAY_DIR/<scoreId>.odr`. Upsert the best score with the same column list and `ON DUPLICATE KEY UPDATE` columns as today.
    7. Recalculate the user's total pp and accuracy (`UserTotalsCalculator`) and update the user.
    8. Delete the row and the file.
- **On failure:** a "retry later" or database error rolls back and keeps the row and the file for the next pass. A calculation that fails permanently (e.g. the beatmap does not exist) behaves as today: the row and file are deleted, and the leaderboard score keeps a `null` pp.

## Score recalculation

Port of `calculateScores.ts`. The plan ports each branch with a test per branch, including today's quirks.

**Per score ID:**

1. Load the score. Missing: skip. Score value 0: invalidate (`scores.pp = null`, `best_scores.pp = 0` for that ID).
2. Look up the beatmap by the score's hash (bulk key). Missing, or not ranked or approved: invalidate.
3. Calculate the score from its stored stats and slider hit counts with `LIVE_DROID_VARIANT`; `pp = total × min(pp_multiplier ?? 1, 1)`. Write `scores.pp` (`null` if the calculation fails permanently).
4. Load the best score with the same ID. If it exists:
    - calculate it the same way;
    - write `best_scores.pp` = its total (unmultiplied, as today);
    - its candidate pp is total × `min(pp_multiplier, 1)`.
5. The higher candidate (the best score wins only if strictly higher) becomes the new best score:
    - upsert it with `filename` = the beatmap title, `pp` = the candidate pp, `pp_multiplier` = its multiplier (1 if null);
    - copy its replay (the score's from `ONLINE_REPLAY_DIR`, or the best score's from `BEST_REPLAY_DIR`) to `BEST_REPLAY_DIR/<scoreId>.odr`.

    No candidate (both calculations failed): log and move on.

**Command:** `recalculate-scores --name <job> --from <id> --to <id> [--concurrency <n>] [--chunk-size <n>]`

- A job splits `[from, to]` into chunks (default 1000 IDs) stored in Postgres. `--concurrency` workers (default 4) each claim the next pending chunk and process its IDs in order.
- **Resuming:** re-running the same `--name` skips finished chunks and restarts chunks that were in progress. Every step is idempotent, so reprocessing a score is safe. Starting a new `--name` with an existing name but a different range is refused.
- **"Retry later" is never a skip:** the worker waits for `Retry-After` (or backs off: 5 s, doubling up to 5 minutes) and retries the same score. A database error is retried the same way.
- **SIGINT/SIGTERM:** workers finish their current score, the chunk stays in progress, and the next run resumes it.
- **`job-status <name>`** prints the range, chunks done and pending, and the last processed ID per worker.

## Total pp recalculation

Port of `calculateTotalPP.ts`: `recalculate-total-pp --name <job> --from <uid> --to <uid> [--concurrency <n>]`, with the same chunked, resumable job mechanism.

Per user:

- No user: skip.
- Last login more than 3 months ago: set `pp` 0, `accuracy` 1.
- Otherwise: `UserTotalsCalculator` over the top 100 best scores; no best scores gives `pp` 0, `accuracy` 1.

**Deliberate fix:** the old script increments the user ID before writing in the "inactive" and "no scores" branches, so it updates the next user instead of the current one. The port updates the correct user.

## Configuration

Environment variables, validated with zod at startup; invalid values stop the process with a message naming the variables but not their values. The CLI needs only the database, official database, broker, beatmap service, variant, and replay folder variables.

| Variable                                                                                               | Default                              | Purpose                                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------- |
| `PORT`                                                                                                 | required                             | HTTP port                                         |
| `HOST`                                                                                                 | `127.0.0.1`                          | bind address (keep it non-public)                 |
| `API_KEY`                                                                                              | required, 16+ characters             | key for `/online-scores`                          |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`                | required (port 5432, password empty) | the score service's Postgres                      |
| `OFFICIAL_DB_HOST`, `OFFICIAL_DB_PORT`, `OFFICIAL_DB_NAME`, `OFFICIAL_DB_USER`, `OFFICIAL_DB_PASSWORD` | required (port 3306)                 | official MySQL                                    |
| `ALICE_DB_URI`, `ELAINA_DB_URI`                                                                        | required (server only)               | MongoDB clusters                                  |
| `BROKER_URL`, `BROKER_API_KEY`                                                                         | required                             | broker                                            |
| `BEATMAP_SERVICE_URL`, `BEATMAP_SERVICE_KEY`, `BEATMAP_SERVICE_BULK_KEY`                               | required                             | beatmap service, priority and bulk lanes          |
| `LIVE_DROID_VARIANT`, `LIVE_OSU_VARIANT`                                                               | required                             | variants (aliases recommended, e.g. `live-droid`) |
| `UNPROCESSED_REPLAY_DIR`, `ONLINE_REPLAY_DIR`, `BEST_REPLAY_DIR`, `UNCALCULATED_REPLAY_DIR`            | required                             | replay folders                                    |
| `DISCORD_METADATA_URL`, `DISCORD_METADATA_KEY`                                                         | required (server only)               | Discord metadata update                           |
| `REPLAY_CONCURRENCY`                                                                                   | 2                                    | listener                                          |
| `UNCALCULATED_CONCURRENCY`                                                                             | 1                                    | uncalculated pass                                 |
| `UNCALCULATED_INTERVAL_MINUTES`                                                                        | 10                                   | uncalculated pass                                 |
| `DAN_COURSE_REFRESH_MINUTES`                                                                           | 60                                   | dan course reload                                 |

For reference, the old hard-coded folders were `/hdd/rian/replays/unprocessed`, `/hdd/osudroid/odr/replay`, `/hdd/osudroid/odr/bestpp`, and `/hdd/osudroid/odr/uncalculated`.

## Runtime behavior

- **Server startup** (exit non-zero on failure):
    1. config;
    2. Postgres (with migrations), MySQL, both MongoDB clusters;
    3. load the dan courses;
    4. HTTP listen;
    5. start the replay watcher (backlog first) and the uncalculated scheduler.
- **Shutdown** on SIGINT/SIGTERM:
    1. stop accepting connections; stop the watcher and the scheduler;
    2. let in-flight requests, replays, and passes finish their current item (force exit after 30 s; unfinished files stay on disk);
    3. close the databases.
- **Logging:** `[score-service]` prefix. One line per processed replay, uncalculated file, and failed calculation (with the reason). Recalculation logs progress per chunk, not per score. API keys and replay contents are never logged.
- **Deployment:** one PM2 app for the server; the CLI is run by hand from `apps/score-service`. Switch-over from `pp-processor-node`:
    1. stop `pp-processor-node` (it must never run at the same time as the score service: both would scan `UNCALCULATED_REPLAY_DIR` and could process the same file twice);
    2. start the score service;
    3. point the game server's pp address at the score service.

    Then retire `pp-processor-node` and the old backend's listener and scripts. Between steps 1 and 3 the game's pp calls fail, so it records scores as uncalculated, and the score service's uncalculated pass calculates them.

## Testing

```
apps/score-service/tests/
  unit/          services, calculators, mapping, job runner, config
  integration/   HTTP layer (supertest + stub broker and beatmap service), job progress (PGlite),
                 official MySQL and MongoDB repositories (opt-in, see below)
  e2e/           the built server with stub broker and beatmap service and temporary folders
  fixtures/      replays (v3+ and older), beatmap metadata
```

- **Unit tests** (in-memory fakes for repositories, clients, and the replay store):
    - every recalculation branch, including the quirks;
    - the online-lookup decision table;
    - the game endpoints' `pp` and `pp_multiplier` arithmetic and every `null` case;
    - the listener's keep-or-delete decisions;
    - the uncalculated pass's best-score comparison;
    - `UserTotalsCalculator`;
    - chunk claiming and resuming;
    - the recent-play mapping against a document from the old code.
- **Integration tests:**
    - the HTTP layer through supertest, against stub broker and beatmap service servers;
    - the job-progress repository against PGlite;
    - the official MySQL and MongoDB repositories against real servers, only when `TEST_OFFICIAL_DB_*` and `TEST_MONGO_URI` are set (skipped otherwise, since no faithful in-memory stand-ins exist).
- **End-to-end** (`pnpm test:e2e`):
    - a replay dropped into the unprocessed folder is processed and deleted;
    - `/calculate-score` and `/calculate-replay` answer in the old format;
    - SIGTERM shuts down cleanly.
- **Processor:** tests for the slider hit count fields (conversion matches `pp-processor-node` on fixtures; invalid combinations rejected).

## Open items

- **Recalculation publishing strategy:** to be designed separately (see Non-goals).
- **Replay fixtures:** the processor's replay fixtures are still to be provided by the user; the score service's replay tests need them too (at least one v3+ replay, ideally a v1/v2 replay and its score row).
