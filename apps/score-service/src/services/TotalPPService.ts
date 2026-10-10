import { dependencyTokens } from "@/dependencies/tokens";
import type { IOfficialScoreRepository } from "@/repositories/IOfficialScoreRepository";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import type { ITotalPPService } from "./ITotalPPService";
import { calculateUserTotals, countedBestScores } from "./userTotals";

const inactiveAfterMs = 3 * 30 * 24 * 60 * 60 * 1000;

@Injectable(dependencyTokens.totalPPService)
export class TotalPPService implements ITotalPPService {
    constructor(
        @inject(dependencyTokens.officialScoreRepository)
        private readonly official: IOfficialScoreRepository,
    ) {}

    async recalculate(uid: number, now = new Date()): Promise<void> {
        const user = await this.official.findUserLastLogin(uid);

        if (!user) {
            return;
        }

        // Players who have not logged in for 3 months are left out of the rankings, as before.
        const inactive =
            user.lastLoginTime !== null &&
            user.lastLoginTime.getTime() < now.getTime() - inactiveAfterMs;

        await this.official.setUserTotals(
            uid,
            inactive
                ? { pp: 0, accuracy: 1 }
                : calculateUserTotals(
                      await this.official.topBestScores(uid, countedBestScores),
                  ),
        );
    }
}
