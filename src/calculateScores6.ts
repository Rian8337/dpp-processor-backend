import { Accuracy, RankedStatus, ScoreRank } from "@rian8337/osu-base";
import {
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { readFile, unlink } from "fs/promises";
import { join } from "path";
import { officialDb } from "./database/official";
import {
    insertBestScore,
    parseOfficialScoreMods,
} from "./database/official/officialDatabaseUtil";
import { bestScoresTable, scoresTable } from "./database/official/schema";
import { OfficialDatabaseBestScore } from "./database/official/schema/OfficialDatabaseBestScore";
import { OfficialDatabaseScore } from "./database/official/schema/OfficialDatabaseScore";
import { processorDb } from "./database/processor";
import { scoreCalculationTable } from "./database/processor/schema";
import { getBeatmap } from "./utils/cache/beatmapStorage";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";
import { PerformanceCalculationParameters } from "./utils/calculator/PerformanceCalculationParameters";
import { constructModString } from "./utils/dppUtil";
import {
    getOfficialBestReplay,
    officialReplayDirectory,
    onlineReplayDirectory,
    saveReplayToOfficialPP,
} from "./utils/replayManager";
import { sortAlphabet } from "./utils/util";

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

function isReplayValid(
    databaseScore: OfficialDatabaseScore,
    replayData: ReplayData,
): boolean {
    // Wrap the score in a Score object.
    const score = new Score({
        ...databaseScore,
        username: "",
        mark: databaseScore.mark as ScoreRank,
        date: databaseScore.date.getTime(),
    });

    // For replay v1 and v2, there is not that much information - just check the accuracy and hash.
    if (
        score.hash !== replayData.hash ||
        !score.accuracy.equals(replayData.accuracy) ||
        // Also check if the accuracy is "empty", as in there are no hits at all.
        Number.isNaN(replayData.accuracy.value())
    ) {
        return false;
    }

    // Replay v3 has way more information - compare all relevant ones.
    if (replayData.isReplayV3()) {
        if (
            score.score !== replayData.score ||
            score.combo !== replayData.maxCombo ||
            databaseScore.geki !== replayData.hit300k ||
            databaseScore.katu !== replayData.hit100k ||
            score.rank !== replayData.rank
        ) {
            return false;
        }

        // Mods are compared later as they are more costly.
        const scoreMods = sortAlphabet(
            score.mods.reduce((a, v) => a + v.droidString, ""),
        );

        const replayMods = sortAlphabet(
            replayData.convertedMods.reduce((a, v) => a + v.droidString, ""),
        );

        if (scoreMods !== replayMods) {
            return false;
        }
    }

    // Replay v4 only has speed multiplier.
    if (
        replayData.isReplayV4() &&
        score.speedMultiplier !== replayData.speedMultiplier
    ) {
        return false;
    }

    // Replay v5 has forced statistics.
    if (
        replayData.isReplayV5() &&
        (score.forceCS !== replayData.forceCS ||
            score.forceAR !== replayData.forceAR ||
            score.forceOD !== replayData.forceOD ||
            score.forceHP !== replayData.forceHP)
    ) {
        return false;
    }

    // Replay v6? Well... nothing new to check there, so let's end it here.
    return true;
}

async function invalidateScore(scoreId: number) {
    await officialDb.transaction(async (tx) => {
        await tx
            .update(scoresTable)
            .set({ pp: null })
            .where(eq(scoresTable.id, scoreId));

        await tx.delete(scoresTable).where(eq(scoresTable.id, scoreId));
    });

    await unlink(
        join(officialReplayDirectory, `${scoreId.toString()}.odr`),
    ).catch(() => null);
}

function obtainOverrideParameters(
    score: OfficialDatabaseScore,
    replay: ReplayAnalyzer,
): PerformanceCalculationParameters | null {
    const { data } = replay;

    if (!data?.isReplayV3()) {
        return null;
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
    // Modify this for starting point
    const processId = 5;

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
        id = 13000001;

        await processorDb.insert(scoreCalculationTable).values({
            process_id: processId,
            score_id: id,
        });
    }

    // Modify this for ending point
    while (id <= 15600000) {
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
            ((beatmap.rankedStatus as RankedStatus) !== RankedStatus.ranked &&
                (beatmap.rankedStatus as RankedStatus) !==
                    RankedStatus.approved)
        ) {
            console.log("Score ID", scoreId, "has an unranked beatmap");

            // Beatmap is not found - mark the score's pp as null and delete the best score.
            await invalidateScore(scoreId);
            continue;
        }

        // Determine the highest pp play among all scores.
        let highestPP: number | null = null;
        let highestPPReplay: ReplayAnalyzer | null = null;

        // Obtain the replay of the top score in terms of score.
        const scoreReplay = new ReplayAnalyzer({ scoreID: scoreId });
        scoreReplay.originalODR = await readFile(
            join(onlineReplayDirectory, `${scoreId.toString()}.odr`),
        ).catch(() => null);

        if (scoreReplay.originalODR) {
            await scoreReplay.analyze().catch(() => {
                console.error(
                    "Top score replay of score ID",
                    scoreId,
                    scoreReplay.originalODR
                        ? "cannot be parsed"
                        : "does not exist",
                );
            });
        }

        await officialDb.transaction(async (tx) => {
            // Update the filename of the score.
            await tx
                .update(scoresTable)
                .set({ filename: beatmap.title })
                .where(eq(scoresTable.id, scoreId));

            if (scoreReplay.data && isReplayValid(score, scoreReplay.data)) {
                // Calculate the pp value of the score.
                const overrideParameters = obtainOverrideParameters(
                    score,
                    scoreReplay,
                );

                const calcResult = await difficultyCalculator
                    .calculateReplayPerformance(
                        scoreReplay,
                        false,
                        overrideParameters,
                    )
                    .catch((e: unknown) => {
                        console.error(
                            `Failed to calculate score with ID ${scoreId.toString()}:`,
                            e,
                        );

                        return null;
                    });

                // Update the pp value of the score.
                await tx
                    .update(scoresTable)
                    .set({ pp: calcResult?.result.total ?? null })
                    .where(eq(scoresTable.id, scoreId));

                if (calcResult !== null) {
                    highestPP = calcResult.result.total;
                    highestPPReplay = scoreReplay;
                }
            } else {
                // If the replay is not valid, invalidate the pp of the score.
                await tx
                    .update(scoresTable)
                    .set({ pp: null })
                    .where(eq(scoresTable.id, scoreId));
            }
        });

        // Get the current best score.
        const bestScore = await obtainOfficialBestScore(scoreId);
        // Obtain the replay of the top score in terms of score.
        const bestScoreReplay = new ReplayAnalyzer({ scoreID: scoreId });
        bestScoreReplay.originalODR = await getOfficialBestReplay(scoreId);

        if (bestScoreReplay.originalODR) {
            await bestScoreReplay.analyze().catch(() => {
                console.error(
                    "Best pp score replay of score ID",
                    scoreId,
                    bestScoreReplay.originalODR
                        ? "cannot be parsed"
                        : "does not exist",
                );
            });
        }

        await officialDb.transaction(async (tx) => {
            // Update the filename of the best score.
            await tx
                .update(bestScoresTable)
                .set({ filename: beatmap.title })
                .where(eq(bestScoresTable.id, scoreId));

            if (bestScoreReplay.data) {
                if (
                    bestScore &&
                    !isReplayValid(bestScore, bestScoreReplay.data)
                ) {
                    // If the replay is not valid, delete the whole score.
                    await tx
                        .delete(bestScoresTable)
                        .where(eq(bestScoresTable.id, scoreId));

                    await unlink(
                        join(
                            officialReplayDirectory,
                            `${scoreId.toString()}.odr`,
                        ),
                    ).catch(() => null);
                } else {
                    // Calculate the pp value of the best score.
                    const overrideParameters = bestScore
                        ? obtainOverrideParameters(bestScore, bestScoreReplay)
                        : null;

                    const calcResult = await difficultyCalculator
                        .calculateReplayPerformance(
                            bestScoreReplay,
                            false,
                            overrideParameters,
                        )
                        .catch((e: unknown) => {
                            console.error(
                                `Failed to calculate best score with ID ${scoreId.toString()}:`,
                                e,
                            );

                            return null;
                        });

                    if (calcResult !== null) {
                        // Update the pp value of the best score.
                        await tx
                            .update(bestScoresTable)
                            .set({ pp: calcResult.result.total })
                            .where(eq(bestScoresTable.id, scoreId));

                        if (
                            highestPP === null ||
                            calcResult.result.total > highestPP
                        ) {
                            highestPP = calcResult.result.total;
                            highestPPReplay = bestScoreReplay;
                        }
                    } else {
                        // If the pp value is null, just set the pp value to 0.
                        await tx
                            .update(bestScoresTable)
                            .set({ pp: 0 })
                            .where(eq(bestScoresTable.id, scoreId));
                    }
                }
            }
        });

        if (
            (highestPP as number | null) === null ||
            !(highestPPReplay as ReplayAnalyzer | null)?.data
        ) {
            console.log("No valid replay found for score ID", scoreId);
            continue;
        }

        const replayData = highestPPReplay!.data!;

        // New best pp obtained - insert to the database.
        const newBestScore: OfficialDatabaseBestScore = {
            id: scoreId,
            uid: score.uid,
            filename: beatmap.title,
            hash: score.hash,
            mode: replayData.isReplayV3()
                ? constructModString(replayData)
                : score.mode,
            score: replayData.isReplayV3() ? replayData.score : score.score,
            combo: replayData.isReplayV3() ? replayData.maxCombo : score.combo,
            mark: replayData.isReplayV3() ? replayData.rank : score.mark,
            geki: replayData.isReplayV3() ? replayData.hit300k : score.geki,
            perfect: replayData.accuracy.n300,
            katu: replayData.isReplayV3() ? replayData.hit100k : score.katu,
            good: replayData.accuracy.n100,
            bad: replayData.accuracy.n50,
            miss: replayData.accuracy.nmiss,
            date: replayData.isReplayV3() ? replayData.time : score.date,
            accuracy: replayData.accuracy.value(),
            pp: highestPP!,
        };

        highestPPReplay!.scoreID = newBestScore.id;

        await insertBestScore(newBestScore);
        await saveReplayToOfficialPP(highestPPReplay!);

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
