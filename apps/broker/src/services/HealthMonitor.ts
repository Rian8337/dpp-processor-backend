import type { IProcessorClient } from "@/clients/IProcessorClient";
import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { instanceKey } from "@/registry/snapshot";
import type { Instance, RegistrySnapshot } from "@/registry/types";
import { Injectable } from "@dpp/server";
import type { InfoResponse } from "@dpp/shared";
import { inject } from "tsyringe";
import type { IHealthMonitor } from "./IHealthMonitor";
import { probeInstance, type InstanceState } from "./probe";

/**
 * How long after an instance is marked down it is probed again, so one spurious failure does not keep a variant
 * unavailable until the next health round.
 */
const recheckDelayMs = 1000;

@Injectable(dependencyTokens.healthMonitor)
export class HealthMonitor implements IHealthMonitor {
    private instances: readonly Instance[] = [];
    private current = new Set<string>();
    private readonly states = new Map<string, InstanceState>();
    private readonly lastInfoByVariant = new Map<string, InfoResponse>();
    private readonly infoByInstance = new Map<string, InfoResponse>();
    private round: Promise<void> | undefined;
    private readonly rechecks = new Map<string, NodeJS.Timeout>();
    private stopped = false;

    constructor(
        @inject(dependencyTokens.processorClient)
        private readonly client: IProcessorClient,
        @inject(dependencyTokens.config)
        private readonly config: Config,
    ) {}

    sync(snapshot: RegistrySnapshot): void {
        const previous = this.current;

        this.instances = [...snapshot.variants.values()].flatMap(
            (variant) => variant.instances,
        );
        this.current = new Set(this.instances.map(instanceKey));

        for (const key of this.states.keys()) {
            if (!this.current.has(key)) {
                this.states.delete(key);
            }
        }

        for (const key of this.infoByInstance.keys()) {
            if (!this.current.has(key)) {
                this.infoByInstance.delete(key);
            }
        }

        for (const [key, timer] of this.rechecks) {
            if (!this.current.has(key)) {
                clearTimeout(timer);
                this.rechecks.delete(key);
            }
        }

        for (const name of this.lastInfoByVariant.keys()) {
            if (!snapshot.variants.has(name)) {
                this.lastInfoByVariant.delete(name);
            }
        }

        // New instances are probed right away rather than waiting for the next round. check() never throws.
        for (const instance of this.instances) {
            if (!previous.has(instanceKey(instance))) {
                void this.check(instance);
            }
        }
    }

    checkAll(): Promise<void> {
        this.round ??= Promise.all(
            this.instances.map((instance) => this.check(instance)),
        )
            .then(() => undefined)
            .catch((e: unknown) => {
                console.error("Health check round failed:", e);
            })
            .finally(() => {
                this.round = undefined;
            });

        return this.round;
    }

    start(): Disposable {
        const timer = setInterval(() => {
            void this.checkAll();
        }, this.config.healthCheck.intervalSeconds * 1000);

        timer.unref();

        return {
            [Symbol.dispose]: () => {
                clearInterval(timer);

                this.stopped = true;

                for (const recheck of this.rechecks.values()) {
                    clearTimeout(recheck);
                }

                this.rechecks.clear();
            },
        };
    }

    stateOf(instance: Instance): InstanceState {
        return this.states.get(instanceKey(instance)) ?? "down";
    }

    isHealthy(instance: Instance): boolean {
        return this.stateOf(instance) === "healthy";
    }

    markDown(instance: Instance, reason: string): void {
        this.setState(instance, "down", reason);
        this.scheduleRecheck(instance);
    }

    lastInfo(variantName: string): InfoResponse | undefined {
        return this.lastInfoByVariant.get(variantName);
    }

    infoOf(instance: Instance): InfoResponse | undefined {
        return this.infoByInstance.get(instanceKey(instance));
    }

    private scheduleRecheck(instance: Instance): void {
        const key = instanceKey(instance);

        if (this.stopped || !this.current.has(key) || this.rechecks.has(key)) {
            return;
        }

        const timer = setTimeout(() => {
            this.rechecks.delete(key);

            if (this.current.has(key)) {
                void this.check(instance);
            }
        }, recheckDelayMs);

        timer.unref();
        this.rechecks.set(key, timer);
    }

    private async check(instance: Instance): Promise<void> {
        const probe = await probeInstance(
            this.client,
            instance,
            this.config.healthCheck.timeoutSeconds * 1000,
        );

        switch (probe.state) {
            case "healthy":
                this.setState(instance, "healthy");

                if (this.current.has(instanceKey(instance))) {
                    this.infoByInstance.set(instanceKey(instance), probe.info);
                    this.lastInfoByVariant.set(
                        instance.variantName,
                        probe.info,
                    );
                }
                break;
            case "mismatch":
                this.setState(
                    instance,
                    "mismatch",
                    `reports variant "${probe.info.id}"`,
                );
                break;
            case "down":
                this.setState(instance, "down", probe.reason);
                break;
        }
    }

    private setState(
        instance: Instance,
        state: InstanceState,
        detail?: string,
    ): void {
        const key = instanceKey(instance);

        // The instance was removed by a registry reload while it was being checked or forwarded to.
        if (!this.current.has(key)) {
            return;
        }

        const previous = this.states.get(key);

        this.states.set(key, state);

        if (previous === state) {
            return;
        }

        const message = `Instance ${instance.url} of ${instance.variantName}: ${previous ?? "unchecked"} → ${state}${detail ? ` (${detail})` : ""}`;

        if (state === "healthy") {
            console.log(message);
        } else if (state === "down") {
            console.warn(message);
        } else {
            console.error(message);
        }
    }
}
