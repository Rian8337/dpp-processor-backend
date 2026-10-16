import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { CalculationTaskHandler } from "@/calculation/tasks";
import {
    BeatmapDecoder,
    ModDoubleTime,
    ModHardRock,
    Modes,
    Slider,
    SliderRepeat,
    SliderTick,
} from "@rian8337/osu-base";
import { md5Of, readBeatmapFixture } from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it, vi } from "vitest";

describe("CalculationTaskHandler", () => {
    const algorithm = createAlgorithm(Modes.Droid);
    const osuFile = readBeatmapFixture("discoprince");
    const beatmapHash = md5Of(osuFile);

    it("calculates difficulty", async () => {
        const handler = new CalculationTaskHandler(algorithm);
        const outcome = await handler.handle({
            kind: "difficulty",
            beatmapHash,
            osuFile,
            mods: modMap(new ModHardRock()).serializeMods(),
        });

        expect(outcome).toEqual({
            ok: true,
            value: algorithm.calculateDifficulty(
                algorithm.decodeBeatmap(osuFile),
                modMap(new ModHardRock()),
            ),
        });
    });

    it("decodes each beatmap once while it stays cached", async () => {
        const decode = vi.spyOn(algorithm, "decodeBeatmap");
        const handler = new CalculationTaskHandler(algorithm);

        await handler.handle({
            kind: "difficulty",
            beatmapHash,
            osuFile,
            mods: [],
        });
        await handler.handle({
            kind: "difficulty",
            beatmapHash,
            osuFile,
            mods: modMap(new ModDoubleTime()).serializeMods(),
        });

        expect(decode).toHaveBeenCalledTimes(1);
    });

    it("renders a strain chart as PNG bytes", async () => {
        const handler = new CalculationTaskHandler(algorithm);
        const outcome = await handler.handle({
            kind: "strainChart",
            beatmapHash,
            osuFile,
            mods: [],
            clockRate: 1,
            color: "#3168e8",
        });

        if (!outcome.ok || !(outcome.value instanceof Uint8Array)) {
            throw new Error("expected PNG bytes");
        }

        expect(Buffer.from(outcome.value).subarray(1, 4).toString()).toBe(
            "PNG",
        );
    });

    it("reports invalid input with its code", async () => {
        const handler = new CalculationTaskHandler(algorithm);

        expect(
            await handler.handle({
                kind: "difficulty",
                beatmapHash: "x",
                osuFile: "garbage",
                mods: [],
            }),
        ).toEqual({
            ok: false,
            code: "INVALID_BEATMAP",
            message: "Beatmap has no hit objects",
        });

        expect(
            await handler.handle({
                kind: "readReplay",
                replay: new Uint8Array([1, 2, 3]),
            }),
        ).toMatchObject({
            ok: false,
            code: "INVALID_REPLAY",
        });
    });

    it("reports unexpected errors as calculation failures", async () => {
        const handler = new CalculationTaskHandler(algorithm);

        vi.spyOn(algorithm, "calculateDifficulty").mockImplementationOnce(
            () => {
                throw new Error("calculator exploded");
            },
        );

        expect(
            await handler.handle({
                kind: "difficulty",
                beatmapHash,
                osuFile,
                mods: [],
            }),
        ).toEqual({
            ok: false,
            code: "CALCULATION_FAILED",
            message: "calculator exploded",
        });
    });

    it.each([Modes.Droid, Modes.Osu])(
        "counts slider objects like pp-processor-node in %s",
        async (mode) => {
            const loveLetter = readBeatmapFixture("loveLetter");
            const handler = new CalculationTaskHandler(createAlgorithm(mode));

            // pp-processor-node's loop, run on the same decode the handler uses.
            const beatmap = new BeatmapDecoder().decode(
                loveLetter,
                mode,
            ).result;
            let ticks = 0;
            let repeats = 0;

            for (const object of beatmap.hitObjects.objects) {
                if (object instanceof Slider) {
                    for (const nested of object.nestedHitObjects) {
                        if (nested instanceof SliderTick) {
                            ++ticks;
                        } else if (nested instanceof SliderRepeat) {
                            ++repeats;
                        }
                    }
                }
            }

            const outcome = await handler.handle({
                kind: "sliderObjectCounts",
                beatmapHash: "loveletter",
                osuFile: loveLetter,
            });

            expect(outcome).toEqual({
                ok: true,
                value: {
                    sliders: beatmap.hitObjects.sliders,
                    ticks,
                    repeats,
                    sliderEnds: beatmap.hitObjects.sliders,
                },
            });
            expect(ticks).toBeGreaterThan(0);
        },
    );
});
