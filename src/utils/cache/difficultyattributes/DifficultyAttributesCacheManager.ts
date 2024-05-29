import { Collection } from "@discordjs/collection";
import { Mod, Modes, ModUtil } from "@rian8337/osu-base";
import { Util } from "../../Util";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { processorPool } from "../../../database/processor/ProcessorDatabasePool";
import {
    ProcessorDatabaseDifficultyAttributes,
    DatabaseDifficultyAttributesPrimaryKey,
} from "../../../database/processor/schema/ProcessorDatabaseDifficultyAttributes";
import { ProcessorDatabaseTables } from "../../../database/processor/ProcessorDatabaseTables";
import { getBeatmap } from "../beatmapStorage";

/**
 * A cache manager for difficulty attributes.
 */
export abstract class DifficultyAttributesCacheManager<
    TAttributes extends RawDifficultyAttributes,
    TDatabaseAttributes extends ProcessorDatabaseDifficultyAttributes
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
     * The database table that stores the difficulty attributes.
     */
    protected abstract readonly databaseTable: Exclude<
        ProcessorDatabaseTables,
        ProcessorDatabaseTables.beatmap
    >;

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
        beatmapId: number
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
        attributeName: string
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
        forceOD?: number
    ): Promise<CacheableDifficultyAttributes<TAttributes>> {
        const cache =
            (await this.getBeatmapAttributes(beatmapId)) ?? new Collection();

        const attributeName = this.getAttributeName(
            difficultyAttributes.mods,
            oldStatistics,
            customSpeedMultiplier,
            forceCS,
            forceAR,
            forceOD
        );

        const cacheableAttributes: CacheableDifficultyAttributes<TAttributes> =
            {
                ...difficultyAttributes,
                mods: ModUtil.modsToOsuString(difficultyAttributes.mods),
            };

        cache.set(attributeName, cacheableAttributes);

        this.cache.set(beatmapId, cache);

        // Also add to database.
        const databaseAttributes = {
            beatmap_id: beatmapId,
            force_cs: forceCS ?? -1,
            force_ar: forceAR ?? -1,
            force_od: forceOD ?? -1,
            old_statistics: oldStatistics ? 1 : 0,
            speed_multiplier: customSpeedMultiplier,
            ...this.convertDifficultyAttributes(difficultyAttributes),
        } as TDatabaseAttributes;

        const keys = Object.keys(databaseAttributes);

        await processorPool.query<TDatabaseAttributes>(
            `INSERT INTO ${this.databaseTable} (${keys.join(
                ","
            )}) VALUES (${keys.map((_, i) => `$${i + 1}`)})`,
            Object.values(databaseAttributes)
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
        mods: Mod[] | string = [],
        oldStatistics = false,
        customSpeedMultiplier = 1,
        forceCS?: number,
        forceAR?: number,
        forceOD?: number
    ): string {
        let attributeName = "";

        switch (this.mode) {
            case Modes.droid:
                attributeName +=
                    Util.sortAlphabet(
                        (Array.isArray(mods)
                            ? mods
                            : ModUtil.droidStringToMods(mods)
                        ).reduce(
                            (a, m) =>
                                a +
                                (m.isApplicableToDroid() ? m.droidString : ""),
                            ""
                        )
                    ) || "-";
                break;
            case Modes.osu:
                attributeName += (
                    Array.isArray(mods) ? mods : ModUtil.pcStringToMods(mods)
                ).reduce(
                    (a, m) => a | (m.isApplicableToOsu() ? m.bitwise : 0),
                    0
                );
        }

        if (customSpeedMultiplier !== 1) {
            attributeName += `|${customSpeedMultiplier.toFixed(2)}x`;
        }

        if (forceCS !== undefined && forceCS !== -1) {
            attributeName += `|CS${forceCS}`;
        }

        if (forceAR !== undefined && forceAR !== -1) {
            attributeName += `|AR${forceAR}`;
        }

        if (forceOD !== undefined && forceOD !== -1) {
            attributeName += `|OD${forceOD}`;
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
     * Converts mods received from the database to a {@link Mod} array.
     *
     * @param attributes The database attributes to convert.
     * @returns The converted mods.
     */
    protected abstract convertDatabaseMods(
        attributes: TDatabaseAttributes
    ): Mod[];

    /**
     * Converts a database attributes to a difficulty attributes, but only accounts for the attributes
     * that are specific to the gamemode.
     *
     * @param attributes The database attributes to convert.
     * @returns The converted difficulty attributes.
     */
    protected abstract convertDatabaseAttributesInternal(
        attributes: TDatabaseAttributes
    ): Omit<TAttributes, keyof RawDifficultyAttributes>;

    /**
     * Converts a difficulty attributes to a database attributes, but only accounts for the attributes
     * that are specific to the gamemode.
     *
     * @param attributes The difficulty attributes to convert.
     * @returns The converted database attributes.
     */
    protected abstract convertDifficultyAttributesInternal(
        attributes: TAttributes
    ): Omit<TDatabaseAttributes, keyof ProcessorDatabaseDifficultyAttributes>;

    /**
     * Converts a database attributes to a difficulty attributes.
     *
     * @param attributes The database attributes to convert.
     * @returns The converted difficulty attributes.
     */
    private convertDatabaseAttributes(
        attributes: TDatabaseAttributes
    ): TAttributes {
        return {
            ...this.convertDatabaseAttributesInternal(attributes),
            mods: this.convertDatabaseMods(attributes),
            aimDifficulty: attributes.aim_difficulty,
            approachRate: attributes.approach_rate,
            clockRate: attributes.clock_rate,
            flashlightDifficulty: attributes.flashlight_difficulty,
            hitCircleCount: attributes.hit_circle_count,
            maxCombo: attributes.max_combo,
            overallDifficulty: attributes.overall_difficulty,
            speedNoteCount: attributes.speed_note_count,
            sliderFactor: attributes.slider_factor,
            sliderCount: attributes.slider_count,
            spinnerCount: attributes.spinner_count,
            starRating: attributes.star_rating,
        } as TAttributes;
    }

    /**
     * Converts a difficulty attributes to a database attributes.
     *
     * @param attributes The difficulty attributes to convert.
     * @returns The converted database attributes.
     */
    private convertDifficultyAttributes(
        attributes: TAttributes
    ): Omit<TDatabaseAttributes, keyof DatabaseDifficultyAttributesPrimaryKey> {
        return {
            ...this.convertDifficultyAttributesInternal(attributes),
            aim_difficulty: attributes.aimDifficulty,
            approach_rate: attributes.approachRate,
            clock_rate: attributes.clockRate,
            flashlight_difficulty: attributes.flashlightDifficulty,
            hit_circle_count: attributes.hitCircleCount,
            max_combo: attributes.maxCombo,
            overall_difficulty: attributes.overallDifficulty,
            speed_note_count: attributes.speedNoteCount,
            slider_factor: attributes.sliderFactor,
            slider_count: attributes.sliderCount,
            spinner_count: attributes.spinnerCount,
            star_rating: attributes.starRating,
        } as Omit<
            TDatabaseAttributes,
            keyof DatabaseDifficultyAttributesPrimaryKey
        >;
    }

    /**
     * Gets the difficulty attributes cache of a beatmap.
     *
     * @param beatmapId The MD5 hash of the beatmap.
     * @returns The difficulty attributes cache, `null` if not found.
     */
    private async getCache(
        beatmapId: number
    ): Promise<Collection<
        string,
        CacheableDifficultyAttributes<TAttributes>
    > | null> {
        let cache = this.cache.get(beatmapId);

        if (!cache) {
            // Try to get cache from database.
            const beatmap = await getBeatmap(beatmapId);

            if (!beatmap) {
                return null;
            }

            const difficultyAttributesCache = await processorPool
                .query<TDatabaseAttributes>(
                    `SELECT * FROM ${this.databaseTable} WHERE beatmap_id = $1;`,
                    [beatmap.id]
                )
                .then((res) =>
                    res.rows.map<{
                        readonly name: string;
                        readonly attributes: CacheableDifficultyAttributes<TAttributes>;
                    }>((v) => {
                        const attributes = this.convertDatabaseAttributes(v);

                        return {
                            name: this.getAttributeName(
                                attributes.mods,
                                Boolean(v.old_statistics),
                                v.speed_multiplier,
                                v.force_cs,
                                v.force_ar,
                                v.force_od
                            ),
                            attributes: {
                                ...attributes,
                                mods: ModUtil.modsToOsuString(attributes.mods),
                            },
                        };
                    })
                )
                .catch(() => null);

            if (!difficultyAttributesCache) {
                return null;
            }

            cache = new Collection();

            for (const attribute of difficultyAttributesCache) {
                cache.set(attribute.name, attribute.attributes);
            }

            this.cache.set(beatmapId, cache);
        }

        return cache;
    }
}
