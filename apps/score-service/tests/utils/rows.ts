import type { ParsedReplay } from "@/replays/parseReplay";
import type { SerializedMod } from "@rian8337/osu-base";
import type {
    BestScoreRow,
    ScoreRow,
    UncalculatedScoreRow,
} from "@/official/types";

export const testHash = "0123456789abcdef0123456789abcdef";

const shared = {
    uid: 7,
    filename: "Artist - Title (Mapper) [Hard]",
    hash: testHash,
    mods: "[]",
    score: 1_000_000,
    combo: 500,
    mark: "S",
    geki: 50,
    perfect: 400,
    katu: 10,
    good: 20,
    bad: 2,
    miss: 1,
    date: new Date("2026-10-01T00:00:00Z"),
    sliderHeadHit: 100,
    sliderTickHit: 200,
    sliderRepeatHit: 10,
    sliderEndHit: 99,
    accuracy: 0.95,
    scoreMultiplier: 1,
};

/**
 * A score row. `totalScore` is generated as the database would, unless overridden.
 */
export function scoreRow(overrides: Partial<ScoreRow> = {}): ScoreRow {
    const row = { id: 1, ...shared, pp: 100, ppMultiplier: 1, ...overrides };

    return { totalScore: Math.round(row.score * row.scoreMultiplier), ...row };
}

export function bestScoreRow(
    overrides: Partial<BestScoreRow> = {},
): BestScoreRow {
    const row = { id: 1, ...shared, pp: 100, ppMultiplier: 1, ...overrides };

    return { totalScore: Math.round(row.score * row.scoreMultiplier), ...row };
}

export function uncalculatedRow(
    overrides: Partial<UncalculatedScoreRow> = {},
): UncalculatedScoreRow {
    return { ...shared, replayfilename: "7_replay.odr", ...overrides };
}

/**
 * A parsed replay that matches `score` (a v3 replay with `score`'s mods taken from `mods`).
 */
export function parsedReplayFor(
    score: ScoreRow | BestScoreRow,
    overrides: Partial<ParsedReplay> = {},
): ParsedReplay {
    return {
        version: 4,
        hash: score.hash,
        fileName: "map.osu",
        accuracy: {
            n300: score.perfect ?? 0,
            n100: score.good ?? 0,
            n50: score.bad ?? 0,
            nmiss: score.miss ?? 0,
        },
        rank: score.mark ?? "",
        hit300k: score.geki ?? 0,
        hit100k: score.katu ?? 0,
        v3: {
            score: score.score,
            maxCombo: score.combo ?? 0,
            mods: JSON.parse(score.mods) as SerializedMod[],
            playerName: "player",
            time: new Date(),
        },
        ...overrides,
    };
}
