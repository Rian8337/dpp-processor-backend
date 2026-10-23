# Owner Role Design

## Context

The broker has two management roles, **manager** and **admin**, stored per uid in `users.role` (see
`2026-10-17-variant-management-design.md`). Any admin can set any user's role over `PUT /admin/users/:uid/role`; the
only guard is that an admin cannot remove their own admin role. So one admin can demote every other admin, and two
admins can demote each other. Nothing has gone wrong yet; this is a safeguard.

## Intent

Add a third, highest role, **owner**, that holds absolute authority and is granted only through the broker CLI on the
server. Role changes over HTTP follow the hierarchy: you can only grant or remove roles below your own. In particular,
admins can no longer touch another admin's role.

## Goals

- Roles, highest to lowest: **owner**, **admin**, **manager**, no role.
- Owner is set and removed only through the CLI. No HTTP request, not even an owner's, can grant or remove owner, or
  change an owner's role.
- Only an owner can make someone an admin or change/remove an admin's role.
- Admins and owners can make someone a manager and demote a manager.
- API key management (every `/admin/keys` route) is owner-only. A key with `canActForUsers` can act for any uid,
  owners included, so an admin who could create or change keys could get around every rule above.
- An owner is treated as an admin everywhere else (variants, visibility, pins, aliases, grants, users).
- Existing admins stay admins after the upgrade; nobody is made owner automatically.

## Non-goals

- droidppboard changes. It compares `role === "admin"` in several places and will treat an owner as having no role
  until it is updated; that is handled separately (see Rollout).
- Mahiru changes (it does not read roles).
- Changing what managers can do, or the grant rules.
- Limiting how many owners there may be.

## Anti-goals

- Any HTTP path, however indirect, that creates, removes, or demotes an owner.
- An admin being able to change their own or another admin's role, directly or by creating, changing, or revoking an
  API key.

## Design

### Contract (`packages/shared`)

- `UserRole` becomes `"owner" | "admin" | "manager"`. It flows into `GET /me` and `GET /admin/users` (`AdminUser`)
  unchanged in shape; owners appear with `role: "owner"`.
- `roleSetSchema` is unchanged: it accepts only `"admin"`, `"manager"`, or `null`. A request body with
  `"owner"` fails validation (`400`), like any other invalid role.
- Update the `UserRole` doc comment (types.ts:144) to describe owners.

### Database (`apps/broker`)

- The `users_role_check` constraint becomes `role in ('owner', 'admin', 'manager')`. Generate a Drizzle migration
  with `pnpm --filter @dpp/broker db:generate`. No data migration: existing rows keep their role.
- A user has one role. Setting `owner` on a manager or admin replaces their role (the existing upsert already does
  this). Their per-variant grants stay in `user_variants`, as they do today when a manager becomes an admin; they have
  no effect at owner level.

### Who may set a role over HTTP (`PUT /admin/users/:uid/role`)

The route still requires at least admin (an owner satisfies that). Then, with the actor's role, the target's
**current** role, and the **requested** role:

| Actor | May change a target whose current role is | May set the role to |
|-------|-------------------------------------------|---------------------|
| owner | admin, manager, or none                    | `admin`, `manager`, `null` |
| admin | manager or none                            | `manager`, `null`   |

Anything else is `403 FORBIDDEN` (`ForbiddenError`), which covers:

- anyone targeting an owner (including an owner targeting themselves or another owner);
- an admin targeting an admin, themselves included;
- an admin requesting `admin`.

Error messages are the builder's, but should say which role is needed (e.g. "Only an owner can grant or change the
admin role", "Owners can only be changed with the CLI").

