import type { ScoreRow } from "@/official/types";
import { modsSchema } from "@dpp/shared";
import { Accuracy, ModUtil } from "@rian8337/osu-base";
import type { ParsedReplay } from "./parseReplay";

export type ValidatedScore = Pick<
    ScoreRow,
    | "hash"
    | "perfect"
    | "good"
    | "bad"
    | "miss"
    | "score"
    | "combo"
    | "geki"
    | "katu"
    | "mark"
    | "mods"
>;

/**
 * Whether a replay belongs to a score. Version 1 and 2 replays record little, so only the beatmap and hit counts are
 * compared; version 3 and later also compare score, combo, geki, katu, rank, and mods.
 */
export function isReplayValid(
    score: ValidatedScore,
    replay: ParsedReplay,
): boolean {
    const counts = replay.accuracy;

    if (
        score.hash !== replay.hash ||
        (score.perfect ?? 0) !== counts.n300 ||
        (score.good ?? 0) !== counts.n100 ||
        (score.bad ?? 0) !== counts.n50 ||
        (score.miss ?? 0) !== counts.nmiss ||
        // A replay without any hit is empty.
        new Accuracy(counts).value === 0
    ) {
        return false;
    }

    if (!replay.v3) {
        return true;
    }

    if (
        score.score !== replay.v3.score ||
        (score.combo ?? 0) !== replay.v3.maxCombo ||
        (score.geki ?? 0) !== replay.hit300k ||
        (score.katu ?? 0) !== replay.hit100k ||
        score.mark !== replay.rank
    ) {
        return false;
    }

    const scoreMods = parseModsColumn(score.mods);

    return (
        scoreMods !== null &&
        ModUtil.deserializeMods(scoreMods).equals(
            ModUtil.deserializeMods(replay.v3.mods),
        )
    );
}

/**
 * Parses a `mods` column (serialized mods as JSON). `null` if unreadable.
 */
export function parseModsColumn(mods: string) {
    try {
        const parsed = modsSchema.safeParse(JSON.parse(mods));

        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
