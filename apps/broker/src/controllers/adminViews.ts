import type { KeyListing, UserListing, Variant } from "@/registry/types";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { AdminKey, AdminUser, AdminVariant } from "@dpp/shared";
import { toVariantSummary } from "./variantSummary";

/**
 * Describes a variant for the management API: the public summary plus visibility and instance count.
 */
export function toAdminVariant(
    variant: Variant,
    health: Pick<IHealthMonitor, "isHealthy" | "lastInfo">,
): AdminVariant {
    return {
        ...toVariantSummary(variant, health),
        public: variant.public,
        instanceCount: variant.instances.length,
    };
}

/**
 * Describes a key for the management API. Hashes are never included.
 */
export function toAdminKey(key: KeyListing): AdminKey {
    return {
        name: key.name,
        rateLimitPerMinute: key.rateLimitPerMinute,
        allVariants: key.allVariants,
        canActForUsers: key.canActForUsers,
        grants: [...key.grants],
        createdAt: key.createdAt.toISOString(),
        revokedAt: key.revokedAt?.toISOString() ?? null,
    };
}

/**
 * Describes a user for the management API.
 */
export function toAdminUser(user: UserListing): AdminUser {
    return { uid: user.uid, role: user.role, grants: [...user.grants] };
}
