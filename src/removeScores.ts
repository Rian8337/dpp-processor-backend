import { RowDataPacket } from "mysql2";
import { officialPool } from "./database/official/OfficialDatabasePool";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";
import { ProcessorDatabaseScoreCalculation } from "./database/processor/schema/ProcessorDatabaseScoreCalculation";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./database/official/OfficialDatabaseTables";
import { OfficialDatabaseScore } from "./database/official/schema/OfficialDatabaseScore";
import { config } from "dotenv";

config();

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

    const userTable = constructOfficialDatabaseTableName(
        OfficialDatabaseTables.user,
    );
    const scoreTable = constructOfficialDatabaseTableName(
        OfficialDatabaseTables.score,
    );
    const bannedScoreTable = constructOfficialDatabaseTableName(
        OfficialDatabaseTables.bannedScore,
    );

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
        const scoreId = id++;

        // Update current progress.
        await processorPool.query(
            `UPDATE ${ProcessorDatabaseTables.scoreCalculation} SET id = $1;`,
            [id],
        );

        const connection = await officialPool.getConnection();

        const score = await connection
            .query<RowDataPacket[]>(
                `SELECT * FROM ${scoreTable} WHERE id = ${scoreId.toString()};`,
            )
            .then((res) => (res[0][0] ?? null) as OfficialDatabaseScore | null)
            .catch((e: unknown) => {
                console.error("Failed to fetch score of ID", scoreId, e);

                return null;
            });

        if (!score) {
            connection.release();
            continue;
        }

        // Check for scores similar to the current score.
        const otherScores = await connection
            .query<RowDataPacket[]>(
                `SELECT * FROM ${scoreTable} WHERE uid = ${score.uid.toString()} AND hash = "${score.hash}" AND id != ${scoreId.toString()};`,
            )
            .then((res) => res[0] as OfficialDatabaseScore[])
            .catch((e: unknown) => {
                console.error("Failed to fetch score of ID", scoreId, e);

                return null;
            });

        if (!otherScores || otherScores.length === 0) {
            connection.release();
            continue;
        }

        // Remove the scores.
        try {
            await connection.beginTransaction();

            for (const otherScore of otherScores) {
                await connection.query(
                    `INSERT INTO ${bannedScoreTable} SELECT * FROM ${scoreTable} WHERE id = ${otherScore.id.toString()};`,
                );

                await connection.query(
                    `DELETE FROM ${scoreTable} WHERE id = ${otherScore.id.toString()};`,
                );
            }

            // Update user profile.
            await connection.query(
                `UPDATE ${userTable} SET
                score = score - ${otherScores.reduce((a, v) => a + v.score, 0).toString()},
                playcount = playcount - ${otherScores.length.toString()}
                WHERE id = ${score.uid.toString()};`,
            );

            await connection.commit();

            console.log("Removed", otherScores.length, "scores of ID", scoreId);
        } catch (e) {
            await connection.rollback();

            console.error("Failed to remove scores of ID", scoreId, e);
        } finally {
            connection.release();
        }
    }
})().catch((e: unknown) => {
    console.error("Failed to connect to the database", e);

    process.exit(1);
});
