# Owner Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CLI-only `owner` role above admin, so that only owners can grant or change admin roles and manage API
keys, and admins can manage only managers.

**Architecture:** `owner` joins the shared `UserRole` union and the `users.role` check constraint. Access helpers in
`apps/broker/src/controllers/adminAccess.ts` learn a role ranking (owner > admin > manager). A new
`requireRoleChangeAllowed` guard governs `PUT /admin/users/:uid/role`, and `AdminKeysController` requires the
`"owner"` level. The CLI stays unrestricted.

**Tech Stack:** TypeScript, Express, Drizzle (Postgres/PGlite), zod, vitest, supertest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-23-owner-role-design.md`

## Global Constraints

- Roles, highest to lowest: `owner`, `admin`, `manager`, no role (`null`).
- No HTTP request can grant or remove `owner` or change an owner's role. `roleSetSchema` keeps accepting only
  `"admin"`, `"manager"`, or `null`.
- Every `/admin/keys` route is owner-only; everywhere else an owner is treated as an admin.
- The CLI stays unrestricted for roles and keys.
- No data migration: existing admins stay admins.
- Refusals are `ForbiddenError` (`403 FORBIDDEN`). Exact messages are fixed in the tasks below.
- CI: `pnpm typecheck`, `pnpm exec oxlint --deny-warnings`, `pnpm exec oxfmt --check`, `pnpm test`, `pnpm test:e2e`.
  Warnings fail CI.

## Review Focus

1. An admin demoting **themselves** (to manager or none) must get 403 and keep admin. This used to be a 409. Pinned in
   Task 3.
2. An owner targeting **themselves** over HTTP (e.g. setting their own role to `admin`) must get 403 and stay owner.
   Otherwise an owner could quietly lose CLI-only status. Pinned in Task 3.
3. An admin setting an **unknown uid** (no `users` row) to `manager` must succeed. The target's current role is `null`
   when `findUser` returns `undefined`. Pinned in Task 3.
4. An admin **changing an admin's or owner's grants** through `PUT /admin/variants/:name/grants/:uid` keeps working,
   as today. `requireGrantChangeAllowed` must not start refusing admins. Pinned in Task 2.
5. A refused key or role request must **change nothing** in the registry. Covered by extending the existing
   `registryState()` check in Task 4.

---

### Task 1: Store and set the owner role

**Files:**

- Modify: `packages/shared/src/types.ts:143-147` (`UserRole` and its doc comment)
- Modify: `apps/broker/src/database/schema.ts:100` (check constraint)
- Create: `apps/broker/drizzle/0003_*.sql` and `meta` (generated)
- Modify: `apps/broker/src/cli/arguments.ts:80-92` (`parseRole`)
- Modify: `apps/broker/src/cli/run.ts:78` (usage line)
- Modify: `apps/broker/README.md:120-130` (CLI section and first-admin bootstrap)
- Test: `apps/broker/tests/integration/repositories/RegistryRepository.int.test.ts`,
  `apps/broker/tests/integration/cli/cli.int.test.ts`

**Interfaces:**

- Produces: `type UserRole = "owner" | "admin" | "manager"` (from `@dpp/shared`). `parseRole(value: string):
UserRole | null` accepts `"owner"`.

- [ ] **Step 1: Write the failing tests**

In `RegistryRepository.int.test.ts`, in `"sets, changes, and clears a role"`, add
`await repository.setUserRole(1001, "owner")` and `expect((await repository.findUser(1001))?.role).toBe("owner")`
before the role is cleared.

In `cli.int.test.ts` `"manages user roles and grants"`, add:

```ts
expect((await run("user", "role", "5", "owner")).info).toEqual([
    "Set user 5's role to owner.",
]);
```

Then set it back to `admin` so the rest of the test keeps its expectations. In `"rejects an invalid role or uid"`,
change the expected message to `/Invalid role "root": expected owner, admin, manager, or none/`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @dpp/broker exec vitest run tests/integration/repositories/RegistryRepository.int.test.ts tests/integration/cli/cli.int.test.ts`
Expected: FAIL. The repository test fails with a typecheck error or a `users_role_check` violation, and the CLI test
fails with `Invalid role "owner"`.

- [ ] **Step 3: Implement**

- Change `UserRole` to `"owner" | "admin" | "manager"`. Update the doc comment: owners can do everything admins can,
  plus manage admins and API keys, and are set only with the CLI.
