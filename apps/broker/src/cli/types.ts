import type { IProcessorClient } from "@/clients/IProcessorClient";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";

export interface CliOutput {
    info(line: string): void;
    error(line: string): void;
}

export interface CliDependencies {
    readonly repository: IRegistryRepository;
    readonly processors: Pick<IProcessorClient, "getInfo">;
    readonly healthCheckTimeoutMs: number;
    readonly out: CliOutput;
}

export type Command = (args: string[], deps: CliDependencies) => Promise<void>;
