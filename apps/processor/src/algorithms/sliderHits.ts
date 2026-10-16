import type { ScoreParameters } from "@dpp/shared";
import { AlgorithmInputError } from "./errors";

/**
 * A beatmap's slider objects, as decoded in the processor's mode.
 */
export interface SliderObjectCounts {
    readonly sliders: number;
    readonly ticks: number;
    readonly repeats: number;
    readonly sliderEnds: number;
}

/**
 * Converts slider hit counts (what the game records) to the miss counts the performance calculators take, exactly as
 * `pp-processor-node` does. Scores without hit counts are returned unchanged.
 *
 * @throws {AlgorithmInputError} With code `INVALID_REQUEST` if a hit count exceeds the beatmap's total.
 */
export function convertSliderHits(
    counts: SliderObjectCounts,
    score: ScoreParameters,
): ScoreParameters {
    const {
        sliderHeadHits,
        sliderTickHits,
        sliderRepeatHits,
        sliderEndHits,
        ...rest
    } = score;

    if (
        sliderHeadHits === undefined ||
        sliderTickHits === undefined ||
        sliderRepeatHits === undefined ||
        sliderEndHits === undefined
    ) {
        return score;
    }

    check("sliderHeadHits", sliderHeadHits, counts.sliders, "sliders");
    check("sliderTickHits", sliderTickHits, counts.ticks, "slider ticks");
    check(
        "sliderRepeatHits",
        sliderRepeatHits,
        counts.repeats,
        "slider repeats",
    );
    check("sliderEndHits", sliderEndHits, counts.sliderEnds, "slider ends");

    return {
        ...rest,
        sliderTicksMissed:
            counts.sliders -
            sliderHeadHits +
            (counts.ticks - sliderTickHits) +
            (counts.repeats - sliderRepeatHits),
        sliderEndsDropped: counts.sliderEnds - sliderEndHits,
    };
}

function check(field: string, hits: number, total: number, noun: string) {
    if (hits > total) {
        throw new AlgorithmInputError(
            "INVALID_REQUEST",
            `${field} is ${hits.toString()}, but the beatmap has ${total.toString()} ${noun}`,
        );
    }
}

/**
 * Whether a score carries slider hit counts (the schema guarantees all four or none).
 */
export function hasSliderHits(score: ScoreParameters | undefined): boolean {
    return score?.sliderHeadHits !== undefined;
}
