import { Mod } from "@rian8337/osu-base";
import {
    DroidDifficultyCalculator,
    IExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
} from "../../../database/processor/columns.helper";
import { rebalanceDroidDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DroidDifficultyAttributesCacheManager } from "./DroidDifficultyAttributesCacheManager";

/**
 * A cache manager for osu!droid rebalance calculation difficulty attributes.
 */
export class RebalanceDroidDifficultyAttributesCacheManager extends DroidDifficultyAttributesCacheManager<IExtendedDroidDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;

    protected override readonly databaseTable =
        rebalanceDroidDifficultyAttributesTable;

    private readonly calculator = new DroidDifficultyCalculator();

    protected override retainDifficultyAdjustmentMods(mods: Mod[]): Mod[] {
        return this.calculator.retainDifficultyAdjustmentMods(mods);
    }

    protected convertDatabaseAttributes(
        attributes: typeof this.databaseTable.$inferSelect,
    ): Omit<
        IExtendedDroidDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return {
            ...attributes,
            mode: "rebalance",
        };
    }

    protected convertDifficultyAttributes(
        attributes: IExtendedDroidDifficultyAttributes,
    ): Omit<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    > {
        const databaseAttributes = {
            ...attributes,
            // Overwrite mode to undefined to prevent it from being inserted into the database.
            mode: undefined,
        };

        delete databaseAttributes.mode;

        return databaseAttributes;
    }
}
