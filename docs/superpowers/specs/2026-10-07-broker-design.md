# Broker Design

Date: 2026-10-07
Status: Draft, pending review

## Context

`dpp-processor-backend` is being rewritten as a set of smaller services (see `2026-10-05-processor-design.md`):

- **Processors** (done): each one calculates difficulty and performance with exactly one **variant** (a named build pairing one game mode with one build of the calculator code).
- **Broker** (this spec): the single entry point for every client. Routes requests to processors by variant name.
- **Score service** (designed next): replay listener, online-score lookup, score and total pp recalculation. It calls processors through the broker.

## Goals

- Clients reach any variant through one service, by variant name or by an alias that the operator can repoint without client changes.
- Server-side services, browsers, and third parties can all call the broker. Anonymous callers are allowed (unless turned off with `ANON_RATE_LIMIT=0`), rate-limited per IP, and see only public variants. Per-client API keys get their own rate limits (or none) and can be granted private variants. Keys can be revoked.
- A variant can have several processor instances. The broker routes only to healthy instances and detects a registry entry that points at the wrong variant.
- Processor API changes do not require broker changes: the broker forwards calculation requests without parsing them.
- The operator manages the registry and keys with a CLI on the server. There are no admin routes over HTTP. (Superseded by `2026-10-17-variant-management-design.md`, which adds admin routes for keys that can act for users.)
- Usage insight (requests, errors, latency per variant and per key) without one log line per request.
- The HTTP plumbing shared with the processor lives in one package.

## Non-goals

- Running several broker processes. Rate-limit counters, health state, and usage statistics are in memory.
- Comparing results across variants in one request. Clients send parallel requests.
- Caching responses. Processors already cache difficulty attributes.
- Alerting (for example Discord webhooks) when a variant goes down.
- Stored metrics or dashboards.

## Repository layout

```
apps/processor/        @dpp/processor (done)
apps/broker/           @dpp/broker (this spec)
apps/score-service/    @dpp/score-service (later)
packages/shared/       @dpp/shared: API contract (schemas, types, error codes, processor routes)
packages/server/       @dpp/server: HTTP and runtime plumbing shared by the apps (new)
```

## `@dpp/server`

A new workspace package for the parts of the processor's HTTP layer that have nothing to do with calculation. Like `@dpp/shared`, it has no build step: its `exports` point at TypeScript source, and apps bundle it. It is separate from `@dpp/shared` because `@dpp/shared` is the API contract that clients depend on, and must not bring in Express, tsyringe, or pg.

Moved from `apps/processor/src`:

| Module                                                                     | Change while moving                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `decorators/` (`@Controller`, `@Injectable`, `@Get`, `@Post`)              | none                                                                                                                                  |
| `router.ts` (`createRouter`)                                               | no longer imports `./controllers`; each app imports its controllers before calling it                                                 |
| the generic loop in `dependencies/register.ts`                             | becomes `registerInjectables(container)`; each app keeps its own `registerDependencies` for runtime instances and its tokens          |
| `dependencies/container.ts`                                                | none                                                                                                                                  |
| `types/errors.ts`: `APIError`, `BadRequestError`, `UnauthorizedError`      | the processor-specific errors (`NotFoundError`, `UnprocessableEntityError`, `ServiceUnavailableError`, `CalculationFailedError`) stay |
| `controllers/BaseController.ts`, `middleware/errorHandlers.ts`             | none                                                                                                                                  |
| `validators/parseBody.ts`                                                  | none                                                                                                                                  |
| `runtime/` (`GracefulServer`, `createShutdownHandler`, `installLogPrefix`) | none                                                                                                                                  |
| `database/DatabaseConnection.ts`                                           | takes the Drizzle schema as a parameter                                                                                               |
| test helper `createTestDatabase` (PGlite with migrations applied)          | takes the schema and the migrations folder as parameters; exported from a separate `@dpp/server/testing` entry                        |

The processor keeps its API-key middleware, `LruCache`, config, and everything about calculation.

The extraction is a refactor on its own, done first. Its done-condition: the processor's unit, integration, and e2e tests pass with only import paths changed. Tests of the moved modules (router building, error handlers, graceful shutdown, shutdown handler, log prefix) move to `packages/server/tests`.

### Error codes and processor routes in `@dpp/shared`

Clients receive broker errors and processor errors in the same shape, so both sets of codes are part of the contract:

- `processorErrorCodes`: the existing codes.
- `brokerErrorCodes`: `VARIANT_NOT_FOUND`, `RATE_LIMITED`, `VARIANT_UNAVAILABLE`, `PROCESSOR_ERROR`, `PROCESSOR_TIMEOUT`.
- `ErrorCode`: the union of both. `APIError` in `@dpp/server` uses it.

