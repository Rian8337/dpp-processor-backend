# Client Redesign: Broker Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers manage only the variants they are granted, and give variant summaries what droidppboard's redesigned sidebar needs (newest `builtAt`, `public`).

**Architecture:** One new access helper in `apps/broker/src/controllers/adminAccess.ts` decides "may this person manage this variant / change this person's grant"; `AdminController` calls it instead of the bare `requireRole(..., "manager")` on variant-scoped routes. `HealthMonitor` keeps `/info` per instance as well as per variant, and `toVariantSummary` derives the newest `builtAt` from healthy instances.

**Tech Stack:** TypeScript, Express (`@dpp/server` controllers), tsyringe, Vitest, supertest, the broker's test database utilities.

**Spec:** `~/Projects/droidppboard/docs/superpowers/specs/2026-10-18-client-redesign-design.md` (section "Backend changes → Broker"). The droidppboard plan is `~/Projects/droidppboard/docs/superpowers/plans/2026-10-18-client-redesign.md`.

## Global Constraints

- Work on a new branch `client-redesign` in `~/Projects/dpp-processor-backend`.
- Run tests with a single worker: `pnpm --filter @dpp/broker exec vitest run --no-file-parallelism --maxWorkers=1 <path>`. Never run several test processes at once.
- Naming: functions and methods start with a verb; variables, constants, and properties are nouns; booleans may be predicates (`isHealthy`, `canManage`).
- Backward compatible with the current droidppboard: no route removed or renamed, no response field removed.
- admin: manages every variant, roles, and keys. manager: manages a variant only with a grant on it. A grant without the manager role only means "can see and use".
- Changing `public` stays admin-only (already enforced in `updateVariant`).
- A manager may grant or remove access only for people with **no role**, never for managers or admins, and never for themselves.
- Errors use the existing `ForbiddenError` (403) and `VariantNotFoundError` (404) types; messages are plain sentences.

## Review Focus

1. A manager acting on a variant they have no grant on, through **any** variant-scoped route including aliases → 403, and nothing is written (tests in Task 1).
2. A manager moving an alias from their variant to one they lack a grant on (or from a variant they lack to theirs) → 403 (test in Task 1).
3. A manager removing their own grant, or another manager's → 403; an admin may do both (tests in Task 1).
4. A variant with two healthy instances on different builds reports the newer `builtAt`; a variant whose instances are all down keeps the last known `builtAt` rather than losing it (tests in Task 2).
5. `GET /admin/variants` for a manager with no grants → an empty list, not 403 (test in Task 1).

---

### Task 1: Per-variant manager access

**Files:**

- Modify: `apps/broker/src/controllers/adminAccess.ts`
- Modify: `apps/broker/src/controllers/AdminController.ts` (`listVariants`, `updateVariant`, `setAlias`, `removeAlias`, `listGrants`, `grantUser`, `ungrantUser`)
- Test: `apps/broker/tests/integration/admin.int.test.ts`
- Test: `apps/broker/tests/unit/controllers/adminAccess.test.ts` (create)

**Interfaces:**

- Consumes: `requireRole(registry, res, role)`, `IRegistryService.findUser(uid): UserRecord | undefined` (`UserRecord` has `role` and `grants: ReadonlySet<string>`), `IRegistryService.allVariants(): Variant[]` (each `Variant` has `name` and `aliases`).
- Produces:
    - `requireVariantManager(registry: Pick<IRegistryService, "findUser">, res: Response, variantName: string): { uid: number; role: UserRole }` — passes for admins, and for managers whose `grants` contain `variantName`; otherwise throws `ForbiddenError("You cannot manage this variant")`.
    - `requireGrantChangeAllowed(registry: Pick<IRegistryService, "findUser">, actor: { uid: number; role: UserRole }, targetUid: number): void` — admins always pass; a manager passes only when `targetUid !== actor.uid` and the target has no role; otherwise throws `ForbiddenError("Managers can only change access for people without a role")`.
    - `canManageVariant(user: UserRecord | undefined, variantName: string): boolean` — the pure predicate both helpers share.

- [ ] **Step 1: Create the branch**

