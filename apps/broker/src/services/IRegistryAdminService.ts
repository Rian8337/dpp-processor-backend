import type { KeyListing, UserListing } from "@/registry/types";
import type { UserRole } from "@dpp/shared";

/**
 * Every rule for changing the registry, shared by the CLI and the management API. Each method throws a
 * `RegistryChangeError` when a rule refuses the change.
 */
export interface IRegistryAdminService {
    /**
     * Creates a variant, checking its name, title, and description as `updateVariant` does. An empty title or
     * description becomes `null`. The caller checks that the name is unused.
     *
     * @throws {RegistryChangeError} `invalid` for a bad name, or a title or description that is too long.
     */
    createVariant(row: {
        readonly name: string;
        readonly public: boolean;
        readonly title: string | null;
        readonly description: string | null;
    }): Promise<void>;

    /**
     * Changes a variant. An empty title or description becomes `null`, which clears it.
     *
     * @throws {RegistryChangeError} `variant-not-found`, or `invalid` for a title or description that is too long.
     */
    updateVariant(
        name: string,
        changes: {
            readonly title?: string | null;
            readonly description?: string | null;
            readonly public?: boolean;
            readonly pinned?: boolean;
        },
    ): Promise<void>;

    /**
     * Creates the alias or repoints it. Variant and alias names share one namespace.
     *
     * @returns The variant the alias pointed at before, if any.
     * @throws {RegistryChangeError} `invalid` for a bad name, `conflict` for a variant's name, or
     * `variant-not-found`.
     */
    setAlias(
        alias: string,
        variant: string,
    ): Promise<{ previous: string | undefined }>;
    /** @throws {RegistryChangeError} `not-found` if there is no such alias. */
    removeAlias(alias: string): Promise<void>;

    /**
     * @returns `false` if the user already had the grant.
     * @throws {RegistryChangeError} `invalid` for a bad uid, or `variant-not-found`.
     */
    grantUser(uid: number, variant: string): Promise<boolean>;
    /** @throws {RegistryChangeError} `invalid` for a bad uid, or `not-found` if the user had no such grant. */
    ungrantUser(uid: number, variant: string): Promise<void>;
    /**
     * Sets a user's role; `null` removes it.
     *
     * @param actingUid The user making the change, if there is one. They cannot remove their own admin role.
     * @throws {RegistryChangeError} `invalid` for a bad uid, or `conflict` for removing one's own admin role.
     */
    setRole(
        uid: number,
        role: UserRole | null,
        actingUid?: number,
    ): Promise<void>;

    /**
     * @returns The new key and its raw value, which is not stored and cannot be shown again.
     * @throws {RegistryChangeError} `invalid` for a bad name, `conflict` if the name is taken, or
     * `variant-not-found` for a grant.
     */
    createKey(input: {
        readonly name: string;
        readonly rateLimitPerMinute: number | null;
        readonly allVariants: boolean;
        readonly canActForUsers: boolean;
        readonly grants: readonly string[];
    }): Promise<{ key: KeyListing; rawKey: string }>;
    /**
     * @param actingKeyName The key the change is made with, if there is one. It cannot stop itself acting for users,
     * which would lock out the clients that manage the registry through it.
     * @throws {RegistryChangeError} `not-found` for an unknown key, or `conflict` for a revoked one or for the
     * acting key stopping itself acting for users.
     */
    updateKey(
        name: string,
        changes: {
            readonly rateLimitPerMinute?: number | null;
            readonly allVariants?: boolean;
            readonly canActForUsers?: boolean;
        },
        actingKeyName?: string,
    ): Promise<KeyListing>;
    /**
     * @returns Whether the grant is new, and whether the key can use every variant anyway.
     * @throws {RegistryChangeError} `not-found` or `conflict` for the key, or `variant-not-found`.
     */
    grantKey(
        name: string,
        variant: string,
    ): Promise<{ added: boolean; allVariants: boolean }>;
    /** @throws {RegistryChangeError} `not-found` or `conflict` for the key, or `not-found` if it had no such grant. */
    ungrantKey(name: string, variant: string): Promise<void>;
    /**
     * @param actingKeyName The key the change is made with, if there is one. It cannot revoke itself.
     * @throws {RegistryChangeError} `not-found` for an unknown key, or `conflict` if it is already revoked or is the
     * acting key.
     */
    revokeKey(name: string, actingKeyName?: string): Promise<void>;

    /** Users with a role or at least one grant; sorted by uid. */
    listUsers(): Promise<UserListing[]>;
    /**
     * The uids of the users granted the variant; sorted.
     *
     * @throws {RegistryChangeError} `variant-not-found`.
     */
    usersGranted(variant: string): Promise<number[]>;
    /** Includes revoked keys; sorted by name. */
    listKeys(): Promise<KeyListing[]>;
}
