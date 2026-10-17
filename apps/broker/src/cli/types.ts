import type { IProcessorClient } from "@/clients/IProcessorClient";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";
import type { IRegistryAdminService } from "@/services/IRegistryAdminService";

export interface CliOutput {
    info(line: string): void;
    error(line: string): void;
}

export interface CliDependencies {
    readonly repository: IRegistryRepository;
    /** Carries out the registry changes that have rules; the commands only parse arguments and print. */
    readonly admin: IRegistryAdminService;
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