Run: `cd ~/Projects/dpp-processor-backend && git checkout -b client-redesign`, then commit this plan file on it: `git add docs/superpowers/plans/2026-10-18-client-redesign-broker.md && git commit -m "Add the client redesign broker plan"`

- [ ] **Step 2: Write failing unit tests for `canManageVariant` in `tests/unit/controllers/adminAccess.test.ts`**

```ts
describe("canManageVariant", () => {
    it("allows an admin on any variant", () => {
        expect(
            canManageVariant(
                { uid: 1, role: "admin", grants: new Set() },
                "flowaim",
            ),
        ).toBe(true);
    });
    it("allows a manager with a grant on the variant", () => {
        expect(
            canManageVariant(
                { uid: 2, role: "manager", grants: new Set(["flowaim"]) },
                "flowaim",
            ),
        ).toBe(true);
    });
    it("refuses a manager without a grant on the variant", () => {
        expect(
            canManageVariant(
                { uid: 2, role: "manager", grants: new Set(["other"]) },
                "flowaim",
            ),
        ).toBe(false);
    });
    it("refuses a grant without a role, and an unknown person", () => {
        expect(
            canManageVariant(
                { uid: 3, role: null, grants: new Set(["flowaim"]) },
                "flowaim",
            ),
        ).toBe(false);
        expect(canManageVariant(undefined, "flowaim")).toBe(false);
    });
});
```

(Match the `UserRecord` shape in `src/registry/types.ts`; adjust the object literals if it has more required fields.)

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @dpp/broker exec vitest run --no-file-parallelism --maxWorkers=1 tests/unit/controllers/adminAccess.test.ts`
Expected: FAIL, `canManageVariant` is not exported.

- [ ] **Step 4: Implement `canManageVariant`, `requireVariantManager`, `requireGrantChangeAllowed` in `src/controllers/adminAccess.ts`**

`requireVariantManager` calls `requireActingUid`, looks the person up, and throws unless `canManageVariant` holds. Document each with JSDoc like the existing helpers.

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: same as Step 3. Expected: PASS.

- [ ] **Step 6: Write failing integration tests in `tests/integration/admin.int.test.ts`**

The fixture already has `admin = 1`, `manager = 2` (granted `flowaim`), `plain = 3`, and variants `droid-live` and `flowaim` (alias `experiment`). Add in `beforeEach`: a second manager `otherManager = 4` with role manager and no grants, and a variant `secret` (private, no grants). Replace the existing test "lists every variant for a manager" with the filtered behaviour, and add, inside the existing `describe` blocks:

```ts
// describe("variants")
it("lists only granted variants for a manager", async () => {
    const res = await as(manager).get("/admin/variants");
    expect(res.status).toBe(200);
    expect(res.body.map((v: { name: string }) => v.name)).toEqual(["flowaim"]);
});
it("lists every variant for an admin", async () => {
    const res = await as(admin).get("/admin/variants");
    expect(res.body.map((v: { name: string }) => v.name)).toEqual([
        "droid-live",
        "flowaim",
        "secret",
    ]);
});
it("lists nothing for a manager without grants", async () => {
    const res = await as(otherManager).get("/admin/variants");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
});
it("refuses a manager editing a variant they are not granted, writing nothing", async () => {
    const res = await as(manager)
        .patch("/admin/variants/secret")
        .send({ title: "Hijacked" });
    expect(res.status).toBe(403);
    const list = await as(admin).get("/admin/variants");
    expect(
        list.body.find((v: { name: string }) => v.name === "secret").title,
    ).toBeNull();
});

