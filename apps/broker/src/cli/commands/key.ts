import {
    expectPositionals,
    parseArguments,
    parseLimit,
    requireValidName,
} from "@/cli/arguments";
import { CliError } from "@/cli/errors";
import { reloadReminder } from "@/cli/output";
import { formatTable } from "@/cli/table";
import type { Command } from "@/cli/types";
import { generateApiKey, hashApiKey } from "@/registry/keys";
import type { KeyListing } from "@/registry/types";
import type { IRegistryRepository } from "@/repositories/IRegistryRepository";
import { requireVariant } from "./variant";

async function requireActiveKey(
    repository: IRegistryRepository,
    name: string,
): Promise<KeyListing> {
    const key = await repository.findKey(name);

    if (!key) {
        throw new CliError(`No key named "${name}"`);
    }

    if (key.revokedAt) {
        throw new CliError(`Key ${name} is revoked`);
    }

    return key;
}

function describeLimit(key: KeyListing): string {
    return key.rateLimitPerMinute === null
        ? "unlimited"
        : `${key.rateLimitPerMinute.toString()}/min`;
}

function describeAccess(key: KeyListing): string {
    if (key.allVariants) {
        return "all variants";
    }

    return ["public variants", ...key.grants].join(", ");
}

export const createKey: Command = (args) => {
    const { values, positionals } = parseArguments(args, {
        limit: { type: "string" },
        unlimited: { type: "boolean", default: false },
        "all-variants": { type: "boolean", default: false },
        grant: { type: "string", multiple: true, default: [] },
    });
    const [name = ""] = expectPositionals(positionals, ["name"]);
    const rateLimitPerMinute = parseLimit(values.limit, values.unlimited);

    requireValidName(name);

    if (rateLimitPerMinute === undefined) {
        throw new CliError("Pass --limit <per-minute> or --unlimited");
    }

    if (values["all-variants"] && values.grant.length > 0) {
        throw new CliError(
            "--all-variants already allows every variant; do not combine it with --grant",
        );
    }

    return async ({ repository, out }) => {
        if (await repository.findKey(name)) {
            throw new CliError(`A key named "${name}" already exists`);
        }

        const grants = [...new Set(values.grant)];

        for (const variant of grants) {
            await requireVariant(repository, variant);
        }

        const key = generateApiKey();

        await repository.insertKey({
            name,
            hash: hashApiKey(key),
            rateLimitPerMinute,
            allVariants: values["all-variants"],
            canActForUsers: false,
            grants,
        });

        out.info(`Created key ${name}.`);
        out.info(`Key: ${key}`);
        out.info("Store it now; it cannot be shown again.");
        out.info(reloadReminder);
    };
};

export const updateKey: Command = (args) => {
    const { values, positionals } = parseArguments(args, {
        limit: { type: "string" },
        unlimited: { type: "boolean", default: false },
        "all-variants": { type: "boolean", default: false },
        "granted-only": { type: "boolean", default: false },
    });
    const [name = ""] = expectPositionals(positionals, ["name"]);
    const rateLimitPerMinute = parseLimit(values.limit, values.unlimited);

    if (values["all-variants"] && values["granted-only"]) {
        throw new CliError("Pass only one of --all-variants or --granted-only");
    }

    const changes: {
        rateLimitPerMinute?: number | null;
        allVariants?: boolean;
    } = {};

    if (rateLimitPerMinute !== undefined) {
        changes.rateLimitPerMinute = rateLimitPerMinute;
    }

    if (values["all-variants"] || values["granted-only"]) {
        changes.allVariants = values["all-variants"];
    }

    if (Object.keys(changes).length === 0) {
        throw new CliError(
            "Nothing to update; pass --limit, --unlimited, --all-variants, or --granted-only",
        );
    }

    return async ({ repository, out }) => {
        await requireActiveKey(repository, name);
        await repository.updateKey(name, changes);

        out.info(`Updated key ${name}.`);
        out.info(reloadReminder);
    };
};

export const grantKey: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [name = "", variant = ""] = expectPositionals(positionals, [
        "name",
        "variant",
    ]);
    return async ({ repository, out }) => {
        const key = await requireActiveKey(repository, name);

        await requireVariant(repository, variant);

        out.info(
            (await repository.grant(name, variant))
                ? `Granted key ${name} access to ${variant}.`
                : `Key ${name} already has access to ${variant}.`,
        );

        if (key.allVariants) {
            out.info(
                `Key ${name} can use every variant; its grants only matter after \`key update ${name} --granted-only\`.`,
            );
        }

        out.info(reloadReminder);
    };
};

export const ungrantKey: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [name = "", variant = ""] = expectPositionals(positionals, [
        "name",
        "variant",
    ]);

    return async ({ repository, out }) => {
        await requireActiveKey(repository, name);

        if (!(await repository.ungrant(name, variant))) {
            throw new CliError(`Key ${name} has no grant for ${variant}`);
        }

        out.info(`Removed key ${name}'s access to ${variant}.`);
        out.info(reloadReminder);
    };
};

export const revokeKey: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [name = ""] = expectPositionals(positionals, ["name"]);

    return async ({ repository, out }) => {
        if (!(await repository.findKey(name))) {
            throw new CliError(`No key named "${name}"`);
        }

        if (!(await repository.revokeKey(name))) {
            throw new CliError(`Key ${name} is already revoked`);
        }

        out.info(`Revoked key ${name}.`);
        out.info(reloadReminder);
    };
};

export const listKeys: Command = (args) => {
    const { positionals } = parseArguments(args, {});

    expectPositionals(positionals, []);

    return async ({ repository, out }) => {
        const keys = await repository.listKeys();

        if (keys.length === 0) {
            out.info("No keys.");

            return;
        }

        for (const line of formatTable(
            ["NAME", "LIMIT", "ACCESS", "CREATED", "REVOKED"],
            keys.map((key) => [
                key.name,
                describeLimit(key),
                describeAccess(key),
                key.createdAt.toISOString(),
                key.revokedAt?.toISOString() ?? "-",
            ]),
        )) {
            out.info(line);
        }
    };
};

export const showKey: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [name = ""] = expectPositionals(positionals, ["name"]);
    return async ({ repository, out }) => {
        const key = await repository.findKey(name);

        if (!key) {
            throw new CliError(`No key named "${name}"`);
        }

        out.info(`Name:     ${key.name}`);
        out.info(`Limit:    ${describeLimit(key)}`);
        out.info(`Access:   ${describeAccess(key)}`);
        out.info(`Created:  ${key.createdAt.toISOString()}`);
        out.info(`Revoked:  ${key.revokedAt?.toISOString() ?? "-"}`);
    };
};
