import { Mod } from "@rian8337/osu-base";
import {
    IOsuDifficultyAttributes,
    OsuDifficultyCalculator,
} from "@rian8337/osu-difficulty-calculator";
import {
    baseDifficultyAttributesColumns,
    DifficultyAttributesPrimaryKey,
} from "../../../database/processor/columns.helper";
import { liveOsuDifficultyAttributesTable } from "../../../database/processor/schema";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";

/**
 * A cache manager for osu!standard live calculation difficulty attributes.
 */
export class LiveOsuDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<IOsuDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.live;

    protected override readonly databaseTable =
        liveOsuDifficultyAttributesTable;

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
