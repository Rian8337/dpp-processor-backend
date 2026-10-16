# dpp-processor-backend

Services that calculate droid performance points (dpp) for osu!droid scores and replays.

Each difficulty and performance algorithm runs in its own processor, and clients pick one by name through a broker:

```text
clients ──► broker ──► processor (variant A) ──► beatmap service
               │  └──► processor (variant B) ──► beatmap service
               ▲
score service ─┘  (official database, replay files, MongoDB)
```

| Path                                                 | What it is                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`apps/processor`](apps/processor/README.md)         | Calculates difficulty and performance for one **variant**: one game mode plus one build of the calculator code (npm live or rebalance package, or a local `osu-droid-module` checkout). Pure calculation, with its own Postgres database. |
| [`apps/broker`](apps/broker/README.md)               | The single entry point for clients. Routes requests to processors by variant name or alias, with per-key access and rate limits. Its registry is managed with a CLI.                                                                      |
| [`apps/score-service`](apps/score-service/README.md) | Everything score-related: the replay listener, online-score lookup, game routes, and resumable score and total pp recalculation. Gets every pp value from a processor through the broker.                                                 |
| `packages/shared`                                    | `@dpp/shared`: the API contract types and validators.                                                                                                                                                                                     |
| `packages/server`                                    | `@dpp/server`: HTTP and runtime plumbing shared by the apps, plus test helpers.                                                                                                                                                           |

Each app's README covers its configuration, CLI, and deployment under PM2. The designs are in
[`docs/superpowers/specs`](docs/superpowers/specs).

## Requirements

- Node.js 24
- pnpm (the version in `packageManager`; pnpm downloads it if yours differs)
- Postgres for the processors and the broker; the score service also uses MariaDB (the official database) and
  MongoDB
- The [beatmap service](https://github.com/Rian8337/osu-beatmap-processor), used by the processors

## Development

```bash
pnpm install
pnpm build         # builds every app
pnpm typecheck
pnpm lint          # oxlint, fixing what it can
pnpm format        # oxfmt
pnpm test          # unit and integration tests, one package at a time
pnpm test:e2e      # builds each app (and a processor snapshot) and tests it as a real process
```

Tests need no running services: they use in-memory Postgres (PGlite), `mongodb-memory-server`, and a throwaway
`mariadbd` (skipped when MariaDB is not installed). GitHub Actions runs the type, lint, and format checks and both test
suites on every push and pull request.

To build a processor variant, see [Building a variant](apps/processor/README.md#building-a-variant).

## License

[MIT](LICENSE)
