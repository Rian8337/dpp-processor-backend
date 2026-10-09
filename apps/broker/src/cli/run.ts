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
import type { CliDependencies, Command } from "./types";

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
 * Runs one CLI command.
 *
 * @returns The exit code: 0 on success, 1 for an unknown command or a {@link CliError}.
 */
export async function runCli(
    argv: readonly string[],
    deps: CliDependencies,
): Promise<number> {
    const [first = "", second = ""] = argv;
    const twoWordCommand = commands.get(`${first} ${second}`);
    const command = twoWordCommand ?? commands.get(first);

    if (!command) {
        deps.out.error(usage);

        return 1;
    }

    try {
        await command(argv.slice(twoWordCommand ? 2 : 1), deps);

        return 0;
    } catch (e) {
        if (e instanceof CliError) {
            deps.out.error(e.message);

            return 1;
        }

        throw e;
    }
}
