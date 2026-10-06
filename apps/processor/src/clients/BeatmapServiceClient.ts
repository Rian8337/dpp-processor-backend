import type { Config } from "@/config/config";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import { ServiceUnavailableError } from "@/types/errors";
import type { OsuAPIResponse } from "@rian8337/osu-base";
import { inject } from "tsyringe";
import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "./IBeatmapServiceClient";

const timeoutMs = 10_000;

@Injectable(dependencyTokens.beatmapServiceClient)
export class BeatmapServiceClient implements IBeatmapServiceClient {
    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null> {
        const response = await this.request(
            "getbeatmap",
            "id" in reference
                ? { id: reference.id.toString() }
                : { hash: reference.hash },
        );

        if (!response) {
            return null;
        }

        // response.json() is untyped; the beatmap service returns the osu! API v1 format.
        const body = (await response.json()) as Pick<
            OsuAPIResponse,
            "beatmap_id" | "file_md5"
        >;

        return { id: Number.parseInt(body.beatmap_id), hash: body.file_md5 };
    }

    async getBeatmapFile(id: number): Promise<Buffer | null> {
        const response = await this.request("getbeatmapfile", {
            id: id.toString(),
        });

        return response ? Buffer.from(await response.arrayBuffer()) : null;
    }

    /**
     * @returns The response, or `null` on 404.
     */
    private async request(
        route: string,
        params: Record<string, string>,
    ): Promise<Response | null> {
        const { url, key } = this.config.beatmapService;
        const requestUrl = new URL(`${url}/${route}`);

        if (key) {
            requestUrl.searchParams.set("key", key);
        }

        for (const [name, value] of Object.entries(params)) {
            requestUrl.searchParams.set(name, value);
        }

        let response: Response;

        try {
            response = await fetch(requestUrl, {
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch {
            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                "Beatmap service is unreachable",
            );
        }

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                `Beatmap service responded with status ${response.status.toString()}`,
            );
        }

        return response;
    }
}
