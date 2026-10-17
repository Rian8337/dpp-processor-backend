# Variant Management, Step 1 (Broker and Score Service) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the broker store variant titles, per-person (uid) grants and roles, let trusted keys act for a uid, and
expose admin routes, with the score service passing the acting uid through.

**Architecture:** The registry snapshot gains users (uid → role and grants). The auth middleware reads `X-Acting-Uid`
for keys with `can_act_for_users`, and `RegistryService` decides visibility from the acting person instead of the key.
A new `RegistryAdminService` holds every registry write rule; both the CLI and the new admin controllers call it, so
the rules exist once. Admin writes reload the snapshot in-process and log one line.

**Tech Stack:** TypeScript, Express 5, tsyringe, Drizzle ORM + drizzle-kit (Postgres, PGlite in tests), zod 4, Vitest,
supertest.

**Spec:** `docs/superpowers/specs/2026-10-17-variant-management-design.md` (section 1 and "Score service").

## Global Constraints

- Branch `variant-management`. Commit after every task; messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Schema changes go in `apps/broker/src/database/schema.ts`; the migration is generated with
  `pnpm --filter @dpp/broker db:generate`, never written by hand.
- `title` ≤ 100 characters; `description` ≤ 4000 characters, newlines allowed.
- Roles are exactly `admin` and `manager`; `null` means no role.
- `X-Acting-Uid` is a positive integer (`^[1-9][0-9]*$`, at most 2147483647).
- Raw API keys and descriptions are never logged.
- Follow existing conventions: `@Injectable(token)`, `I*` interfaces, tokens in `dependencies/tokens.ts`, JSDoc on
  exported members, 4-space indent. Run `pnpm typecheck`, `pnpm lint`, `pnpm format` before each commit.
- Existing tests keep passing; existing CLI output strings stay the same unless a step says otherwise.

## Decisions This Plan Adds to the Spec

- New error codes in `@dpp/shared` `brokerErrorCodes`: `FORBIDDEN` (403), `NOT_FOUND` (404), and `CONFLICT` (409, for
  name collisions, duplicate keys, and an admin removing their own admin role). Task 8 adds `CONFLICT` to the spec.
- The score service caches a variant's mode per `(acting uid, variant)` pair; without an acting uid the key is the
  variant alone, as today.

## Review Focus

1. A key **without** `can_act_for_users` sending `X-Acting-Uid` must get `400`, never silently fall back to its own
   access (Task 4, test `rejects an acting uid from a key that cannot act for users`).
2. An acting person with no role and no grants must see exactly the public variants, even when the key itself has
   `all_variants` (Task 4, test `uses the acting person's access instead of the key's`).
3. A manager sending `public` in `PATCH /admin/variants/:name` must get `403` and nothing must change, including the
   title in the same request (Task 6, test `rejects a manager changing visibility without applying other fields`).
4. An admin demoting themselves must get `409` and keep the role (Task 5 service test and Task 6 route test).
5. Deleting a variant with the CLI must remove its user grants too, so a stale grant cannot resurrect access if the name
   is reused (Task 3, repository test `deletes user grants with the variant`).

---

### Task 1: PUT, PATCH, and DELETE route decorators

**Files:**

- Modify: `packages/server/src/decorators/routes.ts`
- Test: `packages/server/tests/http/router.test.ts`

**Interfaces:**

- Produces: `Put(path)`, `Patch(path)`, `Delete(path)` exported from `@dpp/server`, like `Get`/`Post`.

- [ ] **Step 1: Write the failing test** in `router.test.ts`: `it("registers PUT, PATCH, and DELETE handlers")`, with a
      controller using all three on `/things/:id`. Assert each method answers 200 with its own body through supertest, and
      that `GET /things/1` is 404.
- [ ] **Step 2: Run it.** `pnpm --filter @dpp/server test -- tests/http/router.test.ts`. Expected: FAIL, `Put` is not
      exported.
