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
            description: values.description || null,
        });

        out.info(
            `Added ${values.public ? "public" : "private"} variant ${name}.`,
        );
        out.info(reloadReminder);
    };
};

export const updateVariant: Command = (args) => {
    const { values, positionals } = parseArguments(args, {
        public: { type: "boolean", default: false },
        private: { type: "boolean", default: false },
        description: { type: "string" },
    });
    const [name = ""] = expectPositionals(positionals, ["name"]);

    if (values.public && values.private) {
        throw new CliError("Pass only one of --public or --private");
    }

    if (!values.public && !values.private && values.description === undefined) {
        throw new CliError(
            "Nothing to update; pass --public, --private, or --description",
        );
    }

    return async ({ repository, out }) => {
        await requireVariant(repository, name);

        const changes: { public?: boolean; description?: string | null } = {};

        if (values.public || values.private) {
            changes.public = values.public;
        }

        if (values.description !== undefined) {
            // An empty description clears it.
            changes.description = values.description || null;
        }

        await repository.updateVariant(name, changes);

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
            ["NAME", "ACCESS", "ALIASES", "INSTANCES", "DESCRIPTION"],
            variants.map((variant) => [
                variant.name,
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
