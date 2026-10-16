import {
    expectPositionals,
    instanceUrl,
    parseArguments,
} from "@/cli/arguments";
import { CliError } from "@/cli/errors";
import { reloadReminder } from "@/cli/output";
import type { Command } from "@/cli/types";
import { requireVariant } from "./variant";

function parseInstance(args: string[]): { variant: string; url: string } {
    const { values, positionals } = parseArguments(args, {
        port: { type: "string" },
        url: { type: "string" },
    });
    const [variant = ""] = expectPositionals(positionals, ["variant"]);

    return { variant, url: instanceUrl(values) };
}

export const addInstance: Command = (args) => {
    const { variant, url } = parseInstance(args);

    return async ({ repository, out }) => {
        await requireVariant(repository, variant);

        if (!(await repository.insertInstance(variant, url))) {
            throw new CliError(`${url} is already an instance of ${variant}`);
        }

        out.info(`Added instance ${url} to ${variant}.`);
        out.info(reloadReminder);
    };
};

export const removeInstance: Command = (args) => {
    const { variant, url } = parseInstance(args);

    return async ({ repository, out }) => {
        await requireVariant(repository, variant);

        if (!(await repository.deleteInstance(variant, url))) {
            throw new CliError(`${url} is not an instance of ${variant}`);
        }

        out.info(`Removed instance ${url} from ${variant}.`);
        out.info(reloadReminder);
    };
};
