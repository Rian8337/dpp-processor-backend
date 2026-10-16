import type {
    BeatmapMetadata,
    IBeatmapServiceClient,
} from "@/clients/IBeatmapServiceClient";
import {
    beatmapFixtureNames,
    beatmapFixtures,
    md5Of,
    readBeatmapFixture,
} from "./fixtures";

/**
 * A beatmap service client that serves the beatmap fixtures.
 */
export class FixtureBeatmapServiceClient implements IBeatmapServiceClient {
    private readonly beatmaps = beatmapFixtureNames.map((name) => {
        const bytes = Buffer.from(readBeatmapFixture(name));

        return { id: beatmapFixtures[name].id, hash: md5Of(bytes), bytes };
    });

    getBeatmap(
        reference: { id: number } | { hash: string },
    ): Promise<BeatmapMetadata | null> {
        const beatmap = this.beatmaps.find((b) =>
            "id" in reference
                ? b.id === reference.id
                : b.hash === reference.hash,
        );

        return Promise.resolve(
            beatmap ? { id: beatmap.id, hash: beatmap.hash } : null,
        );
    }

    getBeatmapFile(id: number): Promise<Buffer | null> {
        return Promise.resolve(
            this.beatmaps.find((b) => b.id === id)?.bytes ?? null,
        );
    }
}
