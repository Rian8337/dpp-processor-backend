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
    parseOfficialScoreMods,
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
import { PerformanceCalculationParameters } from "./utils/calculator/PerformanceCalculationParameters";
import { Accuracy } from "@rian8337/osu-base";
import { OfficialDatabaseScore } from "./database/official/schema/OfficialDatabaseScore";

config();

function obtainOfficialScore(
    scoreId: number,
): Promise<OfficialDatabaseScore | null> {
    return officialPool
        .query<RowDataPacket[]>(
            `SELECT * FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.score)} WHERE id = ?;`,
            [scoreId],
        )
        .then((res) => (res[0] as OfficialDatabaseScore[]).at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch best score", e);

            return null;
        });
}

function obtainOfficialBestScore(
    scoreId: number,
): Promise<OfficialDatabaseBestScore | null> {
    return officialPool
        .query<RowDataPacket[]>(
            `SELECT * FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)} WHERE id = ?;`,
            [scoreId],
        )
        .then((res) => (res[0] as OfficialDatabaseBestScore[]).at(0) ?? null)
        .catch((e: unknown) => {
            console.error("Failed to fetch best score", e);

            return null;
        });
}

async function obtainOverrideParameters(
    scoreId: number,
    replay: ReplayAnalyzer,
    useBestTable: boolean,
): Promise<PerformanceCalculationParameters | undefined> {
    const { data } = replay;

    if (!data || data.isReplayV3()) {
        return undefined;
    }

    const score = await (
        useBestTable ? obtainOfficialBestScore : obtainOfficialScore
    )(scoreId);

    if (!score) {
        return undefined;
    }

    const parsedMods = parseOfficialScoreMods(score.mode);

    return new PerformanceCalculationParameters({
        accuracy: new Accuracy({
            n300: score.perfect,
            n100: score.good,
            n50: score.bad,
            nmiss: score.miss,
        }),
        combo: score.combo,
        mods: parsedMods.mods,
        customSpeedMultiplier: parsedMods.speedMultiplier,
        forceAR: parsedMods.forceAR,
        forceCS: parsedMods.forceCS,
        forceHP: parsedMods.forceHP,
        forceOD: parsedMods.forceOD,
        oldStatistics: parsedMods.oldStatistics,
    });
}

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
        id = 207695;

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

            const overrideParameters = await obtainOverrideParameters(
                scoreId,
                bestScoreReplay,
                true,
            );

            bestScorePP = await difficultyCalculator
                .calculateReplayPerformance(
                    bestScoreReplay,
                    false,
                    overrideParameters,
                )
                .then((res) => res.result.total)
                .catch((e: unknown) => {
                    console.error(
                        "Failed to calculate score",
                        (e as Error).message,
                    );

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

            const overrideParameters = await obtainOverrideParameters(
                scoreId,
                scoreReplay,
                false,
            );

            scorePP = await difficultyCalculator
                .calculateReplayPerformance(
                    scoreReplay,
                    false,
                    overrideParameters,
                )
                .then((res) => res.result.total)
                .catch((e: unknown) => {
                    console.error(
                        "Failed to calculate score",
                        (e as Error).message,
                    );

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
            const score = await obtainOfficialBestScore(scoreId);

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
