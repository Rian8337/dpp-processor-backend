import { dependencyTokens } from "@/dependencies/tokens";
import { generateApiKey, hashApiKey } from "@/registry/keys";
import { invalidNameMessage, isValidName } from "@/registry/names";
import {
    invalidRateLimitMessage,
    isValidRateLimit,
} from "@/registry/rateLimits";
import { RegistryChangeError } from "@/registry/RegistryChangeError";
import type { KeyListing, UserListing } from "@/registry/types";
import { isValidUid } from "@/registry/uids";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";
import { Injectable } from "@dpp/server";
import {
    maxVariantDescriptionLength,
    maxVariantTitleLength,
    type UserRole,
} from "@dpp/shared";
import { inject } from "tsyringe";
import type { IRegistryAdminService } from "./IRegistryAdminService";

const uniqueViolationCode = "23505";

/**
 * Whether Postgres rejected a query for a unique constraint. Drizzle wraps the driver's error, so the code may be on
 * its `cause`.
 */
function isUniqueViolation(error: unknown): boolean {
    for (
        let current = error;
        typeof current === "object" && current !== null;
        current = (current as { cause?: unknown }).cause
    ) {
        if ((current as { code?: unknown }).code === uniqueViolationCode) {
            return true;
        }
    }

    return false;
}

@Injectable(dependencyTokens.registryAdminService)
export class RegistryAdminService implements IRegistryAdminService {
    constructor(
        @inject(dependencyTokens.registryRepository)
        private readonly repository: IRegistryRepository,
    ) {}

    async createVariant(row: {
        readonly name: string;
        readonly public: boolean;
        readonly title: string | null;
        readonly description: string | null;
    }): Promise<void> {
        this.requireValidName(row.name);

        await this.repository.insertVariant({
            name: row.name,
            public: row.public,
            title: this.checkedTitle(row.title),
            description: this.checkedDescription(row.description),
        });
    }

    async updateVariant(
        name: string,
        changes: {
            readonly title?: string | null;
            readonly description?: string | null;
            readonly public?: boolean;
        },
    ): Promise<void> {
        await this.requireVariant(name);

        const update: {
            public?: boolean;
            title?: string | null;
            description?: string | null;
        } = {};

        if (changes.public !== undefined) {
            update.public = changes.public;
        }

        if (changes.title !== undefined) {
            update.title = this.checkedTitle(changes.title);
        }

        if (changes.description !== undefined) {
            update.description = this.checkedDescription(changes.description);
        }

        if (Object.keys(update).length > 0) {
            await this.repository.updateVariant(name, update);
        }
    }

    async setAlias(
        alias: string,
        variant: string,
    ): Promise<{ previous: string | undefined }> {
        this.requireValidName(alias);

        if (await this.repository.findVariant(alias)) {
            throw new RegistryChangeError(
                "conflict",
                `"${alias}" is already a variant`,
            );
        }

        await this.requireVariant(variant);

        const previous = await this.repository.findAliasTarget(alias);

        await this.repository.setAlias(alias, variant);

        return { previous };
    }

    async removeAlias(alias: string): Promise<void> {
        if (!(await this.repository.deleteAlias(alias))) {
            throw new RegistryChangeError(
                "not-found",
                `No alias named "${alias}"`,
            );
        }
    }

    async grantUser(uid: number, variant: string): Promise<boolean> {
        this.requireValidUid(uid);
        await this.requireVariant(variant);

        return await this.repository.grantUser(uid, variant);
    }

    async ungrantUser(uid: number, variant: string): Promise<void> {
        this.requireValidUid(uid);

        if (!(await this.repository.ungrantUser(uid, variant))) {
            throw new RegistryChangeError(
                "not-found",
                `User ${uid.toString()} has no grant for ${variant}`,
            );
        }
    }

    async setRole(
        uid: number,
        role: UserRole | null,
        actingUid?: number,
    ): Promise<void> {
        this.requireValidUid(uid);

        if (actingUid === uid && role !== "admin") {
            throw new RegistryChangeError(
                "conflict",
                "You cannot remove your own admin role",
            );
        }

        await this.repository.setUserRole(uid, role);
    }

    async createKey(input: {
        readonly name: string;
        readonly rateLimitPerMinute: number | null;
        readonly allVariants: boolean;
        readonly canActForUsers: boolean;
        readonly grants: readonly string[];
    }): Promise<{ key: KeyListing; rawKey: string }> {
        this.requireValidName(input.name);
        this.requireValidRateLimit(input.rateLimitPerMinute);

        if (await this.repository.findKey(input.name)) {
            throw new RegistryChangeError(
                "conflict",
                `A key named "${input.name}" already exists`,
            );
        }

        const grants = [...new Set(input.grants)];

        for (const variant of grants) {
            await this.requireVariant(variant);
        }

        const rawKey = generateApiKey();

        try {
            await this.repository.insertKey({
                name: input.name,
                hash: hashApiKey(rawKey),
                rateLimitPerMinute: input.rateLimitPerMinute,
                allVariants: input.allVariants,
                canActForUsers: input.canActForUsers,
                grants,
            });
        } catch (e) {
            // Another writer took the name between the check above and the insert.
            if (isUniqueViolation(e)) {
                throw new RegistryChangeError(
                    "conflict",
                    `A key named "${input.name}" already exists`,
                );
            }

            throw e;
        }

        return { key: await this.requireKey(input.name), rawKey };
    }

