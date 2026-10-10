import { AlgorithmInputError } from "@/algorithms/errors";
import { convertSliderHits } from "@/algorithms/sliderHits";
import { describe, expect, it } from "vitest";

const counts = { sliders: 10, ticks: 20, repeats: 4, sliderEnds: 10 };

describe("convertSliderHits", () => {
    it("returns the score unchanged without hit counts", () => {
        const score = { nmiss: 1, sliderTicksMissed: 2 };

        expect(convertSliderHits(counts, score)).toEqual(score);
    });

    it("converts hits to misses as pp-processor-node does", () => {
        expect(
            convertSliderHits(counts, {
                n300: 5,
                sliderHeadHits: 9,
                sliderTickHits: 17,
                sliderRepeatHits: 4,
                sliderEndHits: 8,
            }),
        ).toEqual({
            n300: 5,
            // (10 - 9) + (20 - 17) + (4 - 4)
            sliderTicksMissed: 4,
            sliderEndsDropped: 2,
        });
    });

    it("gives zero misses when every slider object was hit", () => {
        expect(
            convertSliderHits(counts, {
                sliderHeadHits: 10,
                sliderTickHits: 20,
                sliderRepeatHits: 4,
                sliderEndHits: 10,
            }),
        ).toEqual({ sliderTicksMissed: 0, sliderEndsDropped: 0 });
    });

    it.each([
        ["sliderHeadHits", 11, "sliders"],
        ["sliderTickHits", 21, "slider ticks"],
        ["sliderRepeatHits", 5, "slider repeats"],
        ["sliderEndHits", 11, "slider ends"],
    ] as const)(
        "rejects %s above the beatmap's total",
        (field, value, noun) => {
            const score = {
                sliderHeadHits: 10,
                sliderTickHits: 20,
                sliderRepeatHits: 4,
                sliderEndHits: 10,
                [field]: value,
            };

            expect(() => convertSliderHits(counts, score)).toThrow(
                new AlgorithmInputError(
                    "INVALID_REQUEST",
                    `${field} is ${value.toString()}, but the beatmap has ${(value - 1).toString()} ${noun}`,
                ),
            );
        },
    );
});
