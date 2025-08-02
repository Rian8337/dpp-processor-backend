import { isDebug } from "@/config";
import { IBestScore, IScore } from "@/database/official/schema";
import { Score } from "@rian8337/osu-droid-utilities";
import { BaseService } from "./BaseService";
import { IScoreService } from "./IScoreService";
import { inject } from "tsyringe";
import { dependencyTokens } from "@/dependencies/tokens";
import { IScoreRepository } from "@/repositories/official";
import { Service } from "@/decorators/service";

/**
 * Provides score related operations.
 */
@Service(dependencyTokens.scoreService)
export class ScoreService extends BaseService implements IScoreService {
    constructor(
        @inject(dependencyTokens.scoreRepository)
        private readonly scoreRepository: IScoreRepository,
    ) {
        super();
    }

    getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: true,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | null>;

    getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: false,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | Score | null>;

    async getScore<K extends keyof IScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: boolean,
        ...columns: K[]
    ): Promise<Pick<IScore, K> | Score | null> {
        if (isDebug) {
            return forceDatabaseQuery
                ? null
                : Score.getFromHash(uid, hash, false);
        }

        return this.scoreRepository.getScore(uid, hash, ...columns);
    }

    getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: true,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | null>;

    getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: false,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | Score | null>;

    async getBestScore<K extends keyof IBestScore>(
        uid: number,
        hash: string,
        forceDatabaseQuery: boolean,
        ...columns: K[]
    ): Promise<Pick<IBestScore, K> | Score | null> {
        if (isDebug) {
            return forceDatabaseQuery
                ? null
                : Score.getFromHash(uid, hash, true);
        }

        return this.scoreRepository.getBestScore(uid, hash, ...columns);
    }
}
