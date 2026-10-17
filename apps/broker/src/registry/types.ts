export interface Instance {
    readonly variantName: string;
    /** Base URL without a trailing slash, e.g. `http://127.0.0.1:3101`. */
    readonly url: string;
}

export interface Variant {
    readonly name: string;
    readonly public: boolean;
    readonly title: string | null;
    readonly description: string | null;
    /** Sorted by URL. */
    readonly instances: readonly Instance[];
    /** Sorted. */
    readonly aliases: readonly string[];
}

export interface ApiKeyRecord {
    readonly id: number;
    readonly name: string;
    /** `null` means unlimited. */
    readonly rateLimitPerMinute: number | null;
    readonly allVariants: boolean;
    /** Names of the private variants this key may use. */
    readonly grants: ReadonlySet<string>;
}

export interface RegistrySnapshot {
    /** Sorted by name. */
    readonly variants: ReadonlyMap<string, Variant>;
    /** Alias name → variant name. */
    readonly aliases: ReadonlyMap<string, string>;
    /** SHA-256 hex of the key → key. Revoked keys are not included. */
    readonly keysByHash: ReadonlyMap<string, ApiKeyRecord>;
}

export type Caller =
    | { readonly kind: "anonymous" }
    | { readonly kind: "key"; readonly key: ApiKeyRecord };

export interface VariantRow {
    readonly name: string;
    readonly public: boolean;
    readonly description: string | null;
}

/** A key as the CLI shows it, including revoked keys. */
export interface KeyListing {
    readonly name: string;
    readonly rateLimitPerMinute: number | null;
    readonly allVariants: boolean;
    /** Sorted. */
    readonly grants: readonly string[];
    readonly createdAt: Date;
    readonly revokedAt: Date | null;
}

export interface NewApiKey {
    readonly name: string;
    readonly hash: string;
    readonly rateLimitPerMinute: number | null;
    readonly allVariants: boolean;
    readonly grants: readonly string[];
}
