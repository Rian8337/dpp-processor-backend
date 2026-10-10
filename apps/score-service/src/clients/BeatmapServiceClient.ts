import type { CliConfig } from "@/config/config";
import { dependencyTokens } from "@/dependencies/tokens";
import type { UpstreamResult } from "@/types/upstream";
import { Injectable } from "@dpp/server";
import { inject } from "tsyringe";
import { requestJson } from "./http";
import type {
    BeatmapInfo,
    BeatmapLane,
    IBeatmapServiceClient,
} from "./IBeatmapServiceClient";
import { beatmapMetadataSchema } from "./schemas";

const timeoutMs = 15_000;

@Injectable(dependencyTokens.beatmapServiceClient)
export class BeatmapServiceClient implements IBeatmapServiceClient {
    constructor(
        @inject(dependencyTokens.cliConfig)
        private readonly config: CliConfig,
    ) {}

    async getBeatmap(
        lane: BeatmapLane,
        hash: string,
    ): Promise<UpstreamResult<BeatmapInfo | null>> {
        const { url, key, bulkKey } = this.config.beatmapService;
        const requestUrl = new URL(`${url}/getbeatmap`);

        requestUrl.searchParams.set("key", lane === "bulk" ? bulkKey : key);
        requestUrl.searchParams.set("hash", hash);

        const result = await requestJson(
            {
                url: requestUrl.toString(),
                timeoutMs,
                service: "Beatmap service",
                fallbackCode: "BEATMAP_SERVICE_UNAVAILABLE",
                malformedCode: "BEATMAP_SERVICE_UNAVAILABLE",
            },
            beatmapMetadataSchema.refine(
                (beatmap) => beatmap.file_md5 === hash,
            ),
        );

        if (!result.ok) {
            // Only a real "not found" is 404; refusals and outages are 503 with Retry-After.
            return result.status === 404 ? { ok: true, value: null } : result;
        }

        const beatmap = result.value;

        return {
            ok: true,
            value: {
                hash: beatmap.file_md5,
                // Same format as osu-base's MapInfo.fullTitle, which the old backend stored.
                title: `${beatmap.artist} - ${beatmap.title} (${beatmap.creator}) [${beatmap.version}]`,
                rankedStatus: beatmap.approved,
            },
        };
    }
}
