import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { AlgorithmInputError } from "@/algorithms/errors";
import { Modes, ModUtil } from "@rian8337/osu-base";
import { hasReplayFixture, md5Of, replayFixture } from "@test/utils/fixtures";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe.each([Modes.Droid, Modes.Osu])("%s replay handling", (mode) => {
    const algorithm = createAlgorithm(mode);

    it("rejects bytes that are not a replay", async () => {
        const result = algorithm.readReplay(Buffer.from("not a replay"));

        await expect(result).rejects.toBeInstanceOf(AlgorithmInputError);
        await expect(result).rejects.toMatchObject({ code: "INVALID_REPLAY" });
    });

    describe.skipIf(!hasReplayFixture)("with the v3 replay fixture", () => {
        const replay = hasReplayFixture
            ? readFileSync(replayFixture.replay)
            : Buffer.alloc(0);
        const osuFile = hasReplayFixture
            ? readFileSync(replayFixture.beatmap, "utf8")
            : "";

        it("reads the beatmap hash and mods", async () => {
            const header = await algorithm.readReplay(replay);

            expect(header.beatmapHash).toBe(
                md5Of(readFileSync(replayFixture.beatmap)),
            );
            expect(header.mods).not.toBeNull();
        });

        it("derives score values that cover every object", async () => {
            const header = await algorithm.readReplay(replay);
            const replayMods = header.mods ?? [];
            const beatmap = algorithm.decodeBeatmap(osuFile);
            // readReplay returns serialized mods, the format a replay records them in.
            const difficulty = algorithm.calculateDifficulty(
                beatmap,
                ModUtil.deserializeMods(replayMods),
            );
            const played = { ...difficulty, mods: replayMods };

            const { score, replay: attributes } = await algorithm.analyzeReplay(
                replay,
                beatmap,
                played,
            );
            const objectCount =
                played.hitCircleCount +
                played.sliderCount +
                played.spinnerCount;

            expect(
                (score.n300 ?? 0) +
                    (score.n100 ?? 0) +
                    (score.n50 ?? 0) +
                    (score.nmiss ?? 0),
            ).toBe(objectCount);
            expect(score.combo).toBeGreaterThan(0);
            expect(attributes.sliderTickInformation).not.toBeNull();
            expect(attributes.hitError?.unstableRate).toBeGreaterThanOrEqual(0);

            // The result must be usable for a performance calculation.
            expect(
                algorithm.calculatePerformance(played, score).performance.total,
            ).toBeGreaterThan(0);
        });
    });
});
