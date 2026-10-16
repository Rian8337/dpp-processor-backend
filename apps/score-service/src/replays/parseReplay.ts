import type { SerializedMod } from "@rian8337/osu-base";
import { ReplayAnalyzer } from "@rian8337/osu-droid-replay-analyzer";

export interface HitCounts {
    readonly n300: number;
    readonly n100: number;
    readonly n50: number;
    readonly nmiss: number;
}

/**
 * The small part of a replay this service reads. A plain value, so tests can construct one directly.
 */
export interface ParsedReplay {
    readonly version: number;
    readonly hash: string;
    /** The `.osu` file name the replay names. */
    readonly fileName: string;
    readonly accuracy: HitCounts;
    readonly rank: string;
    readonly hit300k: number;
    readonly hit100k: number;
    /** Version 3 and later only. */
    readonly v3: {
        readonly score: number;
        readonly maxCombo: number;
        readonly mods: SerializedMod[];
        readonly playerName: string;
        readonly time: Date;
    } | null;
}

/**
 * Reads a replay file; a function type so tests can script it.
 */
export type ReplayParser = (file: Buffer) => Promise<ParsedReplay | null>;

/**
 * Reads a replay's header and score data. Never throws: an unreadable replay gives `null`.
 */
export async function parseReplay(file: Buffer): Promise<ParsedReplay | null> {
    const analyzer = new ReplayAnalyzer();

    analyzer.originalODR = file;

    try {
        await analyzer.analyze();
    } catch {
        return null;
    }

    const { data } = analyzer;

    if (!data) {
        return null;
    }

    return {
        version: data.replayVersion,
        hash: data.hash,
        fileName: data.fileName,
        accuracy: {
            n300: data.accuracy.n300,
            n100: data.accuracy.n100,
            n50: data.accuracy.n50,
            nmiss: data.accuracy.nmiss,
        },
        rank: data.rank,
        hit300k: data.hit300k,
        hit100k: data.hit100k,
        v3: data.isReplayV3()
            ? {
                  score: data.score,
                  maxCombo: data.maxCombo,
                  mods: data.convertedMods.serializeMods(),
                  playerName: data.playerName,
                  time: data.time,
              }
            : null,
    };
}
