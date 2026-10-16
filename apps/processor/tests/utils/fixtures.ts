import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixturesDirectory = fileURLToPath(
    new URL("../fixtures/", import.meta.url),
);

/**
 * Beatmap fixtures, with the fake beatmap IDs the stub beatmap service uses for them.
 */
export const beatmapFixtures = {
    loveLetter: { id: 1, file: "beatmaps/love-letter.osu" },
    highPowered: { id: 2, file: "beatmaps/high-powered.osu" },
    discoprince: { id: 3, file: "beatmaps/discoprince.osu" },
} as const;

export type BeatmapFixtureName = keyof typeof beatmapFixtures;

// Object.keys returns string[]; the keys of a literal `as const` object are exactly BeatmapFixtureName.
export const beatmapFixtureNames = Object.keys(
    beatmapFixtures,
) as BeatmapFixtureName[];

/**
 * Reads a beatmap fixture as text.
 */
export function readBeatmapFixture(name: BeatmapFixtureName): string {
    return readFileSync(fixturesDirectory + beatmapFixtures[name].file, "utf8");
}

/**
 * Computes the MD5 hash of a string (as UTF-8) or buffer.
 */
export function md5Of(content: string | Buffer): string {
    return createHash("md5").update(content).digest("hex");
}

/**
 * A v3+ replay and the beatmap it was played on. Provided by the user; tests that need it are skipped until both
 * files exist.
 */
export const replayFixture = {
    replay: fixturesDirectory + "replays/v3.odr",
    beatmap: fixturesDirectory + "replays/v3.osu",
};

export const hasReplayFixture =
    existsSync(replayFixture.replay) && existsSync(replayFixture.beatmap);
