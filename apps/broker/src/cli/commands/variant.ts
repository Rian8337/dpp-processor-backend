import { readFile } from "node:fs/promises";
import {
    expectPositionals,
    parseArguments,
    requireValidName,
} from "@/cli/arguments";
import { CliError } from "@/cli/errors";
import { reloadReminder } from "@/cli/output";
import { formatTable } from "@/cli/table";
import type { Command } from "@/cli/types";
import type { VariantRow } from "@/registry/types";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";

/**
 * @throws {CliError} If there is no such variant.
 */
export async function requireVariant(
    repository: IRegistryRepository,
    name: string,
): Promise<VariantRow> {
    const variant = await repository.findVariant(name);

    if (!variant) {
        throw new CliError(`No variant named "${name}"`);
    }

    return variant;
}

/**
 * Variant and alias names share one namespace.
 *
 * @throws {CliError} If a variant or alias already has this name.
 */
export async function requireUnusedName(
    repository: IRegistryRepository,
    name: string,
): Promise<void> {
    if (await repository.findVariant(name)) {
        throw new CliError(`"${name}" is already a variant`);
    }

    const target = await repository.findAliasTarget(name);

    if (target !== undefined) {
        throw new CliError(`"${name}" is already an alias of ${target}`);
    }
}

export const addVariant: Command = (args) => {
    const { values, positionals } = parseArguments(args, {
        public: { type: "boolean", default: false },
        description: { type: "string" },
    });
    const [name = ""] = expectPositionals(positionals, ["name"]);

    requireValidName(name);
    return async ({ repository, out }) => {
        await requireUnusedName(repository, name);
        await repository.insertVariant({
            name,
            public: values.public,
            title: null,
            description: values.description || null,
        });

        out.info(
            `Added ${values.public ? "public" : "private"} variant ${name}.`,
        );
        out.info(reloadReminder);
    };
};

/**
 * Reads a description from a file as UTF-8, without the newline that ends the last line.
 */
async function readDescriptionFile(path: string): Promise<string> {
    let text: string;

    try {
        text = await readFile(path, "utf8");
    } catch (e) {
        throw new CliError(
            `Cannot read "${path}": ${e instanceof Error ? e.message : String(e)}`,
        );
    }

    return text.replace(/\r?\n$/, "");
}

export const updateVariant: Command = (args) => {
    const { values, positionals } = parseArguments(args, {
        public: { type: "boolean", default: false },
        private: { type: "boolean", default: false },
        title: { type: "string" },
        description: { type: "string" },
        "description-file": { type: "string" },
    });
    const [name = ""] = expectPositionals(positionals, ["name"]);

    if (values.public && values.private) {
        throw new CliError("Pass only one of --public or --private");
    }

    if (
        values.description !== undefined &&
        values["description-file"] !== undefined
    ) {
        throw new CliError(
            "Pass only one of --description or --description-file",
        );
    }

    if (
        !values.public &&
        !values.private &&
        values.title === undefined &&
        values.description === undefined &&
        values["description-file"] === undefined
    ) {
        throw new CliError(
            "Nothing to update; pass --public, --private, --title, --description, or --description-file",
        );
    }

    return async ({ admin, out }) => {
        const changes: {
            public?: boolean;
            title?: string;
            description?: string;
        } = {};

        if (values.public || values.private) {
            changes.public = values.public;
        }

        // An empty title or description clears it.
        if (values.title !== undefined) {
            changes.title = values.title;
        }

        if (values.description !== undefined) {
            changes.description = values.description;
        } else if (values["description-file"] !== undefined) {
            changes.description = await readDescriptionFile(
                values["description-file"],
            );
        }

        await admin.updateVariant(name, changes);

        out.info(`Updated variant ${name}.`);
        out.info(reloadReminder);
    };
};

export const removeVariant: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [name = ""] = expectPositionals(positionals, ["name"]);

    return async ({ repository, out }) => {
        await requireVariant(repository, name);

        const aliases = await repository.aliasesOf(name);

        if (aliases.length > 0) {
            throw new CliError(
                `Variant ${name} still has aliases: ${aliases.join(", ")}. Remove or repoint them first.`,
            );
        }

        await repository.deleteVariant(name);

        out.info(`Removed variant ${name}, its instances, and its grants.`);
        out.info(reloadReminder);
    };
};

export const listVariants: Command = (args) => {
    const { positionals } = parseArguments(args, {});

    expectPositionals(positionals, []);

    return async ({ repository, out }) => {
        const variants = [
            ...(await repository.loadSnapshot()).variants.values(),
        ];

        if (variants.length === 0) {
            out.info("No variants.");

            return;
        }

        for (const line of formatTable(
            ["NAME", "TITLE", "ACCESS", "ALIASES", "INSTANCES", "DESCRIPTION"],
            variants.map((variant) => [
                variant.name,
                variant.title ?? "-",
                variant.public ? "public" : "private",
                variant.aliases.join(", ") || "-",
                variant.instances.length.toString(),
                variant.description ?? "-",
            ]),
        )) {
            out.info(line);
        }
    };
};
