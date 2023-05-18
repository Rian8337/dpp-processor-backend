import {
    ReplayAnalyzer,
    ReplayData,
} from "@rian8337/osu-droid-replay-analyzer";
import { Player, Score } from "@rian8337/osu-droid-utilities";
import {
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
} from "@rian8337/osu-difficulty-calculator";
import { getBeatmap } from "./cache/beatmapStorage";
import { DatabaseManager } from "../database/managers/DatabaseManager";
import { BeatmapDroidDifficultyCalculator } from "./calculator/BeatmapDroidDifficultyCalculator";
import { MapInfo, MathUtils, RankedStatus } from "@rian8337/osu-base";
import { PerformanceCalculationResult } from "./calculator/PerformanceCalculationResult";
import { DPPSubmissionValidity } from "../enums/DPPSubmissionValidity";
import { WhitelistUtil } from "./WhitelistUtil";
import { IUserBind } from "../database/structures/elainaDb/IUserBind";
import { PPEntry } from "../structures/PPEntry";

/**
 * Utilities that are related to dpp.
 */
export abstract class DPPUtil {
    /**
     * Submits a replay to the dpp database.
     *
     * @param replay The replay to submit.
     * @param replayFilename The name of the replay file.
     * @returns Whether the submission was successful.
     */
    static async submitReplay(replay: ReplayAnalyzer): Promise<boolean> {
        const { data } = replay;
        if (!data?.playerName) {
            return false;
        }

        const player = await Player.getInformation(data.playerName);
        if (!player) {
            return false;
        }

        const beatmapInfo = await getBeatmap(data.hash, { checkFile: false });
        if (!beatmapInfo) {
            return false;
        }

        if (
            (await this.checkSubmissionValidity(beatmapInfo)) !==
            DPPSubmissionValidity.valid
        ) {
            return false;
        }

        const bindInfo =
            await DatabaseManager.elainaDb.collections.userBind.getFromUid(
                player.uid
            );

        if (!bindInfo) {
            return false;
        }

        const performanceCalculationResult =
            await new BeatmapDroidDifficultyCalculator().calculateReplayPerformance(
                replay
            );

        if (!performanceCalculationResult) {
            return false;
        }

        return this.submitToDatabase(
            replay,
            player.uid,
            bindInfo,
            performanceCalculationResult
        );
    }

    /**
     * Checks a beatmap's submission validity.
     *
     * @param beatmap The beatmap.
     * @returns The validity of the beatmap.
     */
    static async checkSubmissionValidity(
        beatmap: MapInfo
    ): Promise<DPPSubmissionValidity>;

    /**
     * Checks a score's submission validity.
     *
     * @param score The score.
     * @returns The validity of the score.
     */
    static async checkSubmissionValidity(
        score: Score
    ): Promise<DPPSubmissionValidity>;

    static async checkSubmissionValidity(
        beatmapOrScore: Score | MapInfo
    ): Promise<DPPSubmissionValidity> {
        const beatmapInfo =
            beatmapOrScore instanceof MapInfo
                ? beatmapOrScore
                : await getBeatmap(beatmapOrScore.hash, {
                      checkFile: false,
                  });

        if (!beatmapInfo) {
            return DPPSubmissionValidity.beatmapNotFound;
        }

        switch (true) {
            case beatmapOrScore instanceof Score &&
                beatmapOrScore.forcedAR !== undefined:
                return DPPSubmissionValidity.scoreUsesForceAR;
            case beatmapInfo.approved === RankedStatus.loved &&
                (beatmapInfo.hitLength < 30 ||
                    beatmapInfo.hitLength / beatmapInfo.totalLength < 0.6):
                return DPPSubmissionValidity.beatmapTooShort;
            case await WhitelistUtil.isBlacklisted(beatmapInfo.beatmapID):
                return DPPSubmissionValidity.beatmapIsBlacklisted;
            case WhitelistUtil.beatmapNeedsWhitelisting(beatmapInfo.approved) &&
                (await WhitelistUtil.getBeatmapWhitelistStatus(
                    beatmapInfo.hash
                )) !== "updated":
                return DPPSubmissionValidity.beatmapNotWhitelisted;
            default:
                return DPPSubmissionValidity.valid;
        }
    }