- [ ] **Step 3: Implement.** Add `Put = "put"`, `Patch = "patch"`, `Delete = "delete"` to `HttpMethod` and export the
      three decorators made with `createRouteDecorator`, with JSDoc matching `Get`.
- [ ] **Step 4: Run it.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `Add PUT, PATCH, and DELETE route decorators`

### Task 2: Shared contract

**Files:**

- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/limits.ts`, `packages/shared/src/types.ts`,
  `packages/shared/src/schemas.ts`
- Test: `packages/shared/tests/` (create `admin.test.ts`; set up like the package's existing tests, or as
  `packages/server/tests` if `shared` has none)

**Interfaces:**

- Produces (all exported from `@dpp/shared`):
    - `brokerErrorCodes` gains `"FORBIDDEN"`, `"NOT_FOUND"`, `"CONFLICT"`.
    - `maxVariantTitleLength = 100`, `maxVariantDescriptionLength = 4000`.
    - `type UserRole = "admin" | "manager"`.
    - `VariantSummary` gains `readonly title: string | null` (after `name`).
    - `interface MeResponse { uid: number; role: UserRole | null; grants: string[] }`.
    - `interface AdminVariant extends VariantSummary { public: boolean; instanceCount: number }`.
    - `interface AdminKey { name; rateLimitPerMinute: number | null; allVariants: boolean; canActForUsers: boolean;
grants: string[]; createdAt: string; revokedAt: string | null }` (ISO strings).
    - `interface AdminUser { uid: number; role: UserRole | null; grants: string[] }`.
    - `interface CreatedKeyResponse { key: AdminKey; rawKey: string }`.
    - Schemas (zod `strictObject`):
        - `variantUpdateSchema`: `title?: string | null`, `description?: string | null`, `public?: boolean`, at least
          one field.
        - `aliasSetSchema`: `{ variant: string }`.
        - `roleSetSchema`: `{ role: "admin" | "manager" | null }`.
        - `keyCreateSchema`: `name: string`, `rateLimitPerMinute: positive int | null`, `allVariants?: boolean` (default
          false), `canActForUsers?: boolean` (default false), `grants?: string[]` (default `[]`).
        - `keyUpdateSchema`: optional `rateLimitPerMinute`, `allVariants`, `canActForUsers`, at least one.
    - Length limits are **not** in the schemas; `RegistryAdminService` enforces them (Task 5).

- [ ] **Step 1: Write the failing tests.**
    - `variantUpdateSchema` rejects `{}` and an unknown field, and accepts `{ description: "a\nb" }`.
    - `keyCreateSchema` fills the defaults and rejects `rateLimitPerMinute: 0`.
    - `errorCodes` contains `FORBIDDEN`, `NOT_FOUND`, and `CONFLICT`.
- [ ] **Step 2: Run them.** `pnpm --filter @dpp/shared test`. Expected: FAIL.
- [ ] **Step 3: Implement** the exports above.
- [ ] **Step 4: Run them.** Expected: PASS. `pnpm typecheck` now fails in `apps/broker/src/controllers/variantSummary.ts`
      (missing `title`). Fix it there with `title: variant.title`. This needs `Variant.title`, so add
      `readonly title: string | null` to `Variant` in `apps/broker/src/registry/types.ts` and fill it with `null` in
      `buildSnapshot` for now. Task 3 replaces the `null`. Fix any test fixtures that build a `Variant` by hand.
- [ ] **Step 5: Run every broker and score-service test** (`pnpm test`). Expected: PASS.
- [ ] **Step 6: Commit.** `Add the variant management contract to @dpp/shared`

### Task 3: Registry schema, migration, repository, and snapshot

**Files:**

- Modify: `apps/broker/src/database/schema.ts`, `apps/broker/src/registry/types.ts`,
  `apps/broker/src/registry/snapshot.ts`, `apps/broker/src/repositories/IRegistryRepository.ts`,
  `apps/broker/src/repositories/RegistryRepository.ts`, `apps/broker/tests/utils/registry.ts`
- Create: `apps/broker/drizzle/<generated>.sql` and meta (generated)
- Test: `apps/broker/tests/integration/repositories/RegistryRepository.int.test.ts`,
  `apps/broker/tests/unit/registry/snapshot.test.ts`

**Interfaces:**

- Schema:
    - `variantsTable.title: text()`.
    - `apiKeysTable.canActForUsers: boolean().notNull().default(false)`.
    - `usersTable` (`users`): `uid: integer().primaryKey()`, `role: text()` with
      `check("users_role_check", sql\`role in ('admin', 'manager')\`)`, `createdAt`.
    - `userVariantsTable` (`user_variants`): `uid` → `usersTable.uid` cascade, `variantName` → `variantsTable.name`
      cascade, primary key `(uid, variantName)`.
    - Add both new tables to `schema`.
- Types (`registry/types.ts`):
    - `Variant.title`.
    - `VariantRow.title: string | null`.
    - `ApiKeyRecord.canActForUsers: boolean`.
    - `KeyListing.canActForUsers: boolean`.
    - `NewApiKey.canActForUsers: boolean`.
    - `interface UserRecord { uid: number; role: UserRole | null; grants: ReadonlySet<string> }`.
    - `RegistrySnapshot.users: ReadonlyMap<number, UserRecord>`.
    - `interface UserListing { uid: number; role: UserRole | null; grants: readonly string[] }` (grants sorted).
- `SnapshotRows` gains `variants[].title`, `keys[].canActForUsers`, `users: { uid; role }[]`, and
  `userGrants: { uid; variantName }[]`. `testSnapshot` defaults both new arrays to `[]`.
- New repository methods:
    - `updateVariant` changes also accept `title?: string | null`.
    - `updateKey` changes also accept `canActForUsers?: boolean`.
    - `grantUser(uid: number, variantName: string): Promise<boolean>` creates the user row if missing; returns `false`
      if the grant already existed.
    - `ungrantUser(uid: number, variantName: string): Promise<boolean>`.
    - `setUserRole(uid: number, role: UserRole | null): Promise<void>` (upsert).
    - `findUser(uid: number): Promise<UserListing | undefined>`.
    - `listUsers(): Promise<UserListing[]>`, sorted by uid, only users with a role or at least one grant.
    - `usersGranted(variantName: string): Promise<number[]>`, sorted.

- [ ] **Step 1: Write the failing repository tests.**
    - `stores and loads a variant title`.
    - `grants a user a variant once` (second call returns `false`; `loadSnapshot().users.get(uid).grants` has it).
    - `sets, changes, and clears a role`.
    - `lists only users with a role or a grant`.
    - `deletes user grants with the variant`.
    - `loads can_act_for_users for keys` (insert with `canActForUsers: true`; `keysByHash` record has it).
    - `lists the uids granted a variant`.
- [ ] **Step 2: Write the failing snapshot test** `builds users with their roles and grants`.
- [ ] **Step 3: Run them.**
      `pnpm --filter @dpp/broker test -- tests/integration/repositories tests/unit/registry/snapshot.test.ts`.
      Expected: FAIL.
- [ ] **Step 4: Change the schema and generate the migration:** `pnpm --filter @dpp/broker db:generate`. Check that
      the generated SQL contains only the two `alter table` statements, the two `create table`s, the check, and the
      foreign keys.
- [ ] **Step 5: Implement** the types, `buildSnapshot`, `loadSnapshot` (in the same repeatable-read transaction), and
      the new repository methods. Replace Task 2's `title: null` with the row's title.
- [ ] **Step 6: Run the tests** from Step 3, then `pnpm --filter @dpp/broker test`. Expected: PASS.
- [ ] **Step 7: Commit.** `Store variant titles, user roles, and user grants in the broker registry`

### Task 4: Acting for a person

**Files:**

- Modify: `apps/broker/src/registry/types.ts`, `apps/broker/src/middleware/auth.ts`,
  `apps/broker/src/services/RegistryService.ts`, `apps/broker/src/services/IRegistryService.ts`,
  `apps/broker/src/types/errors.ts`, `apps/broker/src/app.ts`
- Test: `apps/broker/tests/unit/middleware/auth.test.ts`, `apps/broker/tests/unit/services/RegistryService.test.ts`,
  `apps/broker/tests/integration/app.int.test.ts`

**Interfaces:**

- `Caller` key variant becomes `{ kind: "key"; key: ApiKeyRecord; actingUid?: number }`.
- `IRegistryService.findUser(uid: number): UserRecord | undefined` and `IRegistryService.allVariants(): Variant[]`
  (every variant regardless of caller, sorted by name; Task 6 builds `AdminVariant` from it with
  `toVariantSummary` plus `public` and `instances.length`), both read from the snapshot.
- `InvalidActingUidError extends APIError` (400 `INVALID_REQUEST`), with two messages:
    - "This key cannot act for users"
    - "X-Acting-Uid must be a positive integer"
- Visibility (`RegistryService.canUse`), when `caller.actingUid` is set:
    - acting user's role is set → `true`;
    - otherwise → `variant.public || user.grants.has(variant.name)`.

    The key's own `allVariants` and grants are ignored. Without `actingUid`, the current rule is unchanged.

- CORS `allowedHeaders` adds `"X-Acting-Uid"`.

- [ ] **Step 1: Write the failing auth middleware tests.**
    - `attaches the acting uid for a key that can act for users`.
    - `rejects an acting uid from a key that cannot act for users`: 400, body code `INVALID_REQUEST`.
    - `rejects an acting uid without a key`: 400.
    - `rejects acting uids that are not positive integers`: values `0`, `-1`, `1.5`, `abc`, `""`, `2147483648`.
- [ ] **Step 2: Write the failing `RegistryService` tests.**
    - `uses the acting person's access instead of the key's`: an `all_variants` key acting for a uid with no role and
      no grants sees only public variants.
    - `lets an acting person use their granted private variants`.
    - `lets acting admins and managers see every variant`.
    - `treats an unknown acting uid as having no grants`.
- [ ] **Step 3: Write the failing app integration test** `filters GET /variants and forwarding by the acting person`.
      Add key `board` (`canActForUsers: true`) and user grant `(1001, "flowaim")` to the `beforeAll` fixtures, then check:
    - uid 1001 sees `flowaim`;
    - uid 1002 does not;
    - `POST /variants/flowaim/difficulty` as uid 1002 is `404 VARIANT_NOT_FOUND`;
    - `GET /variants` responses include `title`.
- [ ] **Step 4: Run them.** Expected: FAIL.
- [ ] **Step 5: Implement.**
- [ ] **Step 6: Run** `pnpm --filter @dpp/broker test`. Expected: PASS.
- [ ] **Step 7: Commit.** `Let trusted broker keys act for a person`

### Task 5: Registry admin service and CLI

**Files:**

- Create: `apps/broker/src/services/IRegistryAdminService.ts`, `apps/broker/src/services/RegistryAdminService.ts`,
  `apps/broker/src/registry/RegistryChangeError.ts`, `apps/broker/src/cli/commands/user.ts`
- Modify: `apps/broker/src/dependencies/tokens.ts` (add `registryAdminService`),
  `apps/broker/src/services/index.ts`, `apps/broker/src/cli/run.ts` (commands, usage, error handling),
  `apps/broker/src/cli/types.ts`, `apps/broker/src/cli.ts`, `apps/broker/src/cli/commands/variant.ts`,
  `apps/broker/src/cli/commands/alias.ts`, `apps/broker/src/cli/commands/key.ts`, `apps/broker/README.md` (CLI
  section)
- Test: `apps/broker/tests/integration/services/RegistryAdminService.int.test.ts` (create),
  `apps/broker/tests/integration/cli/cli.int.test.ts`

**Interfaces:**

- `class RegistryChangeError extends Error { constructor(readonly kind: "invalid" | "not-found" | "variant-not-found" |
"conflict", message: string) }`. Messages are the CLI's current messages, moved here unchanged (for example
  `No variant named "x"`, `"x" is already a variant`, `No key named "x"`, `Key x is revoked`).
