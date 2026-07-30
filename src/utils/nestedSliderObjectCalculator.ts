import {
    HitResult,
    IBeatmap,
    Slider,
    SliderRepeat,
    SliderTail,
    SliderTick,
} from "@rian8337/osu-base";
import { ReplayData } from "@rian8337/osu-droid-replay-analyzer";
import { SliderTickInformation } from "../structures/SliderTickInformation";

/**
 * Obtains the nested object information for sliders in a replay.
 *
 * @param beatmap The beatmap to obtain the information for.
 * @param data The replay data to analyze.
 * @returns An object containing the tick and end information.
 */
export function obtainSliderNestedObjectInformation(
    beatmap: IBeatmap,
    data: ReplayData,
): {
    readonly head: SliderTickInformation;
    readonly tick: SliderTickInformation;
    readonly repeat: SliderTickInformation;
    readonly end: SliderTickInformation;
} {
    const head: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliders,
    };

    const tick: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderTicks,
    };

    const repeat: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderRepeatPoints,
    };

    const end: SliderTickInformation = {
        obtained: 0,
        total: beatmap.hitObjects.sliderEnds,
    };

    for (let i = 0; i < data.hitObjectData.length; ++i) {
        const object = beatmap.hitObjects.objects[i];
        const objectData = data.hitObjectData[i];

        if (
            objectData.result === HitResult.Miss ||
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

            switch (true) {
                case nested instanceof SliderTick:
                    ++tick.obtained;
                    break;

                case nested instanceof SliderRepeat:
                    ++repeat.obtained;
                    break;

                case nested instanceof SliderTail:
                    ++end.obtained;
                    break;
            }
        }
    }

    return { head, tick, repeat, end };
}
