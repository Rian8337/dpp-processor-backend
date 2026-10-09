import type { Config } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { hashApiKey } from "@/registry/keys";
import { emptySnapshot } from "@/registry/snapshot";
import type {
    ApiKeyRecord,
    Caller,
    RegistrySnapshot,
    Variant,
} from "@/registry/types";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { IHealthMonitor } from "./IHealthMonitor";
import type { IRegistryService } from "./IRegistryService";

@Injectable(dependencyTokens.registryService)
export class RegistryService implements IRegistryService {
    private snapshot: RegistrySnapshot = emptySnapshot;

    constructor(
        @inject(dependencyTokens.registryRepository)
        private readonly repository: Pick<IRegistryRepository, "loadSnapshot">,
        @inject(dependencyTokens.healthMonitor)
        private readonly health: Pick<IHealthMonitor, "sync">,
        @inject(dependencyTokens.config)
        private readonly config: Config,
    ) {}

    async load(): Promise<void> {
        const snapshot = await this.repository.loadSnapshot();

        this.snapshot = snapshot;
        this.health.sync(snapshot);
    }

    async reload(): Promise<boolean> {
        try {
            await this.load();

            return true;
        } catch (e) {
            console.error(
                "Failed to reload the registry; keeping the previous one:",
                e instanceof Error ? e.message : e,
            );

            return false;
        }
    }

    startReloading(): Disposable {
        const timer = setInterval(() => {
            void this.reload();
        }, this.config.registryReloadIntervalSeconds * 1000);

        timer.unref();

        return { [Symbol.dispose]: () => clearInterval(timer) };
    }

    authenticate(rawKey: string): ApiKeyRecord | undefined {
        // The map lookup compares hashes, not keys, so its timing reveals nothing usable about stored keys.
        return this.snapshot.keysByHash.get(hashApiKey(rawKey));
    }

    resolve(name: string, caller: Caller): Variant | undefined {
        const variant =
            this.snapshot.variants.get(name) ??
            this.snapshot.variants.get(this.snapshot.aliases.get(name) ?? "");

        return variant && this.canUse(variant, caller) ? variant : undefined;
    }

    visibleVariants(caller: Caller): Variant[] {
        return [...this.snapshot.variants.values()].filter((variant) =>
            this.canUse(variant, caller),
        );
    }

    summary(): string {
        const variants = [...this.snapshot.variants.values()];
        const instances = variants.reduce(
            (count, variant) => count + variant.instances.length,
            0,
        );

        return `${variants.length.toString()} variants, ${instances.toString()} instances, ${this.snapshot.aliases.size.toString()} aliases, ${this.snapshot.keysByHash.size.toString()} keys`;
    }

    private canUse(variant: Variant, caller: Caller): boolean {
        return (
            variant.public ||
            (caller.kind === "key" &&
                (caller.key.allVariants || caller.key.grants.has(variant.name)))
        );
    }
}
