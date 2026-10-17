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
import type { KeyListing } from "@/registry/types";

function describeLimit(key: KeyListing): string {
    return key.rateLimitPerMinute === null
        ? "unlimited"
        : `${key.rateLimitPerMinute.toString()}/min`;
}

function describeActForUsers(key: KeyListing): string {
    return key.canActForUsers ? "yes" : "no";
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
        "act-for-users": { type: "boolean", default: false },
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

    return async ({ admin, out }) => {
        const { rawKey } = await admin.createKey({
            name,
            rateLimitPerMinute,
            allVariants: values["all-variants"],
            canActForUsers: values["act-for-users"],
            grants: values.grant,
        });

        out.info(`Created key ${name}.`);
        out.info(`Key: ${rawKey}`);
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
        "act-for-users": { type: "boolean", default: false },
        "no-act-for-users": { type: "boolean", default: false },
    });
    const [name = ""] = expectPositionals(positionals, ["name"]);
    const rateLimitPerMinute = parseLimit(values.limit, values.unlimited);

    if (values["all-variants"] && values["granted-only"]) {
        throw new CliError("Pass only one of --all-variants or --granted-only");
    }

    if (values["act-for-users"] && values["no-act-for-users"]) {
        throw new CliError(
            "Pass only one of --act-for-users or --no-act-for-users",
        );
    }

    const changes: {
        rateLimitPerMinute?: number | null;
        allVariants?: boolean;
        canActForUsers?: boolean;
    } = {};

    if (rateLimitPerMinute !== undefined) {
        changes.rateLimitPerMinute = rateLimitPerMinute;
    }

    if (values["all-variants"] || values["granted-only"]) {
        changes.allVariants = values["all-variants"];
    }

    if (values["act-for-users"] || values["no-act-for-users"]) {
        changes.canActForUsers = values["act-for-users"];
    }

    if (Object.keys(changes).length === 0) {
        throw new CliError(
            "Nothing to update; pass --limit, --unlimited, --all-variants, --granted-only, --act-for-users, or --no-act-for-users",
        );
    }

    return async ({ admin, out }) => {
        await admin.updateKey(name, changes);

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
    return async ({ admin, out }) => {
        const { added, allVariants } = await admin.grantKey(name, variant);

        out.info(
            added
                ? `Granted key ${name} access to ${variant}.`
                : `Key ${name} already has access to ${variant}.`,
        );

        if (allVariants) {
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

    return async ({ admin, out }) => {
        await admin.ungrantKey(name, variant);

        out.info(`Removed key ${name}'s access to ${variant}.`);
        out.info(reloadReminder);
    };
};

export const revokeKey: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [name = ""] = expectPositionals(positionals, ["name"]);

    return async ({ admin, out }) => {
        await admin.revokeKey(name);

        out.info(`Revoked key ${name}.`);
        out.info(reloadReminder);
    };
};

export const listKeys: Command = (args) => {
    const { positionals } = parseArguments(args, {});

    expectPositionals(positionals, []);

    return async ({ admin, out }) => {
        const keys = await admin.listKeys();

        if (keys.length === 0) {
            out.info("No keys.");

            return;
        }

        for (const line of formatTable(
            ["NAME", "LIMIT", "ACCESS", "ACT FOR USERS", "CREATED", "REVOKED"],
            keys.map((key) => [
                key.name,
                describeLimit(key),
                describeAccess(key),
                describeActForUsers(key),
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
        out.info(`Act for users: ${describeActForUsers(key)}`);
    };
};
