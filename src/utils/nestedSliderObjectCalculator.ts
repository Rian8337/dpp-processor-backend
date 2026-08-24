import {
    Beatmap,
    BeatmapDifficulty,
    DroidHitWindow,
    DroidPlayableBeatmap,
    HitWindow,
    Modes,
    ModMap,
    ModPrecise,
    ModUtil,
    PreciseDroidHitWindow,
    Slider,
    SliderRepeat,
    SliderTail,
    SliderTick
} from "@rian8337/osu-base";
import { ReplayData } from "@rian8337/osu-droid-replay-analyzer";

/**
 * Represents information summary about obtained slider ticks in a replay.
 */
export interface SliderTickInformation {
    /**
     * The amount of ticks obtained.
     */
    obtained: number;

    /**
     * The total amount of ticks.
     */
    total: number;
}

// TODO: replace with osu-droid-replay-analyzer's built-in method after version bump
/**
 * Obtains the nested object information for sliders in a replay.
 *
 * @param beatmap The beatmap to obtain the information for.
 * @param data The replay data to analyze.
 * @returns An object containing the tick and end information.
 */
export function obtainSliderNestedObjectInformation(
    beatmap: Beatmap | DroidPlayableBeatmap,
    data: ReplayData,
): {
    readonly head: SliderTickInformation;
    readonly tick: SliderTickInformation;
    readonly repeat: SliderTickInformation;
    readonly end: SliderTickInformation;
} {
    let hitWindow: HitWindow;

    if (beatmap instanceof DroidPlayableBeatmap) {
        hitWindow = beatmap.hitWindow;
    } else {
        const mods = data.isReplayV3() ? data.convertedMods : new ModMap();
        const adjustedDifficulty = new BeatmapDifficulty(beatmap.difficulty);

        ModUtil.applyModsToBeatmapDifficulty(adjustedDifficulty, Modes.Droid, mods);

        hitWindow = mods.has(ModPrecise)
            ? new PreciseDroidHitWindow(adjustedDifficulty.od)
            : new DroidHitWindow(adjustedDifficulty.od);
    }

    const head: SliderTickInformation = { obtained: 0, total: beatmap.hitObjects.sliders };
    const tick: SliderTickInformation = { obtained: 0, total: 0 };
    const repeat: SliderTickInformation = { obtained: 0, total: 0 };
    const end: SliderTickInformation = { obtained: 0, total: 0 };

    for (let i = 0; i < data.hitObjectData.length; ++i) {
        const object = beatmap.hitObjects.objects[i];
        const objectData = data.hitObjectData[i];

        if (!(object instanceof Slider)) {
            continue;
        }

        let lateHitThreshold = hitWindow.mehWindow;

        // Before replay version 8, the slider head's hit window is capped to the duration of the slider.
        if (data.replayVersion < 8) {
            lateHitThreshold = Math.min(lateHitThreshold, object.duration);
        }

        if (
            -hitWindow.mehWindow <= objectData.accuracy &&
            objectData.accuracy <= lateHitThreshold
        ) {
            ++head.obtained;
        }

        for (let j = 1; j < object.nestedHitObjects.length; ++j) {
            const nested = object.nestedHitObjects[j];
            let tickInformation: SliderTickInformation;

            switch (true) {
                case nested instanceof SliderTick:
                    tickInformation = tick;
                    break;

                case nested instanceof SliderRepeat:
                    tickInformation = repeat;
                    break;

                case nested instanceof SliderTail:
                    tickInformation = end;
                    break;

                default:
                    continue;
            }

            ++tickInformation.total;

            if (objectData.tickset[j - 1]) {
                ++tickInformation.obtained;
            }
        }
    }

    return { head, tick, repeat, end };
}