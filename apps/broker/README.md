# Broker

The single entry point for clients. Routes calculation requests to processors by variant name or alias, with per-key
access and rate limits. See `docs/superpowers/specs/2026-10-07-broker-design.md`.

## API

| Route                                     | Purpose                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `GET /variants`                           | the variants the caller can use, with their status |
| `GET /variants/:name`                     | one variant; `:name` can be an alias               |
| `POST /variants/:name/difficulty`         | forwarded to the processor's `POST /difficulty`    |
| `POST /variants/:name/performance`        | forwarded to `POST /performance`                   |
| `POST /variants/:name/performance/replay` | forwarded to `POST /performance/replay`            |

Without an `X-Api-Key` header, callers are anonymous: they see public variants only and are limited per IP. To turn
anonymous access off (for example while the beatmap service is near osu!'s rate limit), set `ANON_RATE_LIMIT=0` and
`pm2 restart dpp-broker`; requests without a key then get `401 UNAUTHORIZED`. Request
bodies are the processor's (see `packages/shared`); responses carry an `X-Variant` header naming the variant that
answered.

## Setting up

1. Create the registry database: `CREATE DATABASE dpp_broker;`. Migrations run at startup and before every CLI
   command.
2. Build: `pnpm --filter @dpp/broker build`.
3. Set the same `API_KEY` on every processor's PM2 app, and use it as the broker's `PROCESSOR_API_KEY`.
4. Register processors with the CLI (below), then start the broker.

## Running under PM2

```js
// ecosystem.config.cjs
module.exports = {
    apps: [
        {
            name: "dpp-broker",
            script: "apps/broker/dist/index.mjs",
            exp_backoff_restart_delay: 1000,
            // Above PROCESSOR_TIMEOUT_SECONDS + 5 s, so in-flight requests can finish.
            kill_timeout: 40000,
            env: {
                NODE_ENV: "production",
                PORT: 3100,
                DATABASE_HOST: "localhost",
                DATABASE_NAME: "dpp_broker",
                DATABASE_USER: "dpp",
                DATABASE_PASSWORD: "…",
                PROCESSOR_API_KEY: "…",
                TRUST_PROXY: "loopback",
            },
        },
    ],
};
```

## Managing the registry

The CLI reads only the database variables. On the server, put them in `apps/broker/.env.production` and run it with
`NODE_ENV=production`, or export them in the shell.

```bash
cd apps/broker
export NODE_ENV=production

# A variant and its processor(s)
pnpm cli variant add droid-live --public --description "Live droid algorithm"
pnpm cli instance add droid-live --port 3101
pnpm cli instance add droid-live --url http://10.0.0.5:3101

# A stable name clients can use, repointed when the live variant changes
pnpm cli alias set live-droid droid-live

# Keys: the key is printed once
pnpm cli key create discord-bot --unlimited --grant flowaim-experiment
pnpm cli key create my-key --unlimited --all-variants
pnpm cli key create some-site --limit 120
pnpm cli key revoke some-site

# Is every processor up, and is each one the variant the registry says?
pnpm cli status
```

Run `pnpm cli` without arguments for every command. The running broker applies changes within
`REGISTRY_RELOAD_INTERVAL_SECONDS`, or immediately after `pm2 sendSignal SIGHUP dpp-broker`.

## Environment variables

| Variable                                          | Default                  | Purpose                                                                        |
| ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `PORT`                                            | required                 | HTTP port                                                                      |
| `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER` | required                 | the registry database                                                          |
| `DATABASE_PORT`                                   | `5432`                   |                                                                                |
| `DATABASE_PASSWORD`                               | empty                    |                                                                                |
| `PROCESSOR_API_KEY`                               | required, 16+ characters | sent to processors; each processor's `API_KEY`                                 |
| `PROCESSOR_TIMEOUT_SECONDS`                       | `30`                     | longest wait for a processor response                                          |
| `HEALTH_CHECK_INTERVAL_SECONDS`                   | `10`                     | how often every instance's `GET /info` is checked                              |
| `HEALTH_CHECK_TIMEOUT_SECONDS`                    | `3`                      |                                                                                |
| `REGISTRY_RELOAD_INTERVAL_SECONDS`                | `30`                     | how often CLI changes are picked up                                            |
| `ANON_RATE_LIMIT`                                 | `30`                     | requests per minute per IP without a key; `0` requires a key for every request |
| `TRUST_PROXY`                                     | `false`                  | Express `trust proxy`: `true`, a hop count, or addresses/subnets               |
| `USAGE_SUMMARY_INTERVAL_SECONDS`                  | `300`                    | how often usage is logged; `0` turns summaries off                             |

`TRUST_PROXY` must match the deployment. Behind nginx on the same machine, use `loopback`; behind Cloudflare and
nginx, list both. If it is wrong, every anonymous caller shares the proxy's IP and its rate limit.

## Logs

Lines are prefixed `[broker]`. Expect a usage summary per variant and per caller every
`USAGE_SUMMARY_INTERVAL_SECONDS`, one line per 5xx response, one per rate-limited key request, and one whenever an
instance changes state (`healthy`, `down`, or `mismatch`: the processor at that address reports another variant).
Keys and request bodies are never logged.

## Development

Put development settings in `apps/broker/.env.development` (loaded automatically; see the table above).

```bash
pnpm --filter @dpp/broker dev        # rebuilds and restarts on change
pnpm --filter @dpp/broker test       # unit and integration tests
pnpm --filter @dpp/broker test:e2e   # builds the broker and a processor snapshot and runs both
```