- `IRegistryAdminService` (constructor takes `IRegistryRepository` via `dependencyTokens.registryRepository`):
    - `updateVariant(name: string, changes: { title?: string | null; description?: string | null; public?: boolean }):
Promise<void>`. An empty string becomes `null`. Over-length text is `invalid`, with messages
      `Title is longer than 100 characters` and `Description is longer than 4000 characters`.
    - `setAlias(alias: string, variant: string): Promise<{ previous: string | undefined }>`.
    - `removeAlias(alias: string): Promise<void>`.
    - `grantUser(uid: number, variant: string): Promise<boolean>` and `ungrantUser(uid: number, variant: string):
Promise<void>` (`not-found` if there was no grant).
    - `setRole(uid: number, role: UserRole | null, actingUid?: number): Promise<void>`. `conflict` with
      `You cannot remove your own admin role` when `actingUid === uid` and `role !== "admin"`.
    - `createKey(input: { name: string; rateLimitPerMinute: number | null; allVariants: boolean; canActForUsers: boolean;
grants: readonly string[] }): Promise<{ key: KeyListing; rawKey: string }>`.
    - `updateKey(name: string, changes: { rateLimitPerMinute?: number | null; allVariants?: boolean; canActForUsers?:
boolean }): Promise<KeyListing>`.
    - `grantKey(name: string, variant: string): Promise<{ added: boolean; allVariants: boolean }>`, `ungrantKey(name:
string, variant: string): Promise<void>`, and `revokeKey(name: string): Promise<void>`.
    - `listUsers(): Promise<UserListing[]>`, `usersGranted(variant: string): Promise<number[]>` (`variant-not-found`
      for an unknown variant), and `listKeys(): Promise<KeyListing[]>` (reads, for the controllers).

    Name validation uses `isValidName`. `uid` arguments must be positive integers.

