import { ProcessorDb } from "@/database/processor";
import {
    baseDifficultyAttributesColumns,
    rebalanceOsuDifficultyAttributes,
} from "@/database/processor/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    IOsuDifficultyAttributes,
    OsuDifficultyCalculator,
} from "@rian8337/osu-rebalance-difficulty-calculator";
import { inject } from "tsyringe";
import { DifficultyAttributesRepository } from "./DifficultyAttributesRepository";
import { ILiveOsuDifficultyAttributesRepository } from "./ILiveOsuDifficultyAttributesRepository";

/**
 * Provides operations for interacting with rebalance osu! difficulty attributes in the database.
 */
@Repository(dependencyTokens.rebalanceOsuDifficultyAttributesRepository)
export class RebalanceOsuDifficultyAttributesRepository
    extends DifficultyAttributesRepository<IOsuDifficultyAttributes>
    implements ILiveOsuDifficultyAttributesRepository
{
    protected override readonly table = rebalanceOsuDifficultyAttributes;
    protected override readonly calculator = new OsuDifficultyCalculator();

    constructor(@inject(dependencyTokens.processorDb) db: ProcessorDb) {
        super(db);
    }

    protected override convertDatabaseSpecificAttributes(
        attributes: typeof this.table.$inferSelect,
    ): Omit<
        IOsuDifficultyAttributes,
        keyof typeof baseDifficultyAttributesColumns
    > {
        return attributes;
    }
}
