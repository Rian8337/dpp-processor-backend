import { config } from "dotenv";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";
import { ProcessorDatabaseScoreCalculation } from "./database/processor/schema/ProcessorDatabaseScoreCalculation";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import {
    getOfficialBestReplay,
    getOnlineReplay,
    saveReplayToOfficialPP,
} from "./utils/replayManager";
import {
    insertBestScore,
    updateBestScorePPValue,
    updateOfficialScorePPValue,
} from "./database/official/officialDatabaseUtil";
import { officialPool } from "./database/official/OfficialDatabasePool";
import { RowDataPacket } from "mysql2";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./database/official/OfficialDatabaseTables";
import { OfficialDatabaseBestScore } from "./database/official/schema/OfficialDatabaseBestScore";

config();

const difficultyCalculator = new BeatmapDroidDifficultyCalculator();

(async () => {
    let id = await processorPool
        .query<ProcessorDatabaseScoreCalculation>(
            `SELECT id FROM ${ProcessorDatabaseTables.scoreCalculation};`,
        )
        .then((res) => res.rows.at(0)?.id ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch calculation progress", e);

            process.exit(1);
        });

    if (!id) {
        id = 1;

        await processorPool.query(
            `INSERT INTO ${ProcessorDatabaseTables.scoreCalculation} (id) VALUES (1);`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
        const scoreId = id++;

        console.log("Calculating score with ID", scoreId);

        // Update current progress.
        await processorPool.query(
            `UPDATE ${ProcessorDatabaseTables.scoreCalculation} SET id = $1;`,
            [id],
        );

        let scoreReplay: ReplayAnalyzer | null = null;
        let scorePP: number | null = null;
        let bestScorePP: number | null = null;

        // Check if the replay file of the best score exists.
        const bestReplayFile = await getOfficialBestReplay(scoreId);

        if (bestReplayFile) {
            // Get score pp from calculation backend.
            const bestScoreReplay = new ReplayAnalyzer({ scoreID: scoreId });
            bestScoreReplay.originalODR = bestReplayFile;

            await bestScoreReplay.analyze().catch(() => {
                console.error(
                    `Score of ID ${scoreId.toString()} cannot be parsed`,
                );
            });

            bestScorePP = await difficultyCalculator
                .calculateReplayPerformance(bestScoreReplay)
                .then((res) => res.result.total)
                .catch((e: unknown) => {
                    console.error("Failed to calculate score", e);

                    return null;
                });

            if (bestScorePP !== null) {
                // Update the score with the pp.
                await updateBestScorePPValue(scoreId, bestScorePP);
            }
        }

        // Check if the replay file of the score exists.
        const replayFile = await getOnlineReplay(id);

        if (replayFile) {
            // Get score pp from calculation backend.
            scoreReplay = new ReplayAnalyzer({ scoreID: scoreId });
            scoreReplay.originalODR = replayFile;

            await scoreReplay.analyze().catch(() => {
                console.error(
                    `Score of ID ${scoreId.toString()} cannot be parsed`,
                );
            });

            scorePP = await difficultyCalculator
                .calculateReplayPerformance(scoreReplay)
                .then((res) => res.result.total)
                .catch((e: unknown) => {
                    console.error("Failed to calculate score", e);

                    return null;
                });

            // Update the score with the pp.
            await updateOfficialScorePPValue(scoreId, scorePP);
        }

        if (
            scoreReplay?.originalODR &&
            scorePP !== null &&
            bestScorePP !== null &&
            scorePP > bestScorePP
        ) {
            const score = await officialPool
                .query<RowDataPacket[]>(
                    `SELECT * FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.score)} WHERE id = ?;`,
                    [scoreId],
                )
                .then(
                    (res) =>
                        (res[0] as OfficialDatabaseBestScore[]).at(0) ?? null,
                )
                .catch((e: unknown) => {
                    console.error("Failed to fetch best score", e);

                    return null;
                });

            if (!score) {
                continue;
            }

            await insertBestScore(score);
            await saveReplayToOfficialPP(scoreReplay);
        }

        console.log("Successfully calculated score with ID", scoreId);
    }
})().catch((e: unknown) => {
    console.error("Failed to connect to the database", e);

    process.exit(1);
});