- Change the constraint to `role in ('owner', 'admin', 'manager')`, then run
  `pnpm --filter @dpp/broker db:generate`. Check that the SQL drops and re-adds `users_role_check` and nothing else.
- In `parseRole`, accept `"owner"`. The error message becomes
  `Invalid role "${value}": expected owner, admin, manager, or none`. The usage line becomes
  `user role <uid> (owner | admin | manager | none)`.
- README: the bootstrap comment becomes "This is how the first owner is created", with
  `pnpm cli user role 51076 owner`. Add a line saying owners can be set or removed only here.

- [ ] **Step 4: Run them to verify they pass, then typecheck**

Run: `pnpm --filter @dpp/broker exec vitest run tests/integration/repositories/RegistryRepository.int.test.ts tests/integration/cli/cli.int.test.ts && pnpm typecheck`
Expected: PASS. Typecheck may already flag `UserRole` switches elsewhere. Fix only compile errors here; behavior
changes belong to Tasks 2–4.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types.ts apps/broker/src/database/schema.ts apps/broker/drizzle apps/broker/src/cli apps/broker/README.md apps/broker/tests/integration
git commit -m "Add the owner role, set only with the CLI"
```

### Task 2: Treat owners as admins in the access helpers

**Files:**

- Modify: `apps/broker/src/controllers/adminAccess.ts` (`requireRole`, `canManageVariant`,
  `requireGrantChangeAllowed`, new `hasRole`)
- Modify: `apps/broker/src/controllers/AdminController.ts:86` (`listVariants`)
- Test: `apps/broker/tests/unit/controllers/adminAccess.test.ts`, `apps/broker/tests/integration/admin.int.test.ts`

**Interfaces:**

- Consumes: `UserRole` from Task 1.
- Produces:
    - `hasRole(actual: UserRole | null | undefined, needed: UserRole): boolean`. Ranking is owner > admin > manager,
      and `null`/`undefined` never qualifies.
    - `requireRole(registry, res, role: "manager" | "admin" | "owner"): { uid: number; role: UserRole }`.

- [ ] **Step 1: Write the failing tests**

Unit (`adminAccess.test.ts`):

- `describe("hasRole")` with `it.each` over every (actual, needed) pair. Only these are true: `owner`≥all,
  `admin`≥`admin`/`manager`, `manager`≥`manager`. `null` and `undefined` are false for every needed role.
- `canManageVariant`: `"allows an owner on any variant"`, with `{ uid: 6, role: "owner", grants: new Set() }` →
  `true`.

Integration (`admin.int.test.ts`): add `const owner = 6;` and `await repository.setUserRole(owner, "owner")` in
`beforeEach`. Add to `describe("access")`:

- `"lets an owner use admin routes"`: as `owner`, `GET /admin/variants` returns 200 and lists all three variants.
  `PATCH /admin/variants/flowaim` with `{ pinned: true }` returns 200.
- `"lets an admin change an owner's grants"` (Review Focus 4): as `admin`,
  `PUT /admin/variants/flowaim/grants/6` returns 2xx.
- In `"lets an admin list users and set roles"`, add the owner fixture to the expected `GET /admin/users` list
  (`{ uid: 6, role: "owner", grants: [] }`, sorted by uid), since the new fixture appears there.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @dpp/broker exec vitest run tests/unit/controllers/adminAccess.test.ts tests/integration/admin.int.test.ts`
Expected: FAIL. `hasRole` is not exported, and the owner gets 403.

- [ ] **Step 3: Implement**

- Add and export `hasRole` in `adminAccess.ts`, using a rank map.
- `requireRole` uses `hasRole(actual, role)`. When it fails, it throws with these messages:
    - `"owner"`: `"This needs the owner role"`
    - `"admin"`: `"This needs the admin or owner role"`
    - `"manager"`: `"This needs the manager, admin, or owner role"`
- `canManageVariant` and `requireGrantChangeAllowed` use `hasRole(..., "admin")` instead of `=== "admin"`. Update both
  doc comments to say "an admin or owner".
