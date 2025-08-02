import { IGameAPIProvider } from "@/api";
import { isDebug } from "@/config";
import { IScore } from "@/database/official/schema";
import { Service } from "@/decorators/service";
import { dependencyTokens } from "@/dependencies/tokens";
import { IReplayRepository } from "@/repositories";
import { SerializedMod } from "@rian8337/osu-base";
import { ReplayData } from "@rian8337/osu-droid-replay-analyzer";
import { Score } from "@rian8337/osu-droid-utilities";
import { inject } from "tsyringe";
import { isDeepStrictEqual } from "util";
import { BaseService } from "./BaseService";
import { IReplayService } from "./IReplayService";

/**
 * Provides replay related operations.
 */
@Service(dependencyTokens.replayService)
export class ReplayService extends BaseService implements IReplayService {
    constructor(
        @inject(dependencyTokens.gameApiProvider)
        private readonly gameApiProvider: IGameAPIProvider,

        @inject(dependencyTokens.replayRepository)
        private readonly replayRepository: IReplayRepository,
    ) {
        super();
    }

    getReplay(scoreId: number): Promise<Buffer> {
        return isDebug
            ? this.gameApiProvider.getReplay(scoreId)
            : this.replayRepository.getReplay(scoreId);
    }

    getBestReplay(scoreId: number): Promise<Buffer> {
        return isDebug
            ? this.gameApiProvider.getBestReplay(scoreId)
            : this.replayRepository.getBestReplay(scoreId);
    }

    isReplayValid(score: IScore | Score, data: ReplayData): boolean {
        // Wrap the score in a Score object.
        const wrappedScore =
            score instanceof Score
                ? score
                : new Score({
                      ...score,
                      username: "",
                      mods: JSON.parse(score.mods) as SerializedMod[],
                      mark: score.mark!,
                      date: score.date.getTime(),
                      slider_tick_hit: score.sliderTickHit,
                      slider_end_hit: score.sliderEndHit,
                  });

        // For replay v1 and v2, there is not that much information - just check the accuracy and hash.
        if (
            wrappedScore.hash !== data.hash ||
            !wrappedScore.accuracy.equals(data.accuracy) ||
            // Also check if the accuracy is "empty", as in there are no hits at all.
            Number.isNaN(data.accuracy.value())
        ) {
            return false;
        }

        // Replay v3 has way more information - compare all relevant ones.
        if (data.isReplayV3()) {
            if (
                wrappedScore.score !== data.score ||
                wrappedScore.combo !== data.maxCombo ||
                (!(score instanceof Score) &&
                    (score.geki !== data.hit300k ||
                        score.katu !== data.hit100k)) ||
                wrappedScore.rank !== data.rank
            ) {
                return false;
            }

            // Mods are compared later as they are more costly.
            const scoreMods = wrappedScore.mods.serializeMods();
            const replayMods = data.convertedMods.serializeMods();

            if (!isDeepStrictEqual(scoreMods, replayMods)) {
                return false;
            }
        }

        // Replay v4? Well... nothing new to check there, so let's end it here.
        return true;
    }
}
