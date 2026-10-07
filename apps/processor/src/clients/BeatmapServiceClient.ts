import type { Config } from "@/config/config";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import { ServiceUnavailableError } from "@/types/errors";
import { inject } from "tsyringe";
import { z } from "zod";
import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "./IBeatmapServiceClient";

const timeoutMs = 10_000;

class InvalidBodyError extends Error {}

// The beatmap service returns the osu! API v1 format; only these fields are used.
const metadataSchema = z.object({
    beatmap_id: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.int().positive()),
    file_md5: z.string().regex(/^[0-9a-f]{32}$/),
});

@Injectable(dependencyTokens.beatmapServiceClient)
export class BeatmapServiceClient implements IBeatmapServiceClient {
    constructor(
        @inject(dependencyTokens.config) private readonly config: Config,
    ) {}

    async getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null> {
        const body = await this.request(
            "getbeatmap",
            "id" in reference
                ? { id: reference.id.toString() }
                : { hash: reference.hash },
            async (response) => {
                const parsed = metadataSchema.safeParse(await response.json());

                if (!parsed.success) {
                    throw new InvalidBodyError("Invalid beatmap metadata");
                }

                return parsed.data;
            },
        );

        return body ? { id: body.beatmap_id, hash: body.file_md5 } : null;
    }

    async getBeatmapFile(id: number): Promise<Buffer | null> {
        return this.request(
            "getbeatmapfile",
            { id: id.toString() },
            async (response) => Buffer.from(await response.arrayBuffer()),
        );
    }

    /**
     * Requests a route and reads the body. Failing to reach the service, a bad status, and failing to read or
     * validate the body (including stalling past the timeout) are all "service unavailable".
     *
     * @returns The result of `readBody`, or `null` on 404.
     */
    private async request<T>(
        route: string,
        params: Record<string, string>,
        readBody: (response: Response) => Promise<T>,
    ): Promise<T | null> {
        const { url, key } = this.config.beatmapService;
        const requestUrl = new URL(`${url}/${route}`);

        if (key) {
            requestUrl.searchParams.set("key", key);
        }

        for (const [name, value] of Object.entries(params)) {
            requestUrl.searchParams.set(name, value);
        }

        const signal = AbortSignal.timeout(timeoutMs);

        try {
            const response = await fetch(requestUrl, { signal });

            if (response.status === 404) {
                await response.body?.cancel();

                return null;
            }

            if (!response.ok) {
                await response.body?.cancel();

                throw new ServiceUnavailableError(
                    "BEATMAP_SERVICE_UNAVAILABLE",
                    `Beatmap service responded with status ${response.status.toString()}`,
                );
            }

            return await readBody(response);
        } catch (e) {
            if (e instanceof ServiceUnavailableError) {
                throw e;
            }

            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                e instanceof InvalidBodyError
                    ? "Beatmap service returned invalid data"
                    : "Beatmap service is unreachable or returned an unreadable response",
            );
        }
    }
}
