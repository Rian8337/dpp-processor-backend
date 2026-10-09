import {
    boolean,
    char,
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

export const schema = {
    variantsTable,
    variantInstancesTable,
    aliasesTable,
    apiKeysTable,
    apiKeyVariantsTable,
};