`@dpp/shared` also exports:

- `processorRoutes`: the forwardable calculation routes (`/difficulty`, `/performance`, `/performance/replay`). The processor's controllers and the broker's proxy both use it.
- `maxRequestBodyBytes`: 1 MB, used by both apps' body limits.
- `VariantSummary` (see API).

## Registry database

The broker has its own Postgres database. Drizzle schema in `apps/broker/src/database/schema.ts`, migrations generated by drizzle-kit into `apps/broker/drizzle/` and applied at startup.

```sql
variants (
  name         text primary key,
  public       boolean not null default false,
  description  text,
  created_at   timestamptz not null default now()
)

variant_instances (
  id            serial primary key,
  variant_name  text not null references variants on delete cascade,
  url           text not null,
  unique (variant_name, url)
)

aliases (
  name          text primary key,
  variant_name  text not null references variants on delete restrict
)

api_keys (
  id                     serial primary key,
  name                   text not null unique,
  key_hash               char(64) not null unique,
  rate_limit_per_minute  integer,
  all_variants           boolean not null default false,
  created_at             timestamptz not null default now(),
  revoked_at             timestamptz
)

api_key_variants (
  key_id        integer not null references api_keys on delete cascade,
  variant_name  text not null references variants on delete cascade,
  primary key (key_id, variant_name)
)
```

- **`variant_instances.url`** is a base URL without a trailing slash (for example `http://127.0.0.1:3101`). It allows processors on other machines, `https`, or a path prefix behind a reverse proxy.
- **Names**: variant and alias names share one namespace, enforced by the CLI (the CLI is the only writer). Names match `^[a-z0-9][a-z0-9-]*$`.
- **Keys**: 32 random bytes, base64url-encoded. Only the SHA-256 hash (hex) is stored. Keys are identified by their unique name; no part of a key is stored or shown, and the raw key appears only once, in the output of `key create`. `rate_limit_per_minute` null means unlimited. A key with `revoked_at` set is rejected.
- **Grants** (`api_key_variants`) give a key access to specific private variants. Public variants need no grant. A key with `all_variants` set can reach every variant, including private ones added later; its grants are kept but ignored while the flag is set.
- Mode, algorithm, and calculator version are not stored. They come from each instance's `GET /info`.

## Architecture

```
Startup (index.ts)
  ├── Config                 env settings, validated with zod
  └── DatabaseConnection     registry database (from @dpp/server)

HTTP request
  ├── GracefulServer middleware, helmet, CORS
  ├── auth middleware        X-Api-Key → caller (key or anonymous)
  ├── rate limit middleware  express-rate-limit, configured from the caller
  ▼
Controllers
  ├── VariantsController     GET /variants, GET /variants/:name
  └── ProxyController        POST /variants/:name/<processor route>
  ▼
Services
  ├── RegistryService        in-memory registry snapshot
  ├── HealthMonitor          per-instance health
  ├── InstanceSelector       picks an instance
  ├── ProxyService           forwards a request to a processor
  └── UsageStats             aggregates and logs usage
  │
  ├── Repositories: RegistryRepository
  └── Clients: ProcessorClient
```

Same structure as the processor: `@Injectable(token)` and `@Controller(path)`, tsyringe tokens in `dependencies/tokens.ts`, `I*` interfaces for services, repositories, and clients.

### Units

**Config** (`IConfigService`). Environment variables, validated at startup; invalid values stop the process with a message naming the variables but not their values.

| Variable                                                                                | Default                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `PORT`                                                                                  | required                                                      |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | required, except port 5432 and password empty                 |
| `PROCESSOR_API_KEY`                                                                     | required, at least 16 characters                              |
| `PROCESSOR_TIMEOUT_SECONDS`                                                             | 30                                                            |
| `HEALTH_CHECK_INTERVAL_SECONDS`                                                         | 10                                                            |
| `HEALTH_CHECK_TIMEOUT_SECONDS`                                                          | 3                                                             |
| `REGISTRY_RELOAD_INTERVAL_SECONDS`                                                      | 30                                                            |
| `ANON_RATE_LIMIT`                                                                       | 30 (requests per minute per IP); 0 turns anonymous access off |
| `TRUST_PROXY`                                                                           | `false`                                                       |
| `USAGE_SUMMARY_INTERVAL_SECONDS`                                                        | 300; 0 disables summaries                                     |

