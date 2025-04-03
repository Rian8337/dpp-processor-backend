import { ExtendedDroidDifficultyAttributes } from "@rian8337/osu-rebalance-difficulty-calculator";
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
export class RebalanceDroidDifficultyAttributesCacheManager extends DroidDifficultyAttributesCacheManager<ExtendedDroidDifficultyAttributes> {
    protected override readonly attributeType = PPCalculationMethod.rebalance;

    protected override readonly databaseTable =
        rebalanceDroidDifficultyAttributesTable;

    protected convertDatabaseAttributes(
        attributes: typeof this.databaseTable.$inferSelect,
    ): Omit<
        ExtendedDroidDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return {
            ...attributes,
            mode: "rebalance",
            difficultSliders: this.convertDifficultSlidersFromDatabase(
                attributes.difficultSliders,
            ),
            possibleThreeFingeredSections:
                this.convertHighStrainSectionsFromDatabase(
                    attributes.possibleThreeFingeredSections,
                ),
        };
    }

    protected convertDifficultyAttributes(
        attributes: ExtendedDroidDifficultyAttributes,
    ): Omit<
        typeof this.databaseTable.$inferSelect,
        DifficultyAttributesPrimaryKey
    > {
        const databaseAttributes = {
            ...attributes,
            difficultSliders: this.convertDifficultSlidersToDatabase(
                attributes.difficultSliders,
            ),
            possibleThreeFingeredSections:
                this.convertHighStrainSectionsToDatabase(
                    attributes.possibleThreeFingeredSections,
                ),
            // Overwrite mode to undefined to prevent it from being inserted into the database.
            mode: undefined,
        };

        delete databaseAttributes.mode;

        return databaseAttributes;
    }
}