    async updateKey(
        name: string,
        changes: {
            readonly rateLimitPerMinute?: number | null;
            readonly allVariants?: boolean;
            readonly canActForUsers?: boolean;
        },
        actingKeyName?: string,
    ): Promise<KeyListing> {
        const key = await this.requireActiveKey(name);

        if (changes.rateLimitPerMinute !== undefined) {
            this.requireValidRateLimit(changes.rateLimitPerMinute);
        }

        if (actingKeyName === name && changes.canActForUsers === false) {
            throw new RegistryChangeError(
                "conflict",
                "You cannot stop the key this request uses from acting for users",
            );
        }

        if (Object.keys(changes).length === 0) {
            return key;
        }

        await this.repository.updateKey(name, changes);

        return await this.requireKey(name);
    }

    async grantKey(
        name: string,
        variant: string,
    ): Promise<{ added: boolean; allVariants: boolean }> {
        const key = await this.requireActiveKey(name);

        await this.requireVariant(variant);

        return {
            added: await this.repository.grant(name, variant),
            allVariants: key.allVariants,
        };
    }

    async ungrantKey(name: string, variant: string): Promise<void> {
        await this.requireActiveKey(name);

        if (!(await this.repository.ungrant(name, variant))) {
            throw new RegistryChangeError(
                "not-found",
                `Key ${name} has no grant for ${variant}`,
            );
        }
    }

    async revokeKey(name: string, actingKeyName?: string): Promise<void> {
        await this.requireKey(name);

        if (actingKeyName === name) {
            throw new RegistryChangeError(
                "conflict",
                "You cannot revoke the key this request uses",
            );
        }

        if (!(await this.repository.revokeKey(name))) {
            throw new RegistryChangeError(
                "conflict",
                `Key ${name} is already revoked`,
            );
        }
    }

    listUsers(): Promise<UserListing[]> {
        return this.repository.listUsers();
    }

    async usersGranted(variant: string): Promise<number[]> {
        await this.requireVariant(variant);

        return await this.repository.usersGranted(variant);
    }

    listKeys(): Promise<KeyListing[]> {
        return this.repository.listKeys();
    }

    /** An empty title becomes `null`, which clears it. */
    private checkedTitle(value: string | null): string | null {
        const title = value || null;

        if (title?.includes("\u0000")) {
            throw new RegistryChangeError(
                "invalid",
                "Title must not contain NUL characters",
            );
        }

        if (title !== null && title.length > maxVariantTitleLength) {
            throw new RegistryChangeError(
                "invalid",
                `Title is longer than ${maxVariantTitleLength.toString()} characters`,
            );
        }

        return title;
    }

    /** An empty description becomes `null`, which clears it. */
    private checkedDescription(value: string | null): string | null {
        const description = value || null;

        if (description?.includes("\u0000")) {
            throw new RegistryChangeError(
                "invalid",
                "Description must not contain NUL characters",
            );
        }

        if (
            description !== null &&
            description.length > maxVariantDescriptionLength
        ) {
            throw new RegistryChangeError(
                "invalid",
                `Description is longer than ${maxVariantDescriptionLength.toString()} characters`,
            );
        }

        return description;
    }

    private requireValidName(name: string): void {
        if (!isValidName(name)) {
            throw new RegistryChangeError("invalid", invalidNameMessage(name));
        }
    }

    /** `null` means unlimited. */
    private requireValidRateLimit(limit: number | null): void {
        if (limit !== null && !isValidRateLimit(limit)) {
            throw new RegistryChangeError(
                "invalid",
                invalidRateLimitMessage(limit),
            );
        }
    }

    private requireValidUid(uid: number): void {
        if (!isValidUid(uid)) {
            throw new RegistryChangeError(
                "invalid",
                `Invalid uid "${uid.toString()}"`,
            );
        }
    }

    private async requireVariant(name: string): Promise<void> {
        if (!(await this.repository.findVariant(name))) {
            throw new RegistryChangeError(
                "variant-not-found",
                `No variant named "${name}"`,
            );
        }
    }

    private async requireKey(name: string): Promise<KeyListing> {
        const key = await this.repository.findKey(name);

        if (!key) {
            throw new RegistryChangeError(
                "not-found",
                `No key named "${name}"`,
            );
        }

        return key;
    }

    private async requireActiveKey(name: string): Promise<KeyListing> {
        const key = await this.requireKey(name);

        if (key.revokedAt) {
            throw new RegistryChangeError("conflict", `Key ${name} is revoked`);
        }

        return key;
    }
}
