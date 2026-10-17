import {
    aliasesTable,
    apiKeysTable,
    apiKeyVariantsTable,
    usersTable,
    userVariantsTable,
    variantInstancesTable,
    variantsTable,
} from "@/database/schema";
import type { Database } from "@/database/types";
import { dependencyTokens } from "@/dependencies/tokens";
import { buildSnapshot } from "@/registry/snapshot";
import type {
    KeyListing,
    NewApiKey,
    RegistrySnapshot,
    UserListing,
    VariantRow,
} from "@/registry/types";
import { Injectable } from "@dpp/server";
import type { UserRole } from "@dpp/shared";
import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { inject } from "tsyringe";
import type { IRegistryRepository } from "./IRegistryRepository";

@Injectable(dependencyTokens.registryRepository)
export class RegistryRepository implements IRegistryRepository {
    constructor(
        @inject(dependencyTokens.db)
        private readonly db: Database,
    ) {}

    loadSnapshot(): Promise<RegistrySnapshot> {
        // One repeatable-read transaction, so a CLI change made between the queries cannot produce a mixed snapshot.
        return this.db.transaction(
            async (tx) => {
                const variants = await tx
                    .select({
                        name: variantsTable.name,
                        public: variantsTable.public,
                        title: variantsTable.title,
                        description: variantsTable.description,
                    })
                    .from(variantsTable);
                const instances = await tx
                    .select({
                        variantName: variantInstancesTable.variantName,
                        url: variantInstancesTable.url,
                    })
                    .from(variantInstancesTable);
                const aliases = await tx.select().from(aliasesTable);
                const keys = await tx
                    .select({
                        id: apiKeysTable.id,
                        name: apiKeysTable.name,
                        keyHash: apiKeysTable.keyHash,
                        rateLimitPerMinute: apiKeysTable.rateLimitPerMinute,
                        allVariants: apiKeysTable.allVariants,
                        canActForUsers: apiKeysTable.canActForUsers,
                    })
                    .from(apiKeysTable)
                    .where(isNull(apiKeysTable.revokedAt));
                const grants = await tx.select().from(apiKeyVariantsTable);
                const users = await tx
                    .select({ uid: usersTable.uid, role: usersTable.role })
                    .from(usersTable);
                const userGrants = await tx.select().from(userVariantsTable);

                return buildSnapshot({
                    variants,
                    instances,
                    aliases,
                    keys,
                    grants,
                    users,
                    userGrants,
                });
            },
            { isolationLevel: "repeatable read", accessMode: "read only" },
        );
    }

    async findVariant(name: string): Promise<VariantRow | undefined> {
        const [row] = await this.db
            .select({
                name: variantsTable.name,
                public: variantsTable.public,
                title: variantsTable.title,
                description: variantsTable.description,
            })
            .from(variantsTable)
            .where(eq(variantsTable.name, name));

        return row;
    }

    async findAliasTarget(alias: string): Promise<string | undefined> {
        const [row] = await this.db
            .select({ variantName: aliasesTable.variantName })
            .from(aliasesTable)
            .where(eq(aliasesTable.name, alias));

        return row?.variantName;
    }

    async aliasesOf(variantName: string): Promise<string[]> {
        const rows = await this.db
            .select({ name: aliasesTable.name })
            .from(aliasesTable)
            .where(eq(aliasesTable.variantName, variantName))
            .orderBy(asc(aliasesTable.name));

        return rows.map((row) => row.name);
    }

    async insertVariant(variant: VariantRow): Promise<void> {
        await this.db.insert(variantsTable).values(variant);
    }

    async updateVariant(
        name: string,
        changes: {
            readonly public?: boolean;
            readonly title?: string | null;
            readonly description?: string | null;
        },
    ): Promise<void> {
        await this.db
            .update(variantsTable)
            .set(changes)
            .where(eq(variantsTable.name, name));
    }

    async deleteVariant(name: string): Promise<void> {
        await this.db.delete(variantsTable).where(eq(variantsTable.name, name));
    }

    async insertInstance(variantName: string, url: string): Promise<boolean> {
        const inserted = await this.db
            .insert(variantInstancesTable)
            .values({ variantName, url })
            .onConflictDoNothing()
            .returning({ id: variantInstancesTable.id });

        return inserted.length > 0;
    }

    async deleteInstance(variantName: string, url: string): Promise<boolean> {
        const deleted = await this.db
            .delete(variantInstancesTable)
            .where(
                and(
                    eq(variantInstancesTable.variantName, variantName),
                    eq(variantInstancesTable.url, url),
                ),
            )
            .returning({ id: variantInstancesTable.id });

        return deleted.length > 0;
    }

    async setAlias(alias: string, variantName: string): Promise<void> {
        await this.db
            .insert(aliasesTable)
            .values({ name: alias, variantName })
            .onConflictDoUpdate({
                target: aliasesTable.name,
                set: { variantName },
            });
    }

    async deleteAlias(alias: string): Promise<boolean> {
        const deleted = await this.db
            .delete(aliasesTable)
            .where(eq(aliasesTable.name, alias))
            .returning({ name: aliasesTable.name });

        return deleted.length > 0;
    }

    async findKey(name: string): Promise<KeyListing | undefined> {
        const [key] = await this.selectKeys(name);

        return key;
    }

    listKeys(): Promise<KeyListing[]> {
        return this.selectKeys();
    }

