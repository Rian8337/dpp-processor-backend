# Score service

Owns everything score-related for the osu!droid ecosystem. Every pp value comes from a processor through the broker;
the service imports no difficulty or performance calculator. See
`docs/superpowers/specs/2026-10-10-score-service-design.md`.

## What it does

- **Replay listener:** watches the unprocessed replay folder, calculates each replay for the live droid and osu!
  variants, stores the recent play (and updates dan course leaderboards), and notifies Discord.
- **Online-score lookup:** `GET /online-scores` reads a player's score and its replay, and calculates it for any variant.
- **Game pp endpoints:** `POST /calculate-score` and `POST /calculate-replay`, in `pp-processor-node`'s formats.
- **Uncalculated-replay pass:** periodically calculates the scores the game recorded without pp, and keeps the best
  score table up to date.
- **Score recalculation:** a resumable CLI command that recalculates a range of scores after a live algorithm update.
- **Total pp recalculation:** a resumable CLI command that recomputes players' total pp.

## Configuration

Variables are read from the environment; in development, `apps/score-service/.env.development` is loaded
automatically (`.env.production` with `NODE_ENV=production`; neither is loaded when `CI` is set).

| Variable                                                   | Default                  | Purpose                                                                       |
| ---------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `PORT`                                                     | required                 | HTTP port                                                                     |
| `HOST`                                                     | `127.0.0.1`              | address to listen on                                                          |
| `API_KEY`                                                  | required, 16+ characters | required in `X-Api-Key` by `GET /online-scores`                               |
| `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER`          | required                 | the service's own Postgres database (job progress); migrations run at startup |
| `DATABASE_PORT`                                            | `5432`                   |                                                                               |
| `DATABASE_PASSWORD`                                        | empty                    |                                                                               |
| `OFFICIAL_DB_HOST`, `OFFICIAL_DB_NAME`, `OFFICIAL_DB_USER` | required                 | the official osu!droid MySQL database                                         |
| `OFFICIAL_DB_PORT`                                         | `3306`                   |                                                                               |
| `OFFICIAL_DB_PASSWORD`                                     | empty                    |                                                                               |
| `OFFICIAL_DB_PREFIX`                                       | `bbl_`                   | prepended to the official table names (`bbl_score`)                           |
| `ALICE_DB_URI`, `ELAINA_DB_URI`                            | required                 | the two MongoDB clusters (`AliceDB`, `ElainaDB`)                              |
| `BROKER_URL`                                               | required                 | the broker                                                                    |
| `BROKER_API_KEY`                                           | required                 | the service's broker key; it needs no rate limit and `all_variants`           |
| `BEATMAP_SERVICE_URL`                                      | required                 | the beatmap service, including its path: `http://localhost:3017/api/beatmap`  |
| `BEATMAP_SERVICE_KEY`                                      | required                 | the beatmap service's priority key, for interactive work                      |
| `BEATMAP_SERVICE_BULK_KEY`                                 | required                 | the bulk key, for recalculation                                               |
| `LIVE_DROID_VARIANT`, `LIVE_OSU_VARIANT`                   | required                 | the variants the live replay listener and uncalculated pass use; see below    |
| `UNPROCESSED_REPLAY_DIR`                                   | required, absolute       | new replays from the game (watched)                                           |
| `ONLINE_REPLAY_DIR`                                        | required, absolute       | replays of `scores` rows, named `<score id>.odr`                              |
| `BEST_REPLAY_DIR`                                          | required, absolute       | replays of best pp scores, named `<score id>.odr`                             |
| `UNCALCULATED_REPLAY_DIR`                                  | required, absolute       | replays of scores the game could not calculate                                |
| `DISCORD_METADATA_URL`, `DISCORD_METADATA_KEY`             | required                 | the Discord metadata update endpoint and its key                              |
| `REPLAY_CONCURRENCY`                                       | `2`                      | replays processed at once                                                     |
| `UNCALCULATED_CONCURRENCY`                                 | `1`                      | uncalculated scores processed at once                                         |
| `UNCALCULATED_INTERVAL_MINUTES`                            | `10`                     | how often the uncalculated pass runs                                          |
| `DAN_COURSE_REFRESH_MINUTES`                               | `60`                     | how often dan courses are reloaded from MongoDB                               |

Make `LIVE_DROID_VARIANT` and `LIVE_OSU_VARIANT` broker aliases (for example `live-droid` and `live-osu`), so a live
algorithm update is a repointed alias and needs no change here.

The recalculation commands read only the database, broker, beatmap service, variant, and replay folder variables
(everything above except `PORT`, `HOST`, `API_KEY`, the MongoDB URIs, the Discord variables, and the concurrency and
interval settings). `job-status` reads only the Postgres `DATABASE_*` variables. The CLI checks its arguments first, so a
usage error needs no configuration at all.

## Build and run

```bash
pnpm --filter @dpp/score-service build
```

PM2 runs `dist/index.mjs` with `apps/score-service` as the working directory (Node 24). Startup order: configuration;
Postgres (with migrations), the official MySQL database, both MongoDB clusters; dan courses; HTTP listen; then the
replay watcher (existing files first) and the uncalculated pass. On SIGINT or SIGTERM the service stops accepting
connections, stops the watcher and scheduler, lets in-flight work finish its current item (forced exit after 30 s), and
closes the databases. Set PM2's `kill_timeout` above 30 s.

