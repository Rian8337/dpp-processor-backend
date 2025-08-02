import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
    liveDroidDifficultyAttributes,
    liveOsuDifficultyAttributes,
    rebalanceDroidDifficultyAttributes,
    rebalanceOsuDifficultyAttributes,
} from "@/database/processor/schema";
import { RawDifficultyAttributes } from "@/types";
import { Mod, ModUtil, PlayableBeatmap } from "@rian8337/osu-base";
import {
    CacheableDifficultyAttributes,
    DifficultyAttributes,
    DifficultyCalculator,
    DifficultyHitObject,
} from "@rian8337/osu-difficulty-calculator";
import {
    DifficultyAttributes as RebalanceDifficultyAttributes,
    DifficultyCalculator as RebalanceDifficultyCalculator,
    DifficultyHitObject as RebalanceDifficultyHitObject,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { and, eq, sql } from "drizzle-orm";
import { BaseProcessorRepository } from "./BaseProcessorRepository";
import { IDifficultyAttributesRepository } from "./IDifficultyAttributesRepository";

/**
 * Provides operations for interacting with difficulty attributes in the database.
 *
 * @template TAttributes The type of difficulty attributes.
 */
export abstract class DifficultyAttributesRepository<
        TAttributes extends RawDifficultyAttributes,
    >
    extends BaseProcessorRepository
    implements IDifficultyAttributesRepository<TAttributes>
{
    /**
     * The table that stores the difficulty attributes.
     */
    protected abstract readonly table:
        | typeof liveDroidDifficultyAttributes
        | typeof liveOsuDifficultyAttributes
        | typeof rebalanceDroidDifficultyAttributes
        | typeof rebalanceOsuDifficultyAttributes;

    /**
     * The calculator used to calculate the difficulty attributes.
     */
    protected abstract readonly calculator:
        | DifficultyCalculator<
              PlayableBeatmap,
              DifficultyHitObject,
              DifficultyAttributes
          >
        | RebalanceDifficultyCalculator<
              PlayableBeatmap,
              RebalanceDifficultyHitObject,
              RebalanceDifficultyAttributes
          >;

    getAttributes(
        beatmapId: number,
    ): Promise<CacheableDifficultyAttributes<TAttributes>[]>;

    getAttributes(
        beatmapId: number,
        mods: Iterable<Mod>,
    ): Promise<CacheableDifficultyAttributes<TAttributes> | null>;

    async getAttributes(
        beatmapId: number,
        mods?: Iterable<Mod>,
    ): Promise<
        | CacheableDifficultyAttributes<TAttributes>[]
        | CacheableDifficultyAttributes<TAttributes>
        | null
    > {
        if (mods === undefined) {
            return this.db
                .select()
                .from(this.table)
                .where(eq(this.table.beatmapId, beatmapId))
                .then((res) =>
                    res.map(this.convertDatabaseAttributes.bind(this)),
                );
        }

        const difficultyAdjustmentMods =
            this.calculator.retainDifficultyAdjustmentMods([...mods]);

        const serialized = JSON.stringify(
            ModUtil.serializeMods(difficultyAdjustmentMods),
        );

        return this.db
            .select()
            .from(this.table)
            .where(
                and(
                    eq(this.table.beatmapId, beatmapId),
                    sql`${this.table.mods} @> ${serialized}::jsonb`,
                    sql`${serialized}::jsonb @> ${this.table.mods}`,
                ),
            )
            .limit(1)
            .then((res) =>
                res.length > 0 ? this.convertDatabaseAttributes(res[0]) : null,
            );
    }

    async addAttributes(
        beatmapId: number,
        attributes: CacheableDifficultyAttributes<TAttributes>,
    ): Promise<boolean> {
        const difficultyAdjustmentMods =
            this.calculator.retainDifficultyAdjustmentMods([
                ...ModUtil.deserializeMods(attributes.mods).values(),
            ]);

        return this.db
            .insert(this.table)
            .values({
                ...attributes,
                beatmapId: beatmapId,
                mods: ModUtil.serializeMods(difficultyAdjustmentMods),
            })
            .onConflictDoNothing()
            .then((res) => res.rowCount === 1);
    }

    private convertDatabaseAttributes(
        attributes: typeof this.table.$inferSelect,
    ): CacheableDifficultyAttributes<TAttributes> {
        this.removePrimaryKeys(attributes);

        return Object.assign(
            attributes,
            this.convertDatabaseSpecificAttributes(attributes),
        ) as CacheableDifficultyAttributes<TAttributes>;
    }

    private removePrimaryKeys(
        attribute: Partial<
            Pick<
                typeof this.table.$inferSelect,
                Exclude<DifficultyAttributesPrimaryKey, "mods">
            >
        >,
    ) {
        delete attribute.beatmapId;
    }

    /**
     * Converts database attributes to difficulty attributes, but only accounts for the attributes that
     * are specific to the gamemode.
     *
     * @param attributes The database attributes to convert.
     * @returns The converted difficulty attributes.
     */
    protected abstract convertDatabaseSpecificAttributes(
        attributes: typeof this.table.$inferSelect,
    ): Omit<TAttributes, keyof typeof baseDifficultyAttributesColumns>;
}