// describe("aliases and grants")
it("refuses a manager reading or changing grants of a variant they are not granted", async () => {
    expect(
        (await as(manager).get("/admin/variants/secret/grants")).status,
    ).toBe(403);
    expect(
        (await as(manager).put(`/admin/variants/secret/grants/${plain}`))
            .status,
    ).toBe(403);
    expect(
        (await as(manager).delete(`/admin/variants/secret/grants/${plain}`))
            .status,
    ).toBe(403);
});
it("refuses a manager granting or removing a manager, an admin, or themselves", async () => {
    expect(
        (
            await as(manager).put(
                `/admin/variants/flowaim/grants/${otherManager}`,
            )
        ).status,
    ).toBe(403);
    expect(
        (await as(manager).put(`/admin/variants/flowaim/grants/${admin}`))
            .status,
    ).toBe(403);
    expect(
        (await as(manager).delete(`/admin/variants/flowaim/grants/${manager}`))
            .status,
    ).toBe(403);
});
it("lets a manager grant and remove a person without a role on their variant", async () => {
    expect(
        (await as(manager).put(`/admin/variants/flowaim/grants/${plain}`))
            .status,
    ).toBe(204);
    expect(
        (await as(manager).delete(`/admin/variants/flowaim/grants/${plain}`))
            .status,
    ).toBe(204);
});
it("lets an admin grant a manager", async () => {
    expect(
        (await as(admin).put(`/admin/variants/secret/grants/${otherManager}`))
            .status,
    ).toBe(204);
});
it("refuses a manager pointing an alias at, or away from, a variant they are not granted", async () => {
    expect(
        (
            await as(manager)
                .put("/admin/aliases/stolen")
                .send({ variant: "secret" })
        ).status,
    ).toBe(403);
    await as(admin).put("/admin/aliases/theirs").send({ variant: "secret" });
    expect(
        (
            await as(manager)
                .put("/admin/aliases/theirs")
                .send({ variant: "flowaim" })
        ).status,
    ).toBe(403);
    expect((await as(manager).delete("/admin/aliases/theirs")).status).toBe(
        403,
    );
});
it("lets a manager add and remove an alias on their own variant", async () => {
    expect(
        (
            await as(manager)
                .put("/admin/aliases/mine")
                .send({ variant: "flowaim" })
        ).status,
    ).toBe(204);
    expect((await as(manager).delete("/admin/aliases/mine")).status).toBe(204);
});
```

Keep the existing test "manages aliases and user grants as a manager" passing; if it grants `plain` on `flowaim`, it still should.

- [ ] **Step 7: Run them to verify they fail**

Run: `pnpm --filter @dpp/broker exec vitest run --no-file-parallelism --maxWorkers=1 tests/integration/admin.int.test.ts`
Expected: the new tests FAIL (managers currently pass everywhere; the variant list is unfiltered).

- [ ] **Step 8: Apply the checks in `AdminController`**

- `listVariants`: keep `requireRole(..., "manager")`; if the role is `manager`, filter `allVariants()` with `canManageVariant(this.registry.findUser(uid), variant.name)`.
- `updateVariant`, `listGrants`: `requireVariantManager(this.registry, res, req.params.name)` replaces `requireRole(..., "manager")`. Keep the admin check for `public` in `updateVariant`.
- `grantUser`, `ungrantUser`: `requireVariantManager` for the variant, then `requireGrantChangeAllowed(this.registry, actor, pathUid(req.params.uid))` before writing.
- `setAlias`: the variant in the body **and** the variant the alias currently points to (found by scanning `this.registry.allVariants()` for one whose `aliases` include the alias; none if new) each pass `requireVariantManager`.
- `removeAlias`: the variant the alias currently points to passes `requireVariantManager`; an unknown alias keeps today's behaviour.
- All checks happen before any write, so a refused request changes nothing.

- [ ] **Step 9: Run the integration and unit tests to verify they pass**

Run: `pnpm --filter @dpp/broker exec vitest run --no-file-parallelism --maxWorkers=1 tests/integration/admin.int.test.ts tests/unit/controllers/adminAccess.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck and commit**

Run: `pnpm --filter @dpp/broker typecheck` → no errors.

```bash
git add apps/broker/src/controllers apps/broker/tests
git commit -m "Limit managers to the variants they are granted"
```

### Task 2: Newest build time and visibility on variant summaries

**Files:**

- Modify: `apps/broker/src/services/IHealthMonitor.ts`, `apps/broker/src/services/HealthMonitor.ts`
- Modify: `apps/broker/src/controllers/variantSummary.ts`, `apps/broker/src/controllers/adminViews.ts`
- Modify: `packages/shared/src/types.ts` (`VariantSummary`)
- Test: `apps/broker/tests/unit/controllers/variantSummary.test.ts`, `apps/broker/tests/unit/services/HealthMonitor.test.ts`

