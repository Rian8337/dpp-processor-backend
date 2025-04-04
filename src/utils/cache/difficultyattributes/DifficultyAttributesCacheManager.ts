import { Collection } from "@discordjs/collection";
import { Mod, ModMap, ModUtil, SerializedMod } from "@rian8337/osu-base";
import { CacheableDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { processorDb } from "../../../database/processor";
import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
} from "../../../database/processor/columns.helper";
import {
    liveDroidDifficultyAttributesTable,
    liveOsuDifficultyAttributesTable,
    rebalanceDroidDifficultyAttributesTable,
    rebalanceOsuDifficultyAttributesTable,
} from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";
import { sortAlphabet } from "../../util";
import { getBeatmap } from "../beatmapStorage";

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
     * The database table that stores the difficulty attributes.
     */
    protected abstract readonly databaseTable:
        | typeof liveDroidDifficultyAttributesTable
        | typeof rebalanceDroidDifficultyAttributesTable
        | typeof liveOsuDifficultyAttributesTable
        | typeof rebalanceOsuDifficultyAttributesTable;

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
     * @param mods The mods to get the attributes for. Defaults to No Mod.
     * @returns The difficulty attributes cache, `null` if not found.
     */
    getDifficultyAttributes(
        beatmapId: number,
        mods?: ModMap,
    ): Promise<CacheableDifficultyAttributes<TAttributes> | null> {
        return this.getCache(beatmapId)
            .then(
                (cache) =>
                    cache?.get(this.convertModsForAttributeCacheKey(mods)) ??
                    null,
            )
            .catch(() => null);
    }

    /**
     * Adds an attribute to the beatmap difficulty cache.
     *
     * @param beatmapId The ID of the beatmap.
     * @param difficultyAttributes The difficulty attributes to add.
     * @returns The difficulty attributes that were cached.
     */
    async addAttribute(
        beatmapId: number,
        difficultyAttributes: TAttributes,
    ): Promise<CacheableDifficultyAttributes<TAttributes>> {
        const cache =
            (await this.getBeatmapAttributes(beatmapId)) ?? new Collection();

        const cacheableAttributes: CacheableDifficultyAttributes<TAttributes> =
            {
                ...difficultyAttributes,
                mods: difficultyAttributes.mods.serializeMods(),
            };

        cache.set(
            this.convertModsForAttributeCacheKey(cacheableAttributes.mods),
            cacheableAttributes,
        );

        this.cache.set(beatmapId, cache);

        // Also insert attributes to database.
        const databaseAttributes = {
            ...this.convertDifficultyAttributes(difficultyAttributes),
            ...this.constructAttributePrimaryKeys(
                beatmapId,
                difficultyAttributes.mods,
            ),
        } as typeof this.databaseTable.$inferInsert;

        await processorDb.insert(this.databaseTable).values(databaseAttributes);

        return cacheableAttributes;
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
     * Converts a database attributes to a difficulty attributes, but only accounts for the attributes that
     * are specific to the gamemode.
     *
     * @param attributes The database attributes to convert.
     * @returns The converted difficulty attributes.
     */
    protected abstract convertDatabaseAttributes(
        attributes: typeof this.databaseTable.$inferSelect,
    ): Omit<TAttributes, keyof typeof baseDifficultyAttributesColumns>;

    /**
     * Converts difficulty attributes to database attributes, but only accounts for the attributes that are
     * specific to the gamemode.
     *
     * @param attributes The difficulty attributes to convert.
     * @returns The converted database attributes.
     */
    protected abstract convertDifficultyAttributes(
        attributes: TAttributes,
    ): Omit<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    >;

    /**
     * Retains `Mod`s that adjust a beatmap's difficulty from the specified mods.
     *
     * @param mods The mods to retain the difficulty adjustment mods from.
     * @returns The retained difficulty adjustment mods.
     */
    protected abstract retainDifficultyAdjustmentMods(mods: Mod[]): Mod[];

    /**
     * Constructs the primary keys for difficulty attributes.
     *
     * @param beatmapId The ID of the beatmap.
     * @param mods The mods that were used to generate the attributes.
     * @returns The primary keys.
     */
    protected constructAttributePrimaryKeys(
        beatmapId: number,
        mods: ModMap,
    ): Pick<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    > {
        return {
            beatmapId,
            mods: ModUtil.serializeMods(
                this.retainDifficultyAdjustmentMods([...mods.values()]),
            ),
        };
    }

    /**
     * Removes the primary keys from difficulty attributes that were retrieved from the database, except mods.
     *
     * @param attributes The attributes to remove the primary keys from.
     */
    protected removePrimaryKeys(
        attribute: Partial<
            Pick<
                typeof this.databaseTable.$inferSelect,
                Exclude<DifficultyAttributesPrimaryKey, "mods">
            >
        >,
    ) {
        delete attribute.beatmapId;
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

            const schema = createSelectSchema(this.databaseTable);

            const result = await processorDb
                .select()
                .from(this.databaseTable)
                .where(eq(this.databaseTable.beatmapId, beatmapId));

            cache = new Collection();

            for (const row of result) {
                const parsed = schema.parse(
                    row,
                ) as typeof this.databaseTable.$inferSelect;

                this.removePrimaryKeys(parsed);

                cache.set(
                    this.convertModsForAttributeCacheKey(parsed.mods),
                    Object.assign(
                        parsed,
                        this.convertDatabaseAttributes(parsed),
                    ) as CacheableDifficultyAttributes<TAttributes>,
                );
            }

            this.cache.set(beatmapId, cache);
        }

        return cache;
    }

    private convertModsForAttributeCacheKey(
        mods?: ModMap | SerializedMod[],
    ): string {
        const serializedMods =
            mods instanceof ModMap ? mods.serializeMods() : (mods ?? []);

        // This sounds SO expensive for an in-memory cache, but it is what it is...
        return sortAlphabet(JSON.stringify(serializedMods.join("")));
    }
}
