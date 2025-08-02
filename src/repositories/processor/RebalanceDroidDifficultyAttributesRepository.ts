import { ProcessorDb } from "@/database/processor";
import {
    baseDifficultyAttributesColumns,
    rebalanceDroidDifficultyAttributes,
} from "@/database/processor/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    DroidDifficultyCalculator,
    IExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { inject } from "tsyringe";
import { DifficultyAttributesRepository } from "./DifficultyAttributesRepository";
import { IRebalanceDroidDifficultyAttributesRepository } from "./IRebalanceDroidDifficultyAttributesRepository";

/**
 * Provides operations for interacting with rebalance osu!droid difficulty attributes in the database.
 */
@Repository(dependencyTokens.rebalanceDroidDifficultyAttributesRepository)
export class RebalanceDroidDifficultyAttributesRepository
    extends DifficultyAttributesRepository<IExtendedDroidDifficultyAttributes>
    implements IRebalanceDroidDifficultyAttributesRepository
{
    protected override readonly table = rebalanceDroidDifficultyAttributes;
    protected override readonly calculator = new DroidDifficultyCalculator();

    constructor(@inject(dependencyTokens.processorDb) db: ProcessorDb) {
        super(db);
    }

    protected override convertDatabaseSpecificAttributes(
        attributes: typeof this.table.$inferSelect,
    ): Omit<
        IExtendedDroidDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return {
            ...attributes,
            mode: "rebalance",
        };
    }
}
