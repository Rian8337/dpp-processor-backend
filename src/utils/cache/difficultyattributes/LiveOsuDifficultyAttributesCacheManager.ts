import { Mod, ModUtil, Modes } from "@rian8337/osu-base";
import { OsuDifficultyAttributes } from "@rian8337/osu-difficulty-calculator";
import { DifficultyAttributesCacheManager } from "./DifficultyAttributesCacheManager";
import { PPCalculationMethod } from "../../../structures/PPCalculationMethod";
import { DatabaseTables } from "../../../database/postgres/DatabaseTables";
import { DatabaseLiveOsuDifficultyAttributes } from "../../../database/postgres/schema/DatabaseLiveOsuDifficultyAttributes";
import { DatabaseDifficultyAttributes } from "../../../database/postgres/schema/DatabaseDifficultyAttributes";
import { RawDifficultyAttributes } from "../../../structures/attributes/RawDifficultyAttributes";

/**
 * A cache manager for osu!standard live calculation difficulty attributes.
 */
export class LiveOsuDifficultyAttributesCacheManager extends DifficultyAttributesCacheManager<
    OsuDifficultyAttributes,
    DatabaseLiveOsuDifficultyAttributes
> {
    protected override readonly attributeType = PPCalculationMethod.live;
    protected override readonly mode: Modes = Modes.osu;
    protected override readonly databaseTable =
        DatabaseTables.liveOsuDifficultyAttributes;

    protected override convertDatabaseMods(
        attributes: DatabaseLiveOsuDifficultyAttributes
    ): Mod[] {
        return ModUtil.pcModbitsToMods(attributes.mods);
    }

    protected override convertDatabaseAttributesInternal(
        attributes: DatabaseLiveOsuDifficultyAttributes
    ): Omit<OsuDifficultyAttributes, keyof RawDifficultyAttributes> {
        return { speedDifficulty: attributes.speed_difficulty };
    }

    protected override convertDifficultyAttributesInternal(
        attributes: OsuDifficultyAttributes
    ): Omit<
        DatabaseLiveOsuDifficultyAttributes,
        keyof DatabaseDifficultyAttributes
    > {
        return {
            speed_difficulty: attributes.speedDifficulty,
            mods: attributes.mods.reduce(
                (acc, mod) =>
                    mod.isApplicableToOsu() ? acc | mod.bitwise : acc,
                0
            ),
        };
    }
}
