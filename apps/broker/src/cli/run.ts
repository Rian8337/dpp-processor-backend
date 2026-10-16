import { removeAlias, setAlias } from "./commands/alias";
import { addInstance, removeInstance } from "./commands/instance";
import {
    createKey,
    grantKey,
    listKeys,
    revokeKey,
    showKey,
    ungrantKey,
    updateKey,
} from "./commands/key";
import { showStatus } from "./commands/status";
import {
    addVariant,
    listVariants,
    removeVariant,
    updateVariant,
} from "./commands/variant";
import { CliError } from "./errors";
import type {
    CliDependencies,
    CliOutput,
    Command,
    CommandAction,
} from "./types";

const commands = new Map<string, Command>([
    ["variant add", addVariant],
    ["variant update", updateVariant],
    ["variant remove", removeVariant],
    ["variant list", listVariants],
    ["instance add", addInstance],
    ["instance remove", removeInstance],
    ["alias set", setAlias],
    ["alias remove", removeAlias],
    ["key create", createKey],
    ["key update", updateKey],
    ["key grant", grantKey],
    ["key ungrant", ungrantKey],
    ["key revoke", revokeKey],
    ["key list", listKeys],
    ["key show", showKey],
    ["status", showStatus],
]);

export const usage = `Usage: pnpm --filter @dpp/broker cli <command>

  variant add <name> [--public] [--description <text>]
  variant update <name> [--public | --private] [--description <text>]
  variant remove <name>
  variant list

  instance add <variant> (--port <n> | --url <url>)
  instance remove <variant> (--port <n> | --url <url>)

  alias set <alias> <variant>
  alias remove <alias>

  key create <name> (--limit <per-minute> | --unlimited) [--all-variants | --grant <variant>...]
  key update <name> [--limit <per-minute> | --unlimited] [--all-variants | --granted-only]
  key grant <name> <variant>
  key ungrant <name> <variant>
  key revoke <name>
  key list
  key show <name>

  status`;

/**
 * Checks the command name and its arguments. Needs no configuration or database, so a mistyped command reports usage
 * before anything is opened.
 *
 * @returns The action to run, or `undefined` after printing usage or the argument error.
 */
export function parseCli(
    argv: readonly string[],
    out: CliOutput,
): CommandAction | undefined {
    const [first = "", second = ""] = argv;
    const twoWordCommand = commands.get(`${first} ${second}`);
    const command = twoWordCommand ?? commands.get(first);

    if (!command) {
        out.error(usage);

        return undefined;
    }

    try {
        return command(argv.slice(twoWordCommand ? 2 : 1));
    } catch (e) {
        if (e instanceof CliError) {
            out.error(e.message);

            return undefined;
        }

        throw e;
    }
}

/**
 * Runs a parsed command.
 *
 * @returns The exit code: 0 on success, 1 for a {@link CliError}.
 */
export async function runAction(
    action: CommandAction,
    deps: CliDependencies,
): Promise<number> {
    try {
        await action(deps);

        return 0;
    } catch (e) {
        if (e instanceof CliError) {
            deps.out.error(e.message);

            return 1;
        }

        throw e;
    }
}

/**
 * Parses and runs one CLI command.
 *
 * @returns The exit code: 0 on success, 1 for an unknown command or a {@link CliError}.
 */
export async function runCli(
    argv: readonly string[],
    deps: CliDependencies,
): Promise<number> {
    const action = parseCli(argv, deps.out);

    return action ? await runAction(action, deps) : 1;
}
