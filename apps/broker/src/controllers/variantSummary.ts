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

    return {
        name: variant.name,
        title: variant.title,
        aliases: variant.aliases,
        description: variant.description,
        available: variant.instances.some((instance) =>
            health.isHealthy(instance),
        ),
        mode: info?.mode ?? null,
        algorithm: info?.algorithm ?? null,
        calculatorVersion: info?.calculatorVersion ?? null,
        builtAt: info?.builtAt ?? null,
    };
}
