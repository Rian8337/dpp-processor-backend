import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import { Injectable } from "@/decorators/injectable";
import { dependencyTokens } from "@/dependencies/tokens";
import { NotFoundError, ServiceUnavailableError } from "@/types/errors";
import { LruCache } from "@/utils/LruCache";
import { md5 } from "@/utils/md5";
import type { BeatmapReference } from "@dpp/shared";
import { inject } from "tsyringe";
import type { IBeatmapService, ResolvedBeatmap } from "./IBeatmapService";

const cacheTtlMs = 5 * 60 * 1000;

@Injectable(dependencyTokens.beatmapService)
export class BeatmapService implements IBeatmapService {
    private readonly metadata = new LruCache<string, BeatmapMetadata>(
        5000,
        cacheTtlMs,
    );
    private readonly files = new LruCache<string, string>(200, cacheTtlMs);

    constructor(
        @inject(dependencyTokens.beatmapServiceClient)
        private readonly client: IBeatmapServiceClient,
    ) {}

    async resolve(reference: BeatmapReference): Promise<ResolvedBeatmap> {
        if ("file" in reference) {
            const { file } = reference;

            return {
                hash: md5(file),
                cacheable: false,
                getFile: () => Promise.resolve(file),
            };
        }

        const metadata = await this.getMetadata(reference);

        return {
            hash: metadata.hash,
            cacheable: true,
            getFile: () => this.getFile(metadata),
        };
    }

    private async getMetadata(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata> {
        const cached = this.metadata.get(
            "id" in reference
                ? `id:${reference.id.toString()}`
                : `hash:${reference.hash}`,
        );

        if (cached) {
            return cached;
        }

        const metadata = await this.client.getBeatmap(reference);

        if (!metadata) {
            throw new NotFoundError("BEATMAP_NOT_FOUND", "Beatmap not found");
        }

        this.metadata.set(`id:${metadata.id.toString()}`, metadata);
        this.metadata.set(`hash:${metadata.hash}`, metadata);

        return metadata;
    }

    private async getFile(metadata: BeatmapMetadata): Promise<string> {
        const cached = this.files.get(metadata.hash);

        if (cached !== undefined) {
            return cached;
        }

        const bytes = await this.client.getBeatmapFile(metadata.id);

        if (!bytes) {
            throw new NotFoundError(
                "BEATMAP_NOT_FOUND",
                "Beatmap file not found",
            );
        }

        // Hash the bytes, not decoded text: decoding can drop a byte order mark and change the hash.
        const actualHash = md5(bytes);

        if (actualHash !== metadata.hash) {
            console.warn(
                `Beatmap ${metadata.id.toString()} changed between the metadata and file fetches: metadata hash ${metadata.hash}, file hash ${actualHash}`,
            );
            this.metadata.delete(`id:${metadata.id.toString()}`);
            this.metadata.delete(`hash:${metadata.hash}`);

            throw new ServiceUnavailableError(
                "BEATMAP_SERVICE_UNAVAILABLE",
                "Beatmap changed while it was being fetched; retry the request",
            );
        }

        const file = bytes.toString("utf8");
        this.files.set(metadata.hash, file);

        return file;
    }
}