**Interfaces:**

- Consumes: `HealthMonitor.check` (stores `probe.info` on a healthy probe), `InfoResponse.builtAt: string` (ISO datetime).
- Produces:
    - `IHealthMonitor.infoOf(instance: Instance): InfoResponse | undefined` — the `/info` from that instance's most recent healthy check.
    - `VariantSummary.public: boolean` (new field; `AdminVariant` already has it and keeps it).
    - `VariantSummary.builtAt`: the newest `builtAt` among the variant's **healthy** instances' `infoOf`; if none is healthy, `lastInfo(variant.name)?.builtAt ?? null` (keeps the last known time while a variant is down, which the sidebar uses for "Last updated"; a refinement of the spec's "null when none").
    - `toVariantSummary(variant, health: Pick<IHealthMonitor, "isHealthy" | "lastInfo" | "infoOf">)`.

- [ ] **Step 1: Write failing tests**

In `HealthMonitor.test.ts`: `it("remembers /info per instance")` — after two instances of one variant answer healthy with different `builtAt`, `infoOf(each)` returns each one's info; after an instance is removed by `sync`, `infoOf` returns `undefined` for it.

In `variantSummary.test.ts` (extend its fake health object with `infoOf`):

```ts
it("reports the newest build among healthy instances", () => {
    // instance a: healthy, builtAt 2026-10-01T00:00:00.000Z; instance b: healthy, 2026-10-10T00:00:00.000Z
    expect(toVariantSummary(variant, health).builtAt).toBe(
        "2026-10-10T00:00:00.000Z",
    );
});
it("ignores builds of instances that are down", () => {
    // b is down
    expect(toVariantSummary(variant, health).builtAt).toBe(
        "2026-10-01T00:00:00.000Z",
    );
});
it("keeps the last known build when every instance is down", () => {
    // both down; lastInfo has builtAt 2026-09-01T00:00:00.000Z
    expect(toVariantSummary(variant, health).builtAt).toBe(
        "2026-09-01T00:00:00.000Z",
    );
});
it("says whether the variant is public", () => {
    expect(toVariantSummary({ ...variant, public: false }, health).public).toBe(
        false,
    );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @dpp/broker exec vitest run --no-file-parallelism --maxWorkers=1 tests/unit/controllers/variantSummary.test.ts tests/unit/services/HealthMonitor.test.ts`
Expected: FAIL (`infoOf` missing, `public` missing, `builtAt` from `lastInfo` only).

- [ ] **Step 3: Implement**

`HealthMonitor`: a `Map<string, InfoResponse>` keyed by `instanceKey(instance)`, set alongside `lastInfoByVariant` on a healthy check and pruned in `sync` with the other per-instance state. `toVariantSummary`: compare ISO strings (they sort chronologically). Add `public` to `VariantSummary` in `packages/shared/src/types.ts` with a doc comment ("Whether everyone may use the variant; people who can see a private variant are told it is private"). Update the doc comment on `toVariantSummary` that says the public flag is left out. `toAdminVariant` keeps working (its spread already has `public`).

- [ ] **Step 4: Run the tests to verify they pass, then the whole broker suite**

Run: the Step 2 command → PASS; then `pnpm --filter @dpp/broker exec vitest run --no-file-parallelism --maxWorkers=1` → PASS. Run `pnpm --filter @dpp/broker typecheck` → no errors. If other packages consume `VariantSummary` (`grep -rn "VariantSummary" apps packages`), typecheck them too.

- [ ] **Step 5: Commit**

```bash
git add apps/broker packages/shared
git commit -m "Report the newest build and visibility on variant summaries"
```

### Task 3: Push and open the pull request

- [ ] **Step 1:** Check `.github/workflows/ci.yml` runs the broker's unit and integration tests (it runs `vitest` for the workspace; if the integration tests are excluded, include them).
- [ ] **Step 2:** `git push -u origin client-redesign`, then `gh pr create` with a summary of both changes and a note that it is backward compatible with the current board and must deploy before droidppboard's redesign. End the description with the Claude Code attribution line.
