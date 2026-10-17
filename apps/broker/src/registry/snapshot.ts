import type { UserRole } from "@dpp/shared";
import type {
    ApiKeyRecord,
    Caller,
    Instance,
    RegistrySnapshot,
    UserRecord,
    Variant,
} from "./types";

/**
 * The registry tables as plain rows. Keys are only the ones to load (not revoked).
 */
export interface SnapshotRows {
    readonly variants: readonly {
        readonly name: string;
        readonly public: boolean;
        readonly title: string | null;
        readonly description: string | null;
    }[];
    readonly instances: readonly Instance[];
    readonly aliases: readonly {
        readonly name: string;
        readonly variantName: string;
    }[];
    readonly keys: readonly {
        readonly id: number;
        readonly name: string;
        readonly keyHash: string;
        readonly rateLimitPerMinute: number | null;
        readonly allVariants: boolean;
        readonly canActForUsers: boolean;
    }[];
    readonly grants: readonly {
        readonly keyId: number;
        readonly variantName: string;
    }[];
    readonly users: readonly {
        readonly uid: number;
        readonly role: UserRole | null;
    }[];
    readonly userGrants: readonly {
        readonly uid: number;
        readonly variantName: string;
    }[];
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Builds an immutable snapshot from registry rows.
 */
export function buildSnapshot(rows: SnapshotRows): RegistrySnapshot {
    const variants = new Map<string, Variant>();

    for (const row of [...rows.variants].sort((a, b) =>
        byString(a.name, b.name),
    )) {
        variants.set(row.name, {
            name: row.name,
            public: row.public,
            title: row.title,
            description: row.description,
            instances: rows.instances
                .filter((instance) => instance.variantName === row.name)
                .map(({ variantName, url }) => ({ variantName, url }))
                .sort((a, b) => byString(a.url, b.url)),
            aliases: rows.aliases
                .filter((alias) => alias.variantName === row.name)
                .map((alias) => alias.name)
                .sort(byString),
        });
    }

    const keysByHash = new Map<string, ApiKeyRecord>();

    for (const key of rows.keys) {
        keysByHash.set(key.keyHash, {
            id: key.id,
            name: key.name,
            rateLimitPerMinute: key.rateLimitPerMinute,
            allVariants: key.allVariants,
            canActForUsers: key.canActForUsers,
            grants: new Set(
                rows.grants
                    .filter((grant) => grant.keyId === key.id)
                    .map((grant) => grant.variantName),
            ),
        });
    }

    const users = new Map<number, UserRecord>();

    for (const user of [...rows.users].sort((a, b) => a.uid - b.uid)) {
        users.set(user.uid, {
            uid: user.uid,
            role: user.role,
            grants: new Set(
                rows.userGrants
                    .filter((grant) => grant.uid === user.uid)
                    .map((grant) => grant.variantName),
            ),
        });
    }

    return {
        variants,
        aliases: new Map(
            rows.aliases.map((alias) => [alias.name, alias.variantName]),
        ),
        keysByHash,
        users,
    };
}

/**
 * The snapshot before the registry is first loaded.
 */
export const emptySnapshot: RegistrySnapshot = buildSnapshot({
    variants: [],
    instances: [],
    aliases: [],
    keys: [],
    grants: [],
    users: [],
    userGrants: [],
});

/**
 * Identifies an instance across snapshots. The same URL under another variant is another instance.
 */
export function instanceKey(instance: Instance): string {
    return `${instance.variantName} ${instance.url}`;
}

export const anonymousCaller: Caller = { kind: "anonymous" };

/**
 * The caller's name for logs: the key's name, or `anonymous`.
 */
export function callerName(caller: Caller): string {
    return caller.kind === "key" ? caller.key.name : "anonymous";
}
