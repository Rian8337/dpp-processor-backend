import type {
    KeyListing,
    NewApiKey,
    RegistrySnapshot,
    VariantRow,
} from "@/registry/types";

export interface IRegistryRepository {
    /** Everything the broker needs, read in one read-only transaction. */
    loadSnapshot(): Promise<RegistrySnapshot>;

    findVariant(name: string): Promise<VariantRow | undefined>;
    /** The variant an alias points at. */
    findAliasTarget(alias: string): Promise<string | undefined>;
    /** Sorted. */
    aliasesOf(variantName: string): Promise<string[]>;
    insertVariant(variant: VariantRow): Promise<void>;
    updateVariant(
        name: string,
        changes: {
            readonly public?: boolean;
            readonly description?: string | null;
        },
    ): Promise<void>;
    /** Also deletes the variant's instances and grants. Fails while aliases point at it. */
    deleteVariant(name: string): Promise<void>;

    /** @returns `false` if the variant already has an instance with this URL. */
    insertInstance(variantName: string, url: string): Promise<boolean>;
    /** @returns `false` if there was no such instance. */
    deleteInstance(variantName: string, url: string): Promise<boolean>;

    /** Creates the alias or repoints it. */
    setAlias(alias: string, variantName: string): Promise<void>;
    /** @returns `false` if there was no such alias. */
    deleteAlias(alias: string): Promise<boolean>;

    /** Includes revoked keys. */
    findKey(name: string): Promise<KeyListing | undefined>;
    /** Includes revoked keys; sorted by name. */
    listKeys(): Promise<KeyListing[]>;
    insertKey(key: NewApiKey): Promise<void>;
    updateKey(
        name: string,
        changes: {
            readonly rateLimitPerMinute?: number | null;
            readonly allVariants?: boolean;
        },
    ): Promise<void>;
    /** @returns `false` if the key already had the grant. */
    grant(keyName: string, variantName: string): Promise<boolean>;
    /** @returns `false` if the key did not have the grant. */
    ungrant(keyName: string, variantName: string): Promise<boolean>;
    /** @returns `false` if the key was already revoked. */
    revokeKey(name: string): Promise<boolean>;
}
