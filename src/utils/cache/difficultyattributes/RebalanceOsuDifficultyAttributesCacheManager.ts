import {
    IOsuDifficultyAttributes,
    OsuDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
} from "../../../database/processor/columns.helper";
import { rebalanceOsuDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { Mod } from "@rian8337/osu-base";

/**
 * A cache manager for osu!standard rebalance calculation difficulty attributes.
 */
export class RebalanceOsuDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<IOsuDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;

    protected override readonly databaseTable =
        rebalanceOsuDifficultyAttributesTable;

    private readonly calculator = new OsuDifficultyCalculator();

    protected override retainDifficultyAdjustmentMods(mods: Mod[]): Mod[] {
        return this.calculator.retainDifficultyAdjustmentMods(mods);
    }

    protected override convertDatabaseAttributes(
        attributes: typeof this.databaseTable.$inferSelect,
    ): Omit<
        IOsuDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return attributes;
    }

    protected override convertDifficultyAttributes(
        attributes: IOsuDifficultyAttributes,
    ): Omit<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    > {
        return attributes;
    }
}
