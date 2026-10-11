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

/**
 * Runs a parsed command against the registry.
 */
export type CommandAction = (deps: CliDependencies) => Promise<void>;

/**
 * Checks a command's arguments without touching the registry.
 *
 * @throws {CliError} If the arguments are invalid.
 * @returns The action that carries out the command.
 */
export type Command = (args: string[]) => CommandAction;
