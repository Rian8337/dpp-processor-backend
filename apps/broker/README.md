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

A variant's status includes `available` and `healthyInstanceCount`, the number of its instances that are currently
healthy, which is how many requests it can work on at once. Variant summaries also include `public`, `pinned` (list it ahead of the others), and `builtAt`,
the newest build time among healthy instances (the last known one while all are down).

### Acting for a person and management routes

A key created with `can_act_for_users` (`--act-for-users` in the CLI) may send `X-Acting-Uid: <uid>` (a positive
integer). The broker trusts the uid; the client verifies who the person is. Visibility then follows the person
instead of the key: admins and managers see every variant, everyone else sees public variants and their grants. A
key without `can_act_for_users` that sends the header gets `400 INVALID_REQUEST`.

The management routes below need such a key and an `X-Acting-Uid`; without one, or with too low a role, they answer
`403 FORBIDDEN`. Unknown aliases, keys, or grants answer `404 NOT_FOUND`, and a change that clashes with the registry
(a taken key name, an admin removing their own role, or revoking the key the request uses or stopping it acting for
users) answers `409 CONFLICT`. A successful write is applied at once and
logged as `Admin change by uid <uid>: <method> <path>`, without the body. A manager gets `403 FORBIDDEN`, not `404`,
for a variant they are not granted, including an unknown name.

| Route                                              | Role                                          | Purpose                                                                                |
| -------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /me`                                          | any                                           | `{ uid, role, grants }` for the acting person                                          |
| `GET /admin/variants`                              | admin, or manager                             | every variant, with `public` and `instanceCount`; a manager sees only granted variants |
| `PATCH /admin/variants/:name`                      | admin, or manager with a grant on the variant | `{ title?, description? }`; `public` and `pinned` also need admin                      |
| `PUT /admin/aliases/:alias` `{ variant }`          | admin, or manager with a grant on the variant | create or repoint an alias                                                             |
| `DELETE /admin/aliases/:alias`                     | admin, or manager with a grant on the variant |                                                                                        |
| `GET /admin/variants/:name/grants`                 | admin, or manager with a grant on the variant | uids granted the variant                                                               |
| `PUT` / `DELETE /admin/variants/:name/grants/:uid` | admin, or manager with a grant on the variant | grant or remove; a manager only for people with no role, never themselves              |
| `GET /admin/users`                                 | admin                                         | users with a role or a grant                                                           |
| `PUT /admin/users/:uid/role` `{ role }`            | admin                                         | `admin`, `manager`, or `null`                                                          |
| `GET /admin/keys`                                  | admin                                         | all keys, revoked ones included                                                        |
| `POST /admin/keys`                                 | admin                                         | creates a key; responds `201` with the raw key, shown once                             |
| `PATCH /admin/keys/:name`                          | admin                                         | `rateLimitPerMinute`, `allVariants`, `canActForUsers`                                  |
| `PUT` / `DELETE /admin/keys/:name/grants/:variant` | admin                                         | key grants                                                                             |
| `POST /admin/keys/:name/revoke`                    | admin                                         |                                                                                        |

Without an `X-Api-Key` header, callers are anonymous: they see public variants only and are limited per IP. To turn
anonymous access off (for example while the beatmap service is near osu!'s rate limit), set `ANON_RATE_LIMIT=0` (change it
in the ecosystem file and run `pm2 restart ecosystem.config.cjs --only dpp-broker --update-env`, since a plain
`pm2 restart dpp-broker` does not re-read `env`; or set it in `apps/broker/.env.production` and
`pm2 restart dpp-broker`); requests without a key then get `401 UNAUTHORIZED`. Request
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
            // Above PROCESSOR_TIMEOUT_SECONDS + 5 s, so in-flight requests can finish. A request whose first
            // instance fails to connect late and is retried can take up to about twice PROCESSOR_TIMEOUT_SECONDS;
            // the broker waits only PROCESSOR_TIMEOUT_SECONDS + 5 s on shutdown, so such a request may be cut off.
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

# Title and long description (a file keeps its line breaks), or take a variant out of public view
pnpm cli variant update droid-live --title "Live droid" --description-file ./droid-live.txt
pnpm cli variant update droid-live --private

# A stable name clients can use, repointed when the live variant changes
pnpm cli alias set live-droid droid-live

# Keys: the key is printed once
pnpm cli key create discord-bot --unlimited --grant flowaim-experiment
pnpm cli key create my-key --unlimited --all-variants
pnpm cli key create some-site --limit 120
pnpm cli key create web-backend --unlimited --act-for-users   # may send X-Acting-Uid for a user
pnpm cli key update web-backend --no-act-for-users
pnpm cli key revoke some-site

# Users, by uid. This is how the first admin is created
pnpm cli user role 51076 admin
pnpm cli user grant 51076 flowaim-experiment
pnpm cli user ungrant 51076 flowaim-experiment
pnpm cli user role 51076 none    # removes the role
pnpm cli user list

# Is every processor up, and is each one the variant the registry says?
pnpm cli status
```

Run `pnpm cli` without arguments for every command. The running broker applies changes within
`REGISTRY_RELOAD_INTERVAL_SECONDS`, or immediately after `pm2 sendSignal SIGHUP dpp-broker`. New instances are probed as soon as the broker applies the
change, so they do not wait for the next health check.

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
