import {
    expectPositionals,
    parseArguments,
    parseRole,
    parseUid,
} from "@/cli/arguments";
import { reloadReminder } from "@/cli/output";
import { formatTable } from "@/cli/table";
import type { Command } from "@/cli/types";

export const setUserRole: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [uid = "", role = ""] = expectPositionals(positionals, [
        "uid",
        "role",
    ]);
    const parsedUid = parseUid(uid);
    const parsedRole = parseRole(role);

    return async ({ admin, out }) => {
        await admin.setRole(parsedUid, parsedRole);

        out.info(
            parsedRole === null
                ? `Removed user ${parsedUid.toString()}'s role.`
                : `Set user ${parsedUid.toString()}'s role to ${parsedRole}.`,
        );
        out.info(reloadReminder);
    };
};

export const grantUser: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [uid = "", variant = ""] = expectPositionals(positionals, [
        "uid",
        "variant",
    ]);
    const parsedUid = parseUid(uid);

    return async ({ admin, out }) => {
        out.info(
            (await admin.grantUser(parsedUid, variant))
                ? `Granted user ${parsedUid.toString()} access to ${variant}.`
                : `User ${parsedUid.toString()} already has access to ${variant}.`,
        );
        out.info(reloadReminder);
    };
};

export const ungrantUser: Command = (args) => {
    const { positionals } = parseArguments(args, {});
    const [uid = "", variant = ""] = expectPositionals(positionals, [
        "uid",
        "variant",
    ]);
    const parsedUid = parseUid(uid);

    return async ({ admin, out }) => {
        await admin.ungrantUser(parsedUid, variant);

        out.info(
            `Removed user ${parsedUid.toString()}'s access to ${variant}.`,
        );
        out.info(reloadReminder);
    };
};

export const listUsers: Command = (args) => {
    const { positionals } = parseArguments(args, {});

    expectPositionals(positionals, []);

    return async ({ admin, out }) => {
        const users = await admin.listUsers();

        if (users.length === 0) {
            out.info("No users.");

            return;
        }

        for (const line of formatTable(
            ["UID", "ROLE", "GRANTS"],
            users.map((user) => [
                user.uid.toString(),
                user.role ?? "-",
                user.grants.join(", ") || "-",
            ]),
        )) {
            out.info(line);
        }
    };
};
