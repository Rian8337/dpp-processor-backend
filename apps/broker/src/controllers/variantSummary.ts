import type { Variant } from "@/registry/types";
import type { IHealthMonitor } from "@/services/IHealthMonitor";
import type { VariantSummary } from "@dpp/shared";

/**
 * Describes a variant for clients. Instance URLs and the public flag are deliberately left out.
 */
export function toVariantSummary(
    variant: Variant,
    health: Pick<IHealthMonitor, "isHealthy" | "lastInfo">,
): VariantSummary {
    const info = health.lastInfo(variant.name);
    const healthyInstanceCount = variant.instances.filter((instance) =>
        health.isHealthy(instance),
    ).length;

    return {
        name: variant.name,
        title: variant.title,
        aliases: variant.aliases,
        description: variant.description,
        available: healthyInstanceCount > 0,
        healthyInstanceCount,
        mode: info?.mode ?? null,
        algorithm: info?.algorithm ?? null,
        calculatorVersion: info?.calculatorVersion ?? null,
        builtAt: info?.builtAt ?? null,
    };
}
