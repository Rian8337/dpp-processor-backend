# Variant Management Design

Date: 2026-10-17
Status: Draft, pending review

## Context

The broker (`2026-10-07-broker-design.md`) routes calculations to processors by variant name. Two user-facing clients still
describe variants their own way:

- **Mahiru** (`~/Projects/Mahiru`, the Discord bot) hard-codes variant names as `<mode>-<live|rebalance>` in
  `PPProcessorRESTManager.getVariant`, reads rework names and descriptions from the MongoDB collection `prototypepptype`
  (edited by hand in Compass), and picks the active rework from the `CURRENT_REWORK_TYPE` environment variable.
- **droidppboard** (`~/Projects/droidppboard`, the website) reads the same `prototypepptype` collection for its rework
  selector, leaderboard, profiles, and top plays, and has no login.

Variants are managed only with the broker CLI, which cannot comfortably hold a multi-line description and has no
display name. There is no way for a person (rather than an API key) to be given a private variant.

## Intent

The broker becomes the single source of truth for variants: their display names, descriptions, aliases, visibility, and
who may use private ones. Mahiru and droidppboard read everything about variants from the broker. Day-to-day
management moves from the CLI to droidppboard, where the owner and, later, other trusted people log in with their
osu!droid accounts.

## Goals

- `prototypepptype` and `CURRENT_REWORK_TYPE` are retired. Prototype profiles (`prototypepp`) stay in MongoDB, keyed by
  variant name in their `type` field.
- Mahiru's `/calculate` lets users choose a droid variant and a PC variant. `/recalc`, `/pp prototype`, and
  `/leaderboard`'s prototype option take a variant, defaulting to `droid-rebalance`.
- People, identified by osu!droid uid, can be granted private variants. Mahiru and droidppboard show each person the
  variants they may use.
- Anyone with an osu!droid account can log in to droidppboard. Logged-in people see their private variants.
- Two roles, by uid: **manager** and **admin**, with management pages on droidppboard.
- Logging in to droidppboard does not make guessing osu!droid passwords easier than it already is elsewhere.

## Non-goals

- Creating or deleting variants, building processors, or registering instances from droidppboard. These stay on the
  server with the CLI, since a variant is useless until its processor is deployed there.
- droidppboard's planned profile "calculation" page and its page redesign. Login is built so that page can sit behind
  it later.
- An audit-log UI. Changes are logged (see Broker), not browsable.
- Changing how droidppboard's beatmap calculator chooses variants.

## Anti-goals

- Permission checks duplicated across clients. The broker decides what each person may see and change.
- Raw API keys or osu!droid passwords in logs, in the browser (other than a new key shown once), or in MongoDB.

## Overview

```text
Discord user ──► Mahiru ──(own key, X-Acting-Uid from user bind)──► broker ──► processors
browser ──► droidppboard server ──(own key, X-Acting-Uid from session)──► broker
                    │
                    └── login: official database (osu!droid accounts) + Cloudflare Turnstile
```

Order of work, each with its own implementation plan: **1. broker and score service**, **2. Mahiru**, **3.
droidppboard**. The backend changes are backward compatible, so each step can be deployed on its own.

## 1. Broker (`dpp-processor-backend/apps/broker`)

### Registry database

Changes to the Drizzle schema (`apps/broker/src/database/schema.ts`). The migration is generated from it with
drizzle-kit, as for the existing tables; the SQL below only shows the resulting changes:

```sql
alter table variants add column title text;                       -- display name, e.g. "FC Time"; null → use name
alter table api_keys add column can_act_for_users boolean not null default false;

users (
  uid          integer primary key,                               -- osu!droid uid
  role         text check (role in ('admin', 'manager')),         -- null: no role, only grants
  created_at   timestamptz not null default now()
)

user_variants (
  uid           integer not null references users on delete cascade,
  variant_name  text not null references variants on delete cascade,
  primary key (uid, variant_name)
)
```

