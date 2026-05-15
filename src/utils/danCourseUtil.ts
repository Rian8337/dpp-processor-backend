import { Accuracy, ScoreRank } from "@rian8337/osu-base";
import { ReplayV3Data } from "@rian8337/osu-droid-replay-analyzer";
import { DatabaseManager } from "../database/managers/DatabaseManager";
import { IDanCourse } from "../database/structures/aliceDb/IDanCourse";
import { IDanCourseScore } from "../database/structures/aliceDb/IDanCourseScore";

const _courses = new Map<string, IDanCourse>();

/**
 * The dan courses, mapped by their beatmap MD5 hash.
 */
export const courses: ReadonlyMap<string, IDanCourse> = _courses;

/**
 * Retrieves all dan course beatmaps and puts them in the map.
 */
export async function initBeatmaps() {
    for (const beatmap of await DatabaseManager.aliceDb.collections.danCourses.get()) {
        _courses.set(beatmap.hash, beatmap);
    }
}

/**
 * Processes replay data for dan courses.
 *
 * @param uid The ID of the player who submitted the replay.
 * @param data The replay data.
 */
export async function processReplay(uid: number, data: ReplayV3Data) {
    const score: IDanCourseScore = {
        bad: data.accuracy.n50,
        date: data.time.getTime(),
        geki: data.hit300k,
        good: data.accuracy.n100,
        grade: 0,
        hash: data.hash,
        katu: data.hit100k,
        maxCombo: data.maxCombo,
        miss: data.accuracy.nmiss,
        mods: data.convertedMods.serializeMods(),
        perfect: data.accuracy.n300,
        rank: data.rank,
        score: data.score,
        uid: uid,
        username: data.playerName,
    };

    score.grade = getGrade(score);

    const leaderboardDbManager =
        DatabaseManager.aliceDb.collections.danCourseLeaderboard;

    const existingScore = await leaderboardDbManager.getScore(uid, score.hash);

    // Write to leaderboard collection if there's no old scores or the new grade is more than the old grade.
    if (!existingScore || score.grade > existingScore.grade) {
        await leaderboardDbManager.updateScore(score);
    }
}

function getGrade(score: IDanCourseScore): number {
    const beatmap = courses.get(score.hash);

    switch (beatmap?.requirement.id) {
        case "score":
            return score.score;

        case "acc":
            return new Accuracy({
                n300: score.perfect,
                n100: score.good,
                n50: score.bad,
                nmiss: score.miss,
            }).value();

        case "combo":
            return score.maxCombo;

        case "m100":
            return score.good;

        case "m300":
            return score.perfect;

        case "m50":
            return score.bad;

        case "miss":
            return score.miss;

        case "rank":
            return getRankGrade(score.rank);

        default:
            return 0;
    }
}

function getRankGrade(rank: ScoreRank): number {
    switch (rank) {
        case "XH":
            return 8;

        case "SH":
            return 7;

        case "X":
            return 6;

        case "S":
            return 5;

        case "A":
            return 4;

        case "B":
            return 3;

        case "C":
            return 2;

        default:
            return 1;
    }
}
