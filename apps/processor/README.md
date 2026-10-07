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

Snapshots must stay under `apps/processor`. They bundle everything except Node built-ins, `canvas`,
`piscina`, and `pg-native` (optional, not installed by default), which they resolve from `apps/processor/node_modules`; `build:variant` rejects a `--releases-dir`
outside that directory. This also means every snapshot, including running ones, depends on that `node_modules`:
reinstalling or deleting it affects all of them, so rebuild or restart variants afterwards if the installed versions
changed.

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
