import type { Instance, RegistrySnapshot } from "@/registry/types";
import type { InfoResponse } from "@dpp/shared";
import type { InstanceState } from "./probe";

export interface IHealthMonitor {
    /** Adopts a new registry snapshot: forgets removed instances; new ones are `down` until checked. */
    sync(snapshot: RegistrySnapshot): void;
    /** Checks every instance once. Concurrent calls share one round. Never rejects. */
    checkAll(): Promise<void>;
    /** Checks every `HEALTH_CHECK_INTERVAL_SECONDS` until disposed. */
    start(): Disposable;
    stateOf(instance: Instance): InstanceState;
    isHealthy(instance: Instance): boolean;
    /** Marks an instance down after a failed forward; the next successful check restores it. */
    markDown(instance: Instance, reason: string): void;
    /** The `/info` of the variant's most recent successful check, kept while the variant is down. */
    lastInfo(variantName: string): InfoResponse | undefined;
    /** The `/info` of the instance's most recent healthy check; `undefined` if it has not been healthy since it was added. */
    infoOf(instance: Instance): InfoResponse | undefined;
}
