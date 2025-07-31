import { Player, Score } from "@rian8337/osu-droid-utilities";
import { and, eq, gt } from "drizzle-orm";
import { SelectedFields } from "drizzle-orm/mysql-core";
import { officialDb } from ".";
import { isDebug } from "../../utils/util";
import { bestScoresTable, scoresTable, usersTable } from "./schema";
import { OfficialDatabaseBestScore } from "./schema/OfficialDatabaseBestScore";
import { OfficialDatabaseScore } from "./schema/OfficialDatabaseScore";
import { OfficialDatabaseUser } from "./schema/OfficialDatabaseUser";

/**
 * Gets a player's information from their username.
 *
 * In debug mode, the osu!droid API will be requested. Otherwise, the official database will be queried.
 *
 * @param username The username of the player.
 * @param databaseColumns The columns to retrieve from the database if the database is queried.
 * @returns The player's information, `null` if not found.
 */
export async function getPlayerFromUsername<
    K extends keyof OfficialDatabaseUser,
>(
    username: string,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseUser, K> | Player | null> {
    if (isDebug) {
        return Player.getInformation(username);
    }

    const columns: SelectedFields = {};

    for (const column of databaseColumns) {
        columns[column] = usersTable[column];
    }

    return officialDb
        .select(columns)
        .from(usersTable)
        .where(eq(usersTable.username, username))
        .then(
            (res) =>
                (res.at(0) ?? null) as Pick<OfficialDatabaseUser, K> | null,
        )
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });
}

/**
 * Gets a score from a player on a beatmap.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 * @param forceDatabaseQuery Whether to force the database to be queried. In debug mode, setting this to `true` will make this function always return `null`.
 * @param databaseColumns The columns to retrieve from the database if the database is queried.
 * @returns The score, `null` if not found.
 */
export async function getOfficialScore<K extends keyof OfficialDatabaseScore>(
    uid: number,
    hash: string,
    forceDatabaseQuery: true,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseScore, K> | null>;

/**
 * Gets a score from a player on a beatmap.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 * @param forceDatabaseQuery Whether to force the database to be queried. In debug mode, setting this to `true` will make this function always return `null`.
 * @param databaseColumns The columns to retrieve from the database if the database is queried.
 * @returns The score, `null` if not found.
 */
export async function getOfficialScore<K extends keyof OfficialDatabaseScore>(
    uid: number,
    hash: string,
    forceDatabaseQuery: false,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseScore, K> | Score | null>;

export async function getOfficialScore<K extends keyof OfficialDatabaseScore>(
    uid: number,
    hash: string,
    forceDatabaseQuery: boolean,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseScore, K> | Score | null> {
    if (isDebug) {
        return forceDatabaseQuery ? null : Score.getFromHash(uid, hash);
    }

    if (databaseColumns.length === 0) {
        return officialDb
            .select()
            .from(scoresTable)
            .where(
                and(
                    eq(scoresTable.uid, uid),
                    eq(scoresTable.hash, hash),
                    gt(scoresTable.score, 0),
                ),
            )
            .then(
                (res) =>
                    (res.at(0) ?? null) as Pick<
                        OfficialDatabaseScore,
                        K
                    > | null,
            )
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });
    }

    const columns: SelectedFields = {};

    for (const column of databaseColumns) {
        columns[column] = scoresTable[column];
    }

    return officialDb
        .select(columns)
        .from(scoresTable)
        .where(
            and(
                eq(scoresTable.uid, uid),
                eq(scoresTable.hash, hash),
                gt(scoresTable.score, 0),
            ),
        )
        .then(
            (res) =>
                (res.at(0) ?? null) as Pick<OfficialDatabaseScore, K> | null,
        )
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });
}

/**
 * Gets the best score of a player on a beatmap.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 * @param forceDatabaseQuery Whether to force the database to be queried. In debug mode, setting this to `true` will make this function always return `null`.
 * @param databaseColumns The columns to retrieve from the database if the database is queried.
 * @returns The best score, `null` if not found.
 */
export async function getOfficialBestScore<
    K extends keyof OfficialDatabaseBestScore,
>(
    uid: number,
    hash: string,
    forceDatabaseQuery: true,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseBestScore, K> | null>;

/**
 * Gets the best score of a player on a beatmap.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 * @param forceDatabaseQuery Whether to force the database to be queried. In debug mode, setting this to `true` will make this function always return `null`.
 * @param databaseColumns The columns to retrieve from the database if the database is queried.
 * @returns The best score, `null` if not found.
 */
export async function getOfficialBestScore<
    K extends keyof OfficialDatabaseBestScore,
>(
    uid: number,
    hash: string,
    forceDatabaseQuery: false,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseBestScore, K> | Score | null>;

export async function getOfficialBestScore<
    K extends keyof OfficialDatabaseBestScore,
>(
    uid: number,
    hash: string,
    forceDatabaseQuery: boolean,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseBestScore, K> | Score | null> {
    if (isDebug) {
        return forceDatabaseQuery ? null : Score.getFromHash(uid, hash, true);
    }

    if (databaseColumns.length === 0) {
        return officialDb
            .select()
            .from(bestScoresTable)
            .where(
                and(
                    eq(bestScoresTable.uid, uid),
                    eq(bestScoresTable.hash, hash),
                ),
            )
            .then(
                (res) => res.at(0) as Pick<OfficialDatabaseBestScore, K> | null,
            )
            .catch((e: unknown) => {
                console.error(e);

                return null;
            });
    }

    const columns: SelectedFields = {};

    for (const column of databaseColumns) {
        columns[column] = bestScoresTable[column];
    }

    return officialDb
        .select(columns)
        .from(bestScoresTable)
        .where(
            and(eq(bestScoresTable.uid, uid), eq(bestScoresTable.hash, hash)),
        )
        .then((res) => res.at(0) as Pick<OfficialDatabaseBestScore, K> | null)
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });
}

/**
 * Updates the pp value of a score.
 *
 * @param scoreId The ID of the score.
 * @param pp The new pp value.
 * @returns Whether the update was successful.
 */
export function updateOfficialScorePPValue(
    scoreId: number,
    pp: number | null,
): Promise<boolean> {
    return officialDb
        .update(scoresTable)
        .set({ pp })
        .where(eq(scoresTable.id, scoreId))
        .then((res) => res[0].affectedRows === 1)
        .catch((e: unknown) => {
            console.error(e);

            return false;
        });
}

/**
 * Updates the pp value of a best score.
 *
 * @param score The best score.
 * @param pp The new pp value.
 * @returns Whether the update was successful.
 */
export function updateBestScorePPValue(
    scoreId: number,
    pp: number,
): Promise<boolean> {
    return officialDb
        .update(bestScoresTable)
        .set({ pp })
        .where(eq(bestScoresTable.id, scoreId))
        .then((res) => res[0].affectedRows === 1)
        .catch((e: unknown) => {
            console.error(e);

            return false;
        });
}

/**
 * Inserts a score as the best score.
 *
 * @param scoreId The ID of the score.
 * @returns Whether the operation was successful.
 */
export function insertBestScore(
    score: OfficialDatabaseBestScore,
): Promise<boolean> {
    return officialDb
        .insert(bestScoresTable)
        .values(score)
        .onDuplicateKeyUpdate({
            set: {
                ...score,
                id: undefined,
                uid: undefined,
            },
        })
        .then((res) => res[0].affectedRows === 1)
        .catch((e: unknown) => {
            console.error(e);

            return false;
        });
}
