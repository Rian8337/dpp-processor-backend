import { APIProvider } from "@/decorators/apiProvider";
import { BaseAPIProvider } from "./BaseAPIProvider";
import { IGameAPIProvider } from "./IGameAPIProvider";
import { dependencyTokens } from "@/dependencies/tokens";

/**
 * Provides operations for interacting with the game API.
 */
@APIProvider(dependencyTokens.gameApiProvider)
export class GameAPIProvider
    extends BaseAPIProvider
    implements IGameAPIProvider
{
    private readonly host = "https://osudroid.moe/api";

    getReplay(scoreId: number): Promise<Buffer> {
        const url = new URL(`/upload/${scoreId.toString()}.odr`, this.host);

        return this.fetchBuffer(url);
    }

    getBestReplay(scoreId: number): Promise<Buffer> {
        const url = new URL(`/bestpp/${scoreId.toString()}.odr`, this.host);

        return this.fetchBuffer(url);
    }
}