A grant creates the `users` row if missing. Removing a user's last grant and role may leave an empty row; that is
harmless.

Limits: `title` up to 100 characters, `description` up to 4000 characters (fits in a Discord embed
description) and may contain newlines.

### Acting for a person

A key with `can_act_for_users` may send `X-Acting-Uid: <uid>` (positive integer). The broker trusts the uid; verifying
who the person is stays the client's job (Mahiru via user binds, droidppboard via login).

Visibility when acting for a uid replaces the key's own access:

| Acting person                | Sees                           |
| ---------------------------- | ------------------------------ |
| admin or manager             | every variant                  |
| anyone else (or unknown uid) | public variants + their grants |

Without the header, the key's own access applies as today. The header from a key without `can_act_for_users`, or with a
value that is not a positive integer, gets `400 INVALID_REQUEST`. Anonymous callers sending the header get the same 400. Rate limits stay per key.

This applies to every existing route (`GET /variants`, `GET /variants/:name`, and forwarding), so a person can only
calculate with variants they can see.

### API changes

`VariantSummary` (in `@dpp/shared`) gains `title: string | null`.

New routes. All need a key with `can_act_for_users` and an `X-Acting-Uid`. Errors use the existing shape, with three new
codes: `FORBIDDEN` (403: no acting uid, or the person's role does not allow it), `NOT_FOUND` (404: unknown alias, key,
or user grant), and `CONFLICT` (409: a name already used by a variant, alias, or key, an admin removing their own
admin role, or a change that would lock out the key the request uses). Unknown variants keep `VARIANT_NOT_FOUND`.

| Route                                              | Role    | Purpose                                                                                    |
| -------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `GET /me`                                          | any     | `{ uid, role, grants: string[] }` for the acting person                                    |
| `GET /admin/variants`                              | manager | every variant with `public`, `title`, `description`, aliases, availability, instance count |
| `PATCH /admin/variants/:name`                      | manager | `{ title?, description? }`; `public` additionally needs admin                              |
| `PUT /admin/aliases/:alias` `{ variant }`          | manager | create or repoint an alias                                                                 |
| `DELETE /admin/aliases/:alias`                     | manager |                                                                                            |
| `GET /admin/variants/:name/grants`                 | manager | uids granted this variant                                                                  |
| `PUT` / `DELETE /admin/variants/:name/grants/:uid` | manager | grant or remove                                                                            |
| `GET /admin/users`                                 | admin   | uids with a role or at least one grant, with both                                          |
| `PUT /admin/users/:uid/role` `{ role }`            | admin   | `admin`, `manager`, or `null`                                                              |
| `GET /admin/keys`                                  | admin   | like `key list`                                                                            |
| `POST /admin/keys`                                 | admin   | like `key create`; responds with the raw key once                                          |
| `PATCH /admin/keys/:name`                          | admin   | limit, all-variants, `can_act_for_users`                                                   |
| `PUT` / `DELETE /admin/keys/:name/grants/:variant` | admin   | key grants                                                                                 |
| `POST /admin/keys/:name/revoke`                    | admin   |                                                                                            |

Validation and name rules are the CLI's (shared, not copied). An admin cannot remove their own admin role, so there is
always at least one admin (my call). (Superseded by `2026-10-23-owner-role-design.md`: roles follow an owner > admin >
manager hierarchy.) Likewise, a request cannot revoke the key it is made with or stop that key acting
for users, so the board cannot lock itself out; the CLI can still do both. Every successful admin write:

- reloads the registry snapshot in-process before responding, so the change applies at once;
- logs one line: acting uid, route, target (never key material or descriptions).

This reverses the broker spec's "no admin routes over HTTP" non-goal; the CLI remains and gains matching commands:
`variant update <name> --title <text> --description-file <path>`, `user role <uid> (admin|manager|none)`,
`user grant <uid> <variant>`, `user ungrant <uid> <variant>`, `user list`, and `key update <name> --act-for-users |
--no-act-for-users`. The CLI is how the first admin is created.

