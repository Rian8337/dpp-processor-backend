import { Collection } from "@discordjs/collection";
import { MapInfo, Mod, Modes, ModUtil } from "@rian8337/osu-base";
import { Util } from "../../Util";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { CachedDifficultyAttributes } from "../../../structures/attributes/CachedDifficultyAttributes";
import { pool } from "../../../database/postgres/DatabasePool";
import {
    DatabaseDifficultyAttributes,
    DatabaseDifficultyAttributesPrimaryKey,
} from "../../../database/postgres/schema/DatabaseDifficultyAttributes";
import { DatabaseBeatmapHash } from "../../../database/postgres/schema/DatabaseBeatmapHash";
import { DatabaseTables } from "../../../database/postgres/DatabaseTables";

/**
 * A cache manager for difficulty attributes.
 */
export abstract class DifficultyAttributesCacheManager<
    TAttributes extends RawDifficultyAttributes,
    TDatabaseAttributes extends DatabaseDifficultyAttributes
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
        DatabaseTables,
        DatabaseTables.beatmapHash
    >;

    /**
     * The difficulty attributes cache.
     */
    private readonly cache = new Collection<
        number,
        CachedDifficultyAttributes<TAttributes>
    >();

    /**
     * Gets all difficulty attributes cache of a beatmap.
     *
     * @param beatmapInfo The information about the beatmap.
     */
    getBeatmapAttributes(
        beatmapInfo: MapInfo
    ): Promise<CachedDifficultyAttributes<TAttributes> | null> {
        return this.getCache(beatmapInfo);
    }

    /**
     * Gets a specific difficulty attributes cache of a beatmap.
     *
     * @param beatmapInfo The information about the beatmap.
     * @param attributeName The name of the attribute.
     */
    getDifficultyAttributes(
        beatmapInfo: MapInfo,
        attributeName: string
    ): Promise<CacheableDifficultyAttributes<TAttributes> | null> {
        return this.getCache(beatmapInfo)
            .then(
                (cache) =>
                    cache?.difficultyAttributes.get(attributeName) ?? null
            )
            .catch(() => null);
    }

    /**
     * Adds an attribute to the beatmap difficulty cache.
     *
     * @param beatmapInfo The information about the beatmap.
     * @param difficultyAttributes The difficulty attributes to add.
     * @param oldStatistics Whether the difficulty attributes uses old statistics (pre-1.6.8 pre-release).
     * @param customSpeedMultiplier The custom speed multiplier that was used to generate the attributes.
     * @param forceCS The force CS that was used to generate the attributes.
     * @param forceAR The force AR that was used to generate the attributes.
     * @param forceOD The force OD that was used to generate the attributes.
     * @returns The difficulty attributes that were cached.
     */
    async addAttribute(
        beatmapInfo: MapInfo,
        difficultyAttributes: TAttributes,
        oldStatistics = false,
        customSpeedMultiplier = 1,
        forceCS?: number,
        forceAR?: number,
        forceOD?: number
    ): Promise<CacheableDifficultyAttributes<TAttributes>> {
        const cache = (await this.getBeatmapAttributes(beatmapInfo)) ?? {
            hash: beatmapInfo.hash,
            difficultyAttributes: new Collection(),
        };

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

        cache.difficultyAttributes.set(attributeName, cacheableAttributes);

        this.cache.set(beatmapInfo.beatmapId, cache);

        // Also add to database.
        const databaseAttributes = {
            beatmap_id: beatmapInfo.beatmapId,
            force_cs: forceCS ?? -1,
            force_ar: forceAR ?? -1,
            force_od: forceOD ?? -1,
            old_statistics: oldStatistics ? 1 : 0,
            speed_multiplier: customSpeedMultiplier,
            ...this.convertDifficultyAttributes(difficultyAttributes),
        } as TDatabaseAttributes;

        const keys = Object.keys(databaseAttributes);

        await pool.query<TDatabaseAttributes>(
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
            attributeName += `OD|${forceOD}`;
        }

        if (oldStatistics) {
            attributeName += "|oldStats";
        }

        return attributeName;
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
    ): Omit<TDatabaseAttributes, keyof DatabaseDifficultyAttributes>;

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
     * Includes logic to invalidate the beatmap's cache if it's no longer valid.
     *
     * @param beatmapInfo The information about the beatmap.
     */
    private async getCache(
        beatmapInfo: MapInfo
    ): Promise<CachedDifficultyAttributes<TAttributes> | null> {
        let cache = this.cache.get(beatmapInfo.beatmapId);

        if (!cache) {
            cache = {
                hash: beatmapInfo.hash,
                difficultyAttributes: new Collection(),
            };

            // Try to get cache from database.
            let beatmapDatabaseCache = await pool
                .query<DatabaseBeatmapHash>(
                    `SELECT * FROM ${DatabaseTables.beatmapHash} WHERE id = $1`,
                    [beatmapInfo.beatmapId]
                )
                .then((res) => res.rows.at(0) ?? null)
                .catch(() => null);

            if (
                beatmapDatabaseCache &&
                beatmapDatabaseCache.hash !== beatmapInfo.hash
            ) {
                await this.invalidateCache(beatmapInfo.beatmapId);

                return null;
            }

            if (!beatmapDatabaseCache) {
                beatmapDatabaseCache = {
                    id: beatmapInfo.beatmapId,
                    hash: beatmapInfo.hash,
                };

                await pool.query<DatabaseBeatmapHash>(
                    `INSERT INTO ${DatabaseTables.beatmapHash} (id, hash) VALUES ($1, $2)`,
                    [beatmapInfo.beatmapId, beatmapInfo.hash]
                );
            }

            const difficultyAttributesCache = await pool
                .query<TDatabaseAttributes>(
                    `SELECT * FROM ${this.databaseTable} WHERE beatmap_id = $1`,
                    [beatmapInfo.beatmapId]
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

            for (const attribute of difficultyAttributesCache) {
                cache.difficultyAttributes.set(
                    attribute.name,
                    attribute.attributes
                );
            }

            this.cache.set(beatmapInfo.beatmapId, cache);
        }

        if (cache.hash !== beatmapInfo.hash) {
            await this.invalidateCache(beatmapInfo.beatmapId);

            return null;
        }

        return cache;
    }

    /**
     * Invalidates a difficulty attributes cache.
     *
     * @param beatmapId The ID of the beatmap to invalidate.
     */
    private async invalidateCache(beatmapId: number): Promise<void> {
        this.cache.delete(beatmapId);

        // Also delete from database.
        await pool.query<TDatabaseAttributes>(
            `DELETE FROM ${this.databaseTable} WHERE beatmap_id = $1`,
            [beatmapId]
        );
    }
}
