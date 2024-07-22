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
import { getOfficialBestScore } from "./database/official/officialDatabaseUtil";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";
import { officialPool } from "./database/official/OfficialDatabasePool";
import { ResultSetHeader } from "mysql2";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./database/official/OfficialDatabaseTables";
import {
    ModAuto,
    ModAutopilot,
    ModDoubleTime,
    ModEasy,
    ModFlashlight,
    ModHalfTime,
    ModHardRock,
    ModHidden,
    ModNightCore,
    ModNoFail,
    ModPerfect,
    ModPrecise,
    ModReallyEasy,
    ModRelax,
    ModScoreV2,
    ModSuddenDeath,
} from "@rian8337/osu-base";

config();

Promise.all([DatabaseManager.init(), processorPool.connect()])
    .then(async () => {
        const dbManager = DatabaseManager.elainaDb.collections.userBind;
        const droidDifficultyCalculator =
            new BeatmapDroidDifficultyCalculator();

        let bindInfo: IUserBind | null = null;
        let firstLaunch = true;

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

                const scoreHashes = await readdir(localReplayDir).catch(
                    () => null,
                );

                if (scoreHashes === null) {
                    console.log(`No scores found for UID ${uid.toString()}`);
                    continue;
                }

                console.log(
                    `Processing ${scoreHashes.length.toString()} scores for UID ${uid.toString()}`,
                );

                for (const hash of scoreHashes) {
                    // On first launch, if the hash is not empty, the calculation for this player was already ongoing.
                    // Skip until the hash is found.
                    if (firstLaunch) {
                        if (progress.hash && progress.hash !== hash) {
                            continue;
                        }

                        firstLaunch = false;
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
                        "date",
                        "score",
                    );

                    if (!bestScore) {
                        console.log(`Score ${hash} is not found.`);
                        continue;
                    }

                    // Persist the best replay to the official pp system.
                    const replayFiles = await readdir(
                        join(localReplayDir, hash),
                    ).catch(() => null);

                    if (replayFiles === null || replayFiles.length === 0) {
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

                    if (bestPP === -1 || !bestReplay.data) {
                        console.log(`Score ${hash} has no valid calculation.`);
                        continue;
                    }

                    if (bestPP < bestScore.pp) {
                        console.log(
                            `Score ${hash} has lower pp than official pp.`,
                        );
                        continue;
                    }

                    const { data } = bestReplay;

                    // Reconstruct mod string with respect to the game's order.
                    let modstring = "";

                    if (data.convertedMods.some((m) => m instanceof ModAuto)) {
                        modstring += "a";
                    }
                    if (data.convertedMods.some((m) => m instanceof ModRelax)) {
                        modstring += "x";
                    }
                    if (
                        data.convertedMods.some(
                            (m) => m instanceof ModAutopilot,
                        )
                    ) {
                        modstring += "p";
                    }
                    if (data.convertedMods.some((m) => m instanceof ModEasy)) {
                        modstring += "e";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModNoFail)
                    ) {
                        modstring += "n";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModHardRock)
                    ) {
                        modstring += "r";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModHidden)
                    ) {
                        modstring += "h";
                    }
                    if (
                        data.convertedMods.some(
                            (m) => m instanceof ModFlashlight,
                        )
                    ) {
                        modstring += "i";
                    }
                    if (
                        data.convertedMods.some(
                            (m) => m instanceof ModDoubleTime,
                        )
                    ) {
                        modstring += "d";
                    }
                    if (
                        data.convertedMods.some(
                            (m) => m instanceof ModNightCore,
                        )
                    ) {
                        modstring += "c";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModHalfTime)
                    ) {
                        modstring += "t";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModPrecise)
                    ) {
                        modstring += "s";
                    }
                    if (
                        data.convertedMods.some(
                            (m) => m instanceof ModReallyEasy,
                        )
                    ) {
                        modstring += "l";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModPerfect)
                    ) {
                        modstring += "f";
                    }
                    if (
                        data.convertedMods.some(
                            (m) => m instanceof ModSuddenDeath,
                        )
                    ) {
                        modstring += "u";
                    }
                    if (
                        data.convertedMods.some((m) => m instanceof ModScoreV2)
                    ) {
                        modstring += "v";
                    }

                    if (data.replayVersion > 3) {
                        // Replays older than version 3 have a pipe separation for extra mods.
                        modstring += "|";

                        // Only speed multiplier is ranked for now, so let's ignore other extra mods.
                        if (data.speedMultiplier !== 1) {
                            modstring += `x${data.speedMultiplier.toString()}`;
                        }
                    }

                    await saveReplayToOfficialPP(bestReplay);

                    await officialPool
                        .query<ResultSetHeader>(
                            `UPDATE ${constructOfficialDatabaseTableName(
                                OfficialDatabaseTables.bestScore,
                            )} SET accuracy = ?, bad = ?, combo = ?, date = ?, good = ?, geki = ?, katu = ?, mark = ?, miss = ?, mode = ?, perfect = ?, pp = ?, score = ? WHERE id = ?;`,
                            [
                                Math.round(data.accuracy.value() * 100000),
                                data.accuracy.n50,
                                data.maxCombo,
                                data.time.getTime() > 0
                                    ? data.time
                                    : bestScore.date,
                                data.accuracy.n100,
                                data.hit300k,
                                data.hit100k,
                                data.rank,
                                data.accuracy.nmiss,
                                modstring,
                                data.accuracy.n300,
                                bestPP,
                                data.score > 0 ? data.score : bestScore.score,
                                bestScore.id,
                            ],
                        )
                        .then(() => {
                            console.log(`Score ${hash} has been transferred.`);
                        })
                        .catch((e: unknown) => {
                            console.error(e);
                        });
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

            // Reset progress.
            progress = {
                player_id: -1,
                hash: "",
            };

            await processorPool.query(
                `UPDATE ${ProcessorDatabaseTables.replayTransfer} SET player_id = $1, hash = $2;`,
                [progress.player_id, progress.hash],
            );

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
