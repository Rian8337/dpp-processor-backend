import { config } from "dotenv";

config();

/**
 * Available table names in the game's database.
 */
export enum OfficialDatabaseTables {
    user = "user",
    score = "score",
    bannedScore = "score_banned",
    bestScore = "score_best",
    bannedBestScore = "score_best_banned",
}

/**
 * Constructs the table name in the game's database.
 *
 * @param table The table name.
 * @returns The constructed table name.
 */
export function constructOfficialDatabaseTableName(
    table: OfficialDatabaseTables,
): string {
    return `${process.env.OFFICIAL_DB_PREFIX!}${table}`;
}
