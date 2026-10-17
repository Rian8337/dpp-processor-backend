import type { UserRole } from "@dpp/shared";

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
    /** Whether the key may send `X-Acting-Uid` to act on behalf of a user. */
    readonly canActForUsers: boolean;
    /** Names of the private variants this key may use. */
    readonly grants: ReadonlySet<string>;
}

export interface UserRecord {
    readonly uid: number;
    readonly role: UserRole | null;
    /** Names of the private variants this user may use. */
    readonly grants: ReadonlySet<string>;
}

export interface RegistrySnapshot {
    /** Sorted by name. */
    readonly variants: ReadonlyMap<string, Variant>;
    /** Alias name → variant name. */
    readonly aliases: ReadonlyMap<string, string>;
    /** SHA-256 hex of the key → key. Revoked keys are not included. */
    readonly keysByHash: ReadonlyMap<string, ApiKeyRecord>;
    /** Uid → user, for users with a role or a grant. Sorted by uid. */
    readonly users: ReadonlyMap<number, UserRecord>;
}

export type Caller =
    | { readonly kind: "anonymous" }
    | {
          readonly kind: "key";
          readonly key: ApiKeyRecord;
          /** The user the key acts for (`X-Acting-Uid`); their access replaces the key's own. */
          readonly actingUid?: number;
      };

export interface VariantRow {
    readonly name: string;
    readonly public: boolean;
    readonly title: string | null;
    readonly description: string | null;
}

/** A key as the CLI shows it, including revoked keys. */
export interface KeyListing {
    readonly name: string;
    readonly rateLimitPerMinute: number | null;
    readonly allVariants: boolean;
    readonly canActForUsers: boolean;
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
    readonly canActForUsers: boolean;
    readonly grants: readonly string[];
}

/** A user as the management API and CLI show them. */
export interface UserListing {
    readonly uid: number;
    readonly role: UserRole | null;
    /** Sorted. */
    readonly grants: readonly string[];
}
