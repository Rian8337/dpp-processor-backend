import {
    AlgorithmInputError,
    type AlgorithmErrorCode,
} from "@/algorithms/errors";
import type { Algorithm } from "@/algorithms/types";
import { LruCache } from "@/utils/LruCache";
import { ModUtil, type Beatmap, type SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import generateStrainChart from "@rian8337/osu-strain-graph-generator";

/**
 * Work that may run in a worker thread. Every field must survive structured cloning, so mods are serialized.
 */
export type CalculationTask =
    | {
          kind: "difficulty";
          beatmapHash: string;
          osuFile: string;
          mods: SerializedMod[];
      }
    | { kind: "readReplay"; replay: Uint8Array }
    | {
          kind: "analyzeReplay";
          beatmapHash: string;
          osuFile: string;
          replay: Uint8Array;
          difficulty: CacheableDifficultyAttributes<IDifficultyAttributes>;
      }
    | {
          kind: "strainChart";
          beatmapHash: string;
          osuFile: string;
          mods: SerializedMod[];
          clockRate: number;
          color: string;
      };

/**
 * The result of a task. Errors are returned as data because error classes do not survive the worker boundary.
 */
export type TaskOutcome =
    | { ok: true; value: unknown }
    | {
          ok: false;
          code: AlgorithmErrorCode | "CALCULATION_FAILED";
          message: string;
      };

/**
 * Runs calculation tasks with an algorithm. Decoded beatmaps are cached by hash.
 */
export class CalculationTaskHandler {
    private readonly beatmaps: LruCache<string, Beatmap>;

    /**
     * @param algorithm The algorithm to calculate with.
     * @param beatmapCacheSize How many decoded beatmaps to keep.
     */
    constructor(
        private readonly algorithm: Algorithm,
        beatmapCacheSize = 32,
    ) {
        this.beatmaps = new LruCache(beatmapCacheSize);
    }

    /**
     * Runs a task. Never throws: failures are returned as outcomes.
     */
    async handle(task: CalculationTask): Promise<TaskOutcome> {
        try {
            return { ok: true, value: await this.execute(task) };
        } catch (e) {
            if (e instanceof AlgorithmInputError) {
                return { ok: false, code: e.code, message: e.message };
            }

            return {
                ok: false,
                code: "CALCULATION_FAILED",
                message: e instanceof Error ? e.message : "Calculation failed",
            };
        }
    }

    private async execute(task: CalculationTask): Promise<unknown> {
        switch (task.kind) {
            case "difficulty":
                return this.algorithm.calculateDifficulty(
                    this.decode(task.beatmapHash, task.osuFile),
                    ModUtil.deserializeMods(task.mods),
                );

            case "readReplay":
                return this.algorithm.readReplay(Buffer.from(task.replay));

            case "analyzeReplay":
                return this.algorithm.analyzeReplay(
                    Buffer.from(task.replay),
                    this.decode(task.beatmapHash, task.osuFile),
                    task.difficulty,
                );

            case "strainChart": {
                const beatmap = this.decode(task.beatmapHash, task.osuFile);
                const peaks = this.algorithm.calculateStrainPeaks(
                    beatmap,
                    ModUtil.deserializeMods(task.mods),
                );

                return generateStrainChart(beatmap, peaks, task.clockRate, {
                    color: task.color,
                });
            }
        }
    }

    private decode(beatmapHash: string, osuFile: string): Beatmap {
        let beatmap = this.beatmaps.get(beatmapHash);

        if (!beatmap) {
            beatmap = this.algorithm.decodeBeatmap(osuFile);
            this.beatmaps.set(beatmapHash, beatmap);
        }

        return beatmap;
    }
}
