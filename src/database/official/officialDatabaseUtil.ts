import { Player, Score } from "@rian8337/osu-droid-utilities";
import { OfficialDatabaseUser } from "./schema/OfficialDatabaseUser";
import { officialPool } from "./OfficialDatabasePool";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./OfficialDatabaseTables";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { OfficialDatabaseScore } from "./schema/OfficialDatabaseScore";
import { isDebug } from "../../utils/util";
import { OfficialDatabaseBestScore } from "./schema/OfficialDatabaseBestScore";
import { calculateFinalPerformancePoints } from "../../utils/dppUtil";
import { ModUtil } from "@rian8337/osu-base";

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

    const playerQuery = await officialPool.query<RowDataPacket[]>(
        `SELECT ${
            databaseColumns.join() || "*"
        } FROM ${constructOfficialDatabaseTableName(
            OfficialDatabaseTables.user,
        )} WHERE username = ?;`,
        [username],
    );

    return (playerQuery[0] as OfficialDatabaseUser[]).at(0) ?? null;
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

    const scoreQuery = await officialPool.query<RowDataPacket[]>(
        `SELECT ${
            databaseColumns.join() || "*"
        } FROM ${constructOfficialDatabaseTableName(
            OfficialDatabaseTables.score,
        )} WHERE uid = ? AND hash = ? AND score > 0;`,
        [uid, hash],
    );

    return (scoreQuery[0] as OfficialDatabaseScore[]).at(0) ?? null;
}

/**
 * Gets the best score of a player on a beatmap.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 * @param databaseColumns The columns to retrieve from the database.
 * @returns The best score, `null` if not found.
 */
export async function getOfficialBestScore<
    K extends keyof OfficialDatabaseBestScore,
>(
    uid: number,
    hash: string,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseBestScore, K> | null> {
    if (isDebug) {
        // Debug does not have access to official database.
        return null;
    }

    const scoreQuery = await officialPool.query<RowDataPacket[]>(
        `SELECT ${
            databaseColumns.join() || "*"
        } FROM ${constructOfficialDatabaseTableName(
            OfficialDatabaseTables.bestScore,
        )} WHERE uid = ? AND hash = ?;`,
        [uid, hash],
    );

    return (scoreQuery[0] as OfficialDatabaseBestScore[]).at(0) ?? null;
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
    return officialPool
        .query<ResultSetHeader>(
            `UPDATE ${constructOfficialDatabaseTableName(
                OfficialDatabaseTables.score,
            )} SET pp = ? WHERE id = ?;`,
            [pp, scoreId],
        )
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
    return officialPool
        .query<ResultSetHeader>(
            `UPDATE ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)} SET pp = ? WHERE id = ?;`,
            [pp, scoreId],
        )
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
export function insertBestScore(scoreId: number): Promise<boolean> {
    return officialPool
        .query<ResultSetHeader>(
            `INSERT INTO ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)}
            SELECT * FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.score)} WHERE id = ?
            ON DUPLICATE KEY UPDATE
            mode = VALUES(mode),
            score = VALUES(score),
            combo = VALUES(combo),
            mark = VALUES(mark),
            geki = VALUES(geki),
            perfect = VALUES(perfect),
            katu = VALUES(katu),
            good = VALUES(good),
            bad = VALUES(bad),
            miss = VALUES(miss),
            accuracy = VALUES(accuracy),
            date = VALUES(date),
            pp = VALUES(pp);`,
            [scoreId],
        )
        .then((res) => res[0].affectedRows > 0)
        .catch((e: unknown) => {
            console.error(e);

            return false;
        });
}

/**
 * Updates the total pp value of a user.
 *
 * @param id The ID of the user.
 * @returns Whether the operation was successful.
 */
export async function updateUserPP(id: number): Promise<boolean> {
    const scores = await officialPool
        .query<RowDataPacket[]>(
            `SELECT pp FROM ${constructOfficialDatabaseTableName(OfficialDatabaseTables.bestScore)} WHERE uid = ? ORDER BY pp DESC LIMIT 100;`,
            [id],
        )
        .then((res) => res[0] as Pick<OfficialDatabaseBestScore, "pp">[])
        .catch((e: unknown) => {
            console.error(e);

            return null;
        });

    if (scores === null) {
        return false;
    }

    const totalPP = calculateFinalPerformancePoints(scores, 0);

    return officialPool
        .query<ResultSetHeader>(
            `UPDATE ${constructOfficialDatabaseTableName(OfficialDatabaseTables.user)} SET pp = ? WHERE id = ?;`,
            [totalPP, id],
        )
        .then((res) => res[0].affectedRows === 1)
        .catch((e: unknown) => {
            console.error(e);

            return false;
        });
}

/**
 * Parses the mods of a score.
 *
 * @param modstring The raw string of mods received from score table.
 * @returns The parsed mods.
 */
export function parseOfficialScoreMods(modstring: string) {
    // Taken directly from osu! core module.
    const modstrings = modstring.split("|");
    let actualMods = "";
    let speedMultiplier = 1;
    let forceCS: number | undefined;
    let forceAR: number | undefined;
    let forceOD: number | undefined;
    let forceHP: number | undefined;
    let flashlightFollowDelay: number | undefined;

    for (const str of modstrings) {
        if (!str) {
            continue;
        }

        switch (true) {
            // Forced stats
            case str.startsWith("CS"):
                forceCS = parseFloat(str.replace("CS", ""));
                break;

            case str.startsWith("AR"):
                forceAR = parseFloat(str.replace("AR", ""));
                break;

            case str.startsWith("OD"):
                forceOD = parseFloat(str.replace("OD", ""));
                break;

            case str.startsWith("HP"):
                forceHP = parseFloat(str.replace("HP", ""));
                break;

            // FL follow delay
            case str.startsWith("FLD"):
                flashlightFollowDelay = parseFloat(str.replace("FLD", ""));
                break;

            // Speed multiplier
            case str.startsWith("x"):
                speedMultiplier = parseFloat(str.replace("x", ""));
                break;

            default:
                actualMods += str;
        }
    }

    return {
        mods: ModUtil.droidStringToMods(actualMods),
        speedMultiplier,
        forceCS,
        forceAR,
        forceOD,
        forceHP,
        flashlightFollowDelay,
        oldStatistics: !modstring.includes("|"),
    };
}
