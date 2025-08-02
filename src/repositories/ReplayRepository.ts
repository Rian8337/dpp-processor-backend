import { Repository } from "@/decorators/repository";
import { IReplayRepository } from "./IReplayRepository";
import { dependencyTokens } from "@/dependencies/tokens";
import { readFile } from "fs/promises";
import { join } from "path";

/**
 * Provides operations for interacting with stored replays.
 */
@Repository(dependencyTokens.replayRepository)
export class ReplayRepository implements IReplayRepository {
    private readonly basePath = "/hdd/osudroid/";

    getReplay(scoreId: number): Promise<Buffer> {
        return readFile(
            join(this.basePath, "replay", `${scoreId.toString()}.odr`),
        );
    }

    getBestReplay(scoreId: number): Promise<Buffer> {
        return readFile(
            join(this.basePath, "bestpp", `${scoreId.toString()}.odr`),
        );
    }
}