- `CliDependencies` gains `admin: IRegistryAdminService`. `runAction` treats `RegistryChangeError` like `CliError`.
- CLI changes:
    - `variant update` adds `--title <text>` and `--description-file <path>` (UTF-8, trailing newline trimmed), and
      refuses `--description` together with `--description-file`.
    - New `user role <uid> (admin|manager|none)`, `user grant <uid> <variant>`, `user ungrant <uid> <variant>`, and
      `user list` (columns `UID`, `ROLE`, `GRANTS`).
    - `key create` and `key update` accept `--act-for-users`; `key update` also accepts `--no-act-for-users`.
    - `key list` and `key show` show `act for users: yes/no`.
    - `variant list` shows `TITLE`.

    The existing `variant update`, `alias`, and `key` commands call the service instead of the repository.

- [ ] **Step 1: Write the failing service tests**, against a real repository on PGlite:
    - `rejects titles over 100 characters and descriptions over 4000`, with exactly 100 and 4000 accepted;
    - `keeps newlines in descriptions`;
    - `refuses an alias named like a variant` (`conflict`);
    - `grants a user only an existing variant` (`variant-not-found`);
    - `refuses an admin removing their own admin role` (`conflict`, role unchanged);
    - `creates a key that can act for users and returns the raw key once`.
