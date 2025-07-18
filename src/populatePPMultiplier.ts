import { eq, isNull } from "drizzle-orm";
import { officialDb } from "./database/official";
import { bestScoresTable } from "./database/official/schema";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

(async () => {
    const table = bestScoresTable;

    const scores = await officialDb
        .select({
            id: table.id,
            mods: table.mods,
            combo: table.combo,
            perfect: table.perfect,
            good: table.good,
            bad: table.bad,
            miss: table.miss,
            hash: table.hash,
            pp: table.pp,
        })
        .from(table)
        .where(isNull(table.ppMultiplier));

    for (let i = 0; i < scores.length; ++i) {
        const score = scores[i];

        const calcResult = await difficultyCalculator
            .calculateScorePerformance(score, false)
            .catch((e: unknown) => {
                console.error(
                    "Failed to calculate score performance for score",
                    score.id,
                    `(${(i + 1).toString()}/${scores.length.toString()})`,
                    e,
                );

                return null;
            });

        if (!calcResult) {
            continue;
        }

        await officialDb
            .update(table)
            .set({
                ppMultiplier:
                    calcResult.result.total === 0
                        ? 1
                        : Math.min(1, score.pp / calcResult.result.total),
            })
            .where(eq(table.id, score.id));

        // Increment ID for the next iteration.
        console.log(
            "Processed score",
            score.id,
            `(${(i + 1).toString()}/${scores.length.toString()})`,
        );
    }
})()
    .catch((e: unknown) => {
        console.error("Failed to initialize database manager", e);
    })
    .finally(() => {
        process.exit(0);
    });
