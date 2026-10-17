import {
    expectPositionals,
    parseArguments,
    requireValidName,
} from "@/cli/arguments";
import { reloadReminder } from "@/cli/output";
import type { Command } from "@/cli/types";

export const setAlias: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [alias = "", variant = ""] = expectPositionals(positionals, [
        "alias",
        "variant",
    ]);

    requireValidName(alias);

    return async ({ admin, out }) => {
        const { previous } = await admin.setAlias(alias, variant);

        out.info(
            previous !== undefined && previous !== variant
                ? `Repointed alias ${alias} from ${previous} to ${variant}.`
                : `Alias ${alias} now points at ${variant}.`,
        );
        out.info(reloadReminder);
    };
};

export const removeAlias: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [alias = ""] = expectPositionals(positionals, ["alias"]);

    return async ({ admin, out }) => {
        await admin.removeAlias(alias);

        out.info(`Removed alias ${alias}.`);
        out.info(reloadReminder);
    };
};