### Testing

As the existing broker suite: unit tests for visibility with acting uids and roles, role checks per admin route, and
header validation; integration tests for the migration, repository writes, every new route through supertest, and the
new CLI commands.

### Score service (`apps/score-service`), same step

Mahiru's prototype recalculation reaches the broker through the score service's `GET /online-scores`, whose broker key
has `all_variants`. So the broker can enforce access there too (my call, per the anti-goal):

- `GET /online-scores` accepts an optional `X-Acting-Uid` and forwards it unchanged on its broker calls for that request.
  The variant's mode (`variantMode`) is cached per (acting uid, variant) pair; without an acting uid it is cached per
  variant, as before.
- An invalid `X-Acting-Uid` on `GET /online-scores` is rejected with `400 INVALID_REQUEST`.
- The score service's broker key also gets `can_act_for_users`. Without the header it keeps its `all_variants` access,
  so its own work (replay listener, recalculations, game routes) is unchanged.

## 2. Mahiru (`~/Projects/Mahiru`)

### Variants from the broker

- `PPProcessorRESTManager` methods take a **variant name** instead of `(mode, PPCalculationMethod)`; `getVariant` is
  removed. Response typing (live vs rebalance attributes) follows the variant's `algorithm` from `VariantSummary`.
- Default names live in one constants module: `droid-live`, `osu-live`, `droid-rebalance`, `osu-rebalance`. These are
  real variant names, not aliases, because `prototypepp` documents are keyed by them: Mahiru and droidppboard always
  store and look up `prototypepp.type` by the canonical name `VariantSummary.name` returns, never by an alias. Existing
  callers that only need live or rebalance results
  (`/recent`, `/compare`, challenges, embeds, and so on) use these defaults and keep their behavior.
- A variant list service calls `GET /variants`, cached per acting uid for 60 seconds (my call), for autocomplete and
  validation. Autocomplete shows `title ?? name`, filters by mode where relevant, and marks unavailable variants.
- **Acting uid**: every command where a person names a variant, whether picked from autocomplete or typed, sends
  `X-Acting-Uid` with the invoking Discord user's bound uid (looked up through the existing `userbind` collection) and
  resolves the variant with `GET /variants/:name` before using it. That includes reading stored data:
  `/pp prototype check|export` and `/leaderboard`'s prototype option answer a variant the person cannot see as if it does not exist.
  `/recalc` passes the acting uid to the score service (see Broker). Users without a bind send no header and see public
  variants only. Mahiru's broker key gets `can_act_for_users` and no grants of its own, so it sees only public
  variants when acting for no one.
- **Prototype lists** (autocomplete for `/recalc`, `/pp prototype`, `/leaderboard`, and droidppboard's selector) show
  only variants whose `mode` is droid, of either algorithm (my call). Variants whose `mode` is still `null` are left
  out of lists but can still be named directly. `/calculate`'s lists filter by their own mode.

### Commands

- **`/calculate`**: `calculationmethod` is replaced by `variant` (droid variants, default `droid-live`) and
  `pcvariant` (osu variants, default `osu-live`), both autocompleted. A variant of the wrong mode is rejected. The
  detail sections pick live or rebalance formatting from each variant's `algorithm`.
- **`/recalc calculate`**: new `variant` option, default `droid-rebalance`, must be visible to the invoker.
- **`/recalc calculateall`** (bot owner): `reworktype` becomes `variant` (default `droid-rebalance`); `reworkname` and
  the `CURRENT_REWORK_TYPE` check are removed. The variant must exist in the broker. If no `prototypepp` documents
  exist for it yet, `droid-rebalance`'s are cloned (replacing today's clone of `overall`).
- **`PrototypeRecalculationManager`**: live results from `droid-live`, "local" results from the chosen variant, and
  "master" results from `droid-rebalance` whenever the chosen variant is not `droid-rebalance` (replacing
  `reworkType !== "overall"`).
