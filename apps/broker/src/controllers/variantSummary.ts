import type { Variant } from "@/registry/types";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { VariantSummary } from "@dpp/shared";

/**
 * Describes a variant for clients. Instance URLs are deliberately left out.
 *
 * `builtAt` is the newest build among the healthy instances, since a rolling deploy can leave older and newer builds
 * serving at once. While no instance is healthy it falls back to the last known build.
 */
export function toVariantSummary(
    variant: Variant,
    health: Pick<IHealthMonitor, "isHealthy" | "lastInfo" | "infoOf">,
): VariantSummary {
    const info = health.lastInfo(variant.name);
    const healthyInstances = variant.instances.filter((instance) =>
        health.isHealthy(instance),
    );
    const healthyInstanceCount = healthyInstances.length;

    // ISO 8601 strings of the same format sort chronologically.
    const newestBuiltAt = healthyInstances
        .map((instance) => health.infoOf(instance)?.builtAt)
        .filter((builtAt) => builtAt !== undefined)
        .reduce<string | undefined>(
            (newest, builtAt) =>
                newest === undefined || builtAt > newest ? builtAt : newest,
            undefined,
        );

    return {
        name: variant.name,
        title: variant.title,
        aliases: variant.aliases,
        description: variant.description,
        public: variant.public,
        available: healthyInstanceCount > 0,
        healthyInstanceCount,
        mode: info?.mode ?? null,
        algorithm: info?.algorithm ?? null,
        calculatorVersion: info?.calculatorVersion ?? null,
        builtAt: newestBuiltAt ?? info?.builtAt ?? null,
    };
}
