import type { UserRole } from "@dpp/shared";
import { sql } from "drizzle-orm";
import {
    boolean,
    char,
    check,
    integer,
    pgTable,
    primaryKey,
    serial,
    text,
    timestamp,
    unique,
} from "drizzle-orm/pg-core";

/**
 * Variants clients can call. Mode, algorithm, and calculator version are not stored: they come from each instance's
 * `GET /info`.
 */
export const variantsTable = pgTable("variants", {
    name: text().primaryKey(),
    public: boolean().notNull().default(false),
    pinned: boolean().notNull().default(false),
    title: text(),
    description: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Processor instances serving a variant.
 */
export const variantInstancesTable = pgTable(
    "variant_instances",
    {
        id: serial().primaryKey(),
        variantName: text()
            .notNull()
            .references(() => variantsTable.name, { onDelete: "cascade" }),
        url: text().notNull(),
    },
    (table) => [
        unique("variant_instances_variant_name_url_unique").on(
            table.variantName,
            table.url,
        ),
    ],
);

/**
 * Alternative names for variants. A variant cannot be deleted while aliases point at it.
 */
export const aliasesTable = pgTable("aliases", {
    name: text().primaryKey(),
    variantName: text()
        .notNull()
        .references(() => variantsTable.name, { onDelete: "restrict" }),
});

/**
 * Client API keys. Only the SHA-256 hash of a key is stored.
 */
export const apiKeysTable = pgTable("api_keys", {
    id: serial().primaryKey(),
    name: text().notNull().unique("api_keys_name_unique"),
    keyHash: char({ length: 64 }).notNull().unique("api_keys_key_hash_unique"),
    rateLimitPerMinute: integer(),
    allVariants: boolean().notNull().default(false),
    canActForUsers: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
});

/**
 * Private variants a key may use.
 */
export const apiKeyVariantsTable = pgTable(
    "api_key_variants",
    {
        keyId: integer()
            .notNull()
            .references(() => apiKeysTable.id, { onDelete: "cascade" }),
        variantName: text()
            .notNull()
            .references(() => variantsTable.name, { onDelete: "cascade" }),
    },
    (table) => [primaryKey({ columns: [table.keyId, table.variantName] })],
);

/**
 * Users the broker knows by osu!droid uid: those with a management role or a grant of a private variant. A user
 * without a role has `role` set to `null`.
 */
export const usersTable = pgTable(
    "users",
    {
        uid: integer().primaryKey(),
        role: text().$type<UserRole>(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [check("users_role_check", sql`role in ('admin', 'manager')`)],
);

/**
 * Private variants a user may use.
 */
export const userVariantsTable = pgTable(
    "user_variants",
    {
        uid: integer()
            .notNull()
            .references(() => usersTable.uid, { onDelete: "cascade" }),
        variantName: text()
            .notNull()
            .references(() => variantsTable.name, { onDelete: "cascade" }),
    },
    (table) => [primaryKey({ columns: [table.uid, table.variantName] })],
);

export const schema = {
    variantsTable,
    variantInstancesTable,
    aliasesTable,
    apiKeysTable,
    apiKeyVariantsTable,
    usersTable,
    userVariantsTable,
};