- In `AdminController.listVariants`, replace `role === "admin"` with `hasRole(role, "admin")`.
- Run `grep -rn '"admin"' apps/broker/src` and convert every remaining "is admin" comparison. Leave the
  `requireRole(..., "admin")` call arguments alone.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @dpp/broker test`
Expected: PASS. If an existing test asserts the old `"This needs the admin role"` text, update it to the new message.

- [ ] **Step 5: Commit**

```bash
git add apps/broker/src/controllers apps/broker/tests
git commit -m "Treat owners as admins in broker access checks"
```

### Task 3: Enforce the role hierarchy on role changes

**Files:**

- Modify: `apps/broker/src/controllers/adminAccess.ts` (new `requireRoleChangeAllowed`)
- Modify: `apps/broker/src/controllers/AdminController.ts:243-265` (`setRole`)
- Modify: `apps/broker/src/services/IRegistryAdminService.ts:64`, `apps/broker/src/services/RegistryAdminService.ts:153-168`
  (remove the self-demotion check and `actingUid`)
- Modify: `apps/broker/README.md:27-44` (status-code paragraph and the `/admin/users` rows)
- Modify: `docs/superpowers/specs/2026-10-17-variant-management-design.md:139` (pointer note)
- Test: `apps/broker/tests/unit/controllers/adminAccess.test.ts`, `apps/broker/tests/integration/admin.int.test.ts`,
  `apps/broker/tests/integration/services/RegistryAdminService.int.test.ts`

**Interfaces:**

- Consumes: `hasRole` and `requireRole` from Task 2. `owner = 6` fixture from Task 2.
- Produces:
    - `requireRoleChangeAllowed(registry: Pick<IRegistryService, "findUser">, actor: { uid: number; role: UserRole },
targetUid: number, requested: "admin" | "manager" | null): void`
    - `IRegistryAdminService.setRole(uid: number, role: UserRole | null): Promise<void>`, with no `actingUid`.

The rule, in order (target role is `findUser(targetUid)?.role ?? null`):

1. If the target's role is `owner`, throw `ForbiddenError("Owners can only be changed with the CLI")`.
2. If the actor is not an owner and the target is `admin` or `requested === "admin"`, throw
   `ForbiddenError("Only an owner can grant or change the admin role")`.
3. Otherwise allow. The route's `requireRole(..., "admin")` already guarantees the actor is at least admin.

- [ ] **Step 1: Write the failing tests**

Unit (`adminAccess.test.ts`): `describe("requireRoleChangeAllowed")` with a stub registry holding uid 1 = admin,
2 = manager, 6 = owner, 9 = admin. Use `it.each` rows of `[actor, target, requested, expected]`, where `expected` is
`"ok"` or the exact message:

- owner → 9 (admin) → `null`, `"manager"`, `"admin"`: ok
- owner → 2 (manager) → `"admin"`: ok
- owner → 5 (unknown) → `"admin"`: ok
- owner → 6 (self) → `"admin"`: `"Owners can only be changed with the CLI"` (Review Focus 2)
- admin → 6 (owner) → `null`: `"Owners can only be changed with the CLI"`
- admin → 9 (admin) → `"manager"` and `null`: `"Only an owner can grant or change the admin role"`
- admin → 1 (self) → `null` and `"manager"`: `"Only an owner can grant or change the admin role"` (Review Focus 1)
- admin → 5 (unknown) → `"admin"`: `"Only an owner can grant or change the admin role"`
- admin → 5 (unknown) → `"manager"`: ok (Review Focus 3)
- admin → 2 (manager) → `null`: ok

Integration (`admin.int.test.ts`, `describe("users")`):

- Replace `"refuses an admin demoting themselves"`. It now expects 403 `FORBIDDEN` with
  `"Only an owner can grant or change the admin role"`, and `/me` still returns `role: "admin"`.
- `"lets an owner grant and remove the admin role"`: as `owner`, `PUT /admin/users/5/role` with `{ role: "admin" }`
  returns 200 with `{ uid: 5, role: "admin", grants: [] }`. Then `{ role: null }` on uid 1 (the `admin` fixture)
  returns 200 with role `null`.
- `"refuses an admin granting or changing the admin role"`: seed uid 9 as admin. As `admin`, these each return 403
  `FORBIDDEN`: `{ role: "admin" }` on 5, `{ role: "manager" }` on 9, `{ role: null }` on 9. Afterwards
  `repository.findUser(9)` is still admin and uid 5 has no role.
- `"refuses anyone changing an owner over HTTP"`: as `admin` and as `owner`, `PUT /admin/users/6/role` with
  `{ role: "admin" }` returns 403 with `"Owners can only be changed with the CLI"`, and uid 6 stays owner.
- Keep `"rejects an unknown role"` (`{ role: "owner" }` → 400 `INVALID_REQUEST`), but send it as `owner`.

Service (`RegistryAdminService.int.test.ts`): delete `"refuses an admin removing their own admin role"`. In
`"sets and clears roles"`, also call `service.setRole(7, "owner")` and expect `{ uid: 7, role: "owner", grants: [] }`
in the list.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @dpp/broker exec vitest run tests/unit/controllers/adminAccess.test.ts tests/integration/admin.int.test.ts tests/integration/services/RegistryAdminService.int.test.ts`
Expected: FAIL. `requireRoleChangeAllowed` doesn't exist, the admin self-demotion still returns 409, and an admin can
still promote to admin.