`TRUST_PROXY` accepts what Express's `trust proxy` setting accepts: `true`, `false`, a hop count, or a comma-separated list of addresses or subnets. It must match the deployment, or anonymous callers behind a reverse proxy all share the proxy's IP for rate limiting.

**`PROCESSOR_API_KEY`** is sent to every processor; each processor's PM2 app sets the same value as its `API_KEY`.

**RegistryRepository** (`IRegistryRepository`). Drizzle queries on the registry tables: loading the whole registry, and the writes the CLI needs. Accepts the generic Drizzle Postgres database type, so tests use PGlite.

**RegistryService** (`IRegistryService`). Holds an immutable snapshot of the registry: variants with their instances, aliases, and keys (indexed by hash) with their grants. Loads at startup, reloads every `REGISTRY_RELOAD_INTERVAL_SECONDS` and on `SIGHUP`. A failed reload logs an error and keeps the previous snapshot. Requests never query the database. Methods:

- `authenticate(key)`: the key record for a raw key (hashed for lookup), or nothing if unknown or revoked.
- `resolve(name, caller)`: the variant for a variant name or alias, or nothing if it does not exist or the caller cannot see it (private, not granted, and the key does not have `all_variants`).
- `visibleVariants(caller)`: the variants the caller can see.

When a reload adds, removes, or changes instances, it tells `HealthMonitor`.

**ProcessorClient** (`IProcessorClient`). HTTP calls to processors with `fetch`: `getInfo(url, timeout)` and `forward(url, route, body, timeout)`, both sending `X-Api-Key: PROCESSOR_API_KEY`. It reports a connection failure (no response received) separately from a timeout and from an HTTP response, because only a connection failure is retried.

**HealthMonitor** (`IHealthMonitor`). Tracks each instance's state:

- `healthy`: the latest `GET /info` succeeded and its `id` equals the instance's variant name. The `/info` response (mode, algorithm, calculator version, built at) is kept.
- `down`: connection failure, timeout, or a non-2xx response; or a connection failure while forwarding.
- `mismatch`: `/info` returned a different variant id. Never routed to.

Instances start as `down` until checked. Every `HEALTH_CHECK_INTERVAL_SECONDS` it checks every instance with `HEALTH_CHECK_TIMEOUT_SECONDS`. `markDown(instance)` is called by `ProxyService` on a connection failure; the next successful check restores the instance. State changes are logged. For each variant, it also keeps the `/info` response from the most recent successful check of any instance, which `GET /variants` reports even when the variant is down.

**InstanceSelector** (`IInstanceSelector`). Round-robin over a variant's `healthy` instances, with one counter per variant. `select(variant, exclude?)` skips an excluded instance (used for the retry) and returns nothing when no healthy instance is left.

**ProxyService** (`IProxyService`). `forward(variant, route, body)`:

1. Selects an instance; none → `VARIANT_UNAVAILABLE`.
2. Forwards with `PROCESSOR_TIMEOUT_SECONDS`.
3. On a connection failure: marks the instance down, selects another healthy instance (excluding the failed one), and tries once more. No other instance or a second failure → `PROCESSOR_ERROR`.
4. On a timeout → `PROCESSOR_TIMEOUT`. No retry: the processor may still be calculating.
5. On a `401` response → `PROCESSOR_ERROR`, and an error is logged naming the instance: it means `PROCESSOR_API_KEY` does not match the processor's key.
6. On a response that is not JSON → `PROCESSOR_ERROR`.
7. Otherwise returns the processor's status and body unchanged.

Retrying is safe because processor routes are pure calculations.

**Rate limiting**. A middleware factory configuring `express-rate-limit` (memory store, one-minute window):

- `keyGenerator`: `key:<id>` for keyed callers; for anonymous callers, `ipKeyGenerator(req.ip)` so an IPv6 caller cannot rotate addresses within its subnet.
- `limit`: the key's `rate_limit_per_minute`, or `ANON_RATE_LIMIT` for anonymous callers. Evaluated per request, so changed limits apply at the next registry reload.
- `skip`: keys with an unlimited limit.
- `standardHeaders: "draft-8"`; `handler` responds with `429 RATE_LIMITED` in the error shape and records the rejection in `UsageStats`.

**UsageStats** (`IUsageStats`). Records each completed request (variant or none, caller, status, duration) and each rate-limit rejection. Every `USAGE_SUMMARY_INTERVAL_SECONDS`, if anything was recorded, logs:

- one line per variant: requests, 2xx/4xx/5xx counts, p50 and p95 latency;
- one line per key (by name), plus one `anonymous` line for all anonymous callers: requests and rate-limit rejections;

then resets. It also logs a final summary at shutdown.

