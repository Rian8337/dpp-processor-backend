import { createAlgorithm } from "@/algorithms/createAlgorithm";
import { AlgorithmInputError } from "@/algorithms/errors";
import { Modes, ModNoFail, ModDoubleTime, ModUtil } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { readBeatmapFixture } from "@test/utils/fixtures";
import { modMap } from "@test/utils/mods";
import { describe, expect, it, vi } from "vitest";

// Records the options the algorithms construct the analyzer with. No replay fixture exists, so what the analyzer
// does with them is not covered here.
const constructed = vi.hoisted((): unknown[] => []);

vi.mock("@rian8337/osu-droid-replay-analyzer", async (importOriginal) => {
    const original =
        await importOriginal<
            typeof import("@rian8337/osu-droid-replay-analyzer")
        >();

    class RecordingReplayAnalyzer extends original.ReplayAnalyzer {
        constructor(...args: ConstructorParameters<typeof ReplayAnalyzer>) {
            super(...args);
            constructed.push(args[0]);
        }
    }

    return { ...original, ReplayAnalyzer: RecordingReplayAnalyzer };
});

describe.each([Modes.Droid, Modes.Osu])(
    "%s replay analyzer construction",
    (mode) => {
        it("sets difficulty attributes with the deserialized mods before analyzing", async () => {
            constructed.length = 0;
            const algorithm = createAlgorithm(mode);
            const beatmap = algorithm.decodeBeatmap(
                readBeatmapFixture("loveLetter"),
            );
            const mods = modMap(new ModNoFail(), new ModDoubleTime());
            const difficulty = {
                ...algorithm.calculateDifficulty(beatmap, mods),
                mods: mods.serializeMods(),
            };

            // The bytes are not a replay, so analysis fails after the analyzer is constructed.
            await expect(
                algorithm.analyzeReplay(
                    Buffer.from("not a replay"),
                    beatmap,
                    difficulty,
                ),
            ).rejects.toBeInstanceOf(AlgorithmInputError);

            expect(constructed).toHaveLength(1);
            expect(constructed[0]).toMatchObject({
                map: beatmap,
                difficultyAttributes: { starRating: difficulty.starRating },
            });

            const options = constructed[0];
            const attributes =
                typeof options === "object" &&
                options !== null &&
                "difficultyAttributes" in options
                    ? options.difficultyAttributes
                    : undefined;
            const attributeMods =
                typeof attributes === "object" &&
                attributes !== null &&
                "mods" in attributes
                    ? attributes.mods
                    : undefined;

            expect(attributeMods).toEqual(
                ModUtil.deserializeMods(difficulty.mods),
            );
        });
    },
);
