import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { chmod, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { isDebug } from "./util";

/**
 * The directory of local replays.
 */
export const localReplayDirectory = "/hdd/rian/replays";

/**
 * The directory of replays that have not been processed.
 */
export const unprocessedReplayDirectory = `${localReplayDirectory}/unprocessed`;

/**
 * The directory of online replays.
 */
export const onlineReplayDirectory = "/hdd/osudroid/replay";

/**
 * The directory of official replays.
 */
export const officialReplayDirectory = "/hdd/osudroid/bestpp";

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

    if (!scoreID || !originalODR || !data) {
        return false;
    }

    const filePath = join(officialReplayDirectory, `${scoreID.toString()}.odr`);

    return (
        writeFile(filePath, originalODR, { mode: 0o777 })
            // For some reason, the file permission is not set correctly in the call above, so we have to set it again.
            .then(() => chmod(filePath, 0o777))
            .then(() => true)
            .catch(() => false)
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