## API

All responses are JSON; errors are `{ error: { code, message } }`.

### Authentication and access

- No `X-Api-Key` header: anonymous. Sees public variants; rate-limited per IP. With `ANON_RATE_LIMIT=0`, anonymous access is off and such requests get `401 UNAUTHORIZED` ("An API key is required").
- A valid key: sees public variants and the private variants granted to it, or every variant if the key has `all_variants`; rate-limited by its own limit.
- An unknown or revoked key: `401 UNAUTHORIZED`. Not downgraded to anonymous.

Middleware order: `GracefulServer` middleware, helmet, CORS, authentication, rate limiting, routes. Every route counts toward the rate limit.

CORS: all origins (`*`), no credentials, allowed request headers `Content-Type` and `X-Api-Key`, exposed response headers `X-Variant` and the `RateLimit` headers.

### Routes

| Route                                     | Response                                                       |
| ----------------------------------------- | -------------------------------------------------------------- |
| `GET /variants`                           | `VariantSummary[]` of the variants the caller can see, by name |
| `GET /variants/:name`                     | `VariantSummary`; `:name` can be an alias                      |
| `POST /variants/:name/difficulty`         | forwarded to the processor's `POST /difficulty`                |
| `POST /variants/:name/performance`        | forwarded to `POST /performance`                               |
| `POST /variants/:name/performance/replay` | forwarded to `POST /performance/replay`                        |

```ts
interface VariantSummary {
    /** The variant name, also when looked up by alias. */
    readonly name: string;
    readonly aliases: string[];
    readonly description: string | null;
    /** At least one instance is healthy. */
    readonly available: boolean;
    /** From the latest successful GET /info of any instance; null if none has succeeded since the broker started. */
    readonly mode: Modes | null;
    readonly algorithm: CalculatorAlgorithm | null;
    readonly calculatorVersion: string | null;
    readonly builtAt: string | null;
}
```

Instance URLs, instance counts, and the public flag are not exposed.

### Forwarding

- The forwardable routes come from `processorRoutes` in `@dpp/shared`; other paths return `404 INVALID_REQUEST` ("Route not found"), like the processor.
- The body is buffered as raw bytes (`express.raw`) up to `maxRequestBodyBytes`, not parsed. A request whose `Content-Type` is not `application/json` gets `400 INVALID_REQUEST`; a body over the limit gets `413 INVALID_REQUEST` through the shared error handler, as on the processor.
- The variant is resolved and access is checked before forwarding; the body is read before forwarding, so a rejected request never reaches a processor.
- Only `Content-Type` and the processor `X-Api-Key` are sent to the processor.
- The response carries the processor's status and body, plus `X-Variant: <variant name>`.

### Errors added by the broker

| Status | Code                  | Cause                                                                                                          |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| 400    | `INVALID_REQUEST`     | body is not `application/json`                                                                                 |
| 413    | `INVALID_REQUEST`     | body is larger than 1 MiB                                                                                      |
| 404    | `INVALID_REQUEST`     | unknown route                                                                                                  |
| 401    | `UNAUTHORIZED`        | unknown or revoked key, or no key while anonymous access is off                                                |
| 404    | `VARIANT_NOT_FOUND`   | no such variant or alias, or a private variant the caller is not granted                                       |
| 429    | `RATE_LIMITED`        | rate limit exceeded                                                                                            |
| 502    | `PROCESSOR_ERROR`     | connection failed after the retry, the processor responded with a non-JSON body, or the processor answered 401 |
| 503    | `VARIANT_UNAVAILABLE` | no healthy instance                                                                                            |
| 504    | `PROCESSOR_TIMEOUT`   | no response within `PROCESSOR_TIMEOUT_SECONDS`                                                                 |
| 500    | `INTERNAL_ERROR`      | anything else; logged, details not sent                                                                        |

A private variant returns the same 404 as a missing one, so its name cannot be discovered by probing. Every other processor error passes through with its own status and code.

## CLI

`pnpm --filter @dpp/broker cli <command>` runs `dist/cli.mjs`. Arguments are parsed with Node's `util.parseArgs`. It reads the same database environment variables as the broker and writes to the registry directly.

```
variant add <name> [--public] [--description <text>]
variant update <name> [--public | --private] [--description <text>]
variant remove <name>                     refused while aliases point at it
variant list

instance add <variant> (--port <n> | --url <url>)
instance remove <variant> (--port <n> | --url <url>)

alias set <alias> <variant>               creates the alias or repoints it
alias remove <alias>

key create <name> (--limit <per-minute> | --unlimited) [--all-variants | --grant <variant>...]
key update <name> [--limit <per-minute> | --unlimited] [--all-variants | --granted-only]
key grant <name> <variant>
key ungrant <name> <variant>
key revoke <name>
key list                                  name, limit, access (all or grants), created, revoked
key show <name>

status
```

