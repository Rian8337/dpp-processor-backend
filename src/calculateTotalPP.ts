import { config } from "dotenv";
import { officialPool } from "./database/official/OfficialDatabasePool";
import { processorPool } from "./database/processor/ProcessorDatabasePool";
import { ProcessorDatabaseTotalPPCalculation } from "./database/processor/schema/ProcessorDatabaseTotalPPCalculation";
import { ProcessorDatabaseTables } from "./database/processor/ProcessorDatabaseTables";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./database/official/OfficialDatabaseTables";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { OfficialDatabaseBestScore } from "./database/official/schema/OfficialDatabaseBestScore";

config();

(async () => {
    let id = await processorPool
        .query<ProcessorDatabaseTotalPPCalculation>(
            `SELECT id FROM ${ProcessorDatabaseTables.totalPPCalculation};`,
        )
        .then((res) => res.rows.at(0)?.id ?? null)
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });

    if (id === null) {
        id = 2417;

        await processorPool.query(
            `INSERT INTO ${ProcessorDatabaseTables.totalPPCalculation} (id) VALUES ($1);`,
            [id],
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
        // Update progress.
        await processorPool.query(
            `UPDATE ${ProcessorDatabaseTables.totalPPCalculation} SET id = $1;`,
            [id],
        );

        // Get user top scores.
        const topScores = await officialPool
            .query<RowDataPacket[]>(
                `SELECT pp FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)} WHERE uid = ? ORDER BY pp DESC LIMIT 100;`,
                [id],
            )
            .then((res) => res[0] as Pick<OfficialDatabaseBestScore, "pp">[])
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        if (!topScores) {
            console.log("User", id++, "has no scores");
            continue;
        }

        // Calculate total pp.
        const totalPP = topScores.reduce(
            (a, v, i) => a + v.pp * Math.pow(0.95, i),
            0,
        );

        // Update total pp.
        const result = await officialPool
            .query<ResultSetHeader>(
                `UPDATE ${constructOfficialDatabaseTableName(OfficialDatabaseTables.user)} SET pp = ? WHERE id = ?;`,
                [totalPP, id],
            )
            .then((res) => res[0].affectedRows === 1)
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });

        if (result === null) {
            console.log("Failed to update user", id);
            continue;
        }

        console.log("User", id++, "has", totalPP, "pp");

        if (!result) {
            console.log("Calculation complete");

            break;
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
        await processorPool.end();
        await officialPool.end();
    });