- [ ] **Step 2: Write the failing CLI tests:**
    - `sets a title and a multi-line description from a file` (temp file with two lines; `variant list` shows the
      title);
    - `manages user roles and grants` (`user role 5 admin`, `user grant 6 x`, `user list` output, `user role 5 none`);
    - `rejects an invalid role or uid`;
    - `lets a key act for users`.
    - Existing CLI tests stay unchanged and must still pass.
- [ ] **Step 3: Run them.** `pnpm --filter @dpp/broker test -- tests/integration`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement** the error, the service, the CLI refactor, the new commands, and the usage text. Update
      the README's "Managing the registry" section with the new commands and an example of creating the first admin.
- [ ] **Step 5: Run** `pnpm --filter @dpp/broker test`. Expected: PASS.
- [ ] **Step 6: Commit.** `Move registry rules into RegistryAdminService and add user CLI commands`

### Task 6: Admin and me routes

**Files:**

- Create: `apps/broker/src/controllers/MeController.ts`, `apps/broker/src/controllers/AdminController.ts`,
  `apps/broker/src/controllers/adminAccess.ts`, `apps/broker/src/http/jsonBody.ts`
- Modify: `apps/broker/src/controllers/index.ts`, `apps/broker/src/types/errors.ts`, `apps/broker/README.md` (API
  section)
