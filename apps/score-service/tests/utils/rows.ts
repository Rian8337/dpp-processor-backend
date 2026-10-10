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
