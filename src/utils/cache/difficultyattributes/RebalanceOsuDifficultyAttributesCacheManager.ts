import { OsuDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
} from "../../../database/processor/columns.helper";
import { rebalanceOsuDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { OsuDifficultyAttributesCacheManager } from "./OsuDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!standard rebalance calculation difficulty attributes.
 */
export class RebalanceOsuDifficultyAttributesCacheManager extends OsuDifficultyAttributesCacheManager<OsuDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;

    protected override readonly databaseTable =
        rebalanceOsuDifficultyAttributesTable;

    protected convertDatabaseAttributes(
        attributes: typeof this.databaseTable.$inferSelect,
    ): Omit<
        OsuDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return attributes;
    }

    protected convertDifficultyAttributes(
        attributes: OsuDifficultyAttributes,
    ): Omit<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    > {
        return attributes;
    }
}
