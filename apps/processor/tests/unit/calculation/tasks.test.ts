import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { CalculationTaskHandler } from "@/calculation/tasks";
import { ModDoubleTime, ModHardRock, Modes } from "@rian8337/osu-base";
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
});