- [ ] **Step 3: Implement**

- Add `requireRoleChangeAllowed` to `adminAccess.ts` next to `requireGrantChangeAllowed`, following the rule above,
  with a doc comment in the same style.
- In `AdminController.setRole`: take `{ uid, role: actorRole }` from `requireRole`, parse the body, call
  `requireRoleChangeAllowed(this.registry, { uid, role: actorRole }, target, role)`, then
  `this.admin.setRole(target, role)`.
- Remove `actingUid` and the self-demotion `RegistryChangeError` from `setRole` in the service and its interface.
  Update the doc comment.
- README: in the status-code paragraph, drop "an admin removing their own role" from the `409` list and add owner
  rules to the `403` description. In the route table, `GET /admin/users` becomes "admin or owner", and the
  `PUT /admin/users/:uid/role` row describes the rule ("owner: admin/manager/null on anyone but owners; admin:
  manager/null on managers and people without a role").
- Old spec, line 139: after "An admin cannot remove their own admin role, …", add
  "(Superseded by `2026-10-23-owner-role-design.md`: roles follow an owner > admin > manager hierarchy.)"

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @dpp/broker test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/broker docs/superpowers/specs/2026-10-17-variant-management-design.md
git commit -m "Only let owners grant or change the admin role"
```

### Task 4: Make API key management owner-only

**Files:**

- Modify: `apps/broker/src/controllers/AdminKeysController.ts:42,56,77,99,116,130`
- Modify: `apps/broker/README.md:45-49` (key route rows)
- Test: `apps/broker/tests/integration/admin.int.test.ts` (`describe("access")` route table, `describe("keys")`,
  `"refuses an admin locking out the key the request uses"`, `describe("logging")`)

**Interfaces:**

- Consumes: `requireRole(..., "owner")` from Task 2. `owner = 6` fixture from Task 2.

- [ ] **Step 1: Write the failing tests**

- In the `access` route table, replace `adminOnly: boolean` with `minimum: "manager" | "admin" | "owner"`.
  `adminOnly: false` becomes `"manager"`, `adminOnly: true` becomes `"admin"`, and all six `/admin/keys` rows become
  `"owner"`. The refused callers are `undefined` and `plain`, plus `manager` when the minimum is `"admin"` or above,
  plus `admin` when it is `"owner"`. Each refused call is still checked against `registryState()` (Review Focus 5).
  Rename the test to `"refuses $method $path below its role and changes nothing"`.
- In `describe("keys")`, `"refuses an admin locking out the key the request uses"`, and every `describe("logging")`
  case that hits `/admin/keys`, switch the caller from `as(admin)` to `as(owner)`. Rename the lock-out test to
  `"refuses an owner locking out the key the request uses"`. Update any logged-uid expectation from 1 to 6.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @dpp/broker exec vitest run tests/integration/admin.int.test.ts`
Expected: FAIL. Key routes return 2xx for `admin` where the table expects 403.

- [ ] **Step 3: Implement**

- Change all six `requireRole(this.registry, res, "admin")` calls in `AdminKeysController` to `"owner"`. Update the
  class doc comment.
- README: the access column of the five key rows becomes `owner`. Add one sentence saying API keys are owner-only
  because a key that can act for users can act for anyone.

- [ ] **Step 4: Run the full suite and CI checks**

Run: `pnpm typecheck && pnpm exec oxlint --deny-warnings && pnpm exec oxfmt --check && pnpm test && pnpm --filter @dpp/broker test:e2e`
Expected: everything passes with no warnings. If `oxfmt --check` fails, run `pnpm format` and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/broker
git commit -m "Restrict API key management to owners"
```
