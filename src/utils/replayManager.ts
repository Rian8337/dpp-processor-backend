import {
    HitResult,
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { chmod, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { isDebug } from "./util";
import { IBeatmap, Slider, SliderTick, SliderTail } from "@rian8337/osu-base";
import { SliderTickInformation } from "../structures/SliderTickInformation";

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
export const onlineReplayDirectory = "/hdd/osudroid/odr/replay";

/**
 * The directory of official replays.
 */
export const officialReplayDirectory = "/hdd/osudroid/odr/bestpp";

/**
 * Saves a replay to the official replay folder.
 *
 * @param replay The replay to save.
 * @returns Whether the operation was successful.
 */
export async function saveReplayToOfficialPP(
    replay: ReplayAnalyzer,
): Promise<boolean> {
    const { originalODR, scoreID } = replay;

    if (!scoreID || !originalODR) {
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

/**
 * Obtains the tick and end information for sliders in a replay.
 *
 * @param beatmap The beatmap to obtain the information for.
 * @param data The replay data to analyze.
 * @returns An object containing the tick and end information.
 */
export function obtainTickInformation(
    beatmap: IBeatmap,
    data: ReplayData,
): {
    readonly tick: SliderTickInformation;
    readonly end: SliderTickInformation;
} {
    const tick: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderTicks,
    };

    const end: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderEnds,
    };

    for (let i = 0; i < data.hitObjectData.length; ++i) {
        const object = beatmap.hitObjects.objects[i];
        const objectData = data.hitObjectData[i];

        if (
            objectData.result === HitResult.miss ||
            !(object instanceof Slider)
        ) {
            continue;
        }

        // Exclude the head circle.
        for (let j = 1; j < object.nestedHitObjects.length; ++j) {
            const nested = object.nestedHitObjects[j];

            if (!objectData.tickset[j - 1]) {
                continue;
            }

            if (nested instanceof SliderTick) {
                ++tick.obtained;
            } else if (nested instanceof SliderTail) {
                ++end.obtained;
            }
        }
    }

    return { tick, end };
}