- Test: `apps/broker/tests/integration/admin.int.test.ts` (create), `apps/broker/tests/unit/http/jsonBody.test.ts`
  (create)

**Interfaces:**

- `readJsonBody(req: Request): unknown` parses the `Buffer` that `express.raw` left. It throws `BadRequestError`
  ("Request body must be JSON, sent with Content-Type: application/json") on a missing or invalid body.
- `requireRole(registry: IRegistryService, res: Response, role: "manager" | "admin"): { uid: number; role: UserRole }`.
    - `ForbiddenError` (403 `FORBIDDEN`) when the caller has no acting uid or the role is too low. An admin satisfies
      `"manager"`.
    - `GET /me` uses only the acting uid. It is 403 without one, and needs no role.
- Errors from `RegistryChangeError` map to:
    - `invalid` → 400 `INVALID_REQUEST`;
    - `not-found` → 404 `NOT_FOUND`;
    - `variant-not-found` → 404 `VARIANT_NOT_FOUND`;
    - `conflict` → 409 `CONFLICT`.

    Add `ForbiddenError`, `NotFoundError`, and `ConflictError` to `types/errors.ts`, plus
    `toApiError(e: RegistryChangeError): APIError`.

- Routes exactly as in the spec's table. Responses:
    - `GET /me` → `MeResponse`.
    - `GET /admin/variants` → `AdminVariant[]`.
    - `PATCH /admin/variants/:name` → the updated `AdminVariant`.
    - `PUT /admin/aliases/:alias` → `204`.
    - `GET /admin/variants/:name/grants` → `number[]`.
    - Grant `PUT` and `DELETE` → `204`.
    - `GET /admin/users` → `AdminUser[]`.
    - `PUT /admin/users/:uid/role` → `AdminUser`.
    - `GET /admin/keys` → `AdminKey[]`.
    - `POST /admin/keys` → `201 CreatedKeyResponse`.
    - `PATCH /admin/keys/:name` → `AdminKey`.
    - Key grant routes and revoke → `204`.
- `PATCH /admin/variants/:name` checks for admin **before** writing anything when the body contains `public`.
- After every successful write: `await registry.reload()`, then
  `console.log(\`Admin change by uid ${uid}: ${req.method} ${req.path}\`)`. Never log bodies.

- [ ] **Step 1: Write the failing `jsonBody` unit tests:** a valid buffer is parsed; an empty buffer, invalid JSON, or
      a non-buffer body is rejected.
- [ ] **Step 2: Write the failing integration tests.** Fixtures: an app with variants, a `board` key with
      `canActForUsers`, admin uid 1, manager uid 2, and plain uid 3.
    - `answers GET /me for the acting person`, and 403 without `X-Acting-Uid`.
    - `rejects admin routes for people without a role` (uid 3 → 403 on `GET /admin/variants`).
    - `lets a manager edit a title and a multi-line description and applies it at once`: the next `GET /variants`
      shows them without waiting for a reload.
    - `rejects a manager changing visibility without applying other fields`: `{ title: "x", public: true }` → 403, and
      the title is unchanged.
    - `lets an admin make a variant public`.
    - `manages aliases and user grants as a manager`.
    - `keeps key and role routes to admins` (manager → 403 on `GET /admin/keys` and `PUT /admin/users/5/role`).
    - `creates a key and returns the raw key once`: the raw key then authenticates against `GET /variants`.
    - `refuses an admin demoting themselves` (409 `CONFLICT`).
    - `rejects over-length descriptions` (4001 characters → 400).
    - `logs admin changes without bodies`: spy on `console.log`; the line contains `uid 2` and the path, and no
      description text.
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement** the controllers and helpers. Update the README's API section with the new routes, the
      `X-Acting-Uid` header, and a note that admin routes need a key with `can_act_for_users`.