    /**
     * Submits a replay to the database.
     *
     * @param replay The replay.
     * @param playerId The ID of the player.
     * @param databaseEntry The database entry to submit the replay to.
     * @param result The calculation result of the replay.
     * @returns Whether the submission was successful.
     */
    private static async submitToDatabase(
        replay: ReplayAnalyzer,
        playerId: number,
        databaseEntry: IUserBind,
        result: PerformanceCalculationResult<
            DroidDifficultyCalculator,
            DroidPerformanceCalculator
        >
    ): Promise<boolean> {
        if (!replay.data) {
            return false;
        }

        const beatmap = await getBeatmap(replay.data.hash);
        if (!beatmap) {
            return false;
        }

        const ppEntry = DPPUtil.scoreToPPEntry(
            beatmap,
            playerId,
            replay.scoreID,
            replay.data,
            result
        );

        if (this.checkScoreInsertion(databaseEntry.pp, ppEntry)) {
            await beatmap.retrieveBeatmapFile();

            if (!beatmap.hasDownloadedBeatmap()) {
                return false;
            }

            await BeatmapDroidDifficultyCalculator.applyTapPenalty(
                replay,
                result
            );

            await BeatmapDroidDifficultyCalculator.applySliderCheesePenalty(
                replay,
                result
            );

            ppEntry.pp = MathUtils.round(result.result.total, 2);

            this.insertScore(databaseEntry.pp, [ppEntry]);
        }

        const updateResult = await DatabaseManager.elainaDb.collections.userBind
            .updateOne(
                { discordid: databaseEntry.discordid },
                {
                    $set: {
                        pptotal: this.calculateFinalPerformancePoints(
                            databaseEntry.pp
                        ),
                        pp: databaseEntry.pp,
                        weightedAccuracy: this.calculateWeightedAccuracy(
                            databaseEntry.pp
                        ),
                    },
                    $inc: {
                        playc: 1,
                    },
                }
            )
            .catch(() => null);

        return !!updateResult;
    }

    /**
     * Checks whether a PP entry will be kept once it's entered to a list.
     *
     * @param list The list of dpp plays.
     * @param entry The entry to check.
     * @returns Whether the PP entry will be kept.
     */
    private static checkScoreInsertion(
        list: PPEntry[],
        entry: PPEntry
    ): boolean {
        if (list.length < 75) {
            return true;
        }

        for (let i = 0; i < list.length; ++i) {
            const l = list[i];

            if (l.hash === entry.hash && l.pp >= entry.pp) {
                return false;
            }
        }

        return list[list.length - 1].pp < entry.pp;
    }

    /**
     * Converts a calculation result to PP entry.
     *
     * @param beatmap The beatmap.
     * @param playerId The ID of the player.
     * @param scoreId The ID of the score.
     * @param replayData The replay data.
     * @param calculationResult The dpp calculation result of the beatmap.
     * @returns A PP entry from the beatmap and calculation result.
     */
    private static scoreToPPEntry(
        beatmap: MapInfo,
        playerId: number,
        scoreId: number,
        replayData: ReplayData,
        calculationResult: PerformanceCalculationResult<
            DroidDifficultyCalculator,
            DroidPerformanceCalculator
        >
    ): PPEntry {
        let replayFilename = `${playerId}_${replayData.hash}_${
            replayData.convertedMods.map((v) => v.droidString) || "-"
        }`;

        if (replayData.speedModification !== 1) {
            replayFilename += `_${replayData.speedModification}x`;
        }

        if (replayData.forcedAR !== undefined) {
            replayFilename += `_AR${replayData.forcedAR}`;
        }

        return {
            hash: beatmap.hash,
            title: beatmap.fullTitle,
            pp: MathUtils.round(calculationResult.result.total, 2),
            mods: calculationResult.result.difficultyAttributes.mods.reduce(
                (a, v) => a + v.acronym,
                ""
            ),
            accuracy: MathUtils.round(
                calculationResult.params.accuracy.value() * 100,
                2
            ),
            combo: calculationResult.params.combo ?? beatmap.maxCombo,
            miss: calculationResult.params.accuracy.nmiss,
            scoreID: scoreId,
            speedMultiplier:
                replayData.speedModification !== 1
                    ? replayData.speedModification
                    : undefined,
            replayFilename: replayFilename,
        };
    }

    /**
     * Inserts a score into a list of dpp plays.
     *
     * @param list The list of dpp plays.
     * @param entries The plays to add.
     */
    private static insertScore(list: PPEntry[], entries: PPEntry[]): void {
        let needsSorting = false;

        for (const entry of entries) {
            if (isNaN(entry.pp)) {
                continue;
            }

            if (list.length >= 75 && list[list.length - 1].pp >= entry.pp) {
                continue;
            }

            let found = false;
            for (let i = 0; i < list.length; ++i) {
                if (list[i].hash === entry.hash && list[i].pp < entry.pp) {
                    found = true;
                    list[i] = entry;
                    break;
                }
            }

            if (!found) {
                list.push(entry);
            }

            needsSorting = true;
        }

        if (needsSorting) {
            list.sort((a, b) => b.pp - a.pp);
        }

        while (list.length > 75) {
            list.pop();
        }
    }

    /**
     * Calculates the final performance points from a list of pp entries.
     *
     * @param list The list.
     * @returns The final performance points.
     */
    private static calculateFinalPerformancePoints(list: PPEntry[]): number {
        list.sort((a, b) => b.pp - a.pp);

        return list.reduce((a, v, i) => a + v.pp * Math.pow(0.95, i), 0);
    }

    /**
     * Calculates the weighted accuracy of a dpp list.
     *
     * @param list The list.
     * @returns The weighted accuracy of the list.
     */
    private static calculateWeightedAccuracy(list: PPEntry[]): number {
        if (list.length === 0) {
            return 0;
        }

        let accSum = 0;
        let weight = 0;
        let i = 0;

        for (const pp of list.values()) {
            accSum += pp.accuracy * Math.pow(0.95, i);
            weight += Math.pow(0.95, i);
            ++i;
        }

        return accSum / weight;
    }
}
