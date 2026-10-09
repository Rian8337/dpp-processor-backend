import {
    expectPositionals,
    parseArguments,
    requireValidName,
} from "@/cli/arguments";
import { CliError } from "@/cli/errors";
import { reloadReminder } from "@/cli/output";
import type { Command } from "@/cli/types";
import { requireVariant } from "./variant";

export const setAlias: Command = async (args, { repository, out }) => {
    const { positionals } = parseArguments(args, {});
    const [alias = "", variant = ""] = expectPositionals(positionals, [
        "alias",
        "variant",
    ]);

    requireValidName(alias);

    if (await repository.findVariant(alias)) {
        throw new CliError(`"${alias}" is already a variant`);
    }

    await requireVariant(repository, variant);

    const previous = await repository.findAliasTarget(alias);

    await repository.setAlias(alias, variant);

    out.info(
        previous !== undefined && previous !== variant
            ? `Repointed alias ${alias} from ${previous} to ${variant}.`
            : `Alias ${alias} now points at ${variant}.`,
    );
    out.info(reloadReminder);
};

export const removeAlias: Command = async (args, { repository, out }) => {
    const { positionals } = parseArguments(args, {});
    const [alias = ""] = expectPositionals(positionals, ["alias"]);

    if (!(await repository.deleteAlias(alias))) {
        throw new CliError(`No alias named "${alias}"`);
    }

    out.info(`Removed alias ${alias}.`);
    out.info(reloadReminder);
};