- **`/pp prototype check|export`**: the `rework` option becomes `variant` (my call, for consistency), default
  `droid-rebalance`, autocompleted from the broker. The embed shows `title ?? name` and the description.
- **`/leaderboard`**: the prototype option's autocomplete comes from the broker.

### Removed

`PrototypePPType`, `PrototypePPTypeCollectionManager`, `DatabasePrototypePPType`, its registration in
`AliceDBCollection`, `CURRENT_REWORK_TYPE` in `globals.d.ts`, `PPCalculationMethod` where no longer used, and
localization strings that only those used.

## 3. droidppboard (`~/Projects/droidppboard`)

### Login

- A login page with osu!droid username, password, and a Cloudflare Turnstile widget. The server verifies the Turnstile
  token (`TURNSTILE_SECRET_KEY`; the client gets `TURNSTILE_SITE_KEY`) before touching the database.
- The password is checked against the official database's user table the same way the official site's web login does,
  including its legacy formula. The builder takes both formulas from the **deployed** official site's `user/login.php`
  (the private checkout on the production machine; older copies elsewhere have only the legacy formula). The board
  never writes to the official database. Banned and archived accounts are refused. Before building, confirm the
  board's official-database user can read the user table's password, banned, and archived columns.
- Every failure, whatever the cause, answers "Invalid username or password" (Turnstile failures may say so).
- **Brute-force limits** (in memory; the server is one process, so a restart resets them; my call on the numbers):
    - per username: after 3 failures, further attempts are refused for 2, 4, 8 … seconds, capped at 15 minutes; resets
      after an hour without failures or on success;
    - per IP: 10 attempts per 15 minutes;
    - global: more than 100 failures in 5 minutes refuses all logins for 5 minutes;
    - each failure is logged with IP and username, never the password.
- **Sessions**: a random 32-byte token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie; MongoDB stores only its
  SHA-256 hash with the uid and an expiry (TTL index). A session expires after 1 day without use; each authenticated
  request pushes the expiry back to 1 day from then, but never past 7 days after login (my call), after which the
  person logs in again. Logout deletes it. State-changing requests also require
  an allowed `Origin`. Banned or archived status is re-checked on each authenticated request.

### Variants on public pages

- The server calls the broker with its own key (`can_act_for_users`, no grants of its own) and the logged-in uid as
  `X-Acting-Uid`, or no header for visitors.
- The rework selector, leaderboard, profile, and top-plays routes use `GET /variants` instead of `prototypepptype`,
  showing `title ?? name`, and default to `droid-rebalance` instead of `overall`. A request for a variant the person
  cannot see is answered as if the variant does not exist.
- `app-structures` types change from `IPrototypePPType` to the broker's variant summary shape.

### Management pages

Shown according to `GET /me`'s role; the broker enforces them regardless.

- **Managers and admins**: variant list; edit title and multi-line description; aliases; grants (add or remove uids,
  shown with usernames).
- **Admins** additionally: public/private toggle; roles; API keys (create with the raw key shown once, update,
  grant, revoke).

The server exposes these as routes under `/api/manage/...` that require a session and forward to the broker's admin
routes with the acting uid.

### Testing

droidppboard has no automated tests today. The builder sets up Vitest for the server and adds unit tests for the
brute-force limiter, password check, and session handling at least; the rest is verified by hand.

## Rollout

1. Deploy the broker. Make the default variants public, set titles and descriptions, and create the first admin with
   the CLI. Existing clients keep working unchanged.
2. Deploy Mahiru and droidppboard (either order). When each goes live, mark its key `can_act_for_users` and remove the
   key's own grants or all-variants access. At the same time, in `prototypepp`, rename `overall` to `droid-rebalance`
   and delete `fc-time` and `acc-pp-removal` (done by hand by the owner).
3. Drop the `prototypepptype` collection.

## Left to the builder

- Route and module names inside each repo, following each repo's conventions.
- How Mahiru types responses by `algorithm`.
- The Turnstile client integration in the create-react-app client.
