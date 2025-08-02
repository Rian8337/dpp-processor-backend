import { IBeatmapAPIProvider } from "@/api";
import { IBeatmap } from "@/database/processor/schema";
import { Service } from "@/decorators/service";
import { dependencyTokens } from "@/dependencies/tokens";
import { IBeatmapRepository } from "@/repositories/processor";
import { EitherOperationResult, HttpStatusCode } from "@/types";
import { MapInfo, RankedStatus } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import { BaseService } from "./BaseService";
import { IBeatmapService } from "./IBeatmapService";

/**
 * Provides beatmap-related operations.
 */
@Service(dependencyTokens.beatmapService)
export class BeatmapService extends BaseService implements IBeatmapService {
    private readonly idCache = new Map<number, IBeatmap>();
    private readonly hashCache = new Map<string, IBeatmap>();

    constructor(
        @inject(dependencyTokens.beatmapRepository)
        private readonly beatmapRepository: IBeatmapRepository,

        @inject(dependencyTokens.beatmapApiProvider)
        private readonly apiBeatmapProvider: IBeatmapAPIProvider,
    ) {
        super();
    }

    async getBeatmap(
        idOrHash: number | string,
    ): Promise<EitherOperationResult<IBeatmap>> {
        // Check existing cache first.
        let result =
            (typeof idOrHash === "number"
                ? this.idCache.get(idOrHash)
                : this.hashCache.get(idOrHash)) ?? null;

        // If not found, get the beatmap from the repository.
        result ??= await this.beatmapRepository.getBeatmap(idOrHash);

        // If still not found, fetch from beatmap processor.
        if (!result) {
            const apiBeatmap = await this.apiBeatmapProvider
                .getBeatmap(idOrHash)
                .catch((e: unknown) => {
                    console.error(
                        `Failed to fetch beatmap ${idOrHash.toString()} from API:`,
                        e,
                    );

                    return null;
                });

            if (!apiBeatmap) {
                return this.createFailedResponse(
                    `Beatmap ${idOrHash.toString()} not found.`,
                    HttpStatusCode.NotFound,
                );
            }

            result = this.beatmapToCache(MapInfo.from(apiBeatmap));

            // When retrieving with beatmap hash, the beatmap may be invalid when the new hash is retrieved.
            // In that case, invalidate the cache.
            if (typeof idOrHash === "string") {
                if (this.idCache.has(result.id)) {
                    await this.invalidateBeatmap(result.id, idOrHash);
                } else {
                    // Check if the old beatmap cache is in the database.
                    const oldBeatmap = await this.beatmapRepository.getBeatmap(
                        result.id,
                    );

                    if (oldBeatmap && oldBeatmap.hash !== result.hash) {
                        await this.invalidateBeatmap(
                            result.id,
                            oldBeatmap.hash,
                        );
                    }
                }
            }

            await this.insertBeatmap(result);
        }

        // For unranked beatmaps, check the status if 30 minutes have passed since the last check.
        if (
            result.rankedStatus !== RankedStatus.ranked &&
            result.rankedStatus !== RankedStatus.approved &&
            result.lastChecked < new Date(Date.now() - 1800000)
        ) {
            const apiBeatmap = await this.apiBeatmapProvider
                .getBeatmap(idOrHash)
                .catch((e: unknown) => {
                    console.error(
                        `Failed to fetch beatmap ${idOrHash.toString()} from API:`,
                        e,
                    );

                    return null;
                });

            if (!apiBeatmap) {
                // Cannot check status - invalidate for now, but do not delete existing cache.
                return this.createFailedResponse(
                    `Beatmap ${idOrHash.toString()} not found.`,
                    HttpStatusCode.NotFound,
                );
            }

            const beatmap = MapInfo.from(apiBeatmap);

            if (result.hash !== beatmap.hash) {
                // Beatmap has been updated - invalidate cache completely.
                const oldHash = result.hash;

                result = this.beatmapToCache(beatmap);

                await this.invalidateBeatmap(result.id, oldHash);
                await this.insertBeatmap(result);
            } else {
                await this.beatmapRepository.refreshCheckDate(result.id);
            }
        }

        return this.createSuccessfulResponse(result);
    }

    updateBeatmapMaxCombo(id: number, maxCombo: number): Promise<boolean> {
        return this.beatmapRepository.updateMaxCombo(id, maxCombo);
    }

    private async insertBeatmap(beatmap: IBeatmap) {
        this.idCache.set(beatmap.id, beatmap);
        this.hashCache.set(beatmap.hash, beatmap);

        await this.beatmapRepository.insert(beatmap);
    }

    private async invalidateBeatmap(id: number, oldHash: string) {
        this.idCache.delete(id);
        this.hashCache.delete(oldHash);

        await this.beatmapRepository.delete(id);
    }

    private beatmapToCache(beatmap: MapInfo): IBeatmap {
        return {
            id: beatmap.beatmapId,
            hash: beatmap.hash,
            title: beatmap.fullTitle,
            hitLength: beatmap.hitLength,
            totalLength: beatmap.totalLength,
            maxCombo: beatmap.maxCombo,
            objectCount: beatmap.objects,
            rankedStatus: beatmap.approved,
            lastChecked: new Date(),
        };
    }
}
