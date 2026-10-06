import type { Algorithm } from "@/algorithms/types";
import type { ICalculationRunner } from "@/calculation/ICalculationRunner";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import type { VariantManifest } from "@/manifest/manifest";
import type {
    DifficultyAttributesKey,
    IDifficultyAttributesRepository,
} from "@/repositories/IDifficultyAttributesRepository";
import { LruCache } from "@/utils/LruCache";
import { createModsKey } from "@/utils/modsKey";
import type { ModMap, SerializedMod } from "@rian8337/osu-base";
import type {
    CacheableDifficultyAttributes,
    IDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import type { ResolvedBeatmap } from "./IBeatmapService";
import type { IDifficultyCacheService } from "./IDifficultyCacheService";

type Attributes = CacheableDifficultyAttributes<IDifficultyAttributes>;

const memoryEntries = 10_000;

@Injectable(dependencyTokens.difficultyCacheService)
export class DifficultyCacheService implements IDifficultyCacheService {
    private readonly memory = new LruCache<string, Attributes>(memoryEntries);
    private readonly inFlight = new Map<string, Promise<Attributes>>();

    constructor(
        @inject(dependencyTokens.algorithm)
        private readonly algorithm: Algorithm,
        @inject(dependencyTokens.manifest)
        private readonly manifest: VariantManifest,
        @inject(dependencyTokens.difficultyAttributesRepository)
        private readonly repository: IDifficultyAttributesRepository,
        @inject(dependencyTokens.calculationRunner)
        private readonly runner: ICalculationRunner,
    ) {}

    get(beatmap: ResolvedBeatmap, mods: ModMap): Promise<Attributes> {
        const difficultyMods =
            this.algorithm.retainDifficultyAdjustmentMods(mods);

        if (!beatmap.cacheable) {
            return this.calculate(beatmap, difficultyMods);
        }

        const key: DifficultyAttributesKey = {
            calculatorVersion: this.manifest.calculatorVersion,
            beatmapHash: beatmap.hash,
            mods: createModsKey(difficultyMods),
        };

        // The calculator version is constant for the process, so it is not part of the memory key.
        const memoryKey = `${key.beatmapHash}|${key.mods}`;
        const cached = this.memory.get(memoryKey);

        if (cached) {
            return Promise.resolve(cached);
        }

        let pending = this.inFlight.get(memoryKey);

        if (!pending) {
            pending = this.load(key, beatmap, difficultyMods)
                .then((attributes) => {
                    this.memory.set(memoryKey, attributes);

                    return attributes;
                })
                .finally(() => this.inFlight.delete(memoryKey));

            this.inFlight.set(memoryKey, pending);
        }

        return pending;
    }

    private async load(
        key: DifficultyAttributesKey,
        beatmap: ResolvedBeatmap,
        difficultyMods: SerializedMod[],
    ): Promise<Attributes> {
        const stored = await this.repository.find(key).catch((e: unknown) => {
            console.error(
                "Failed to read difficulty attributes; calculating instead:",
                e,
            );

            return null;
        });

        if (stored) {
            return stored;
        }

        const attributes = await this.calculate(beatmap, difficultyMods);

        await this.repository.insert(key, attributes).catch((e: unknown) => {
            console.error("Failed to store difficulty attributes:", e);
        });

        return attributes;
    }

    private async calculate(
        beatmap: ResolvedBeatmap,
        mods: SerializedMod[],
    ): Promise<Attributes> {
        return this.runner.calculateDifficulty({
            beatmapHash: beatmap.hash,
            osuFile: await beatmap.getFile(),
            mods,
        });
    }
}
