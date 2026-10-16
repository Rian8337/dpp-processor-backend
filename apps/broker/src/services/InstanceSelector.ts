import { dependencyTokens } from "@/dependencies/tokens";
import { instanceKey } from "@/registry/snapshot";
import type { Instance, Variant } from "@/registry/types";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { IHealthMonitor } from "./IHealthMonitor";
import type { IInstanceSelector } from "./IInstanceSelector";

@Injectable(dependencyTokens.instanceSelector)
export class InstanceSelector implements IInstanceSelector {
    private readonly counters = new Map<string, number>();

    constructor(
        @inject(dependencyTokens.healthMonitor)
        private readonly health: Pick<IHealthMonitor, "isHealthy">,
    ) {}

    select(variant: Variant, ...exclude: Instance[]): Instance | undefined {
        const excluded = new Set(exclude.map(instanceKey));
        const candidates = variant.instances.filter(
            (instance) =>
                this.health.isHealthy(instance) &&
                !excluded.has(instanceKey(instance)),
        );

        if (candidates.length === 0) {
            return undefined;
        }

        const counter = this.counters.get(variant.name) ?? 0;

        this.counters.set(variant.name, counter + 1);

        return candidates[counter % candidates.length];
    }
}
