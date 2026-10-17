import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import { Injectable } from "@dpp/server";
import {
    chmod,
    readdir,
    readFile,
    stat,
    unlink,
    writeFile,
} from "node:fs/promises";
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
        await this.makeReadableByEveryone(path);
    }

    /**
     * The umask can strip bits from the `mode` of a new file, so set them explicitly, as the old code did. Only the
     * owner may change a mode: a file that another user created is left alone, because failing here would undo
     * recording the score.
     */
    private async makeReadableByEveryone(path: string): Promise<void> {
        if (((await stat(path)).mode & 0o777) === 0o777) {
            return;
        }

        try {
            await chmod(path, 0o777);
        } catch (e) {
            if (!isNotPermitted(e)) {
                throw e;
            }

            console.warn(
                `Could not make ${path} readable by everyone: ${e.message}`,
            );
        }
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

    async modifiedAt(
        folder: ReplayFolder,
        fileName: string,
    ): Promise<Date | null> {
        try {
            return (await stat(this.path(folder, fileName))).mtime;
        } catch (e) {
            if (isMissing(e)) {
                return null;
            }

            throw e;
        }
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

function isNotPermitted(error: unknown): error is Error {
    return error instanceof Error && "code" in error && error.code === "EPERM";
}

function isMissing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
