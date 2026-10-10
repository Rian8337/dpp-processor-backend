import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import { chmod, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { inject } from "tsyringe";
import type { IReplayStore, ReplayFolder } from "./IReplayStore";

@Injectable(dependencyTokens.replayStore)
export class ReplayStore implements IReplayStore {
    constructor(
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async read(folder: ReplayFolder, fileName: string): Promise<Buffer | null> {
        try {
            return await readFile(this.path(folder, fileName));
        } catch (e) {
            if (isMissing(e)) {
                return null;
            }

            throw e;
        }
    }

    readScoreReplay(folder: "online" | "best", scoreId: number) {
        return this.read(folder, `${scoreId.toString()}.odr`);
    }

    async writeBestReplay(scoreId: number, replay: Buffer): Promise<void> {
        const path = this.path("best", `${scoreId.toString()}.odr`);

        await writeFile(path, replay, { mode: 0o777 });
        // The umask can strip bits from `mode`; set them explicitly, as the old code did.
        await chmod(path, 0o777);
    }

    deleteBestReplay(scoreId: number): Promise<void> {
        return this.delete("best", `${scoreId.toString()}.odr`);
    }

    async list(folder: ReplayFolder): Promise<string[]> {
        const entries = await readdir(this.config.replayDirectories[folder], {
            withFileTypes: true,
        });

        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);
    }

    async delete(folder: ReplayFolder, fileName: string): Promise<void> {
        try {
            await unlink(this.path(folder, fileName));
        } catch (e) {
            if (!isMissing(e)) {
                throw e;
            }
        }
    }

    private path(folder: ReplayFolder, fileName: string): string {
        if (
            basename(fileName) !== fileName ||
            fileName === "." ||
            fileName === ".."
        ) {
            throw new Error(`Invalid replay file name: ${fileName}`);
        }

        return join(this.config.replayDirectories[folder], fileName);
    }
}

function isMissing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
