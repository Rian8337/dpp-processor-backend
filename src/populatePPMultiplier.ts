import { eq } from "drizzle-orm";
import { processorDb } from "./database/processor";
import { scoreCalculationTable } from "./database/processor/schema";
import { scoresTable } from "./database/official/schema";
import { officialDb } from "./database/official";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

(async () => {
    const processId = 0;

    let id = await processorDb
        .select()
        .from(scoreCalculationTable)
        .where(eq(scoreCalculationTable.process_id, processId))
        .then((res) => res.at(0)?.score_id ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch calculation progress", e);

            process.exit(1);
        });

    if (!id) {
        // Modify this for starting point
        id = 207695;

        await processorDb.insert(scoreCalculationTable).values({
            process_id: processId,
            score_id: id,
        });
    }

    while (id <= 26000000) {
        // Update progress.
        await processorDb
            .update(scoreCalculationTable)
            .set({ score_id: id })
            .where(eq(scoreCalculationTable.process_id, processId));

        // Fetch the next score to process.
        const score = await officialDb
            .select({
                mode: scoresTable.mode,
                combo: scoresTable.combo,
                perfect: scoresTable.perfect,
                good: scoresTable.good,
                bad: scoresTable.bad,
                miss: scoresTable.miss,
                hash: scoresTable.hash,
                pp: scoresTable.pp,
            })
            .from(scoresTable)
            .where(eq(scoresTable.id, id))
            .limit(1)
            .then((res) => res.at(0) ?? null)
            .catch((e: unknown) => {
                console.error("Failed to fetch score", e);
                return null;
            });

        if (!score) {
            console.log("Score", id++, "does not exist");
            continue;
        }

        if (score.pp === null) {
            console.log("Score", id++, "has no pp, skipping");
            continue;
        }

        const calcResult = await difficultyCalculator.calculateScorePerformance(
            score,
            false,
        );

        await officialDb
            .update(scoresTable)
            .set({
                ppMultiplier:
                    calcResult.result.total === 0
                        ? 1
                        : score.pp / calcResult.result.total,
            })
            .where(eq(scoresTable.id, id));

        // Increment ID for the next iteration.
        console.log("Processed score", id++);
    }
})()
    .catch((e: unknown) => {
        console.error("Failed to initialize database manager", e);
    })
    .finally(() => {
        process.exit(0);
    });