    async insertKey(key: NewApiKey): Promise<void> {
        await this.db.transaction(async (tx) => {
            const [inserted] = await tx
                .insert(apiKeysTable)
                .values({
                    name: key.name,
                    keyHash: key.hash,
                    rateLimitPerMinute: key.rateLimitPerMinute,
                    allVariants: key.allVariants,
                    canActForUsers: key.canActForUsers,
                })
                .returning({ id: apiKeysTable.id });

            if (inserted && key.grants.length > 0) {
                await tx.insert(apiKeyVariantsTable).values(
                    key.grants.map((variantName) => ({
                        keyId: inserted.id,
                        variantName,
                    })),
                );
            }
        });
    }

    async updateKey(
        name: string,
        changes: {
            readonly rateLimitPerMinute?: number | null;
            readonly allVariants?: boolean;
            readonly canActForUsers?: boolean;
        },
    ): Promise<void> {
        await this.db
            .update(apiKeysTable)
            .set(changes)
            .where(eq(apiKeysTable.name, name));
    }

    async grant(keyName: string, variantName: string): Promise<boolean> {
        const [key] = await this.db
            .select({ id: apiKeysTable.id })
            .from(apiKeysTable)
            .where(eq(apiKeysTable.name, keyName));

        if (!key) {
            return false;
        }

        const inserted = await this.db
            .insert(apiKeyVariantsTable)
            .values({ keyId: key.id, variantName })
            .onConflictDoNothing()
            .returning({ keyId: apiKeyVariantsTable.keyId });

        return inserted.length > 0;
    }

    async ungrant(keyName: string, variantName: string): Promise<boolean> {
        const deleted = await this.db
            .delete(apiKeyVariantsTable)
            .where(
                and(
                    eq(apiKeyVariantsTable.variantName, variantName),
                    inArray(
                        apiKeyVariantsTable.keyId,
                        this.db
                            .select({ id: apiKeysTable.id })
                            .from(apiKeysTable)
                            .where(eq(apiKeysTable.name, keyName)),
                    ),
                ),
            )
            .returning({ keyId: apiKeyVariantsTable.keyId });

        return deleted.length > 0;
    }

    async revokeKey(name: string): Promise<boolean> {
        const revoked = await this.db
            .update(apiKeysTable)
            .set({ revokedAt: new Date() })
            .where(
                and(
                    eq(apiKeysTable.name, name),
                    isNull(apiKeysTable.revokedAt),
                ),
            )
            .returning({ id: apiKeysTable.id });

        return revoked.length > 0;
    }

    async grantUser(uid: number, variantName: string): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            await tx.insert(usersTable).values({ uid }).onConflictDoNothing();

            const inserted = await tx
                .insert(userVariantsTable)
                .values({ uid, variantName })
                .onConflictDoNothing()
                .returning({ uid: userVariantsTable.uid });

            return inserted.length > 0;
        });
    }

    async ungrantUser(uid: number, variantName: string): Promise<boolean> {
        const deleted = await this.db
            .delete(userVariantsTable)
            .where(
                and(
                    eq(userVariantsTable.uid, uid),
                    eq(userVariantsTable.variantName, variantName),
                ),
            )
            .returning({ uid: userVariantsTable.uid });

        return deleted.length > 0;
    }

    async setUserRole(uid: number, role: UserRole | null): Promise<void> {
        await this.db
            .insert(usersTable)
            .values({ uid, role })
            .onConflictDoUpdate({ target: usersTable.uid, set: { role } });
    }

    async findUser(uid: number): Promise<UserListing | undefined> {
        const [user] = await this.selectUsers(eq(usersTable.uid, uid));

        return user;
    }

    async listUsers(): Promise<UserListing[]> {
        const users = await this.selectUsers();

        return users.filter(
            (user) => user.role !== null || user.grants.length > 0,
        );
    }

    async usersGranted(variantName: string): Promise<number[]> {
        const rows = await this.db
            .select({ uid: userVariantsTable.uid })
            .from(userVariantsTable)
            .where(eq(userVariantsTable.variantName, variantName))
            .orderBy(asc(userVariantsTable.uid));

        return rows.map((row) => row.uid);
    }

    private async selectUsers(where?: SQL): Promise<UserListing[]> {
        const users = await this.db
            .select()
            .from(usersTable)
            .where(where)
            .orderBy(asc(usersTable.uid));

        if (users.length === 0) {
            return [];
        }

        const grants = await this.db
            .select()
            .from(userVariantsTable)
            .where(
                inArray(
                    userVariantsTable.uid,
                    users.map((user) => user.uid),
                ),
            )
            .orderBy(asc(userVariantsTable.variantName));

        return users.map((user) => ({
            uid: user.uid,
            role: user.role,
            grants: grants
                .filter((grant) => grant.uid === user.uid)
                .map((grant) => grant.variantName),
        }));
    }

    private async selectKeys(name?: string): Promise<KeyListing[]> {
        const keys = await this.db
            .select()
            .from(apiKeysTable)
            .where(name === undefined ? undefined : eq(apiKeysTable.name, name))
            .orderBy(asc(apiKeysTable.name));

        if (keys.length === 0) {
            return [];
        }

        const grants = await this.db
            .select()
            .from(apiKeyVariantsTable)
            .where(
                inArray(
                    apiKeyVariantsTable.keyId,
                    keys.map((key) => key.id),
                ),
            )
            .orderBy(asc(apiKeyVariantsTable.variantName));

        return keys.map((key) => ({
            name: key.name,
            rateLimitPerMinute: key.rateLimitPerMinute,
            allVariants: key.allVariants,
            canActForUsers: key.canActForUsers,
            grants: grants
                .filter((grant) => grant.keyId === key.id)
                .map((grant) => grant.variantName),
            createdAt: key.createdAt,
            revokedAt: key.revokedAt,
        }));
    }
}
