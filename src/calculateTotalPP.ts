import { config } from "dotenv";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { officialPool } from "./database/official/OfficialDatabasePool";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./database/official/OfficialDatabaseTables";
import { OfficialDatabaseBestScore } from "./database/official/schema/OfficialDatabaseBestScore";
import { processorDb } from "./database/processor";
import { totalPPCalculationTable } from "./database/processor/schema";

config();

(async () => {
    let id = await processorDb
        .select()
        .from(totalPPCalculationTable)
        .then((res) => res.at(0)?.id ?? null)
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });

    if (id === null) {
        id = 2417;

        await processorDb.insert(totalPPCalculationTable).values({ id });
    }

    const userTable = constructOfficialDatabaseTableName(
        OfficialDatabaseTables.user,
    );

    while (id <= 500000) {
        // Update progress.
        await processorDb.update(totalPPCalculationTable).set({ id });

        // Get user top scores.
        const topScores = await officialPool
            .query<RowDataPacket[]>(
                `SELECT pp, accuracy FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)} WHERE uid = ? ORDER BY pp DESC LIMIT 100;`,
                [id],
            )
            .then(
                (res) =>
                    res[0] as Pick<
                        OfficialDatabaseBestScore,
                        "pp" | "accuracy"
                    >[],
            )
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        const connection = await officialPool.getConnection();

        try {
            await connection.beginTransaction();

            if (!topScores) {
                console.log("User", id++, "has no scores");

                await connection.query(
                    `UPDATE ${userTable} SET pp = 0, accuracy = 1 WHERE id = ?;`,
                    [id],
                );

                continue;
            }

            // Calculate total pp and accuracy.
            let totalPP = 0;
            let accuracy = 0;
            let accuracyWeight = 0;

            for (let i = 0; i < topScores.length; ++i) {
                const score = topScores[i];
                const weightMultiplier = Math.pow(0.95, i);

                totalPP += score.pp * weightMultiplier;
                accuracy += score.accuracy * weightMultiplier;
                accuracyWeight += weightMultiplier;
            }

            if (accuracyWeight > 0) {
                accuracy /= accuracyWeight;
            } else {
                accuracy = 1;
            }

            // Update total pp and accuracy.
            await connection
                .query<ResultSetHeader>(
                    `UPDATE ${userTable} SET pp = ?, accuracy = ? WHERE id = ?;`,
                    [totalPP, accuracy, id],
                )
                .then((res) => res[0].affectedRows === 1)
                .catch((e: unknown) => {
                    console.error(e);

                    return null;
                });

            console.log(
                "User",
                id++,
                "has",
                totalPP,
                "pp and",
                accuracy,
                "accuracy",
            );

            await connection.commit();
        } catch (e: unknown) {
            console.error(e);

            await connection.rollback();
        } finally {
            connection.release();
        }
    }
})()
    .then(() => {
        console.log("Done");
    })
    .catch((e: unknown) => {
        console.error(e);
    })
    .finally(async () => {
        await officialPool.end();
    });
