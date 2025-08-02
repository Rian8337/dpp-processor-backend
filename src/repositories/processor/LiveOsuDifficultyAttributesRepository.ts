import { ProcessorDb } from "@/database/processor";
import {
    baseDifficultyAttributesColumns,
    liveOsuDifficultyAttributes,
} from "@/database/processor/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    IOsuDifficultyAttributes,
    OsuDifficultyCalculator,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import { DifficultyAttributesRepository } from "./DifficultyAttributesRepository";
import { ILiveOsuDifficultyAttributesRepository } from "./ILiveOsuDifficultyAttributesRepository";

/**
 * Provides operations for interacting with live osu! difficulty attributes in the database.
 */
@Repository(dependencyTokens.liveOsuDifficultyAttributesRepository)
export class LiveOsuDifficultyAttributesRepository
    extends DifficultyAttributesRepository<IOsuDifficultyAttributes>
    implements ILiveOsuDifficultyAttributesRepository
{
    protected override readonly table = liveOsuDifficultyAttributes;
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
