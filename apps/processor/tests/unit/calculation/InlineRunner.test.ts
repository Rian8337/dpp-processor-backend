import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { InlineRunner } from "@/calculation/InlineRunner";
import {
    CalculationFailedError,
    UnprocessableEntityError,
} from "@/types/errors";
import { Modes } from "@rian8337/osu-base";
import { md5Of, readBeatmapFixture } from "@test/utils/fixtures";
import { describe, expect, it, vi } from "vitest";

describe("InlineRunner", () => {
    const algorithm = createAlgorithm(Modes.Osu);
    const osuFile = readBeatmapFixture("loveLetter");

    it("returns task values", async () => {
        await using runner = new InlineRunner(algorithm);
        const attributes = await runner.calculateDifficulty({
            beatmapHash: md5Of(osuFile),
            osuFile,
            mods: [],
        });

        expect(attributes.starRating).toBeGreaterThan(0);
    });

    it("returns strain charts as buffers", async () => {
        await using runner = new InlineRunner(algorithm);
        const chart = await runner.renderStrainChart({
            beatmapHash: md5Of(osuFile),
            osuFile,
            mods: [],
            clockRate: 1,
            color: "#169c18",
        });

        expect(Buffer.isBuffer(chart)).toBe(true);
    });

    it("throws invalid input as 422 errors", async () => {
        await using runner = new InlineRunner(algorithm);

        await expect(
            runner.readReplay(Buffer.from([0])),
        ).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it("throws calculator failures as 500 errors", async () => {
        await using runner = new InlineRunner(algorithm);

        vi.spyOn(algorithm, "calculateDifficulty").mockImplementationOnce(
            () => {
                throw new Error("boom");
            },
        );

        await expect(
            runner.calculateDifficulty({
                beatmapHash: "other",
                osuFile,
                mods: [],
            }),
        ).rejects.toBeInstanceOf(CalculationFailedError);
    });
});
