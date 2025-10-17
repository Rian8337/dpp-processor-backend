import { RankedStatus } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import { join } from "path";
import { officialDb } from "./database/official";
import { insertBestScore } from "./database/official/officialDatabaseUtil";
import { bestScoresTable, scoresTable } from "./database/official/schema";
import { OfficialDatabaseBestScore } from "./database/official/schema/OfficialDatabaseBestScore";
import { OfficialDatabaseScore } from "./database/official/schema/OfficialDatabaseScore";
import { processorDb } from "./database/processor";
import { scoreCalculationTable } from "./database/processor/schema";
import { getBeatmap } from "./utils/cache/beatmapStorage";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";
import {
    getOfficialBestReplay,
    onlineReplayDirectory,
    saveReplayToOfficialPP,
} from "./utils/replayManager";

function obtainOfficialScore(
    scoreId: number,
): Promise<OfficialDatabaseScore | null> {
    return officialDb
        .select()
        .from(scoresTable)
        .where(eq(scoresTable.id, scoreId))
        .then((res) => res.at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch best score", e);

            return null;
        });
}

function obtainOfficialBestScore(
    scoreId: number,
): Promise<OfficialDatabaseBestScore | null> {
    return officialDb
        .select()
        .from(bestScoresTable)
        .where(eq(bestScoresTable.id, scoreId))
        .then((res) => res.at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch best score", e);

            return null;
        });
}

async function invalidateScore(scoreId: number) {
    await officialDb.transaction(async (tx) => {
        await tx
            .update(scoresTable)
            .set({ pp: null })
            .where(eq(scoresTable.id, scoreId));

        await tx
            .update(bestScoresTable)
            .set({ pp: 0 })
            .where(eq(bestScoresTable.id, scoreId));
    });
}

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

(async () => {
    // Modify this for starting point
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
        id = 23398014;

        await processorDb.insert(scoreCalculationTable).values({
            process_id: processId,
            score_id: id,
        });
    }

    // Modify this for ending point
    while (id <= 23398014) {
        const scoreId = id++;

        await processorDb
            .update(scoreCalculationTable)
            .set({ score_id: id })
            .where(eq(scoreCalculationTable.process_id, processId));

        // Get the current score.
        const score = await obtainOfficialScore(scoreId);
        if (!score || score.score === 0) {
            console.log("Score ID", scoreId, "does not exist");

            await invalidateScore(scoreId);
            continue;
        }

        // Obtain the beatmap of the score.
        const beatmap = await getBeatmap(score.hash);

        if (
            !beatmap ||
            (beatmap.rankedStatus !== RankedStatus.ranked &&
                beatmap.rankedStatus !== RankedStatus.approved)
        ) {
            console.log("Score ID", scoreId, "has an unranked beatmap");

            await invalidateScore(scoreId);
            continue;
        }

        // Determine the highest pp play among all scores.
        let highestPP: number | null = null;
        let highestPPScore: OfficialDatabaseScore | null = null;
        let highestPPReplay: Buffer | null = null;

        // Calculate the pp value of the score.
        const scoreCalcResult = await difficultyCalculator
            .calculateScorePerformance(score, false)
            .catch((e: unknown) => {
                console.error(
                    `Failed to calculate score with ID ${scoreId.toString()}:`,
                    e,
                );

                return null;
            });

        await officialDb.transaction(async (tx) => {
            // Update the pp value of the score.
            if (scoreCalcResult !== null) {
                highestPP =
                    scoreCalcResult.result.total *
                    Math.min(score.ppMultiplier ?? 1, 1);

                await tx
                    .update(scoresTable)
                    .set({ pp: highestPP })
                    .where(eq(scoresTable.id, scoreId));

                highestPPScore = score;
                highestPPReplay = await readFile(
                    join(onlineReplayDirectory, `${scoreId.toString()}.odr`),
                ).catch(() => null);
            } else {
                await tx
                    .update(scoresTable)
                    .set({ pp: null })
                    .where(eq(scoresTable.id, scoreId));
            }
        });

        // Get the current best score.
        const bestScore = await obtainOfficialBestScore(scoreId);

        if (bestScore !== null) {
            // Calculate the pp value of the best score.
            const bestScoreCalcResult = await difficultyCalculator
                .calculateScorePerformance(bestScore, false)
                .catch((e: unknown) => {
                    console.error(
                        `Failed to calculate best score with ID ${scoreId.toString()}:`,
                        e,
                    );

                    return null;
                });

            await officialDb.transaction(async (tx) => {
                // Update the pp value of the best score.
                await tx
                    .update(bestScoresTable)
                    .set({ pp: bestScoreCalcResult?.result.total ?? 0 })
                    .where(eq(bestScoresTable.id, scoreId));

                if (
                    bestScoreCalcResult !== null &&
                    (highestPP === null ||
                        bestScoreCalcResult.result.total > highestPP)
                ) {
                    highestPP =
                        bestScoreCalcResult.result.total *
                        Math.min(bestScore.ppMultiplier, 1);

                    highestPPScore = bestScore;
                    highestPPReplay = await getOfficialBestReplay(scoreId);
                }
            });
        }

        // Necessary so that ESLint does not complain about nullability below.
        highestPP = highestPP as number | null;
        highestPPScore =
            highestPPScore as unknown as OfficialDatabaseScore | null;

        if (highestPP === null || highestPPScore === null) {
            console.log("No valid replay found for score ID", scoreId);
            continue;
        }

        // New best pp obtained - insert to the database.
        const newBestScore: OfficialDatabaseBestScore = {
            ...highestPPScore,
            filename: beatmap.title,
            pp: highestPP,
            ppMultiplier: highestPPScore.ppMultiplier ?? 1,
        };

        const analyzer = new ReplayAnalyzer({ scoreID: scoreId });
        analyzer.originalODR = highestPPReplay;

        await insertBestScore(newBestScore);
        await saveReplayToOfficialPP(analyzer);

        console.log(
            "Processed score ID",
            scoreId,
            "with a pp value of",
            highestPP,
        );
    }

    console.log("Process done");
})().catch((e: unknown) => {
    console.error("Failed to initialize database manager", e);
});
