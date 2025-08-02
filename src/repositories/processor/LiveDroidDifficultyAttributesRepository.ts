import { ProcessorDb } from "@/database/processor";
import {
    baseDifficultyAttributesColumns,
    liveDroidDifficultyAttributes,
} from "@/database/processor/schema";
import { Repository } from "@/decorators/repository";
import { dependencyTokens } from "@/dependencies/tokens";
import {
    DroidDifficultyCalculator,
    IExtendedDroidDifficultyAttributes,
} from "@rian8337/osu-difficulty-calculator";
import { inject } from "tsyringe";
import { DifficultyAttributesRepository } from "./DifficultyAttributesRepository";
import { ILiveDroidDifficultyAttributesRepository } from "./ILiveDroidDifficultyAttributesRepository";

/**
 * Provides operations for interacting with live osu!droid difficulty attributes in the database.
 */
@Repository(dependencyTokens.liveDroidDifficultyAttributesRepository)
export class LiveDroidDifficultyAttributesRepository
    extends DifficultyAttributesRepository<IExtendedDroidDifficultyAttributes>
    implements ILiveDroidDifficultyAttributesRepository
{
    protected override readonly table = liveDroidDifficultyAttributes;
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
            mode: "live",
        };
    }
}