- `--port <n>` stores `http://127.0.0.1:<n>`; `--url` is stored as given, without a trailing slash.
- `key create` requires one of `--limit` or `--unlimited`; there is no default limit for keys. `key update` requires at least one option.
- `--all-variants` sets `all_variants`; `--granted-only` clears it, so the key falls back to its grants.
- `key create` prints the key once; it cannot be shown again.
- `status` loads the registry, calls every instance's public `GET /info` itself, and prints a table: variant, aliases, public, instance URL, state (`healthy`, `down`, `mismatch`), mode, algorithm, calculator version.
- Every command that changes the registry ends by reminding that the running broker applies changes within `REGISTRY_RELOAD_INTERVAL_SECONDS`, or immediately after `pm2 sendSignal SIGHUP <app>`.
- Invalid arguments, unknown names, and constraint violations print a message and exit with code 1.

## Runtime behavior

- **Startup** (exit non-zero on failure): config, database connection, migrations, first registry load. Then the first round of health checks (down processors do not stop startup), HTTP listen, then the reload, health check, and usage summary timers.
- **`SIGHUP`**: reload the registry.
- **Shutdown** on `SIGINT`/`SIGTERM`: stop accepting connections, let in-flight requests finish, stop the timers, log the final usage summary, close the database. Force exit after `PROCESSOR_TIMEOUT_SECONDS + 5` seconds. The README tells the operator to set PM2's `kill_timeout` above that.
- **Logging**: `console`, prefixed with `[broker]`. Individual lines for: every 5xx response (from the broker or a processor), rate-limit rejections of keyed callers, instance state changes, failed registry reloads, and processors rejecting the broker's key. Keys and request bodies are never logged.
- **Build and deployment**: a plain tsdown build with `index` and `cli` entries and the migrations copied next to them; one PM2 app. The broker has no variants or snapshots.

## Testing

```
apps/broker/tests/
  unit/          services, middleware, controllers, CLI argument handling
  integration/   repository, CLI commands, and the full app, against PGlite
  e2e/           the built broker and a built processor as real processes
  utils/         stub processor, test container, test config
```

- **Unit** (mocked dependencies, child DI container per test):
    - `RegistryService`: name and alias resolution, visibility of public and private variants with and without grants and with `all_variants`, key lookup, revoked keys, failed reload keeps the previous snapshot.
    - `HealthMonitor` (fake timers, stub client): state changes, mismatch detection, `markDown` and recovery, last known `/info` per variant.
    - `InstanceSelector`: round-robin, skipping unhealthy and excluded instances.
    - `ProxyService`: retry only on connection failure, timeout → 504, processor 401 → 502, non-JSON → 502, other errors passed through.
    - Rate limit middleware: per-key limit, unlimited keys skipped, per-IP limit for anonymous callers, error shape.
    - `UsageStats`: aggregation, percentiles, nothing logged for an empty interval.
    - Key generation and hashing.
- **Integration** (PGlite with real migrations):
    - `RegistryRepository` queries and constraints.
    - Every CLI command, including refusals (alias pointing at a removed variant, name collisions, unknown names).
    - The full app through supertest, with stub processors (small Express servers on port 0 serving `/info` and canned responses): authentication, CORS headers, the 404 for private variants, rate-limit headers and 429, forwarding of bodies and status codes, `X-Variant`, failover to a second instance, a mismatched instance never used, `GET /variants` contents.
- **End-to-end** (`pnpm test:e2e` at the root runs both apps'): build the broker and a processor variant, start both, register the processor with the CLI, send a `/difficulty` request through the broker, and check SIGTERM shutdown. The processor e2e test's setup (free port, PGlite socket server, stub beatmap service, variant build, process start) is extracted into a harness the broker's e2e test can import.
- **`@dpp/server`**: the moved tests, plus `DatabaseConnection` with a schema parameter.
- **`@dpp/shared`**: `brokerErrorCodes` and `processorRoutes` additions.

## To verify during planning

- How the broker's e2e test imports the processor's e2e harness (a `@dpp/processor` test export, or moving the harness into `@dpp/server/testing` with processor-specific parts passed in).
- That `express-rate-limit`'s current major version supports Express 5, a function `limit`, and `ipKeyGenerator`.
- That `express.raw` with a byte limit produces the same body-parser errors the shared error handler already maps.