The current self-demotion guard in `RegistryAdminService.setRole` (`409 CONFLICT`, "You cannot remove your own admin
role") becomes unreachable over HTTP: admins cannot change their own role at all, and owners cannot be changed over
HTTP. Its purpose (there is always someone who can manage roles) is now met by owners being CLI-only. Remove it and
its `actingUid` parameter, along with its tests (*my call*; keeping it as a redundant check is acceptable if removal
proves awkward).

### API keys are owner-only

Every route in `AdminKeysController` (`GET /admin/keys`, `POST /admin/keys`, `PATCH /admin/keys/:name`,
`PUT`/`DELETE /admin/keys/:name/grants/:variant`, `POST /admin/keys/:name/revoke`) requires the owner role; an admin
or manager gets `403 FORBIDDEN`. `requireRole` gains an `"owner"` level for this. The existing guards that stop a
request from revoking its own key or stopping it acting for users stay as they are. The CLI's key commands stay
unrestricted.

This is the user's decision "for now": it may later narrow to only the actions that grant or remove impersonation
(`canActForUsers`, and revoking or downgrading a key that has it), giving admins the rest back.

### Owner counts as admin elsewhere

Every check that currently means "is an admin" must also accept owner. Known places:

- `requireRole` in `apps/broker/src/controllers/adminAccess.ts`: an owner satisfies `"owner"`, `"admin"`, and
  `"manager"`; an admin satisfies `"admin"` and `"manager"`.
- `canManageVariant` and `requireGrantChangeAllowed` in the same file: an owner behaves as an admin.
- `AdminController.listVariants`: `role === "admin"` must include owner.

The builder should sweep for any other `"admin"` comparisons (e.g. visibility in the registry snapshot or
`RegistryService`) and centralise the "admin or above" check rather than repeating `role === "admin" || role ===
"owner"`.

### CLI

- `parseRole` (`apps/broker/src/cli/arguments.ts`) accepts `owner`; the usage becomes
  `user role <uid> (owner|admin|manager|none)`.
- The CLI stays unrestricted: it can set or remove any role, including owner. This is how an owner is created and
  how one is demoted.
- `user list` shows `owner` like any other role.

### Docs

- Broker README: role table and route table (`PUT /admin/users/:uid/role` access and rules, `/admin/keys` routes now
  owner), CLI usage, and the
  "first admin" bootstrap note, which now creates the first owner (`pnpm cli user role <uid> owner`).
- `2026-10-17-variant-management-design.md`: add a short note pointing to this spec where it describes roles and the
  self-demotion rule.

## Testing

As the existing broker suite:

- Unit tests for `requireRole`, `canManageVariant`, `requireGrantChangeAllowed` with an owner, and for the new
  role-change rule over the full actor × current role × requested role matrix above.
- Integration tests (`admin.int.test.ts`) for `PUT /admin/users/:uid/role`: owner promotes to admin, owner demotes an
  admin, admin promotes to manager, admin demotes a manager; `403` for admin → admin, admin demoting an admin, admin
  demoting themselves, anyone targeting an owner; `400` for `role: "owner"`. An owner can use an admin-only route
  (e.g. `PATCH /admin/variants/:name` with `pinned`). Every `/admin/keys` route: `403` for an admin and a manager,
  success for an owner; existing key tests switch their actor to an owner.
- Repository/service test that the constraint accepts `owner` and the migration applies on PGlite.
- CLI test that `parseRole("owner")` works.
- E2E: update any role expectations if they enumerate roles.

## Rollout

1. Deploy the broker. Existing admins remain admins; with no owner, no one can grant or remove admin over HTTP, but
   everything else works as before.
2. Before promoting anyone to owner with the CLI, update droidppboard to treat `owner` as admin (its client
   permissions, access rules, roles page, and server recalculation permissions), to tolerate `"owner"` wherever it
   parses `/me` or `/admin/users`, and to show key management (the API keys pages and `AccessTable`'s granted keys)
   only to owners. Otherwise the owner loses admin pages and recalculation rights there.
   Between steps 1 and 2, droidppboard's key pages fail with `403` for admins; key changes go through the CLI.
3. `pnpm --filter @dpp/broker cli user role <uid> owner`.

## Left to the builder

- Where the role-change rule lives (controller helper in `adminAccess.ts` next to `requireGrantChangeAllowed`, or the
  service with the actor's role passed in), as long as the CLI stays unrestricted.
- Exact error messages.
- The name and home of the shared "admin or above" helper.
