import {
    freePort,
    startProcess,
    startTestPostgres,
    type StartedProcess,
    type TestPostgres,
} from "@dpp/server/testing";
import { Modes } from "@rian8337/osu-base";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtempDisposable } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const brokerDir = fileURLToPath(new URL("../../", import.meta.url));
const processorDir = join(brokerDir, "..", "processor");
const processorApiKey = "e2e-processor-key-0123456789";
const variant = "e2e-broker-droid";

function databaseEnvironment(postgres: TestPostgres): NodeJS.ProcessEnv {
    return {
        DATABASE_HOST: "127.0.0.1",
        DATABASE_PORT: postgres.port.toString(),
        DATABASE_NAME: "postgres",
        DATABASE_USER: "postgres",
        DATABASE_PASSWORD: "",
    };
}

describe("broker (e2e)", () => {
    const resources = new AsyncDisposableStack();
    let broker: StartedProcess;
    let brokerEnvironment: NodeJS.ProcessEnv;
    let baseUrl: string;
    let clientKey: string;

    const cli = async (...args: string[]) =>
        (
            await promisify(execFile)(
                "node",
                [join(brokerDir, "dist", "cli.mjs"), ...args],
                {
                    env: brokerEnvironment,
                },
            )
        ).stdout;

    beforeAll(async () => {
        execFileSync("pnpm", ["run", "build"], {
            cwd: brokerDir,
            stdio: "inherit",
        });

        // Processor snapshots must sit below apps/processor to resolve their external packages.
        const releasesRoot = join(processorDir, "releases");

        await mkdir(releasesRoot, { recursive: true });

        const releases = resources.use(
            await mkdtempDisposable(join(releasesRoot, "e2e-broker-")),
        );

        execFileSync(
            "node",
            [
                "scripts/build-variant.ts",
                variant,
                "--mode",
                Modes.Droid,
                "--algorithm",
                "live",
                "--releases-dir",
                releases.path,
                "--activate",
            ],
            { cwd: processorDir, stdio: "inherit" },
        );

        const processorDatabase = resources.use(await startTestPostgres());
        const brokerDatabase = resources.use(await startTestPostgres());
        const processorPort = await freePort();
        const brokerPort = await freePort();

        baseUrl = `http://127.0.0.1:${brokerPort.toString()}`;

        resources.use(
            await startProcess({
                script: join(releases.path, variant, "current", "index.mjs"),
                env: {
                    ...process.env,
                    CI: "1",
                    PORT: processorPort.toString(),
                    ...databaseEnvironment(processorDatabase),
                    // Never called: the test uploads its beatmap.
                    BEATMAP_SERVICE_URL: "http://127.0.0.1:9/api/beatmap",
                    API_KEY: processorApiKey,
                    CALCULATION_THREADS: "1",
                },
                readyUrl: `http://127.0.0.1:${processorPort.toString()}/info`,
            }),
        );

        brokerEnvironment = {
            ...process.env,
            CI: "1",
            PORT: brokerPort.toString(),
            ...databaseEnvironment(brokerDatabase),
            PROCESSOR_API_KEY: processorApiKey,
            HEALTH_CHECK_INTERVAL_SECONDS: "1",
            USAGE_SUMMARY_INTERVAL_SECONDS: "3600",
        };

        // Registered before the broker starts: the CLI applies migrations itself.
        await cli("variant", "add", variant, "--public");
        await cli(
            "instance",
            "add",
            variant,
            "--port",
            processorPort.toString(),
        );
        await cli("alias", "set", "live-droid", variant);

        const created = await cli("key", "create", "e2e", "--unlimited");

        clientKey = /^Key: (\S+)$/m.exec(created)?.[1] ?? "";

        if (!/^[A-Za-z0-9_-]{43}$/.test(clientKey)) {
            throw new Error(`Unexpected key output: ${created}`);
        }

        broker = resources.use(
            await startProcess({
                script: join(brokerDir, "dist", "index.mjs"),
                env: brokerEnvironment,
                readyUrl: `${baseUrl}/variants`,
            }),
        );
    });

    afterAll(() => resources.disposeAsync());

    it("lists the registered processor with details from its /info", async () => {
        const response = await fetch(`${baseUrl}/variants`);

        expect(await response.json()).toEqual([
            {
                name: variant,
                title: null,
                aliases: ["live-droid"],
                description: null,
                public: true,
                available: true,
                healthyInstanceCount: 1,
                mode: Modes.Droid,
                algorithm: "live",
                calculatorVersion: expect.stringMatching(/^[0-9a-f]{16}$/),
                builtAt: expect.any(String),
            },
        ]);
        expect(broker.output()).toContain(
            "[broker] Loaded registry: 1 variants",
        );
    });

    it("calculates difficulty through the broker by alias", async () => {
        const file = readFileSync(
            join(
                processorDir,
                "tests",
                "fixtures",
                "beatmaps",
                "love-letter.osu",
            ),
            "utf8",
        );
        const response = await fetch(
            `${baseUrl}/variants/live-droid/difficulty`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": clientKey,
                },
                body: JSON.stringify({ beatmap: { file } }),
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("x-variant")).toBe(variant);
        expect(await response.json()).toMatchObject({
            difficulty: { starRating: expect.any(Number) },
        });
    });

    it.each([
        [["varient", "list"], "Usage:"],
        [["instance", "add", variant], "Pass exactly one of --port or --url"],
    ])(
        "reports CLI usage errors (%j) before reading any configuration",
        async (args, message) => {
            const failure = await promisify(execFile)(
                "node",
                [join(brokerDir, "dist", "cli.mjs"), ...args],
                { env: { PATH: process.env.PATH, CI: "1" } },
            ).then(
                () => {
                    throw new Error("expected the CLI to fail");
                },
                (e: unknown) => e as { code: number; stderr: string },
            );

            expect(failure.code).toBe(1);
            expect(failure.stderr).toContain(message);
            expect(failure.stderr).not.toContain("DATABASE_");
        },
    );

    it("rejects an unknown key", async () => {
        const response = await fetch(`${baseUrl}/variants`, {
            headers: { "X-Api-Key": "not-a-key" },
        });

        expect(response.status).toBe(401);
    });

    it("applies CLI changes immediately after SIGHUP", async () => {
        await cli("alias", "set", "sighup-alias", variant);
        broker.child.kill("SIGHUP");

        await vi.waitFor(
            async () => {
                const response = await fetch(
                    `${baseUrl}/variants/sighup-alias`,
                );

                expect(response.status).toBe(200);
            },
            { timeout: 5000, interval: 100 },
        );
        expect(broker.output()).toContain("Reloaded registry:");
    });

    it("shuts down cleanly on SIGTERM and logs a final usage summary", async () => {
        broker.child.kill("SIGTERM");

        expect(await broker.exited).toBe(0);
        expect(broker.output()).toContain("Received SIGTERM");
        expect(broker.output()).toMatch(
            /Usage over \d+ s: variant e2e-broker-droid: 1 requests/,
        );
        expect(broker.output()).not.toContain("did not finish within");
    });
});
