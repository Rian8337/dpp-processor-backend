import type { DatabaseSettings } from "@dpp/server";
import { freePort } from "@dpp/server/testing";
import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { createConnection } from "mysql2/promise";

/**
 * A MariaDB server in a temporary folder, with database `test` and passwordless `root`. Disposing stops it and
 * deletes the folder.
 */
export interface TestMariaDb extends AsyncDisposable {
    readonly settings: DatabaseSettings;
}

/**
 * Whether `mariadbd` and `mariadb-install-db` are on PATH. Tests that need MariaDB are skipped without them
 * (CI installs the `mariadb-server` package).
 */
export async function hasMariaDb(): Promise<boolean> {
    // Not run with `--help`/`--version`: `mariadb-install-db` exits non-zero for `--help` and treats `--version` as a
    // real install attempt against the system data directory.
    const found = await Promise.all(
        ["mariadbd", "mariadb-install-db"].map(inPath),
    );

    return found.every(Boolean);
}

async function inPath(executable: string): Promise<boolean> {
    for (const directory of (process.env.PATH ?? "").split(delimiter)) {
        try {
            await access(join(directory, executable), constants.X_OK);
            return true;
        } catch {
            // Not in this directory.
        }
    }

    return false;
}

export async function startTestMariaDb(): Promise<TestMariaDb> {
    const directory = await mkdtemp(join(tmpdir(), "score-service-mariadb-"));
    const dataDirectory = join(directory, "data");
    const port = await freePort();
    // `--no-defaults` keeps the system's /etc/mysql configuration out; `--user` lets it run as root too.
    const common = [
        "--no-defaults",
        `--user=${userInfo().username}`,
        `--datadir=${dataDirectory}`,
    ];

    await promisify(execFile)("mariadb-install-db", [
        ...common,
        "--auth-root-authentication-method=normal",
        "--skip-test-db",
    ]);

    const server = spawn(
        "mariadbd",
        [
            ...common,
            `--port=${port.toString()}`,
            "--bind-address=127.0.0.1",
            `--socket=${join(directory, "mariadb.sock")}`,
            `--pid-file=${join(directory, "mariadb.pid")}`,
            "--skip-grant-tables",
            "--skip-log-bin",
        ],
        { stdio: "ignore" },
    );
    const exited = new Promise<void>((resolve) =>
        server.once("exit", () => resolve()),
    );
    const stop = async () => {
        server.kill("SIGTERM");
        await exited;
        await rm(directory, { recursive: true, force: true });
    };

    try {
        await waitUntilReady(port);
    } catch (e) {
        await stop();
        throw e;
    }

    return {
        settings: {
            host: "127.0.0.1",
            port,
            name: "test",
            user: "root",
            password: "",
        },
        [Symbol.asyncDispose]: stop,
    };
}

async function waitUntilReady(port: number): Promise<void> {
    const deadline = Date.now() + 30_000;

    for (;;) {
        try {
            const connection = await createConnection({
                host: "127.0.0.1",
                port,
                user: "root",
            });

            await connection.query("CREATE DATABASE IF NOT EXISTS test");
            await connection.end();
            return;
        } catch (e) {
            if (Date.now() > deadline) {
                throw new Error("MariaDB did not start within 30 s", {
                    cause: e,
                });
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
}
