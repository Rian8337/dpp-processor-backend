import { Player, Score } from "@rian8337/osu-droid-utilities";
import { OfficialDatabaseUser } from "./schema/OfficialDatabaseUser";
import { officialPool } from "./OfficialDatabasePool";
import {
    constructOfficialDatabaseTableName,
    OfficialDatabaseTables,
} from "./OfficialDatabaseTables";
import { RowDataPacket } from "mysql2";
import { OfficialDatabaseScore } from "./schema/OfficialDatabaseScore";
import { isDebug } from "../../utils/util";

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
 * In debug mode, the osu!droid API will be requested. Otherwise, the official database will be queried.
 *
 * @param uid The uid of the player.
 * @param hash The MD5 hash of the beatmap.
 * @param databaseColumns The columns to retrieve from the database if the database is queried.
 * @returns The score, `null` if not found.
 */
export async function getOfficialScore<K extends keyof OfficialDatabaseScore>(
    uid: number,
    hash: string,
    ...databaseColumns: K[]
): Promise<Pick<OfficialDatabaseScore, K> | Score | null> {
    if (isDebug) {
        return Score.getFromHash(uid, hash);
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
