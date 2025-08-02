import { APIProvider } from "@/decorators/apiProvider";
import { dependencyTokens } from "@/dependencies/tokens";
import { OsuAPIResponse } from "@rian8337/osu-base";
import { BaseAPIProvider } from "./BaseAPIProvider";
import { IBeatmapAPIProvider } from "./IBeatmapProvider";

/**
 * Provides operations for interacting with beatmap APIs.
 */
@APIProvider(dependencyTokens.beatmapApiProvider)
export class BeatmapAPIProvider
    extends BaseAPIProvider
    implements IBeatmapAPIProvider
{
    private readonly host = new URL("http://localhost:3017/api/beatmap");

    getBeatmap(idOrHash: string | number): Promise<OsuAPIResponse> {
        const url = new URL("getbeatmap", this.host);

        url.searchParams.append(
            typeof idOrHash === "number" ? "id" : "hash",
            idOrHash.toString(),
        );

        return this.fetchJSON(url);
    }

    getBeatmapFile(idOrHash: string | number): Promise<Buffer> {
        const url = new URL("getbeatmapfile", this.host);

        url.searchParams.append(
            typeof idOrHash === "number" ? "id" : "hash",
            idOrHash.toString(),
        );

        return this.fetchBuffer(url);
    }

    protected override onRequestPrepare(url: URL) {
        super.onRequestPrepare(url);

        url.searchParams.append("key", process.env.DROID_SERVER_INTERNAL_KEY!);
    }
}
