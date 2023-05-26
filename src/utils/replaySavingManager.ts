import { IModApplicableToDroid, Mod } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { ReadStream } from "fs";
import { readFile, copyFile, writeFile, mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { Util } from "./Util";

const mainDirectory = join(homedir(), "..", "..");

/**
 * The directory of local replays.
 */
export const localReplayDirectory = join(mainDirectory, "data", "dpp-replays");

/**
 * The directory of online replays.
 */
export const onlineReplayDirectory = join(
    mainDirectory,
    "DroidData",
    "osudroid",
    "zip",
    "upload"
);

/**
 * Saves a replay to the disk.
 *
 * @param playerId The ID of the player.
 * @param replayFile The replay file.
 * @returns The path to replay file was saved in if the operation is successful, `null` otherwise.
 */
export async function saveReplay(
    playerId: number,
    replayAnalyzer: ReplayAnalyzer
): Promise<boolean> {
    const { originalODR, data } = replayAnalyzer;
    if (!originalODR || !data) {
        return false;
    }

    const filePath = generateReplayFilePath(
        playerId,
        data.hash,
        data.convertedMods,
        data.speedModification,
        data.forcedAR
    );

    // Ensure directory exists before performing read/write operations.
    await ensureBeatmapDirectoryExists(filePath);

    // Compare accuracy and miss count to determine the incremental ID of the replay.
    let replayIncrementId = 0;
    for (let i = 1; i <= 5; ++i) {
        const replayFile = await readFile(
            join(localReplayDirectory, filePath + "_" + i + ".odr")
        ).catch(() => null);
        if (!replayFile) {
            replayIncrementId = i;
            break;
        }

        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = replayFile;
        await analyzer.analyze();

        if (!analyzer.data) {
            continue;
        }

        // Compare misses first as a more important part of the metric.
        if (data.accuracy.nmiss < analyzer.data.accuracy.nmiss) {
            replayIncrementId = i;
            break;
        }

        if (data.accuracy.value() > analyzer.data.accuracy.value()) {
            replayIncrementId = i;
            break;
        }
    }

    if (replayIncrementId === 0) {
        // Replay does not need saving.
        return true;
    }

    // Overwrite existing incremental IDs.
    for (let i = replayIncrementId; i < 5; ++i) {
        const name = join(localReplayDirectory, filePath);
        const file = await readFile(name + "_" + i + ".odr").catch(() => null);

        if (!file) {
            continue;
        }

        await copyFile(name + "_" + i + ".odr", name + "_" + (i + 1) + ".odr");
    }

    return writeFile(
        join(localReplayDirectory, filePath + `_${replayIncrementId}.odr`),
        originalODR
    )
        .then(() => true)
        .catch(() => false);
}

/**
 * Generates a path for a replay.
 *
 * @param playerId The ID of the player.
 * @param mapMD5 The MD5 hash of the beatmap.
 * @param mods The mods of the replay, either in array of mods or droid string.
 * @param speedModification The speed modification used in the replay.
 * @param forcedAR The force AR value used in the replay.
 * @returns The path to the replay file, without the `.odr` extension.
 */
export function generateReplayFilePath(
    playerId: number,
    mapMD5: string,
    mods: (Mod & IModApplicableToDroid)[],
    speedModification: number = 1,
    forcedAR?: number
) {
    let filePath = join(
        playerId.toString(),
        mapMD5,
        `${Util.sortAlphabet(
            mods.reduce((a, v) => a + v.droidString, "") || "-"
        )}`
    );

    if (speedModification !== 1) {
        filePath += `_${speedModification}x`;
    }

    if (forcedAR !== undefined) {
        filePath += `_AR${forcedAR}`;
    }

    return filePath;
}

/**
 * Persists a replay file.
 *
 * This appends the replay file name with `_persisted.odr`.
 *
 * @param playerId The ID of the player.
 * @param replay The replay to persist.
 * @returns Whether the operation was successful.
 */
export async function persistReplay(
    playerId: number,
    replay: ReplayAnalyzer
): Promise<boolean> {
    const { data, originalODR } = replay;
    if (!data || !originalODR) {
        return false;
    }

    const filePath =
        generateReplayFilePath(
            playerId,
            data.hash,
            data.convertedMods,
            data.speedModification,
            data.forcedAR
        ) + "_persisted.odr";

    return ensureBeatmapDirectoryExists(filePath)
        .then(() =>
            writeFile(join(localReplayDirectory, filePath), originalODR)
        )
        .then(() => true)
        .catch(() => false);
}

/**
 * Gets an online replay file.
 *
 * @param scoreId The ID of the score associated with the replay.
 * @returns The replay file, `null` if not found.
 */
export function getOnlineReplay(
    scoreId: string | number
): Promise<Buffer | null> {
    return readFile(join(onlineReplayDirectory, `${scoreId}.odr`)).catch(
        () => null
    );
}

/**
 * Persists an online replay file.
 *
 * @param playerId The ID of the player.
 * @param scoreId The ID of the score.
 */
export async function persistOnlineReplay(
    playerId: number,
    scoreId: number
): Promise<boolean> {
    const onlineReplayPath = join(onlineReplayDirectory, `${scoreId}.odr`);
    const analyzer = new ReplayAnalyzer({ scoreID: scoreId });
    analyzer.originalODR = await readFile(onlineReplayPath).catch(() => null);

    if (!analyzer.originalODR) {
        return false;
    }

    await analyzer.analyze();
    const { data } = analyzer;
    if (!data) {
        return false;
    }

    const filePath =
        generateReplayFilePath(
            playerId,
            data.hash,
            data.convertedMods,
            data.speedModification,
            data.forcedAR
        ) + "_persisted.odr";

    return ensureBeatmapDirectoryExists(filePath)
        .then(() =>
            writeFile(
                join(localReplayDirectory, filePath),
                analyzer.originalODR!
            )
        )
        .then(() => true)
        .catch(() => false);
}

/**
 * Reads a file stream and returns it as a buffer.
 *
 * @param stream The stream to read.
 * @returns The buffer represented by the read stream.
 */
export function readFileStream(stream: ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("error", (err) => reject(err));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
}

/**
 * Ensures the beatmap directory for a replay exists.
 *
 * @param filePath The path to the replay file.
 * @returns The created path from `mkdir`.
 */
function ensureBeatmapDirectoryExists(
    filePath: string
): Promise<string | undefined> {
    const beatmapDirectory = filePath.split("/");
    beatmapDirectory.pop();

    return mkdir(join(localReplayDirectory, ...beatmapDirectory), {
        recursive: true,
    });
}