- [ ] **Step 5: Run** `pnpm --filter @dpp/broker test` and `pnpm --filter @dpp/broker test:e2e`. Expected: PASS.
- [ ] **Step 6: Commit.** `Add broker admin and me routes`

### Task 7: Score service passes the acting uid

**Files:**

- Modify: `apps/score-service/src/clients/IBrokerClient.ts`, `apps/score-service/src/clients/BrokerClient.ts`,
  `apps/score-service/src/services/IScoreCalculator.ts`, `apps/score-service/src/services/ScoreCalculator.ts`,
  `apps/score-service/src/services/IOnlineScoreService.ts`, `apps/score-service/src/services/OnlineScoreService.ts`,
  `apps/score-service/src/controllers/OnlineScoresController.ts`, `apps/score-service/README.md`
- Test: `apps/score-service/tests/unit/clients/BrokerClient.test.ts`, the `OnlineScoreService` unit test (create
  `tests/unit/services/OnlineScoreService.test.ts` if none exists), `apps/score-service/tests/integration/app.int.test.ts`

**Interfaces:**

- `IBrokerClient`:
    - `performance(variant, request, actingUid?: number)`;
    - `replayPerformance(variant, request, actingUid?: number)`;
    - `variantMode(variant, actingUid?: number)`.

    When `actingUid` is set, the request carries `X-Acting-Uid`. The mode cache key is `` `${actingUid ?? ""}:${variant}` ``.

- `StatsOptions` and `ReplayOptions` gain `actingUid?: number`. `ScoreCalculator` passes it to the broker.
- `IOnlineScoreService.lookup(query: OnlineScoreQuery, actingUid?: number)`.
- `OnlineScoresController` reads `X-Acting-Uid` with the same rule and message as the broker. It moves the broker's
  parser into `@dpp/shared` as `parseActingUid(value: string | undefined): number | undefined | "invalid"`, used by
  both apps; Task 4's middleware switches to it here. An invalid value is 400 `INVALID_REQUEST`.

- [ ] **Step 1: Write the failing tests:**
    - `BrokerClient`: `sends X-Acting-Uid when acting for a person`, `omits X-Acting-Uid otherwise`, and
      `caches modes per acting uid`.
    - `OnlineScoreService`: `passes the acting uid to every broker call` (stats path and replay path).
    - App integration: `forwards X-Acting-Uid from GET /online-scores` and `rejects an invalid X-Acting-Uid`.
    - Shared: `parseActingUid` cases as in Task 4.
- [ ] **Step 2: Run them.** `pnpm --filter @dpp/score-service test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update the score service README's `GET /online-scores` section: optional
      `X-Acting-Uid`, which needs the score service's broker key to have `can_act_for_users`.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `Pass the acting uid from the score service to the broker`

### Task 8: Spec alignment and full verification

**Files:**

- Modify: `docs/superpowers/specs/2026-10-17-variant-management-design.md`, `docs/superpowers/specs/2026-10-07-broker-design.md`
  (mark the "no admin routes over HTTP" non-goal as superseded by the 2026-10-17 design)

- [ ] **Step 1: Update the spec.** Add `CONFLICT` (409) next to `FORBIDDEN`, and the per-acting-uid mode cache wording.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm test:e2e`. Expected: all pass.
- [ ] **Step 3: Commit.** `Align the variant management spec with the broker implementation`
