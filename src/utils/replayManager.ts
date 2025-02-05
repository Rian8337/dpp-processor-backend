import { IModApplicableToDroid, Mod } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import {
    readFile,
    rm,
    copyFile,
    writeFile,
    mkdir,
    unlink,
    stat,
    chmod,
} from "fs/promises";
import { join } from "path";
import { isDebug, sortAlphabet } from "./util";

/**
 * The directory of local replays.
 */
export const localReplayDirectory = "/data/dpp-replays";

/**
 * The directory of replays that have not been processed.
 */
export const unprocessedReplayDirectory = `${localReplayDirectory}/unprocessed`;

/**
 * The directory of online replays.
 */
export const onlineReplayDirectory = "/DroidData/osudroid/zip/upload";

/**
 * The directory of official replays.
 */
export const officialReplayDirectory = "/data/osudroid/bestpp";

/**
 * Saves a replay to the disk.
 *
 * @param playerId The ID of the player.
 * @param replayFile The replay file.
 * @returns The path to replay file was saved in if the operation is successful, `null` otherwise.
 */
export async function saveReplayToDppSystem(
    playerId: number,
    replayAnalyzer: ReplayAnalyzer,
): Promise<boolean> {
    const { originalODR, data } = replayAnalyzer;
    if (!originalODR || !data) {
        return false;
    }

    const filePath = generateDppSystemReplayFilePath(
        playerId,
        data.hash,
        data.isReplayV3() ? data.convertedMods : undefined,
        data.isReplayV4() ? data.speedMultiplier : undefined,
        data.isReplayV5() ? data.forceCS : undefined,
        data.isReplayV5() ? data.forceAR : undefined,
        data.isReplayV5() ? data.forceOD : undefined,
    );

    // Ensure directory exists before performing read/write operations.
    await ensureReplayDirectoryExists(filePath);

    // Compare accuracy and miss count to determine the incremental ID of the replay.
    let replayIncrementId = 0;
    const { accuracy: newAccuracy } = data;

    for (let i = 1; i <= 5; ++i) {
        const replayPath = join(
            localReplayDirectory,
            `${filePath}_${i.toString()}.odr`,
        );
        const replayFile = await readFile(replayPath).catch(() => null);
        if (!replayFile) {
            replayIncrementId = i;
            break;
        }

        const analyzer = new ReplayAnalyzer({ scoreID: 0 });
        analyzer.originalODR = replayFile;
        await analyzer.analyze().catch(() => null);

        if (!analyzer.data) {
            continue;
        }

        const { accuracy: oldAccuracy } = analyzer.data;

        if (newAccuracy.equals(oldAccuracy)) {
            // Same accuracy and miss count found - compare combo if available,
            // otherwise overwrite replay without changing increment ID.
            if (data.isReplayV3() && analyzer.data.isReplayV3()) {
                // Combo data is available.
                if (data.maxCombo > analyzer.data.maxCombo) {
                    // New replay with better combo - increment replay ID.
                    replayIncrementId = i;
                    break;
                } else if (data.maxCombo === analyzer.data.maxCombo) {
                    // Same combo as well - overwrite replay without changing increment ID.
                    return writeFile(replayPath, originalODR)
                        .then(() => true)
                        .catch(() => false);
                }
            } else {
                // Combo data is not available - overwrite replay without changing increment ID.
                return writeFile(replayPath, originalODR)
                    .then(() => true)
                    .catch(() => false);
            }

            continue;
        }

        // Compare misses first as a more important part of the metric.
        if (
            newAccuracy.nmiss < oldAccuracy.nmiss ||
            newAccuracy.value() > oldAccuracy.value()
        ) {
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
        const nameWithIncrementId = `${name}_${i.toString()}.odr`;
        const file = await readFile(nameWithIncrementId).catch(() => null);

        if (!file) {
            continue;
        }

        await copyFile(
            nameWithIncrementId,
            `${name}_${(i + 1).toString()}.odr`,
        );
    }

    return writeFile(
        join(
            localReplayDirectory,
            `${filePath}_${replayIncrementId.toString()}.odr`,
        ),
        originalODR,
    )
        .then(() => true)
        .catch(() => false);
}

/**
 * Saves a replay to the official replay folder.
 *
 * @param replay The replay to save.
 * @returns Whether the operation was successful.
 */
export async function saveReplayToOfficialPP(
    replay: ReplayAnalyzer,
): Promise<boolean> {
    const { originalODR, data, scoreID } = replay;

    if (!originalODR || !data) {
        return false;
    }

    const filePath = join(officialReplayDirectory, `${scoreID.toString()}.odr`);

    return (
        ensureReplayDirectoryExists(filePath)
            .then(() => writeFile(filePath, originalODR, { mode: 0o777 }))
            // For some reason, the file permission is not set correctly in the call above, so we have to set it again.
            .then(() => chmod(filePath, 0o777))
            .then(() => true)
            .catch(() => false)
    );
}

/**
 * Generates a path for a replay.
 *
 * @param playerId The ID of the player.
 * @param mapMD5 The MD5 hash of the beatmap.
 * @param mods The mods of the replay, either in array of mods or droid string.
 * @param customSpeedMultiplier The custom speed multiplier used in the replay.
 * @param forceCS The force CS value used in the replay.
 * @param forceAR The force AR value used in the replay.
 * @param forceOD The force OD value used in the replay.
 * @returns The path to the replay file, without the `.odr` extension.
 */
export function generateDppSystemReplayFilePath(
    playerId: number,
    mapMD5: string,
    mods: (Mod & IModApplicableToDroid)[] = [],
    customSpeedMultiplier = 1,
    forceCS?: number,
    forceAR?: number,
    forceOD?: number,
) {
    let filePath = join(
        playerId.toString(),
        mapMD5,
        sortAlphabet(mods.reduce((a, v) => a + v.droidString, "") || "-"),
    );

    if (customSpeedMultiplier !== 1) {
        filePath += `_${customSpeedMultiplier.toString()}x`;
    }

    if (forceCS !== undefined) {
        filePath += `_CS${forceCS.toString()}`;
    }
    if (forceAR !== undefined) {
        filePath += `_AR${forceAR.toString()}`;
    }
    if (forceOD !== undefined) {
        filePath += `_OD${forceOD.toString()}`;
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
export async function persistReplayToDppSystem(
    playerId: number,
    replay: ReplayAnalyzer,
): Promise<boolean> {
    const { data, originalODR } = replay;
    if (!data || !originalODR) {
        return false;
    }

    const filePath =
        generateDppSystemReplayFilePath(
            playerId,
            data.hash,
            data.isReplayV3() ? data.convertedMods : undefined,
            data.isReplayV4() ? data.speedMultiplier : undefined,
            data.isReplayV5() ? data.forceCS : undefined,
            data.isReplayV5() ? data.forceAR : undefined,
            data.isReplayV5() ? data.forceOD : undefined,
        ) + "_persisted.odr";

    return ensureReplayDirectoryExists(filePath)
        .then(() =>
            writeFile(join(localReplayDirectory, filePath), originalODR),
        )
        .then(() => true)
        .catch(() => false);
}

/**
 * Gets a replay file from the local replay folder.
 *
 * @param playerId The ID of the player.
 * @param mapMD5 The MD5 hash of the beatmap.
 * @param mods The mods of the replay.
 * @param customSpeedMultiplier The custom speed multiplier used in the replay.
 * @returns The replay file, `null` if not found.
 */
export async function getDppSystemPersistedReplay(
    playerId: number,
    mapMD5: string,
    mods: (Mod & IModApplicableToDroid)[],
    customSpeedMultiplier = 1,
): Promise<Buffer | null> {
    if (isDebug) {
        // Debug should not have access to persisted replays.
        return null;
    }

    return readFile(
        join(
            localReplayDirectory,
            generateDppSystemReplayFilePath(
                playerId,
                mapMD5,
                mods,
                customSpeedMultiplier,
            ) + "_persisted.odr",
        ),
    ).catch(() => null);
}

/**
 * Gets a replay file from the unprocessed replay folder.
 *
 * @param filename The name of the replay file.
 * @returns The replay file, `null` if not found.
 */
export async function getUnprocessedReplay(
    filename: string,
): Promise<Buffer | null> {
    return isDebug
        ? null
        : readFile(join(unprocessedReplayDirectory, filename)).catch(
              () => null,
          );
}

/**
 * Deletes a replay file from the unprocessed replay folder.
 *
 * @param path The path to the replay file.
 */
export async function deleteUnprocessedReplay(path: string): Promise<void> {
    if (isDebug) {
        // Debug should not have access to unprocessed replays.
        return;
    }

    return unlink(path);
}

/**
 * Gets an online replay file.
 *
 * @param scoreId The ID of the score associated with the replay.
 * @returns The replay file, `null` if not found.
 */
export function getOnlineReplay(
    scoreId: string | number,
): Promise<Buffer | null> {
    return isDebug
        ? fetch(`https://osudroid.moe/api/upload/${scoreId.toString()}.odr`)
              .then((res) => res.arrayBuffer())
              .then((res) => Buffer.from(res))
              .catch(() => null)
        : readFile(
              join(onlineReplayDirectory, `${scoreId.toString()}.odr`),
          ).catch(() => null);
}

/**
 * Gets the official best replay of a score in terms of dpp.
 *
 * @param scoreId The ID of the score.
 * @returns The replay file, `null` if not found.
 */
export function getOfficialBestReplay(
    scoreId: string | number,
): Promise<Buffer | null> {
    return isDebug
        ? fetch(`https://osudroid.moe/api/bestpp/${scoreId.toString()}.odr`)
              .then((res) => res.arrayBuffer())
              .then((res) => Buffer.from(res))
              .catch(() => null)
        : readFile(
              join(officialReplayDirectory, `${scoreId.toString()}.odr`),
          ).catch(() => null);
}

/**
 * Deletes all replays of a player from a beatmap.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 */
export async function deleteReplays(
    uid: number | string,
    hash: string,
): Promise<boolean> {
    if (isDebug) {
        // Debug should not have access to local replays.
        return false;
    }

    return rm(join(localReplayDirectory, uid.toString(), hash), {
        recursive: true,
    })
        .then(() => true)
        .catch(() => false);
}

/**
 * Checks if a score was submitted by looking at the replay directory.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 */
export async function wasBeatmapSubmitted(
    uid: number,
    hash: string,
): Promise<boolean> {
    if (isDebug) {
        // Debug should not have access to local replays.
        return false;
    }

    const dirStat = await stat(
        join(localReplayDirectory, uid.toString(), hash),
    ).catch(() => null);

    return dirStat?.isDirectory() ?? false;
}

/**
 * Ensures the directory for a replay exists.
 *
 * @param filePath The path to the replay file.
 * @returns The created path from `mkdir`.
 */
async function ensureReplayDirectoryExists(
    filePath: string,
): Promise<string | undefined> {
    if (isDebug) {
        // Debug should not have access to local replays.
        return;
    }

    const beatmapDirectory = filePath.split("/");
    beatmapDirectory.pop();

    return mkdir(join(localReplayDirectory, ...beatmapDirectory), {
        recursive: true,
    });
}
