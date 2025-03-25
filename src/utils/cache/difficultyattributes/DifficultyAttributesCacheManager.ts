import { Collection } from "@discordjs/collection";
import { Mod, Modes, ModUtil } from "@rian8337/osu-base";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { getBeatmap } from "../beatmapStorage";
import {
    liveDroidDifficultyAttributesTable,
    liveOsuDifficultyAttributesTable,
    rebalanceDroidDifficultyAttributesTable,
    rebalanceOsuDifficultyAttributesTable,
} from "../../../database/processor/schema";
import { DifficultyAttributesPrimaryKey } from "../../../database/processor/columns.helper";

/**
 * A cache manager for difficulty attributes.
 */
export abstract class DifficultyAttributesCacheManager<
    TAttributes extends RawDifficultyAttributes,
> {
    /**
     * The type of the attribute.
     */
    protected abstract readonly attributeType: PPCalculationMethod;

    /**
     * The gamemode at which the difficulty attribute is stored for.
     */
    protected abstract readonly mode: Modes;

    /**
     * The difficulty attributes cache.
     */
    private readonly cache = new Collection<
        number,
        Collection<string, CacheableDifficultyAttributes<TAttributes>>
    >();

    /**
     * Gets all difficulty attributes cache of a beatmap.
     *
     * @param beatmapId The ID of the beatmap.
     */
    getBeatmapAttributes(
        beatmapId: number,
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<TAttributes>
    > | null> {
        return this.getCache(beatmapId);
    }

    /**
     * Gets a specific difficulty attributes cache of a beatmap.
     *
     * @param beatmapId The ID of the beatmap.
     * @param attributeName The name of the attribute.
     */
    getDifficultyAttributes(
        beatmapId: number,
        attributeName: string,
    ): Promise<CacheableDifficultyAttributes<TAttributes> | null> {
        return this.getCache(beatmapId)
            .then((cache) => cache?.get(attributeName) ?? null)
            .catch(() => null);
    }

    /**
     * Adds an attribute to the beatmap difficulty cache.
     *
     * @param beatmapId The ID of the beatmap.
     * @param difficultyAttributes The difficulty attributes to add.
     * @param oldStatistics Whether the difficulty attributes uses old statistics (pre-1.6.8 pre-release).
     * @param customSpeedMultiplier The custom speed multiplier that was used to generate the attributes.
     * @param forceCS The force CS that was used to generate the attributes.
     * @param forceAR The force AR that was used to generate the attributes.
     * @param forceOD The force OD that was used to generate the attributes.
     * @returns The difficulty attributes that were cached.
     */
    async addAttribute(
        beatmapId: number,
        difficultyAttributes: TAttributes,
        oldStatistics = false,
        customSpeedMultiplier = 1,
        forceCS?: number,
        forceAR?: number,
        forceOD?: number,
    ): Promise<CacheableDifficultyAttributes<TAttributes>> {
        const cache =
            (await this.getBeatmapAttributes(beatmapId)) ?? new Collection();

        const attributeName = this.getAttributeName(
            difficultyAttributes.mods,
            oldStatistics,
            customSpeedMultiplier,
            forceCS,
            forceAR,
            forceOD,
        );

        const cacheableAttributes: CacheableDifficultyAttributes<TAttributes> =
            {
                ...difficultyAttributes,
                mods: ModUtil.modsToOsuString(difficultyAttributes.mods),
            };

        cache.set(attributeName, cacheableAttributes);

        this.cache.set(beatmapId, cache);

        await this.insertToDatabase(
            beatmapId,
            oldStatistics,
            customSpeedMultiplier,
            forceCS,
            forceAR,
            forceOD,
            difficultyAttributes,
        );

        return cacheableAttributes;
    }

    /**
     * Constructs an attribute name based on the given parameters.
     *
     * @param mods The mods to construct with.
     * @param oldStatistics Whether the attribute uses old statistics (pre-1.6.8 pre-release).
     * @param customSpeedMultiplier The custom speed multiplier to construct with.
     * @param forceAR The force CS to construct with.
     * @param forceAR The force AR to construct with.
     * @param forceOD The force OD to construct with.
     */
    getAttributeName(
        mods: Mod[] = [],
        oldStatistics = false,
        customSpeedMultiplier = 1,
        forceCS?: number,
        forceAR?: number,
        forceOD?: number,
    ): string {
        let attributeName = this.convertMods(mods);

        if (customSpeedMultiplier !== 1) {
            attributeName += `|${customSpeedMultiplier.toFixed(2)}x`;
        }

        if (forceCS !== undefined && forceCS !== -1) {
            attributeName += `|CS${forceCS.toString()}`;
        }

        if (forceAR !== undefined && forceAR !== -1) {
            attributeName += `|AR${forceAR.toString()}`;
        }

        if (forceOD !== undefined && forceOD !== -1) {
            attributeName += `|OD${forceOD.toString()}`;
        }

        if (oldStatistics) {
            attributeName += "|oldStats";
        }

        return attributeName;
    }

    /**
     * Invalidates the cache of a beatmap.
     *
     * @param beatmapId The ID of the beatmap.
     */
    invalidateCache(beatmapId: number) {
        this.cache.delete(beatmapId);
    }

    /**
     * Inserts an attribute to the database.
     *
     * @param beatmapId The ID of the beatmap.
     * @param oldStatistics Whether the difficulty attributes uses old statistics (pre-1.6.8 pre-release).
     * @param customSpeedMultiplier The custom speed multiplier that was used to generate the attributes.
     * @param forceCS The force CS that was used to generate the attributes.
     * @param forceAR The force AR that was used to generate the attributes.
     * @param forceOD The force OD that was used to generate the attributes.
     * @param attributes The attributes to insert.
     */
    protected abstract insertToDatabase(
        beatmapId: number,
        oldStatistics: boolean,
        customSpeedMultiplier: number,
        forceCS: number | undefined,
        forceAR: number | undefined,
        forceOD: number | undefined,
        attributes: TAttributes,
    ): Promise<void>;

    /**
     * Gets the difficulty attributes cache of a beatmap from the database.
     *
     * @param beatmapId The MD5 hash of the beatmap.
     * @returns The difficulty attributes cache, `null` if not found.
     */
    protected abstract getCacheFromDatabase(
        beatmapId: number,
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<TAttributes>
    > | null>;

    /**
     * Converts an array of {@link Mod}s to a string that will be stored in the database.
     *
     * @param mods The mods to convert.
     * @returns The converted mods.
     */
    protected abstract convertMods(mods: Mod[]): string;

    /**
     * Removes the primary keys from difficulty attributes that were retrieved from the database, except mods.
     *
     * @param attributes The attributes to remove the primary keys from.
     */
    protected removePrimaryKeys<
        T extends
            | typeof liveDroidDifficultyAttributesTable.$inferSelect
            | typeof rebalanceDroidDifficultyAttributesTable.$inferSelect
            | typeof liveOsuDifficultyAttributesTable.$inferSelect
            | typeof rebalanceOsuDifficultyAttributesTable.$inferSelect,
    >(
        attribute: Partial<
            Pick<T, Exclude<DifficultyAttributesPrimaryKey, "mods">>
        >,
    ) {
        delete attribute.beatmapId;
        delete attribute.forceAR;
        delete attribute.forceCS;
        delete attribute.forceOD;
        delete attribute.oldStatistics;
        delete attribute.speedMultiplier;
    }

    /**
     * Gets the difficulty attributes cache of a beatmap.
     *
     * @param beatmapId The ID of the beatmap.
     * @returns The difficulty attributes cache, `null` if not found.
     */
    private async getCache(
        beatmapId: number,
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<TAttributes>
    > | null> {
        let cache = this.cache.get(beatmapId) ?? null;

        if (!cache) {
            // Try to get cache from database.
            const beatmap = await getBeatmap(beatmapId);

            if (!beatmap) {
                return null;
            }

            cache = await this.getCacheFromDatabase(beatmap.id);

            if (cache) {
                this.cache.set(beatmapId, cache);
            }
        }

        return cache;
    }
}