## Before the first deployment

- If the production schema of the four official tables (users, scores, best scores, uncalculated scores) changed,
  update `src/official/schema.ts` to match. The tests generate their tables from it.
- Count the existing duplicate best rows, to know how much the first recalculation will clean up (read-only):

    ```sql
    SELECT uid, hash, COUNT(*) FROM <prefix>score_best GROUP BY uid, hash HAVING COUNT(*) > 1;
    ```

## Deployment

One PM2 app runs the server. It must never run at the same time as `pp-processor-node`: both would scan the
uncalculated replay folder.

## CLI

Run from `apps/score-service` with the same `.env` (or exported variables), after building.

```bash
cd apps/score-service

# Recalculate scores with IDs 1 to 2500000, four workers at a time
pnpm cli recalculate-scores --name live-update-1 --from 1 --to 2500000 --concurrency 4

# Then recalculate every player's total pp
pnpm cli recalculate-total-pp --name live-update-1-pp --from 1 --to 250000

# Progress of a job
pnpm cli job-status live-update-1
```

Optional: `--concurrency` (default 4) and `--chunk-size` (default 1000). The official database pool has 10
connections, so effective parallelism is bounded by it: a `--concurrency` above about 10 only queues on the pool. A job splits its range into chunks stored in
Postgres. Run the same command with the same `--name` to resume: finished chunks are skipped and interrupted ones are
restarted (every step is idempotent). Reusing a name with a different range is refused. On SIGINT or SIGTERM, workers
finish their current ID and the process exits with code 130; the next run resumes. A "retry later" from the broker or
beatmap service is waited out, never skipped.

Run `recalculate-total-pp` after a score recalculation: totals are not updated per score.

## API

### `GET /online-scores`

Requires `X-Api-Key: <API_KEY>` (`401 UNAUTHORIZED` otherwise).

Query: `uid` and `hash` (the beatmap MD5) are required, `variant` (a variant name or alias) is required, `best`
(`true` reads the player's best score for the beatmap and its replay from `BEST_REPLAY_DIR`; default `false`) and
`strainChart` (`true` asks the processor for a strain chart; default `false`). Unknown parameters are rejected.

Response:

```json
{
    "score": { "id": 1, "uid": 2, "hash": "…", "best": false, "mods": [] },
    "source": "replay",
    "ppMultiplier": 1,
    "pp": 123.4,
    "calculation": {}
}
```

`score.mods` is all of the score's mods; the calculation's `difficulty.mods` holds only the difficulty-adjusting ones.
`source` is `replay` when the score's replay was calculated, or `score` when it was calculated from the stored statistics
(then `ppMultiplier` is the score's `pp_multiplier`, at most 1, for droid variants). `calculation` is the processor's
response unchanged. Errors use `{ error: { code, message } }`: `404 SCORE_NOT_FOUND` when there is no such score, and
broker and processor errors pass through with their status and code (for example `404 VARIANT_NOT_FOUND`,
`404 BEATMAP_NOT_FOUND`, `503`).

### `POST /calculate-score` and `POST /calculate-replay`

The game server's routes, with `pp-processor-node`'s field names, in multipart, URL-encoded, or JSON bodies.

- `/calculate-score` fields: `hash`, `mods` (serialized mods JSON), `combo`, `perfect`, `good`, `bad`, `miss`,
  `total_score`; optional `slider_head_hit`, `slider_tick_hit`, `slider_repeat_hit`, `slider_end_hit` (all four or none)
  and `pp_multiplier` (default 1).
- `/calculate-replay`: multipart file field `replayfile`. Only replays of version 3 or later are calculated.
- Both accept an optional `variant` (default `LIVE_DROID_VARIANT`) for local tools.

They accept only loopback connections (`403` otherwise) and have no key. They answer `200`
`{ "pp": number | null, "pp_multiplier": number | null }`. Permanent failures (invalid input, an unsupported replay, a
definite answer such as a missing beatmap) answer `null` for both, and the game stores the score without pp, as today.
Temporary failures (the broker or processor busy or unreachable, or a configuration problem) close the connection
without a response, so the game records the score as uncalculated and the uncalculated pass calculates it later.

## Logs

Lines are prefixed `[score-service]`. API keys and replay contents are never logged.

## Tests

```bash
pnpm --filter @dpp/score-service test       # unit and integration tests
pnpm --filter @dpp/score-service test:e2e   # builds the service and runs the built server against stubs
```

- MongoDB tests use `mongodb-memory-server`, which downloads `mongod` once into `~/.cache/mongodb-binaries`. Set
  `MONGOMS_DISTRO` if the OS is newer than its known builds.
- MariaDB tests start a throwaway `mariadbd` in a temporary folder, and are skipped when `mariadbd` or
  `mariadb-install-db` is missing. With `REQUIRE_MARIADB=1` (set in CI, which installs `mariadb-server`) they fail
  instead.
- Fixtures: a real replay (`tests/fixtures/replays/v3.odr`) and a recent play document written by the old backend
  (`tests/fixtures/recent-play.json`). `v2.odr` (a replay older than v3) is optional: the production replay storage
  has none, so tests cover the v1/v2 paths with made-up data, and tests that need it are skipped without it.
