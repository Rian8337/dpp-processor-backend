import type { ApiKeyRecord, Caller, Variant } from "@/registry/types";

export interface IRegistryService {
    /** Loads the registry and hands it to the health monitor. Rejects if the database fails. */
    load(): Promise<void>;
    /** Like `load`, but logs a failure and keeps the previous snapshot. Resolves `true` on success. */
    reload(): Promise<boolean>;
    /** Reloads every `REGISTRY_RELOAD_INTERVAL_SECONDS` until disposed. */
    startReloading(): Disposable;
    /** The key for a raw `X-Api-Key` value, or `undefined` if unknown or revoked. */
    authenticate(rawKey: string): ApiKeyRecord | undefined;
    /** The variant for a name or alias, or `undefined` if it does not exist or the caller may not use it. */
    resolve(name: string, caller: Caller): Variant | undefined;
    /** The variants the caller may use, sorted by name. */
    visibleVariants(caller: Caller): Variant[];
    /** e.g. `3 variants, 4 instances, 2 aliases, 5 keys`, for startup and SIGHUP logs. */
    summary(): string;
}
