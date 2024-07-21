import { readdir, readFile } from "fs/promises";
import { DatabaseManager } from "./database/managers/DatabaseManager";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { IUserBind } from "./database/structures/elainaDb/IUserBind";
import { join } from "path";
import {
    localReplayDirectory,
    saveReplayToOfficialPP,
} from "./utils/replayManager";
import { ProcessorDatabaseReplayTransfer } from "./database/processor/schema/ProcessorDatabaseReplayTransfer";
import { BeatmapDroidDifficultyCalculator } from "./utils/calculator/BeatmapDroidDifficultyCalculator";
import { config } from "dotenv";
import {
    getOfficialBestScore,
    updateBestScorePPValue,
} from "./database/official/officialDatabaseUtil";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";

config();

Promise.all([DatabaseManager.init(), processorPool.connect()])
    .then(async () => {
        const dbManager = DatabaseManager.elainaDb.collections.userBind;
        const droidDifficultyCalculator =
            new BeatmapDroidDifficultyCalculator();

        let bindInfo: IUserBind | null = null;

        let progress = await processorPool
            .query<ProcessorDatabaseReplayTransfer>(
                `SELECT * FROM ${ProcessorDatabaseTables.replayTransfer};`,
            )
            .then((res) => res.rows.at(0) ?? null)
            .catch(() => null);

        if (!progress) {
            progress = {
                player_id: -1,
                hash: "",
            };

            await processorPool.query(
                `INSERT INTO ${ProcessorDatabaseTables.replayTransfer} (player_id, hash) VALUES ($1, $2);`,
                [progress.player_id, progress.hash],
            );
        }

        while (
            (bindInfo = await dbManager.getOne(
                {
                    uid:
                        // Get previously calculated player if calculation is stopped mid-way.
                        progress.player_id === -1
                            ? undefined
                            : progress.player_id,
                    dppTransferComplete: { $ne: true },
                },
                { projection: { _id: 0, discordid: 1, previous_bind: 1 } },
            ))
        ) {
            console.log(`Transferring for Discord ID ${bindInfo.discordid}`);

            for (const uid of bindInfo.previous_bind) {
                // Update currently calculated player.
                progress.player_id = uid;

                // Update the progress in the database.
                await processorPool.query(
                    `UPDATE ${ProcessorDatabaseTables.replayTransfer} SET player_id = $1;`,
                    [progress.player_id],
                );

                const localReplayDir = join(
                    localReplayDirectory,
                    uid.toString(),
                );

                const scoreHashes = await readdir(localReplayDir);

                console.log(
                    `Processing ${scoreHashes.length.toString()} scores for UID ${uid.toString()}`,
                );

                for (const hash of scoreHashes) {
                    // If the hash is not empty, the calculation for this player was already ongoing.
                    // Skip until the hash is found.
                    if (progress.hash && progress.hash !== hash) {
                        continue;
                    }

                    progress.hash = hash;

                    // Update the progress in the database.
                    await processorPool.query(
                        `UPDATE ${ProcessorDatabaseTables.replayTransfer} SET hash = $1;`,
                        [progress.hash],
                    );

                    // Get score from best score table.
                    // If the score is not found, skip.
                    const bestScore = await getOfficialBestScore(
                        uid,
                        hash,
                        "id",
                        "pp",
                    );

                    if (!bestScore) {
                        console.log(`Score ${hash} is not found.`);
                        continue;
                    }

                    // Persist the best replay to the official pp system.
                    const replayFiles = await readdir(
                        join(localReplayDir, hash),
                    );

                    if (replayFiles.length === 0) {
                        console.log(`Score ${hash} has no replay.`);
                        continue;
                    }

                    let bestReplay = new ReplayAnalyzer({
                        scoreID: bestScore.id,
                    });
                    let bestPP = -1;

                    for (const replay of replayFiles) {
                        const replayAnalyzer = new ReplayAnalyzer({
                            scoreID: bestScore.id,
                        });

                        replayAnalyzer.originalODR = await readFile(
                            join(localReplayDir, hash, replay),
                        );

                        await replayAnalyzer.analyze().catch(() => {
                            console.error(`Cannot process replay ${replay}`);
                        });

                        const result = await droidDifficultyCalculator
                            .calculateReplayPerformance(replayAnalyzer, false)
                            .catch((e: unknown) => {
                                console.error(e);

                                return null;
                            });

                        if (!result) {
                            console.log(
                                `Score ${hash} has no calculation result.`,
                            );
                            continue;
                        }

                        if (bestPP < result.result.total) {
                            bestPP = result.result.total;
                            bestReplay = replayAnalyzer;
                        }
                    }

                    if (bestPP === -1) {
                        console.log(`Score ${hash} has no valid calculation.`);
                        continue;
                    }

                    if (bestPP < bestScore.pp) {
                        console.log(
                            `Score ${hash} has lower pp than official pp.`,
                        );
                        continue;
                    }

                    await saveReplayToOfficialPP(bestReplay);
                    await updateBestScorePPValue(bestScore.id, bestPP);

                    console.log(`Score ${hash} has been transferred.`);
                }

                // Reset progress.
                progress = {
                    player_id: -1,
                    hash: "",
                };

                await processorPool.query(
                    `UPDATE ${ProcessorDatabaseTables.replayTransfer} SET player_id = $1, hash = $2;`,
                    [progress.player_id, progress.hash],
                );
            }

            await dbManager.updateOne(
                {
                    discordid: bindInfo.discordid,
                },
                { $set: { dppTransferComplete: true } },
            );

            console.log(
                `Discord ID ${bindInfo.discordid} has completed transfer.`,
            );
        }

        console.log("Transfer completed.");
    })
    .catch((e: unknown) => {
        console.error(e);
        process.exit(1);
    });
